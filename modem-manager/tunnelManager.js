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

const VPS_HOST      = process.env.VPS_HOST || '157.151.206.163';
const VPS_USER      = process.env.VPS_USER || 'opc';
const VPS_SSH_PORT  = parseInt(process.env.VPS_SSH_PORT || '22');

function getSshKeyPath() {
  const homeKey = path.join(process.env.USERPROFILE || process.env.HOME || '', '.ssh', 'proxicell_tunnel');
  if (fs.existsSync(homeKey)) return homeKey;

  const envKey = process.env.VPS_SSH_KEY;
  if (envKey && fs.existsSync(envKey)) return envKey;

  const bundledKey = path.join(__dirname, 'keys', 'proxicell_tunnel');
  if (fs.existsSync(bundledKey)) return bundledKey;

  return envKey || bundledKey;
}

// Active port mappings: { localPort, publicPort }[]
const portMappings = [];
let autosshProcess = null;

// ─── Build SSH port-forward args ─────────────────────────────────────────────
function buildSshArgs() {
  const remoteForwards = portMappings.flatMap(({ localPort, publicPort }) => [
    '-R', `0.0.0.0:${publicPort}:127.0.0.1:${localPort}`,
  ]);

  const keyPath = getSshKeyPath();

  return [
    '-N',                              // no remote command
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=/dev/null',
    '-o', 'ExitOnForwardFailure=no',   // keep going even if a port fails
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'ConnectTimeout=15',
    '-p', String(VPS_SSH_PORT),
    '-i', keyPath,
    ...remoteForwards,
    `${VPS_USER}@${VPS_HOST}`,
  ];
}

let tunnelProcess = null;
let tunnelRestartTimer = null;
let isStopping = false;

// ─── Start/restart SSH tunnel ────────────────────────────────────────────────
async function startTunnel() {
  if (!VPS_HOST) {
    console.warn('[TunnelManager] VPS_HOST not set — tunnel disabled.');
    return;
  }

  isStopping = false;
  await stopTunnel();

  const args = buildSshArgs();
  console.log(`[TunnelManager] Starting tunnel to ${VPS_USER}@${VPS_HOST}:${VPS_SSH_PORT}`);
  console.log(`[TunnelManager] Port mappings: ${portMappings.length}`);

  const isWin = process.platform === 'win32';

  if (isWin) {
    // Windows: Use native OpenSSH client (ssh.exe) with automatic reconnect on exit
    tunnelProcess = spawn('ssh', args, {
      stdio: 'ignore',
      detached: false,
    });

    tunnelProcess.on('exit', (code) => {
      if (!isStopping && portMappings.length > 0) {
        console.warn(`[TunnelManager] Windows SSH tunnel exited (code ${code}). Reconnecting in 5s...`);
        clearTimeout(tunnelRestartTimer);
        tunnelRestartTimer = setTimeout(() => {
          if (!isStopping) startTunnel().catch(() => {});
        }, 5000);
      }
    });

    console.log(`[TunnelManager] Windows SSH tunnel started (PID: ${tunnelProcess.pid})`);
  } else {
    // Linux: Use autossh
    tunnelProcess = spawn('autossh', [
      '-M', '0',           // disable autossh monitoring port
      '-f',                // run in background
      ...args,
    ], {
      detached: true,
      stdio:    'ignore',
      env: {
        ...process.env,
        AUTOSSH_GATETIME:   '0',
        AUTOSSH_LOGLEVEL:   '5',
        AUTOSSH_LOGFILE:    `${process.env.APP_DIR || '/opt/proxicell'}/logs/autossh.log`,
      },
    });

    tunnelProcess.unref();
    console.log(`[TunnelManager] autossh started (PID: ${tunnelProcess.pid})`);
  }
}

async function stopTunnel() {
  isStopping = true;
  clearTimeout(tunnelRestartTimer);

  if (process.platform === 'win32') {
    if (tunnelProcess) {
      try { tunnelProcess.kill('SIGKILL'); } catch {}
      tunnelProcess = null;
    }
    await execAsync('taskkill /F /IM ssh.exe 2>nul || exit 0', { shell: 'cmd.exe' }).catch(() => {});
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

  for (const m of newMappings) {
    if (!portMappings.find(p => p.localPort === m.localPort)) {
      portMappings.push(m);
    }
  }

  console.log(`[TunnelManager] Added ports for ${modem.label}:`,
    newMappings.map(m => `${m.localPort}→${m.publicPort}`).join(', '));

  // Restart tunnel with updated port list
  await startTunnel();
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
    await startTunnel();
  }
}

// ─── Check tunnel health ─────────────────────────────────────────────────────
async function checkTunnelHealth() {
  if (!VPS_HOST) return false;
  if (tunnelProcess && !tunnelProcess.killed) return true;

  try {
    const keyPath = getSshKeyPath();
    await execAsync(
      `ssh -i "${keyPath}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 ` +
      `-p ${VPS_SSH_PORT} ${VPS_USER}@${VPS_HOST} echo ok`,
      { timeout: 8000 }
    );
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  startTunnel,
  stopTunnel,
  addTunnelPorts,
  removeTunnelPorts,
  checkTunnelHealth,
  portMappings,
};
