/**
 * Vertex Proxies — Background Service Daemon Supervisor & Autonomous Healing Engine
 * Runs continuously in the background, enforces single-instance execution,
 * auto-restarts crashed workers, performs periodic health-checks,
 * and maintains rotating log files.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const BASE_DIR = __dirname;
const LOGS_DIR = path.join(BASE_DIR, 'logs');
const MODEM_DIR = path.join(BASE_DIR, 'modem-manager');
const PID_FILE = path.join(LOGS_DIR, 'service.pid');
const WORKERS_PID_FILE = path.join(LOGS_DIR, 'workers.json');
const SERVICE_LOG = path.join(LOGS_DIR, 'service.log');
const ERROR_LOG = path.join(LOGS_DIR, 'error.log');

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB rotation limit

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Enhance process PATH
const extraPaths = [
  'C:\\Program Files\\nodejs',
  'C:\\Program Files (x86)\\nodejs',
  'C:\\Windows\\System32\\OpenSSH',
  'C:\\Program Files\\Git\\cmd',
  'C:\\Program Files\\Git\\bin',
  path.join(MODEM_DIR, 'bin'),
  path.join(MODEM_DIR, 'bin', 'platform-tools')
];
const currentPath = process.env.PATH || '';
process.env.PATH = extraPaths.filter(p => fs.existsSync(p)).join(';') + ';' + currentPath;

function isProcessAlive(pid) {
  if (!pid || isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

// ─── Single-Instance Enforcement ─────────────────────────────────────────────
if (fs.existsSync(PID_FILE)) {
  try {
    const existingPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (existingPid && existingPid !== process.pid && isProcessAlive(existingPid)) {
      // Check if that PID is actually a node process running service-daemon
      try {
        const ps = `Get-CimInstance Win32_Process -Filter "ProcessId = ${existingPid}" -ErrorAction SilentlyContinue | Select-Object CommandLine | ConvertTo-Json`;
        const raw = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, {
          timeout: 4000,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore']
        }).toString().trim();
        if (raw && raw.includes('service-daemon.js')) {
          // Another daemon is already running! Exit silently.
          process.exit(0);
        }
      } catch (_) {}
    }
  } catch (_) {}
}

// Write master PID file
try {
  fs.writeFileSync(PID_FILE, process.pid.toString(), 'utf8');
} catch (e) {}

function rotateLogIfNeeded(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size > MAX_LOG_SIZE) {
        const backupPath = filePath + '.1';
        if (fs.existsSync(backupPath)) {
          try { fs.unlinkSync(backupPath); } catch (_) {}
        }
        fs.renameSync(filePath, backupPath);
      }
    }
  } catch (err) {}
}

function logMessage(level, msg) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const line = `[${timestamp}] [${level}] ${msg}\n`;
  rotateLogIfNeeded(SERVICE_LOG);
  try {
    fs.appendFileSync(SERVICE_LOG, line, 'utf8');
    if (level === 'ERROR') {
      rotateLogIfNeeded(ERROR_LOG);
      fs.appendFileSync(ERROR_LOG, line, 'utf8');
    }
  } catch (e) {}
}

logMessage('INFO', '==================================================');
logMessage('INFO', `Vertex Proxies Background Service Daemon started (PID: ${process.pid})`);
logMessage('INFO', '==================================================');

const processes = {
  main: {
    file: 'index.js',
    child: null,
    restartCount: 0,
    isShuttingDown: false,
    startTime: 0
  },
  bandwidth: {
    file: 'bandwidthTracker.js',
    child: null,
    restartCount: 0,
    isShuttingDown: false,
    startTime: 0
  }
};

function updateWorkersPidFile() {
  try {
    const data = {
      daemon: process.pid,
      main: processes.main.child ? processes.main.child.pid : null,
      bandwidth: processes.bandwidth.child ? processes.bandwidth.child.pid : null,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(WORKERS_PID_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

function spawnWorker(key) {
  const proc = processes[key];
  if (proc.isShuttingDown) return;

  if (proc.child && isProcessAlive(proc.child.pid)) {
    return; // Already running
  }

  const targetPath = path.join(MODEM_DIR, proc.file);
  if (!fs.existsSync(targetPath)) {
    logMessage('ERROR', `Target script not found: ${targetPath}`);
    return;
  }

  logMessage('INFO', `Starting ${key} worker (${proc.file})...`);
  proc.startTime = Date.now();

  const child = spawn(process.execPath, [targetPath], {
    cwd: MODEM_DIR,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  proc.child = child;
  updateWorkersPidFile();

  child.stdout.on('data', (data) => {
    const text = data.toString();
    rotateLogIfNeeded(SERVICE_LOG);
    try {
      fs.appendFileSync(SERVICE_LOG, text, 'utf8');
    } catch (e) {}
  });

  child.stderr.on('data', (data) => {
    const text = data.toString();
    // Filter out benign noise from stderr
    if (!text.includes('Debugger attached') && !text.includes('ExperimentalWarning')) {
      rotateLogIfNeeded(ERROR_LOG);
      rotateLogIfNeeded(SERVICE_LOG);
      try {
        fs.appendFileSync(ERROR_LOG, text, 'utf8');
        fs.appendFileSync(SERVICE_LOG, text, 'utf8');
      } catch (e) {}
    }
  });

  child.on('exit', (code, signal) => {
    logMessage('WARN', `${key} worker (${proc.file}) exited with code ${code}, signal ${signal}`);
    proc.child = null;
    updateWorkersPidFile();

    if (!proc.isShuttingDown) {
      const runDuration = Date.now() - proc.startTime;
      if (runDuration > 30000) {
        proc.restartCount = 0;
      } else {
        proc.restartCount++;
      }

      const delay = Math.min(20000, 1500 * Math.pow(1.3, Math.min(proc.restartCount, 5)));
      logMessage('INFO', `Restarting ${key} worker in ${(delay / 1000).toFixed(1)}s (restart count: ${proc.restartCount})...`);
      setTimeout(() => spawnWorker(key), delay);
    }
  });

  child.on('error', (err) => {
    logMessage('ERROR', `Failed to start ${key} worker: ${err.message}`);
  });
}

// ─── Clean up any orphaned child processes from earlier ───────────────────────
try {
  const ps = `Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.ProcessId -ne ${process.pid} -and ($_.CommandLine -like "*modem-manager*index.js*" -or $_.CommandLine -like "*bandwidthTracker.js*") } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, {
    timeout: 5000,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore']
  });
} catch (_) {}

// Start all workers
spawnWorker('main');
spawnWorker('bandwidth');
updateWorkersPidFile();

const net = require('net');

// ─── Active Autonomous Health Check Loop (every 20 seconds) ─────────────────
let consecutiveFailures = 0;

async function checkLocalProxyPort(port = 31000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2500);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

function checkSshProcessAlive() {
  try {
    const ps = `Get-CimInstance Win32_Process -Filter "Name = 'ssh.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*-R*" -or $_.CommandLine -like "*104.131.118.5*" } | Select-Object -ExpandProperty ProcessId`;
    const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, {
      timeout: 3000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();
    return !!out;
  } catch {
    return true; // Don't false-positive on shell timeout
  }
}

setInterval(async () => {
  if (processes.main.isShuttingDown) return;

  const mainDead = !processes.main.child || !isProcessAlive(processes.main.child.pid);
  const bwDead = !processes.bandwidth.child || !isProcessAlive(processes.bandwidth.child.pid);

  if (mainDead) {
    logMessage('WARN', '[HealthCheck] Main proxy engine was not running — autonomously restarting...');
    spawnWorker('main');
  }

  if (bwDead) {
    logMessage('WARN', '[HealthCheck] Bandwidth tracker was not running — autonomously restarting...');
    spawnWorker('bandwidth');
  }

  // If workers are running, verify end-to-end proxy connectivity & SSH tunnel
  if (!mainDead) {
    const portOpen = await checkLocalProxyPort(31000);
    const sshAlive = checkSshProcessAlive();

    if (!portOpen && !sshAlive) {
      consecutiveFailures++;
      if (consecutiveFailures >= 2) {
        logMessage('WARN', '[HealthCheck] Proxy port and SSH tunnel unresponsive for 2 cycles — restarting main worker to restore routing...');
        if (processes.main.child) {
          try { processes.main.child.kill('SIGKILL'); } catch (_) {}
          processes.main.child = null;
        }
        consecutiveFailures = 0;
        spawnWorker('main');
      }
    } else {
      consecutiveFailures = 0;
    }
  }

  updateWorkersPidFile();
}, 20 * 1000);

// Heartbeat log every 5 minutes
setInterval(() => {
  const mainAlive = processes.main.child && isProcessAlive(processes.main.child.pid);
  const bwAlive = processes.bandwidth.child && isProcessAlive(processes.bandwidth.child.pid);
  logMessage('INFO', `[Heartbeat] Service running normally (Main: ${mainAlive ? 'OK' : 'DOWN'}, Bandwidth: ${bwAlive ? 'OK' : 'DOWN'})`);
}, 5 * 60 * 1000);

// Handle termination signals
function shutdown(signal) {
  logMessage('INFO', `Received shutdown signal (${signal}). Terminating background service workers...`);
  
  for (const key of Object.keys(processes)) {
    const proc = processes[key];
    proc.isShuttingDown = true;
    if (proc.child) {
      try {
        proc.child.kill('SIGTERM');
      } catch (e) {}
    }
  }

  try {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    if (fs.existsSync(WORKERS_PID_FILE)) fs.unlinkSync(WORKERS_PID_FILE);
  } catch (e) {}

  setTimeout(() => {
    logMessage('INFO', 'Background Service Daemon stopped.');
    process.exit(0);
  }, 1000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('SIGHUP', () => {
  logMessage('INFO', 'Console disconnected / closed — daemon continuing 24/7 background execution.');
});

process.on('uncaughtException', (err) => {
  logMessage('ERROR', `Uncaught exception in daemon supervisor: ${err.message}\n${err.stack}`);
});

process.on('unhandledRejection', (reason) => {
  logMessage('ERROR', `Unhandled rejection in daemon supervisor: ${reason}`);
});
