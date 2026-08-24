/**
 * Vertex Proxies — Background Service Daemon Supervisor
 * Runs continuously in the background, auto-restarts crashed workers,
 * and redirects logs to rotating log files.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BASE_DIR = __dirname;
const LOGS_DIR = path.join(BASE_DIR, 'logs');
const MODEM_DIR = path.join(BASE_DIR, 'modem-manager');
const PID_FILE = path.join(LOGS_DIR, 'service.pid');
const WORKERS_PID_FILE = path.join(LOGS_DIR, 'workers.json');
const SERVICE_LOG = path.join(LOGS_DIR, 'service.log');
const ERROR_LOG = path.join(LOGS_DIR, 'error.log');

const MAX_LOG_SIZE = 15 * 1024 * 1024; // 15 MB rotation limit

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

// Write master PID file
try {
  fs.writeFileSync(PID_FILE, process.pid.toString(), 'utf8');
} catch (e) {}

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

function spawnWorker(key) {
  const proc = processes[key];
  if (proc.isShuttingDown) return;

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
    rotateLogIfNeeded(ERROR_LOG);
    rotateLogIfNeeded(SERVICE_LOG);
    try {
      fs.appendFileSync(ERROR_LOG, text, 'utf8');
      fs.appendFileSync(SERVICE_LOG, text, 'utf8');
    } catch (e) {}
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

      const delay = Math.min(30000, 2000 * Math.pow(1.5, Math.min(proc.restartCount, 6)));
      logMessage('INFO', `Restarting ${key} worker in ${(delay / 1000).toFixed(1)}s (restart count: ${proc.restartCount})...`);
      setTimeout(() => spawnWorker(key), delay);
    }
  });

  child.on('error', (err) => {
    logMessage('ERROR', `Failed to start ${key} worker: ${err.message}`);
  });
}

// Start all workers
spawnWorker('main');
spawnWorker('bandwidth');
updateWorkersPidFile();

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

// Crucial: Ignore terminal closure SIGHUP so it keeps running in the background
process.on('SIGHUP', () => {
  logMessage('INFO', 'Console disconnected / closed — daemon continuing 24/7 background execution.');
});

process.on('uncaughtException', (err) => {
  logMessage('ERROR', `Uncaught exception in daemon supervisor: ${err.message}\n${err.stack}`);
});

process.on('unhandledRejection', (reason) => {
  logMessage('ERROR', `Unhandled rejection in daemon supervisor: ${reason}`);
});

// Keep-alive heartbeat every 5 minutes in logs
setInterval(() => {
  const mainAlive = !!processes.main.child;
  const bwAlive = !!processes.bandwidth.child;
  logMessage('INFO', `[Heartbeat] Service running normally (Main: ${mainAlive ? 'OK' : 'DOWN'}, Bandwidth: ${bwAlive ? 'OK' : 'DOWN'})`);
}, 5 * 60 * 1000);
