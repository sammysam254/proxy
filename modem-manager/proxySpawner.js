/**
 * ProxiCell — 3proxy Spawner
 * Generates 3proxy config files and manages the 3proxy process
 * Supports: HTTP, SOCKS4, SOCKS5 per modem interface
 */

'use strict';

const fs         = require('fs');
const path       = require('path');
const { exec }   = require('child_process');
const { promisify } = require('util');
const execAsync  = promisify(exec);

const APP_DIR     = process.env.APP_DIR || '/opt/proxicell';
const CONFIG_DIR  = path.join(APP_DIR, 'proxy-configs');
const PASSWD_FILE = path.join(CONFIG_DIR, 'passwd');
const CONFIG_FILE = path.join(CONFIG_DIR, '3proxy.cfg');
const LOG_DIR     = path.join(APP_DIR, 'logs');

// In-memory store: modemId → [ { username, password } ]
const credStore = new Map();

// ─── Ensure directories exist ─────────────────────────────────────────────────
[CONFIG_DIR, LOG_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ─── Generate passwd file (3proxy auth format) ────────────────────────────────
function writePasswdFile() {
  const lines = [];
  for (const [, creds] of credStore) {
    for (const { username, password } of creds) {
      // Format: username:CL:password  (ClearText auth)
      lines.push(`${username}:CL:${password}`);
    }
  }
  fs.writeFileSync(PASSWD_FILE, lines.join('\n') + '\n', 'utf8');
}

// ─── Generate 3proxy config ───────────────────────────────────────────────────
function generate3proxyConfig(modems) {
  const normLogPath = path.join(LOG_DIR, '3proxy.log').replace(/\\/g, '/');
  const normPasswdPath = PASSWD_FILE.replace(/\\/g, '/');

  const lines = [
    '# ProxiCell — 3proxy config',
    '# Auto-generated. Do not edit manually.',
    '',
    `log "${normLogPath}" D`,
    'logformat "- +_L%t.%.  %N.%p %E %U %C:%c %R:%r %O %I %h %T"',
    'rotate 30',
    '',
    '# Auth',
    `users $"${normPasswdPath}"`,
    '',
    '# Max connections per user',
    'maxconn 20',
    '',
    '# Connection timeout',
    'timeouts 1 5 30 60 180 1800 15 60',
    '',
    'nserver 8.8.8.8',
    'nserver 1.1.1.1',
    'nscache 65536',
    '',
    'auth strong',
    '',
  ];

  for (const modem of modems) {
    // CRITICAL: Skip any device that doesn't have a valid IP yet
    if (!modem.ipAddress || modem.ipAddress === '0.0.0.0') {
      lines.push(`# SKIPPED (no IP): ${modem.label}`);
      lines.push('');
      continue;
    }

    if (!modem.portSet) continue;

    const { http, socks4, socks5 } = modem.portSet;
    const exitIp  = modem.ipAddress;   // The SIM card's IP — this is what routes traffic out
    const bindIp  = '0.0.0.0';        // Listen on all interfaces
    const label   = modem.label.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
    const devType = modem.isAndroid ? 'Android' : 'Modem';

    lines.push(`# ── ${devType}: ${modem.label} ──`);
    lines.push(`# Interface: ${modem.interface}  Exit IP: ${exitIp}`);
    lines.push('');

    // Per-device user allow list
    const modemCreds = credStore.get(modem.id || modem.devicePath) || [];

    if (modemCreds.length > 0) {
      const userList = modemCreds.map(c => c.username).join(',');
      lines.push(`allow ${userList} * * ${http},${socks4},${socks5}`);
    } else {
      lines.push(`# No active users — denying all on :${http}/:${socks4}/:${socks5}`);
      lines.push(`deny * * * ${http},${socks4},${socks5}`);
    }
    lines.push('');

    // HTTP proxy
    lines.push(`# HTTP — ${label}`);
    lines.push(`proxy -n -a -p${http} -i${bindIp} -e${exitIp}`);
    lines.push('');

    // SOCKS4 proxy
    lines.push(`# SOCKS4 — ${label}`);
    lines.push(`socks -4 -n -a -p${socks4} -i${bindIp} -e${exitIp}`);
    lines.push('');

    // SOCKS5 proxy
    lines.push(`# SOCKS5 — ${label}`);
    lines.push(`socks -n -a -p${socks5} -i${bindIp} -e${exitIp}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Find 3proxy executable ──────────────────────────────────────────────────
function get3proxyBin() {
  const isWin = process.platform === 'win32';
  if (isWin) {
    const candidates = [
      path.join(__dirname, 'bin', '3proxy.exe'),
      path.join(APP_DIR, 'bin', '3proxy.exe'),
      path.join(process.cwd(), 'bin', '3proxy.exe'),
      '3proxy.exe',
      '3proxy',
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return '3proxy.exe';
  }
  return '3proxy';
}

// ─── Write config and reload 3proxy ──────────────────────────────────────────
let proxy3Pid = null;

async function reloadConfig(modems) {
  if (!modems) {
    writePasswdFile();
    if (proxy3Pid) {
      if (process.platform === 'win32') {
        // On Windows 3proxy re-reads passwd automatically or restarts
      } else {
        await execAsync(`kill -HUP ${proxy3Pid}`).catch(() => {});
      }
    }
    return;
  }

  const config = generate3proxyConfig(modems);
  fs.writeFileSync(CONFIG_FILE, config, 'utf8');
  writePasswdFile();

  // Stop existing 3proxy
  if (process.platform === 'win32') {
    await execAsync('taskkill /F /IM 3proxy.exe 2>nul || exit 0', { shell: 'cmd.exe' }).catch(() => {});
  } else {
    await execAsync('pkill -f 3proxy 2>/dev/null || true').catch(() => {});
  }
  await new Promise(r => setTimeout(r, 1000));

  // Start 3proxy with new config
  const bin = get3proxyBin();
  const proc = exec(`"${bin}" "${CONFIG_FILE}"`, { shell: true });
  proxy3Pid = proc.pid;

  proc.stdout?.on('data', d => process.stdout.write(`[3proxy] ${d}`));
  proc.stderr?.on('data', d => process.stderr.write(`[3proxy] ${d}`));
  proc.on('exit', code => {
    if (code !== 0 && code !== null) {
      console.error(`[3proxy] exited with code ${code}`);
    }
  });

  console.log(`[ProxySpawner] 3proxy started (PID: ${proc.pid}) with ${modems.length} device(s)`);
}

// ─── Per-device proxy start/stop ─────────────────────────────────────────────

// Registry of all devices managed by spawner (including offline ones)
const activeModems = new Map();

async function startProxy(device) {
  if (!device.ipAddress) {
    console.warn(`[ProxySpawner] startProxy called for ${device.label} but no IP — skipping`);
    return;
  }
  activeModems.set(device.devicePath, device);
  // Only build config for devices that have a valid IP
  const online = [...activeModems.values()].filter(d => d.ipAddress && d.ipAddress !== '0.0.0.0');
  await reloadConfig(online);
}

async function stopProxy(device) {
  activeModems.delete(device.devicePath);
  const online = [...activeModems.values()].filter(d => d.ipAddress && d.ipAddress !== '0.0.0.0');
  if (online.length > 0) {
    await reloadConfig(online);
  } else {
    // No online devices — kill 3proxy entirely
    await execAsync('pkill -f 3proxy 2>/dev/null || true').catch(() => {});
    proxy3Pid = null;
  }
}

// ─── Credential management ────────────────────────────────────────────────────

async function addCredential(username, password, modemId) {
  if (!credStore.has(modemId)) {
    credStore.set(modemId, []);
  }
  const creds = credStore.get(modemId);

  // Remove existing entry for this username
  const idx = creds.findIndex(c => c.username === username);
  if (idx !== -1) creds.splice(idx, 1);

  creds.push({ username, password });
  credStore.set(modemId, creds);

  writePasswdFile();

  // Signal 3proxy to reload (HUP)
  if (proxy3Pid) {
    await execAsync(`kill -HUP ${proxy3Pid}`).catch(() => {});
  }
}

async function removeCredential(username, modemId) {
  if (credStore.has(modemId)) {
    const creds = credStore.get(modemId);
    const idx = creds.findIndex(c => c.username === username);
    if (idx !== -1) {
      creds.splice(idx, 1);
      writePasswdFile();
      if (proxy3Pid) {
        await execAsync(`kill -HUP ${proxy3Pid}`).catch(() => {});
      }
    }
  }
}

// ─── Get bandwidth from iptables counters ─────────────────────────────────────
async function getModemBandwidth(modem) {
  if (!modem.interface) return { bytesIn: 0, bytesOut: 0 };
  try {
    const { stdout } = await execAsync(
      `iptables -nvL FORWARD -x 2>/dev/null | grep ${modem.interface} || echo "0 0"`
    );
    const lines = stdout.trim().split('\n');
    let bytesIn = 0, bytesOut = 0;
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        bytesIn  += parseInt(parts[1]) || 0;
        bytesOut += parseInt(parts[1]) || 0;
      }
    }
    return { bytesIn, bytesOut };
  } catch {
    return { bytesIn: 0, bytesOut: 0 };
  }
}

module.exports = {
  startProxy,
  stopProxy,
  // reloadConfig: called by index.js after each cycle
  reloadConfig: () => {
    const online = [...activeModems.values()].filter(d => d.ipAddress && d.ipAddress !== '0.0.0.0');
    return reloadConfig(online);
  },
  addCredential,
  removeCredential,
  getModemBandwidth,
};
