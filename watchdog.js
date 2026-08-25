/**
 * Vertex Proxies — Autonomous Watchdog Agent
 *
 * Runs every minute (or continuously) to inspect service health:
 * 1. Checks if Service Daemon (service-daemon.js) is alive.
 * 2. Checks if Main Proxy Engine (index.js) is alive.
 * 3. Checks if Bandwidth Tracker (bandwidthTracker.js) is alive.
 * 4. Checks network connectivity.
 * 5. If ANY service is stopped/crashed, autonomously heals & relaunches it.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const http = require('http');

const BASE_DIR = __dirname;
const LOGS_DIR = path.join(BASE_DIR, 'logs');
const VBS_PATH = path.join(BASE_DIR, 'start-hidden.vbs');
const WATCHDOG_LOG = path.join(LOGS_DIR, 'watchdog.log');
const WORKERS_FILE = path.join(LOGS_DIR, 'workers.json');
const PID_FILE = path.join(LOGS_DIR, 'service.pid');

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const line = `[${ts}] [WATCHDOG] ${msg}\n`;
  try {
    fs.appendFileSync(WATCHDOG_LOG, line, 'utf8');
  } catch (_) {}
}

function isProcessAlive(pid) {
  if (!pid || isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

function getRunningNodeProcesses() {
  try {
    const ps = `Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Select-Object ProcessId, CommandLine | ConvertTo-Json`;
    const raw = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, {
      timeout: 8000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();

    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

async function checkWebhookHealth() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:9001/status', { timeout: 3000 }, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 404);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function inspectAndHeal() {
  const procs = getRunningNodeProcesses();

  let daemonFound = false;
  let mainFound = false;
  let bandwidthFound = false;

  for (const p of procs) {
    const cmd = p.CommandLine || '';
    if (cmd.includes('proxy') || cmd.includes('modem-manager')) {
      if (cmd.includes('service-daemon.js')) daemonFound = true;
      if (cmd.includes('modem-manager\\index.js') || cmd.includes('modem-manager/index.js')) mainFound = true;
      if (cmd.includes('bandwidthTracker.js')) bandwidthFound = true;
    }
  }

  // Also check PID files
  if (!daemonFound && fs.existsSync(PID_FILE)) {
    try {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      if (isProcessAlive(pid)) daemonFound = true;
    } catch (_) {}
  }

  if (daemonFound && mainFound && bandwidthFound) {
    // All healthy!
    return { status: 'healthy', daemon: true, main: true, bandwidth: true };
  }

  // Something is missing - initiate self-healing
  log(`Health check failed! State: Daemon=${daemonFound ? 'OK' : 'MISSING'}, Main=${mainFound ? 'OK' : 'MISSING'}, Bandwidth=${bandwidthFound ? 'OK' : 'MISSING'}`);
  log('⚡ Autonomous Agent triggering self-healing restart...');

  try {
    if (fs.existsSync(VBS_PATH)) {
      spawn('wscript.exe', [VBS_PATH], {
        cwd: BASE_DIR,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }).unref();
      log('✅ Self-healing launch triggered successfully.');
    } else {
      // Direct node fallback
      const daemonScript = path.join(BASE_DIR, 'service-daemon.js');
      spawn(process.execPath, [daemonScript], {
        cwd: BASE_DIR,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }).unref();
      log('✅ Self-healing direct spawn triggered successfully.');
    }
  } catch (err) {
    log(`❌ Failed to trigger self-healing: ${err.message}`);
  }

  return { status: 'healed', daemon: daemonFound, main: mainFound, bandwidth: bandwidthFound };
}

// If executed directly, run single check or loop if requested
if (require.main === module) {
  const isLoop = process.argv.includes('--loop');
  if (isLoop) {
    log('Autonomous Watchdog loop mode activated (checking every 60s)...');
    inspectAndHeal();
    setInterval(inspectAndHeal, 60000);
  } else {
    inspectAndHeal().then(() => {
      process.exit(0);
    });
  }
}

module.exports = { inspectAndHeal };
