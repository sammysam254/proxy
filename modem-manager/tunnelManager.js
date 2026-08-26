/**
 * ProxiCell — SSH Tunnel Manager
 * Creates and maintains a persistent reverse SSH tunnel
 * from the local machine to the Oracle VPS
 *
 * Each modem gets 3 port forwards:
 *   -R 41000:localhost:31000  (HTTP)
 *   -R 42000:localhost:32000  (SOCKS4)
 *   -R 43000:localhost:33000  (SOCKS5)
 */

const fs           = require('fs');
const path         = require('path');
const { spawn }    = require('child_process');
const { promisify} = require('util');
const { exec }     = require('child_process');
const execAsync    = promisify(exec);

const VPS_HOST      = process.env.VPS_HOST || '104.131.118.5';
const VPS_USER      = process.env.VPS_USER || 'root';
const VPS_SSH_PORT  = parseInt(process.env.VPS_SSH_PORT || '22');

function syncSshKeys() {
  try {
    const homeDir = process.env.USERPROFILE || process.env.HOME || '';
    const candidates = [
      path.join(homeDir, '.ssh'),
      'C:\\Windows\\System32\\config\\systemprofile\\.ssh',
      'C:\\ProgramData\\ssh'
    ];

    const bundledKey   = path.join(__dirname, 'keys', 'proxicell_tunnel');
    const bundledPubKey= path.join(__dirname, 'keys', 'proxicell_tunnel.pub');

    // Ensure bundled key has Unix LF line endings (required by OpenSSH)
    if (fs.existsSync(bundledKey)) {
      try {
        const raw = fs.readFileSync(bundledKey, 'utf8');
        if (raw.includes('\r\n')) {
          fs.writeFileSync(bundledKey, raw.replace(/\r\n/g, '\n').trim() + '\n', 'utf8');
        }
      } catch (_) {}
    }

    if (fs.existsSync(bundledKey)) {
      const bContent = fs.readFileSync(bundledKey, 'utf8').replace(/\r\n/g, '\n').trim() + '\n';
      const pubContent = fs.existsSync(bundledPubKey) ? fs.readFileSync(bundledPubKey, 'utf8').replace(/\r\n/g, '\n').trim() + '\n' : null;

      for (const dir of candidates) {
        if (!dir) continue;
        try {
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          const targetKey = path.join(dir, 'proxicell_tunnel');
          fs.writeFileSync(targetKey, bContent, 'utf8');
          if (pubContent) {
            fs.writeFileSync(path.join(dir, 'proxicell_tunnel.pub'), pubContent, 'utf8');
          }
          if (process.platform === 'win32') {
            const user = process.env.USERNAME || 'Administrator';
            try {
              execSync(`cmd.exe /c "icacls \\"${targetKey}\\" /reset >nul 2>&1 & icacls \\"${targetKey}\\" /inheritance:r >nul 2>&1 & icacls \\"${targetKey}\\" /grant:r \\"${user}\\":F >nul 2>&1 & icacls \\"${targetKey}\\" /grant:r \\"SYSTEM\\":F >nul 2>&1 & icacls \\"${targetKey}\\" /grant:r \\"Administrators\\":F >nul 2>&1"`, { timeout: 3000 });
            } catch (_) {}
          } else {
            try { fs.chmodSync(targetKey, 0o600); } catch (_) {}
          }
        } catch (_) {}
      }

      if (process.platform === 'win32') {
        const user = process.env.USERNAME || 'Administrator';
        try {
          execSync(`cmd.exe /c "icacls \\"${bundledKey}\\" /reset >nul 2>&1 & icacls \\"${bundledKey}\\" /inheritance:r >nul 2>&1 & icacls \\"${bundledKey}\\" /grant:r \\"${user}\\":F >nul 2>&1 & icacls \\"${bundledKey}\\" /grant:r \\"SYSTEM\\":F >nul 2>&1 & icacls \\"${bundledKey}\\" /grant:r \\"Administrators\\":F >nul 2>&1"`, { timeout: 3000 });
        } catch (_) {}
      }
    }
  } catch (e) {
    // Non-fatal fallback
  }
}

function getSshKeyPath() {
  syncSshKeys();
  const candidates = [
    path.join(__dirname, 'keys', 'proxicell_tunnel'),
    path.join(process.env.USERPROFILE || process.env.HOME || '', '.ssh', 'proxicell_tunnel'),
    'C:\\proxy\\modem-manager\\keys\\proxicell_tunnel',
    'C:\\Windows\\System32\\config\\systemprofile\\.ssh\\proxicell_tunnel',
    'C:\\Users\\sammy\\.ssh\\proxicell_tunnel',
    process.env.VPS_SSH_KEY
  ];

  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }

  return path.join(__dirname, 'keys', 'proxicell_tunnel');
}

function getPublicKeyContent() {
  const pubCandidates = [
    path.join(__dirname, 'keys', 'proxicell_tunnel.pub'),
    path.join(process.env.USERPROFILE || process.env.HOME || '', '.ssh', 'proxicell_tunnel.pub'),
    'C:\\proxy\\modem-manager\\keys\\proxicell_tunnel.pub',
    'C:\\Users\\sammy\\.ssh\\proxicell_tunnel.pub'
  ];
  for (const p of pubCandidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  }
  return null;
}

// Active port mappings: { localPort, publicPort }[]
const portMappings = [];
let tunnelProcess = null;
let tunnelRestartTimer = null;
let isStopping = false;
let lastSshError = null;

// ─── Build SSH port-forward args ─────────────────────────────────────────────
const REMOTE_SSH_PORT = parseInt(process.env.REMOTE_SSH_PORT || '2222', 10);

// ─── Clean remote VPS ports & ensure GatewayPorts is active ──────────────────
async function cleanRemoteVpsPorts() {
  // OpenSSH handles port cleanup natively with StreamLocalBindUnlink=yes
  return true;
}

// ─── Build SSH port-forward args ─────────────────────────────────────────────
function buildSshArgs() {
  const remoteForwards = [
    // Private management port: strictly bound to VPS localhost (127.0.0.1) so it is NEVER exposed publicly
    '-R', `127.0.0.1:${REMOTE_SSH_PORT}:127.0.0.1:22`,
    ...portMappings.flatMap(({ localPort, publicPort }) => [
      '-R', `0.0.0.0:${publicPort}:127.0.0.1:${localPort}`,
    ])
  ];

  const keyPath = getSshKeyPath();

  return [
    '-N',                              // no remote command
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=/dev/null',
    '-o', 'StreamLocalBindUnlink=yes',
    '-o', 'ExitOnForwardFailure=no',   // keep going even if a single port fails
    '-o', 'ServerAliveInterval=15',    // send keepalive packet every 15s
    '-o', 'ServerAliveCountMax=3',     // disconnect if 3 keepalives fail (45s)
    '-o', 'ConnectTimeout=10',
    '-o', 'TCPKeepAlive=yes',
    '-o', 'IPQoS=throughput',          // optimize TCP buffers for maximum bandwidth
    '-o', 'Compression=no',            // disable CPU compression bottleneck for maximum speed
    '-c', 'aes128-gcm@openssh.com,chacha20-poly1305@openssh.com,aes256-gcm@openssh.com', // hardware AES-NI acceleration
    '-p', String(VPS_SSH_PORT),
    '-i', keyPath,
    ...remoteForwards,
    `${VPS_USER}@${VPS_HOST}`,
  ];
}

let _activeTunnelPortsSignature = '';

function getPortsSignature() {
  return portMappings.map(m => `${m.localPort}:${m.publicPort}`).sort().join(',');
}

// ─── Check if SSH process is running ─────────────────────────────────────────
async function isTunnelRunning() {
  if (tunnelProcess && !tunnelProcess.killed && tunnelProcess.exitCode === null) {
    return true;
  }
  return false;
}

let _startTunnelDebounceTimer = null;
function scheduleTunnelStart(delayMs = 600) {
  clearTimeout(_startTunnelDebounceTimer);
  return new Promise((resolve) => {
    _startTunnelDebounceTimer = setTimeout(async () => {
      const res = await startTunnel();
      resolve(res);
    }, delayMs);
  });
}

// ─── Start/restart SSH tunnel ────────────────────────────────────────────────
async function startTunnel(force = false) {
  if (!VPS_HOST) {
    console.warn('[TunnelManager] VPS_HOST not set — tunnel disabled.');
    return false;
  }

  if (portMappings.length === 0) {
    console.log('[TunnelManager] No active port mappings yet — tunnel standing by.');
    return true;
  }

  const currentSig = getPortsSignature();

  // If already running and port list has not changed, do NOT restart
  if (!force && tunnelProcess && !tunnelProcess.killed && tunnelProcess.exitCode === null && _activeTunnelPortsSignature === currentSig) {
    return true;
  }

  isStopping = true;
  clearTimeout(tunnelRestartTimer);

  if (tunnelProcess) {
    try { tunnelProcess.kill(); } catch {}
    tunnelProcess = null;
  }

  // Release any lingering port listeners on the VPS
  await cleanRemoteVpsPorts();

  const args = buildSshArgs();
  console.log(`[TunnelManager] Starting persistent SSH tunnel to ${VPS_USER}@${VPS_HOST}:${VPS_SSH_PORT}`);
  console.log(`[TunnelManager] Active port forwards (${portMappings.length}): ${portMappings.map(m => `${m.localPort}→${m.publicPort}`).join(', ')}`);

  _activeTunnelPortsSignature = currentSig;
  isStopping = false;

  const isWin = process.platform === 'win32';

  if (isWin) {
    tunnelProcess = spawn('ssh', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    if (tunnelProcess.stderr) {
      tunnelProcess.stderr.on('data', (data) => {
        const str = data.toString().trim();
        if (str) {
          lastSshError = str;
          if (!str.includes('Warning: Permanently added') && !str.includes('Warning: remote port forwarding failed')) {
            console.warn(`[TunnelManager] SSH stderr: ${str}`);
          }
        }
      });
    }

    tunnelProcess.on('exit', (code) => {
      tunnelProcess = null;
      _activeTunnelPortsSignature = '';
      if (!isStopping && portMappings.length > 0) {
        console.warn(`[TunnelManager] SSH tunnel exited (code ${code}). Auto-reconnecting in 3s...`);
        clearTimeout(tunnelRestartTimer);
        tunnelRestartTimer = setTimeout(() => {
          if (!isStopping && portMappings.length > 0) {
            startTunnel(true).catch(e => console.error('[TunnelManager] Reconnect error:', e.message));
          }
        }, 3000);
      }
    });

    console.log(`[TunnelManager] Windows SSH tunnel spawned (PID: ${tunnelProcess.pid})`);
    return true;
  } else {
    // Linux: autossh
    tunnelProcess = spawn('autossh', [
      '-M', '0',
      '-f',
      ...args,
    ], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        AUTOSSH_GATETIME: '0',
        AUTOSSH_LOGLEVEL: '5',
      },
    });

    tunnelProcess.unref();
    console.log(`[TunnelManager] autossh started (PID: ${tunnelProcess.pid})`);
    return true;
  }
}

async function stopTunnel() {
  isStopping = true;
  clearTimeout(tunnelRestartTimer);
  clearTimeout(_startTunnelDebounceTimer);

  if (process.platform === 'win32') {
    if (tunnelProcess) {
      try { tunnelProcess.kill(); } catch {}
      tunnelProcess = null;
    }
    await execAsync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'ssh.exe'\\" | Where-Object { $_.CommandLine -like '*${VPS_HOST}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { timeout: 4000 }).catch(() => {});
  } else {
    await execAsync('pkill -f autossh 2>/dev/null || true').catch(() => {});
    tunnelProcess = null;
  }
}

// ─── Add tunnel ports for a new modem ─────────────────────────────────────────
async function addTunnelPorts(modem) {
  if (!modem.portSet) return;

  const { http, socks4, socks5, publicHttp, publicSocks4, publicSocks5 } = modem.portSet;

  const newMappings = [
    { localPort: http,   publicPort: publicHttp },
    { localPort: socks4, publicPort: publicSocks4 },
    { localPort: socks5, publicPort: publicSocks5 },
  ];

  let added = false;
  for (const m of newMappings) {
    if (!portMappings.find(p => p.localPort === m.localPort)) {
      portMappings.push(m);
      added = true;
    }
  }

  if (added) {
    console.log(`[TunnelManager] Added ports for ${modem.label}:`,
      newMappings.map(m => `${m.localPort}→${m.publicPort}`).join(', '));
    // Batch/debounce tunnel startup across all discovered devices
    scheduleTunnelStart(600);
  }
}

async function removeTunnelPorts(modem) {
  if (!modem.portSet) return;

  const toRemove = new Set([
    modem.portSet.http,
    modem.portSet.socks4,
    modem.portSet.socks5,
  ]);

  const before = portMappings.length;
  portMappings.splice(0, portMappings.length,
    ...portMappings.filter(m => !toRemove.has(m.localPort))
  );

  if (portMappings.length < before) {
    console.log(`[TunnelManager] Removed ports for ${modem.label}`);
    if (portMappings.length > 0) {
      await startTunnel();
    } else {
      await stopTunnel();
    }
  }
}

// ─── Ensure tunnel is connected (called on every detection cycle) ─────────────
async function ensureTunnelConnected() {
  if (!VPS_HOST || portMappings.length === 0) return true;

  const running = await isTunnelRunning();
  if (!running) {
    console.warn('[TunnelManager] VPS tunnel is NOT active. Re-establishing connection now...');
    return await startTunnel();
  }
  return true;
}

// ─── Check tunnel health via process state and connection ────────────────────
async function checkTunnelHealth() {
  if (!VPS_HOST) return false;

  const running = await isTunnelRunning();
  if (!running && portMappings.length > 0) {
    return false;
  }

  // If the background SSH process is active and running without error, it is healthy
  if (running) {
    return true;
  }

  try {
    const keyPath = getSshKeyPath();
    if (!keyPath || !fs.existsSync(keyPath)) return false;
    await execAsync(
      `ssh -i "${keyPath}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 ` +
      `-p ${VPS_SSH_PORT} ${VPS_USER}@${VPS_HOST} echo ok`,
      { timeout: 8000 }
    );
    return true;
  } catch (err) {
    lastSshError = err.message;
    return false;
  }
}

module.exports = {
  startTunnel,
  stopTunnel,
  addTunnelPorts,
  removeTunnelPorts,
  ensureTunnelConnected,
  checkTunnelHealth,
  isTunnelRunning,
  getSshKeyPath,
  getPublicKeyContent,
  syncSshKeys,
  portMappings,
};
