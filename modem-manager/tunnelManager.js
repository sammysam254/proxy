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

'use strict';

const { spawn }    = require('child_process');
const { promisify} = require('util');
const { exec }     = require('child_process');
const execAsync    = promisify(exec);

const VPS_HOST      = process.env.VPS_HOST;
const VPS_USER      = process.env.VPS_USER || 'proxicell';
const VPS_SSH_PORT  = parseInt(process.env.VPS_SSH_PORT || '22');
const VPS_SSH_KEY   = process.env.VPS_SSH_KEY || '/root/.ssh/proxicell_tunnel';

// Active port mappings: { localPort, publicPort }[]
const portMappings = [];
let autosshProcess = null;

// ─── Build SSH port-forward args ─────────────────────────────────────────────
function buildSshArgs() {
  const remoteForwards = portMappings.flatMap(({ localPort, publicPort }) => [
    '-R', `0.0.0.0:${publicPort}:127.0.0.1:${localPort}`,
  ]);

  return [
    '-N',                              // no remote command
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ExitOnForwardFailure=no',   // keep going even if a port fails
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'ConnectTimeout=15',
    '-p', String(VPS_SSH_PORT),
    '-i', VPS_SSH_KEY,
    ...remoteForwards,
    `${VPS_USER}@${VPS_HOST}`,
  ];
}

// ─── Start/restart autossh tunnel ────────────────────────────────────────────
async function startTunnel() {
  if (!VPS_HOST) {
    console.warn('[TunnelManager] VPS_HOST not set — tunnel disabled.');
    return;
  }

  await stopTunnel();

  const args = buildSshArgs();
  console.log(`[TunnelManager] Starting tunnel to ${VPS_USER}@${VPS_HOST}:${VPS_SSH_PORT}`);
  console.log(`[TunnelManager] Port mappings: ${portMappings.length}`);

  autosshProcess = spawn('autossh', [
    '-M', '0',           // disable autossh monitoring port (use ServerAlive instead)
    '-f',                // run in background (fork)
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

  autosshProcess.unref();
  console.log(`[TunnelManager] autossh started (PID: ${autosshProcess.pid})`);
}

async function stopTunnel() {
  await execAsync('pkill -f autossh 2>/dev/null || true').catch(() => {});
  autosshProcess = null;
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
  try {
    await execAsync(
      `ssh -i ${VPS_SSH_KEY} -o StrictHostKeyChecking=no -o ConnectTimeout=5 ` +
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
