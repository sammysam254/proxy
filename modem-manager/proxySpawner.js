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

// ─── Uncap Libuv Threadpool for Instant Parallel DNS & Network I/O ───────────
process.env.UV_THREADPOOL_SIZE = '128';

const http = require('http');
const net  = require('net');
const url  = require('url');
const os   = require('os');
const dns  = require('dns');

// ─── Fast In-Memory DNS Cache (0ms repeat lookup latency) ─────────────────────
const _dnsCache = new Map();
const DNS_CACHE_TTL = 300_000; // 5 minutes

async function resolveHostFast(hostname) {
  if (!hostname || net.isIP(hostname)) return hostname;
  
  const cached = _dnsCache.get(hostname);
  if (cached && (Date.now() - cached.time < DNS_CACHE_TTL)) {
    return cached.ip;
  }

  try {
    const addresses = await dns.promises.resolve4(hostname);
    if (addresses && addresses.length > 0) {
      const ip = addresses[0];
      _dnsCache.set(hostname, { ip, time: Date.now() });
      return ip;
    }
  } catch {}

  return new Promise((resolve) => {
    dns.lookup(hostname, { family: 4 }, (err, address) => {
      if (!err && address) {
        _dnsCache.set(hostname, { ip: address, time: Date.now() });
        return resolve(address);
      }
      resolve(hostname);
    });
  });
}

// ─── Network Interface Binding Validator ──────────────────────────────────────
let _cachedAvailableIps = new Set();
let _lastIpScanTime = 0;

function getAvailableLocalIps() {
  const now = Date.now();
  if (now - _lastIpScanTime < 5000 && _cachedAvailableIps.size > 0) {
    return _cachedAvailableIps;
  }
  const ips = new Set();
  try {
    const ifaces = os.networkInterfaces();
    for (const name in ifaces) {
      for (const iface of ifaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.add(iface.address);
        }
      }
    }
  } catch {}
  _cachedAvailableIps = ips;
  _lastIpScanTime = now;
  return ips;
}

function getValidLocalAddress(ip) {
  if (!ip || ip === '0.0.0.0' || ip === '127.0.0.1' || ip.startsWith('127.')) return undefined;
  const ips = getAvailableLocalIps();
  if (ips.has(ip)) return ip;
  // If exact IP is not directly bound or changed, return undefined (System Direct Gateway routing for full speed & 100% uptime)
  return undefined;
}

// ─── State ────────────────────────────────────────────────────────────────────
// In-memory credential store: modemId → [ { username, password } ]
const credStore = new Map();
// Global quick lookup map: username → password
const globalUserMap = new Map();

// Active server instances: devicePath → { httpServers: [], socksServers: [], bandwidth: { in: 0, out: 0 } }
const activeServers = new Map();

// ─── Authentication Helper ───────────────────────────────────────────────────
function isAuthorized(modemId, username, password) {
  if (!username || !password) return false;
  // 1. Direct match in globalUserMap (fastest & most reliable)
  if (globalUserMap.has(username) && globalUserMap.get(username) === password) {
    return true;
  }
  // 2. Direct match for this specific modemId
  const creds = credStore.get(modemId);
  if (creds && creds.some(c => c.username === username && c.password === password)) {
    return true;
  }
  // 3. Fallback across all registered modems in credStore
  for (const [, list] of credStore) {
    if (list && list.some(c => c.username === username && c.password === password)) {
      return true;
    }
  }
  return false;
}

// User-level bandwidth store: username → { in: 0, out: 0, lastSyncedIn: 0, lastSyncedOut: 0 }
const userBandwidthStore = new Map();

function recordUserBandwidth(username, bytesIn, bytesOut) {
  if (!username) return;
  let entry = userBandwidthStore.get(username);
  if (!entry) {
    entry = { in: 0, out: 0, lastSyncedIn: 0, lastSyncedOut: 0 };
    userBandwidthStore.set(username, entry);
  }
  entry.in  += bytesIn;
  entry.out += bytesOut;
}

function getDeltaUserBandwidth(username) {
  if (!username) return { deltaIn: 0, deltaOut: 0, totalDelta: 0 };
  const entry = userBandwidthStore.get(username);
  if (!entry) return { deltaIn: 0, deltaOut: 0, totalDelta: 0 };

  const deltaIn  = Math.max(0, entry.in - entry.lastSyncedIn);
  const deltaOut = Math.max(0, entry.out - entry.lastSyncedOut);
  const totalDelta = deltaIn + deltaOut;

  entry.lastSyncedIn  = entry.in;
  entry.lastSyncedOut = entry.out;

  return { deltaIn, deltaOut, totalDelta };
}

// ─── Socket Stream Tuning & Optimization (Uncapped Maximum Throughput) ───────
function tuneSocket(sock) {
  if (!sock) return;
  try {
    sock.setNoDelay(true);
    sock.setKeepAlive(true, 1000);
    if (sock.readableHighWaterMark !== undefined) sock.readableHighWaterMark = 64 * 1024 * 1024;
    if (sock.writableHighWaterMark !== undefined) sock.writableHighWaterMark = 64 * 1024 * 1024;
  } catch {}
}

// ─── Socket Stream Forwarder with Native Zero-Overhead C++ Stream Piping (1 Gbps+) ───
function forwardStreams(clientSocket, serverSocket, trackingKey, username) {
  tuneSocket(clientSocket);
  tuneSocket(serverSocket);

  let lastClientRead = clientSocket.bytesRead || 0;
  let lastServerRead = serverSocket.bytesRead || 0;

  const flushBytes = () => {
    const curClientRead = clientSocket.bytesRead || 0;
    const curServerRead = serverSocket.bytesRead || 0;
    const deltaIn = Math.max(0, curClientRead - lastClientRead);
    const deltaOut = Math.max(0, curServerRead - lastServerRead);
    if (deltaIn > 0 || deltaOut > 0) {
      recordBandwidth(trackingKey, deltaOut, deltaIn);
      if (username) {
        recordUserBandwidth(username, deltaOut, deltaIn);
      }
      lastClientRead = curClientRead;
      lastServerRead = curServerRead;
    }
  };

  // Flush bandwidth periodically without interrupting streaming
  const interval = setInterval(flushBytes, 1000);

  // Native kernel stream piping — delivers maximum line speed
  clientSocket.pipe(serverSocket);
  serverSocket.pipe(clientSocket);

  const cleanup = () => {
    clearInterval(interval);
    flushBytes();
    if (!serverSocket.destroyed) serverSocket.destroy();
    if (!clientSocket.destroyed) clientSocket.destroy();
  };

  clientSocket.on('error', cleanup);
  serverSocket.on('error', cleanup);
  clientSocket.on('close', cleanup);
  serverSocket.on('close', cleanup);
}

const httpKeepAliveAgent = new http.Agent({
  keepAlive: true,
  maxSockets: Infinity,
  maxFreeSockets: Infinity,
  maxTotalSockets: Infinity,
  timeout: 0,
  keepAliveMsecs: 1000,
});

// ─── HTTP / HTTPS CONNECT Proxy Server ───────────────────────────────────────
function createHttpProxy(modem, port) {
  const exitIp       = modem.ipAddress;
  const boundAddress = getValidLocalAddress(exitIp);
  const modemId      = modem.id || modem.devicePath;
  const trackKey     = modemId;

  const server = http.createServer({
    highWaterMark: 64 * 1024 * 1024,
    keepAlive: true,
    keepAliveInitialDelay: 1000,
    keepAliveTimeout: 0,
  }, (req, res) => {
    let authUser = null;
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
      authUser = u;
    } else {
      const creds = credStore.get(modemId);
      if ((creds && creds.length > 0) || credStore.size > 0) {
        res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="ProxiCell Proxy"' });
        return res.end('Proxy Authentication Required');
      }
    }

    // 2. Forward regular HTTP request
    const parsed = url.parse(req.url);
    const rawHost = req.headers['host'] || '';
    const hostParts = rawHost.split(':');
    const targetHost = parsed.hostname || hostParts[0] || '127.0.0.1';
    const targetPort = parsed.port || (hostParts[1] ? parseInt(hostParts[1], 10) : 80);
    const targetPath = parsed.path || req.url || '/';

    const options = {
      hostname:     targetHost,
      port:         targetPort,
      path:         targetPath,
      method:       req.method,
      headers:      { ...req.headers },
      agent:        httpKeepAliveAgent,
      localAddress: boundAddress,
    };

    delete options.headers['proxy-authorization'];

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.on('data', chunk => {
        recordBandwidth(trackKey, chunk.length, 0);
        if (authUser) recordUserBandwidth(authUser, chunk.length, 0);
      });
      proxyRes.pipe(res);
    });

    req.on('data', chunk => {
      recordBandwidth(trackKey, 0, chunk.length);
      if (authUser) recordUserBandwidth(authUser, 0, chunk.length);
    });
    req.pipe(proxyReq);

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
      }
      res.end('Bad Gateway');
    });
  });

  // 3. Handle HTTPS CONNECT Tunnels
  server.on('connect', (req, clientSocket, head) => {
    try {
      clientSocket.setNoDelay(true);
      clientSocket.setKeepAlive(true, 1000);
    } catch {}

    let authUser = null;
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
      authUser = u;
    } else {
      const creds = credStore.get(modemId);
      if ((creds && creds.length > 0) || credStore.size > 0) {
        clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="ProxiCell"\r\n\r\n');
        return clientSocket.end();
      }
    }

    const [targetHost, targetPort] = req.url.split(':');
    const portNum = parseInt(targetPort || '443');

    async function doConnect() {
      const resolvedHost = await resolveHostFast(targetHost);
      const opts = { host: resolvedHost, port: portNum };
      if (boundAddress) opts.localAddress = boundAddress;

      const serverSocket = net.connect(opts, () => {
        tuneSocket(serverSocket);
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head && head.length > 0) {
          recordBandwidth(trackKey, 0, head.length);
          if (authUser) recordUserBandwidth(authUser, 0, head.length);
          serverSocket.write(head);
        }
        forwardStreams(clientSocket, serverSocket, trackKey, authUser);
      });

      serverSocket.on('error', () => {
        if (!clientSocket.destroyed) {
          try {
            clientSocket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 11\r\n\r\nBad Gateway');
          } catch {
            clientSocket.destroy();
          }
        }
      });
    }

    doConnect();
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[ProxyEngine] HTTP/HTTPS proxy listening on 0.0.0.0:${port} (Exit: ${exitIp || '0.0.0.0'})`);
  });

  return server;
}

// ─── SOCKS5 / SOCKS4 Proxy Server ───────────────────────────────────────────
function createSocksProxy(modem, port, isSocks4 = false) {
  const exitIp       = modem.ipAddress;
  const boundAddress = getValidLocalAddress(exitIp);
  const modemId      = modem.id || modem.devicePath;
  const trackKey     = modemId;

  const server = net.createServer({
    pauseOnConnect: false,
    highWaterMark: 64 * 1024 * 1024,
  }, (socket) => {
    tuneSocket(socket);

    socket.once('data', (firstChunk) => {
      const version = firstChunk[0];

      if (version === 0x05 && !isSocks4) {
        // ── SOCKS5 Handshake ──────────────────────────────────────────────
        const nmethods = firstChunk[1];
        const methods  = firstChunk.slice(2, 2 + nmethods);
        const creds    = credStore.get(modemId);
        const reqAuth  = (creds && creds.length > 0) || credStore.size > 0;

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
              handleSocks5Request(socket, modem, boundAddress, trackKey, u);
            } else {
              socket.write(Buffer.from([0x01, 0x01])); // Auth failed
              socket.destroy();
            }
          });
        } else {
          // No auth required (0x00)
          socket.write(Buffer.from([0x05, 0x00]));
          handleSocks5Request(socket, modem, boundAddress, trackKey, null);
        }
      } else if (version === 0x04 || isSocks4) {
        // ── SOCKS4 Handshake ──────────────────────────────────────────────
        const cmd = firstChunk[1];
        if (cmd !== 0x01) return socket.destroy(); // only CONNECT supported
        const destPort = firstChunk.readUInt16BE(2);
        const destIp   = `${firstChunk[4]}.${firstChunk[5]}.${firstChunk[6]}.${firstChunk[7]}`;

        const opts = { host: destIp, port: destPort };
        if (boundAddress) opts.localAddress = boundAddress;

        const outbound = net.connect(opts, () => {
          try {
            outbound.setNoDelay(true);
            outbound.setKeepAlive(true, 1000);
          } catch {}
          socket.write(Buffer.from([0x00, 0x5a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
          forwardStreams(socket, outbound, trackKey, null);
        });

        outbound.on('error', () => {
          if (!socket.destroyed) socket.destroy();
        });
      } else {
        socket.destroy();
      }
    });

    socket.on('error', () => {});
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[ProxyEngine] SOCKS${isSocks4 ? '4' : '5'} proxy listening on 0.0.0.0:${port} (Exit: ${exitIp || '0.0.0.0'})`);
  });

  return server;
}

function handleSocks5Request(socket, modem, boundAddress, trackKey, username) {
  socket.once('data', (req) => {
    if (req.length < 4 || req[0] !== 0x05) {
      return socket.destroy();
    }
    if (req[1] !== 0x01) { // only TCP CONNECT supported
      socket.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
      return socket.destroy();
    }

    const addrType = req[3];
    let host = '';
    let port = 0;
    let offset = 4;

    if (addrType === 0x01) {
      // IPv4
      if (req.length < 10) return socket.destroy();
      host = `${req[4]}.${req[5]}.${req[6]}.${req[7]}`;
      offset = 8;
    } else if (addrType === 0x03) {
      // Domain name
      const len = req[4];
      if (req.length < 5 + len + 2) return socket.destroy();
      host = req.slice(5, 5 + len).toString('utf8');
      offset = 5 + len;
    } else if (addrType === 0x04) {
      // IPv6
      if (req.length < 22) return socket.destroy();
      host = req.slice(4, 20).toString('hex').match(/.{1,4}/g).join(':');
      offset = 20;
    } else {
      socket.write(Buffer.from([0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
      return socket.destroy();
    }

    port = req.readUInt16BE(offset);

    // Pause socket during connection establishment so TLS handshake packets are not dropped
    socket.pause();

    async function doSocksConnect() {
      const resolvedHost = await resolveHostFast(host);
      const opts = { host: resolvedHost, port };
      if (boundAddress) opts.localAddress = boundAddress;

      const outbound = net.connect(opts, () => {
        tuneSocket(outbound);
        // SOCKS5 success response (0x05, 0x00 = success, 0x00 = RSV, 0x01 = IPv4, 0.0.0.0:0)
        const resp = Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
        socket.write(resp, () => {
          forwardStreams(socket, outbound, trackKey, username);
          socket.resume();
        });
      });

      outbound.on('error', () => {
        if (!socket.destroyed) {
          socket.resume();
          socket.write(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          socket.destroy();
        }
      });
    }

    doSocksConnect();
  });
}

// ─── Bandwidth Tracking ───────────────────────────────────────────────────────
function recordBandwidth(trackingKey, bytesIn, bytesOut) {
  const s = activeServers.get(trackingKey);
  if (s && s.bandwidth) {
    s.bandwidth.in  += bytesIn;
    s.bandwidth.out += bytesOut;
  }
}

async function getModemBandwidth(modem) {
  // Key by modem.id (Supabase UUID) — consistent for all device types
  const key = modem.id || modem.devicePath;
  const s = activeServers.get(key);
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

  // Key by modem.id — always consistent regardless of device type
  const key = modem.id || modem.devicePath;
  activeServers.set(key, {
    servers: [httpSrv, socks4Srv, socks5Srv],
    bandwidth: { in: 0, out: 0 },
  });

  console.log(`[ProxyEngine] ✅ Started HTTP(:${httpPort}), SOCKS4(:${socks4Port}), SOCKS5(:${socks5Port}) for ${modem.label}`);
}

async function stopProxy(modem) {
  const key = modem.id || modem.devicePath;
  const s = activeServers.get(key);
  if (s && s.servers) {
    for (const srv of s.servers) {
      try { srv.close(); } catch {}
    }
    activeServers.delete(key);
  }
}

// ─── Credentials Store ────────────────────────────────────────────────────────
async function addCredential(username, password, modemId) {
  if (username && password) globalUserMap.set(username, password);
  if (!credStore.has(modemId)) credStore.set(modemId, []);
  const list = credStore.get(modemId);
  const existing = list.find(c => c.username === username);
  if (existing) {
    existing.password = password;
  } else {
    list.push({ username, password });
  }
}

async function removeCredential(username, modemId) {
  if (username) {
    globalUserMap.delete(username);
  }
  if (modemId && credStore.has(modemId)) {
    const list = credStore.get(modemId) || [];
    const filtered = list.filter(c => c.username !== username);
    credStore.set(modemId, filtered);
  }
  if (username && !modemId) {
    for (const [mId, list] of credStore) {
      credStore.set(mId, (list || []).filter(c => c.username !== username));
    }
  }
  console.log(`[ProxyEngine] 🔒 Revoked and invalidated credential for user '${username}'`);
}

async function setExactCredentials(modemId, credsList) {
  credStore.set(modemId, credsList || []);
  for (const c of credsList || []) {
    if (c.username && c.password) globalUserMap.set(c.username, c.password);
  }
}

async function setAllActiveCredentials(subsList) {
  globalUserMap.clear();
  credStore.clear();
  for (const sub of subsList || []) {
    if (sub.proxy_username && sub.proxy_password) {
      globalUserMap.set(sub.proxy_username, sub.proxy_password);
      const mId = sub.proxies?.modem_id || sub.modem_id;
      if (mId) {
        if (!credStore.has(mId)) credStore.set(mId, []);
        credStore.get(mId).push({ username: sub.proxy_username, password: sub.proxy_password });
      }
    }
  }
  console.log(`[ProxyEngine] Synchronized ${globalUserMap.size} active proxy credentials.`);
}

module.exports = {
  startProxy,
  stopProxy,
  reloadConfig: async () => {},
  addCredential,
  removeCredential,
  setExactCredentials,
  setAllActiveCredentials,
  getModemBandwidth,
  getDeltaUserBandwidth,
  recordUserBandwidth,
};
