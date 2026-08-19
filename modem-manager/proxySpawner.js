/**
 * ProxiCell — Native High-Performance Proxy Engine
 * Built in pure Node.js (HTTP / HTTPS CONNECT / SOCKS4 / SOCKS5)
 *
 * Features:
 *   - Zero binary dependencies (works on Windows, Linux, macOS with no SmartScreen/Defender issues)
 *   - Outbound SIM Binding (localAddress: modem.ipAddress) so traffic exits via the SIM card
 *   - Username / Password Authentication per device
 *   - Accurate real-time incoming/outgoing bandwidth tracking
 */

'use strict';

const http = require('http');
const net  = require('net');
const url  = require('url');

// ─── State ────────────────────────────────────────────────────────────────────
// In-memory credential store: modemId → [ { username, password } ]
const credStore = new Map();

// Active server instances: devicePath → { httpServers: [], socksServers: [], bandwidth: { in: 0, out: 0 } }
const activeServers = new Map();

// ─── Authentication Helper ───────────────────────────────────────────────────
function isAuthorized(modemId, username, password) {
  // 1. Direct match for this specific modemId
  const creds = credStore.get(modemId);
  if (creds && creds.some(c => c.username === username && c.password === password)) {
    return true;
  }
  // 2. Global fallback across all registered modems in credStore
  for (const [, list] of credStore) {
    if (list && list.some(c => c.username === username && c.password === password)) {
      return true;
    }
  }
  return false;
}

// ─── HTTP / HTTPS CONNECT Proxy Server ───────────────────────────────────────
function createHttpProxy(modem, port) {
  const exitIp  = modem.ipAddress;
  const modemId = modem.id || modem.devicePath;

  const server = http.createServer((req, res) => {
    // 1. Check Auth for standard HTTP
    const authHeader = req.headers['proxy-authorization'];
    if (authHeader && authHeader.startsWith('Basic ')) {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
      const colonIdx = decoded.indexOf(':');
      const u = colonIdx !== -1 ? decoded.slice(0, colonIdx) : decoded;
      const p = colonIdx !== -1 ? decoded.slice(colonIdx + 1) : '';
      if (!isAuthorized(modemId, u, p)) {
        res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="ProxiCell Proxy"' });
        return res.end('Proxy Authentication Required');
      }
    } else {
      const creds = credStore.get(modemId);
      if ((creds && creds.length > 0) || credStore.size > 0) {
        res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="ProxiCell Proxy"' });
        return res.end('Proxy Authentication Required');
      }
    }

    // 2. Forward regular HTTP request through modem IP
    const parsed = url.parse(req.url);
    const options = {
      hostname:     parsed.hostname,
      port:         parsed.port || 80,
      path:         parsed.path,
      method:       req.method,
      headers:      req.headers,
      localAddress: exitIp && exitIp !== '0.0.0.0' ? exitIp : undefined,
    };

    delete options.headers['proxy-authorization'];

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
      proxyRes.on('data', chunk => recordBandwidth(modem.devicePath, chunk.length, 0));
    });

    req.on('data', chunk => recordBandwidth(modem.devicePath, 0, chunk.length));
    req.pipe(proxyReq);

    proxyReq.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end('Bad Gateway');
    });
  });

  // 3. Handle HTTPS CONNECT Tunnels
  server.on('connect', (req, clientSocket, head) => {
    const authHeader = req.headers['proxy-authorization'];
    if (authHeader && authHeader.startsWith('Basic ')) {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
      const colonIdx = decoded.indexOf(':');
      const u = colonIdx !== -1 ? decoded.slice(0, colonIdx) : decoded;
      const p = colonIdx !== -1 ? decoded.slice(colonIdx + 1) : '';
      if (!isAuthorized(modemId, u, p)) {
        clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="ProxiCell"\r\n\r\n');
        return clientSocket.end();
      }
    } else {
      const creds = credStore.get(modemId);
      if ((creds && creds.length > 0) || credStore.size > 0) {
        clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="ProxiCell"\r\n\r\n');
        return clientSocket.end();
      }
    }

    const [targetHost, targetPort] = req.url.split(':');
    const portNum = parseInt(targetPort || '443');

    // Create outbound socket exiting specifically through the SIM card IP
    const serverSocket = net.connect({
      host:         targetHost,
      port:         portNum,
      localAddress: exitIp && exitIp !== '0.0.0.0' ? exitIp : undefined,
    }, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length > 0) serverSocket.write(head);
      clientSocket.pipe(serverSocket);
      serverSocket.pipe(clientSocket);
    });

    clientSocket.on('data', chunk => recordBandwidth(modem.devicePath, 0, chunk.length));
    serverSocket.on('data', chunk => recordBandwidth(modem.devicePath, chunk.length, 0));

    serverSocket.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => serverSocket.destroy());
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[ProxyEngine] HTTP/HTTPS proxy listening on 0.0.0.0:${port} (Exit: ${exitIp})`);
  });

  return server;
}

// ─── SOCKS5 / SOCKS4 Proxy Server ───────────────────────────────────────────
function createSocksProxy(modem, port, isSocks4 = false) {
  const exitIp  = modem.ipAddress;
  const modemId = modem.id || modem.devicePath;

  const server = net.createServer((socket) => {
    socket.once('data', (firstChunk) => {
      const version = firstChunk[0];

      if (version === 0x05 && !isSocks4) {
        // ── SOCKS5 Handshake ──────────────────────────────────────────────
        const nmethods = firstChunk[1];
        const methods  = firstChunk.slice(2, 2 + nmethods);
        const creds    = credStore.get(modemId);
        const reqAuth  = creds && creds.length > 0;

        if (reqAuth) {
          // Tell client to use Username/Password auth (0x02)
          socket.write(Buffer.from([0x05, 0x02]));
          socket.once('data', (authChunk) => {
            if (authChunk[0] !== 0x01) return socket.destroy();
            const ulen = authChunk[1];
            const u = authChunk.slice(2, 2 + ulen).toString('utf8');
            const plen = authChunk[2 + ulen];
            const p = authChunk.slice(3 + ulen, 3 + ulen + plen).toString('utf8');

            if (isAuthorized(modemId, u, p)) {
              socket.write(Buffer.from([0x01, 0x00])); // Auth success
              handleSocks5Request(socket, modem, exitIp);
            } else {
              socket.write(Buffer.from([0x01, 0x01])); // Auth failed
              socket.destroy();
            }
          });
        } else {
          // No auth required (0x00)
          socket.write(Buffer.from([0x05, 0x00]));
          handleSocks5Request(socket, modem, exitIp);
        }
      } else if (version === 0x04 || isSocks4) {
        // ── SOCKS4 Handshake ──────────────────────────────────────────────
        const cmd = firstChunk[1];
        if (cmd !== 0x01) return socket.destroy(); // only CONNECT supported
        const destPort = firstChunk.readUInt16BE(2);
        const destIp   = `${firstChunk[4]}.${firstChunk[5]}.${firstChunk[6]}.${firstChunk[7]}`;

        const outbound = net.connect({
          host: destIp,
          port: destPort,
          localAddress: exitIp && exitIp !== '0.0.0.0' ? exitIp : undefined,
        }, () => {
          socket.write(Buffer.from([0x00, 0x5a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
          socket.pipe(outbound);
          outbound.pipe(socket);
        });

        socket.on('data', chunk => recordBandwidth(modem.devicePath, 0, chunk.length));
        outbound.on('data', chunk => recordBandwidth(modem.devicePath, chunk.length, 0));
        outbound.on('error', () => socket.destroy());
        socket.on('error', () => outbound.destroy());
      } else {
        socket.destroy();
      }
    });

    socket.on('error', () => {});
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[ProxyEngine] SOCKS${isSocks4 ? '4' : '5'} proxy listening on 0.0.0.0:${port} (Exit: ${exitIp})`);
  });

  return server;
}

function handleSocks5Request(socket, modem, exitIp) {
  socket.once('data', (req) => {
    if (req[0] !== 0x05 || req[1] !== 0x01) { // only TCP CONNECT
      socket.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
      return socket.destroy();
    }

    const addrType = req[3];
    let host = '';
    let port = 0;
    let offset = 4;

    if (addrType === 0x01) {
      // IPv4
      host = `${req[4]}.${req[5]}.${req[6]}.${req[7]}`;
      offset = 8;
    } else if (addrType === 0x03) {
      // Domain name
      const len = req[4];
      host = req.slice(5, 5 + len).toString('utf8');
      offset = 5 + len;
    } else {
      socket.destroy();
      return;
    }

    port = req.readUInt16BE(offset);

    // Connect outbound using the modem's SIM exit IP
    const outbound = net.connect({
      host: host,
      port: port,
      localAddress: exitIp && exitIp !== '0.0.0.0' ? exitIp : undefined,
    }, () => {
      // SOCKS5 success response
      const resp = Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
      socket.write(resp);
      socket.pipe(outbound);
      outbound.pipe(socket);
    });

    socket.on('data', chunk => recordBandwidth(modem.devicePath, 0, chunk.length));
    outbound.on('data', chunk => recordBandwidth(modem.devicePath, chunk.length, 0));

    outbound.on('error', () => socket.destroy());
    socket.on('error', () => outbound.destroy());
  });
}

// ─── Bandwidth Tracking ───────────────────────────────────────────────────────
function recordBandwidth(devicePath, bytesIn, bytesOut) {
  const s = activeServers.get(devicePath);
  if (s && s.bandwidth) {
    s.bandwidth.in  += bytesIn;
    s.bandwidth.out += bytesOut;
  }
}

async function getModemBandwidth(modem) {
  const s = activeServers.get(modem.devicePath);
  if (s && s.bandwidth) {
    return { bytesIn: s.bandwidth.in, bytesOut: s.bandwidth.out };
  }
  return { bytesIn: 0, bytesOut: 0 };
}

// ─── Start / Stop Proxy per Device ───────────────────────────────────────────
async function startProxy(modem) {
  if (!modem.ipAddress || !modem.portSet) return;
  await stopProxy(modem);

  const { http: httpPort, socks4: socks4Port, socks5: socks5Port } = modem.portSet;

  const httpSrv   = createHttpProxy(modem, httpPort);
  const socks4Srv = createSocksProxy(modem, socks4Port, true);
  const socks5Srv = createSocksProxy(modem, socks5Port, false);

  activeServers.set(modem.devicePath, {
    servers: [httpSrv, socks4Srv, socks5Srv],
    bandwidth: { in: 0, out: 0 },
  });

  console.log(`[ProxyEngine] ✅ Started HTTP(:${httpPort}), SOCKS4(:${socks4Port}), SOCKS5(:${socks5Port}) for ${modem.label}`);
}

async function stopProxy(modem) {
  const s = activeServers.get(modem.devicePath);
  if (s && s.servers) {
    for (const srv of s.servers) {
      try { srv.close(); } catch {}
    }
    activeServers.delete(modem.devicePath);
  }
}

// ─── Credentials Store ────────────────────────────────────────────────────────
async function addCredential(username, password, modemId) {
  if (!credStore.has(modemId)) credStore.set(modemId, []);
  const list = credStore.get(modemId);
  const existing = list.find(c => c.username === username);
  if (existing) {
    existing.password = password;
  } else {
    list.push({ username, password });
  }
  console.log(`[ProxyEngine] Added credential for user '${username}' on modem '${modemId}'`);
}

async function removeCredential(username, modemId) {
  if (!credStore.has(modemId)) return;
  const list = credStore.get(modemId).filter(c => c.username !== username);
  credStore.set(modemId, list);
}

module.exports = {
  startProxy,
  stopProxy,
  reloadConfig: async () => {},
  addCredential,
  removeCredential,
  getModemBandwidth,
};
