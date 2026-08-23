/**
 * ProxiCell — Modem Manager
 *
 * Detects ALL connected devices (USB modems + Android phones) and
 * continuously builds proxies for every device that has a live IP.
 *
 * State machine per device:
 *   DETECTED  → device seen, registered in DB, port assigned
 *   PENDING   → has port, but no IP yet (offline / tethering not active)
 *   PROXYING  → IP obtained, 3proxy + tunnel running, fully live
 *   REMOVED   → unplugged, proxy/tunnel torn down
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const cron     = require('node-cron');
const chalk    = require('chalk');
const detector = require('./modemDetector');
const android  = require('./androidDetector');
const wifi     = require('./wifiDetector');
const spawner  = require('./proxySpawner');
const tunnel   = require('./tunnelManager');
const sync     = require('./supabaseSync');

// ─── Device Type Helper ───────────────────────────────────────────────────────
function getDeviceTag(device) {
  if (device.isAndroid) return '📱 Android';
  if (device.isWifi)    return '📶 Wi-Fi';
  return '📡 Modem';
}

// ─── Logging ──────────────────────────────────────────────────────────────────
const log = {
  info:  (...a) => console.log(chalk.blue('[INFO]'),   new Date().toISOString(), ...a),
  ok:    (...a) => console.log(chalk.green('[OK]'),    new Date().toISOString(), ...a),
  warn:  (...a) => console.log(chalk.yellow('[WARN]'), new Date().toISOString(), ...a),
  error: (...a) => console.error(chalk.red('[ERR]'),   new Date().toISOString(), ...a),
  device:(...a) => console.log(chalk.magenta('[DEV]'), new Date().toISOString(), ...a),
};

// ─── Device Registry ──────────────────────────────────────────────────────────
//
//  key: devicePath  (e.g. /dev/ttyUSB0, android:R52RA2345AB, wifi:Wi-Fi)
//  val: { ...modemFields, state, portIndex, portSet, id }
//
//  state: 'pending' | 'proxying'
//
const registry = new Map();

// Global port counter — strictly incrementing, never reuses a slot
// This prevents port collisions even if devices come/go
let portCounter = 0;

// ─── Assign a port set to a device ───────────────────────────────────────────
function assignPorts() {
  const idx = portCounter++;
  return {
    http:        31000 + idx,
    socks4:      32000 + idx,
    socks5:      33000 + idx,
    publicHttp:  41000 + idx,
    publicSocks4:42000 + idx,
    publicSocks5:43000 + idx,
  };
}

const https = require('https');

// ─── Fetch Public SIM IP via local interface binding ────────────────────────
function fetchPublicIp(localAddress) {
  return new Promise((resolve) => {
    if (!localAddress || localAddress === '0.0.0.0') return resolve(null);
    const req = https.get('https://api.ipify.org?format=json', {
      localAddress,
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.ip || null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => {
      const fallback = https.get('https://icanhazip.com', {
        localAddress,
        timeout: 5000,
      }, (res2) => {
        let text = '';
        res2.on('data', chunk => (text += chunk));
        res2.on('end', () => resolve(text.trim() || null));
      });
      fallback.on('error', () => resolve(null));
    });
  });
}

// ─── Bring a device fully online (start proxy + tunnel) ──────────────────────
async function bringOnline(device) {
  log.ok(`[${getDeviceTag(device)}] Bringing online: ${device.label}`);
  
  // 1. Fetch public IP
  const publicIp = await fetchPublicIp(device.ipAddress);
  device.publicIp = publicIp || device.ipAddress;

  log.ok(`  ↳ Public IP: ${device.publicIp} (Local Interface: ${device.ipAddress})`);
  log.ok(`  ↳ HTTP :${device.portSet.http}  SOCKS4 :${device.portSet.socks4}  SOCKS5 :${device.portSet.socks5}`);
  log.ok(`  ↳ VPS  HTTP :${device.portSet.publicHttp}  SOCKS4 :${device.portSet.publicSocks4}  SOCKS5 :${device.portSet.publicSocks5}`);

  // 2. Start proxy server for this device
  await spawner.startProxy(device);

  // 3. Open reverse-tunnel ports on VPS
  await tunnel.addTunnelPorts(device);

  // 4. Update state & sync real public IP with Supabase
  device.state = 'proxying';
  await sync.updateModemStatus(device.id, {
    ...device,
    ip_address: device.publicIp,
    status: 'online',
  });

  log.ok(`✅ ${device.label} is LIVE — Public IP: ${device.publicIp}`);
}

// ─── Take a device offline (stop proxy + tunnel) ──────────────────────────────
async function bringOffline(device, reason = 'disconnected') {
  if (device.state !== 'proxying') return; // already offline

  log.warn(`[${getDeviceTag(device)}] Going offline: ${device.label} (${reason})`);

  await spawner.stopProxy(device);
  await tunnel.removeTunnelPorts(device);

  device.state      = 'pending';
  device.ipAddress  = null;
  device.publicIp   = null;

  await sync.updateModemStatus(device.id, { ...device, status: 'offline' });
}

// ─── Main detection + reconciliation cycle ────────────────────────────────────
async function runCycle() {
  log.info('─── Detection cycle ───────────────────────────────');

  try {
    // ── 1. Detect Wi-Fi / Residential proxies exclusively ────────────────
    const wifiDetected = await wifi.detectWifiDevices().catch(e => {
      log.warn('Wi-Fi detection error:', e.message);
      return [];
    });
    wifiDetected.forEach(d => { d.isWifi = true; });

    const detected = wifiDetected;

    const onlineCount  = detected.filter(d => d.ipAddress).length;
    const offlineCount = detected.length - onlineCount;
    log.info(`USA Residential Proxies: ${onlineCount} online / ready at max speed (${offlineCount} pending)`);

    const detectedPaths = new Set(detected.map(d => d.devicePath));

    // ── 2. Handle removed devices ──────────────────────────────────────────
    for (const [path, device] of registry) {
      if (!detectedPaths.has(path)) {
        log.warn(`Device removed: ${device.label} (${path})`);
        await bringOffline(device, 'unplugged');
        await sync.markModemOffline(device.id);
        registry.delete(path);
      }
    }

    // ── 3. Process each detected device ───────────────────────────────────
    for (const freshDevice of detected) {
      const path     = freshDevice.devicePath;
      const existing = registry.get(path);

      if (!existing) {
        // ── NEW device — register and assign ports ────────────────────────
        const deviceType = getDeviceTag(freshDevice);
        log.device(`New ${deviceType} detected: ${freshDevice.label}`);

        freshDevice.portSet   = assignPorts();
        freshDevice.state     = 'pending';
        freshDevice.portIndex = portCounter - 1;

        // Register in Supabase (even if offline — so admin can see it)
        try {
          const dbId = await sync.upsertModem(freshDevice);
          freshDevice.id = dbId;
          log.ok(`  Registered in DB: ${dbId}`);
        } catch (e) {
          log.error(`  DB registration failed: ${e.message}`);
          // Continue anyway — we'll retry next cycle
        }

        registry.set(path, freshDevice);

        // If it already has an IP, bring it online immediately
        if (freshDevice.ipAddress && freshDevice.status === 'online') {
          await bringOnline(freshDevice).catch(e => {
            log.error(`  Failed to bring online: ${e.message}`);
          });
        } else {
          log.warn(`  ${freshDevice.label}: no IP yet — waiting (state: ${freshDevice.status})`);
        }

      } else {
        // ── EXISTING device — check for state changes ─────────────────────
        const hadIp      = !!existing.ipAddress;
        const hasIpNow   = !!freshDevice.ipAddress;
        const ipChanged  = existing.ipAddress !== freshDevice.ipAddress;
        const wasOnline  = existing.state === 'proxying';

        // Update live fields
        existing.ipAddress      = freshDevice.ipAddress;
        existing.signal         = freshDevice.signal;
        existing.operator       = freshDevice.operator;
        existing.status         = freshDevice.status;
        existing.interface      = freshDevice.interface || existing.interface;
        // Android-specific
        if (freshDevice.isAndroid) {
          existing.battery        = freshDevice.battery;
          existing.androidVersion = freshDevice.androidVersion;
          existing.model          = freshDevice.model;
        }

        if (!hadIp && hasIpNow) {
          // ── Device CAME ONLINE — start its proxy ─────────────────────────
          log.ok(`${existing.label}: IP appeared (${freshDevice.ipAddress}) — starting proxy!`);
          await bringOnline(existing).catch(e => {
            log.error(`Failed to bring online: ${e.message}`);
          });

        } else if (hadIp && !hasIpNow && wasOnline) {
          // ── Device LOST IP — stop its proxy ──────────────────────────────
          log.warn(`${existing.label}: IP lost — stopping proxy`);
          await bringOffline(existing, 'IP lost');

        } else if (wasOnline && ipChanged && hasIpNow) {
          // ── IP changed (after rotation) — restart proxy with new IP ──────
          log.ok(`${existing.label}: IP changed to ${freshDevice.ipAddress} — restarting proxy`);
          await bringOffline(existing, 'IP rotated');
          await bringOnline(existing).catch(e => {
            log.error(`Failed to restart proxy: ${e.message}`);
          });

        } else if (wasOnline) {
          // Still online, no change — just update DB heartbeat
          await sync.updateModemStatus(existing.id, existing).catch(() => {});

        } else if (!hasIpNow) {
          // Still offline — log once every 10 cycles (avoid spam)
          if (Math.random() < 0.1) {
            log.warn(`${existing.label}: still waiting for IP...`);
          }
        }
      }
    }

    // ── 4. Rebuild proxy engine config & verify VPS tunnel connection ────
    const proxying = [...registry.values()].filter(d => d.state === 'proxying');
    if (proxying.length > 0) {
      await spawner.reloadConfig().catch(e => {
        log.error('Proxy reload error:', e.message);
      });
      // Always ensure VPS reverse SSH tunnel is connected on every single run
      await tunnel.ensureTunnelConnected().catch(e => {
        log.warn('VPS tunnel check error:', e.message);
      });
    }

    // ── 5. Print status table ──────────────────────────────────────────────
    printStatusTable();

    // ── 6. Reconcile DB (deactivate any stale/ghost online modems) ────────
    const activeIds = proxying.map(d => d.id).filter(Boolean);
    await sync.reconcileOnlineModems(activeIds).catch(() => {});

    // ── 7. Expire overdue subscriptions & sync credentials ───────────────
    await sync.expireOldSubscriptions().catch(() => {});
    await sync.syncActiveCredentials().catch(() => {});

  } catch (err) {
    log.error('Cycle failed:', err.message, err.stack);
  }
}

// ─── Terminate any previous orphan instances ──────────────────────────────
async function killPreviousInstances() {
  const currentPid = process.pid;
  try {
    if (process.platform === 'win32') {
      const { execSync } = require('child_process');
      log.info('Checking and cleaning up any stale previous instances...');
      // 1. Kill any other node processes running modem-manager
      try {
        execSync(`powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'node.exe'\\" | Where-Object { $_.ProcessId -ne ${currentPid} -and ($_.CommandLine -like '*modem-manager*' -or $_.CommandLine -like '*index.js*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { timeout: 5000 });
      } catch {}

      // 2. Kill any stale SSH reverse tunnels from previous runs
      try {
        execSync(`powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'ssh.exe'\\" | Where-Object { $_.CommandLine -like '*64.227.3.211*' -or $_.CommandLine -like '*157.151.206.163*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { timeout: 5000 });
      } catch {}
    }
  } catch (e) {
    // Non-fatal
  }
}

// ─── Status table ─────────────────────────────────────────────────────────────
function printStatusTable() {
  const devices = [...registry.values()];
  if (devices.length === 0) {
    log.info('No devices in registry.');
    return;
  }

  console.log(chalk.cyan('\n  ┌─────────────────────────────────────────────────────────────────────┐'));
  console.log(chalk.cyan('  │ DEVICE                    │ TYPE    │ STATUS   │ PUBLIC IP       │ PORTS'));
  console.log(chalk.cyan('  ├─────────────────────────────────────────────────────────────────────┤'));

  for (const d of devices) {
    const type    = d.isAndroid ? 'Android' : (d.isWifi ? 'Wi-Fi  ' : 'Modem  ');
    const status  = d.state === 'proxying'
      ? chalk.green('LIVE    ')
      : chalk.yellow('PENDING ');
    const ip      = (d.publicIp || d.ipAddress || 'no IP').padEnd(16);
    const ports   = d.portSet
      ? `HTTP:${d.portSet.publicHttp} S4:${d.portSet.publicSocks4} S5:${d.portSet.publicSocks5}`
      : 'not assigned';
    const label   = d.label.slice(0, 26).padEnd(26);

    console.log(chalk.cyan('  │ ') + `${label} │ ${type} │ ${status}│ ${ip}│ ${ports}`);
  }

  console.log(chalk.cyan('  └─────────────────────────────────────────────────────────────────────┘\n'));
}

// ─── Wait for Wi-Fi connection to initialize (instant boot) ───────────────────
async function waitForDevices(maxWaitMs = 15_000, intervalMs = 2_000) {
  const deadline = Date.now() + maxWaitMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;
    log.info(`Initializing USA Residential Proxy slots (attempt #${attempt})...`);

    const wifiDevices = await wifi.detectWifiDevices().catch(() => []);
    const withIp = wifiDevices.filter(d => d.ipAddress).length;

    if (withIp > 0) {
      log.ok(`✅ Initialized ${withIp} USA Residential proxy slots with live Wi-Fi connection. Proceeding!`);
      return true;
    }

    const remaining = deadline - Date.now();
    if (remaining > 0) {
      const wait = Math.min(intervalMs, remaining);
      await new Promise(r => setTimeout(r, wait));
    }
  }

  log.warn(`⚠️  Starting anyway — will detect on next cycle.`);
  return false;
}

// ─── Startup ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(chalk.cyan.bold('\n  ╔══════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('  ║  Vertex Proxies — Residential Engine     ║'));
  console.log(chalk.cyan.bold('  ║  USA High-Speed Wi-Fi Proxies (12 Slots) ║'));
  console.log(chalk.cyan.bold('  ╚══════════════════════════════════════════╝\n'));

  // Terminate any previous instances & stale reverse tunnels
  await killPreviousInstances();

  log.info('Starting up...');
  log.info(`VPS Host:    ${process.env.VPS_HOST || '(not set)'}`);
  log.info(`VPS User:    ${process.env.VPS_USER || 'opc'}`);
  log.info(`Supabase:    ${process.env.SUPABASE_URL || '(not set)'}`);
  const pubKey = tunnel.getPublicKeyContent();
  if (pubKey) {
    log.info(`SSH PubKey:  ${pubKey}`);
  }
  log.info('High-Speed Wi-Fi Tunneling Engine active');

  // ── Boot-time adapter stabilization ────────────────────────────────────────
  await waitForDevices(15_000, 2_000);

  // Start persistent SSH tunnel to VPS
  await tunnel.startTunnel().catch(e => {
    log.warn('Tunnel start failed (will retry):', e.message);
  });

  // Clean up any duplicate modem records from previous restarts
  log.info('Running startup cleanup...');
  await sync.cleanupDuplicateModems().catch(e => {
    log.warn('Startup cleanup failed (non-fatal):', e.message);
  });

  // Run first detection cycle immediately
  await runCycle();

  // Detection cycle: every 30 seconds
  cron.schedule('*/30 * * * * *', runCycle);

  // Bandwidth sync: every 15 seconds
  cron.schedule('*/15 * * * * *', async () => {
    const proxying = [...registry.values()].filter(d => d.state === 'proxying');
    if (proxying.length > 0) {
      await sync.syncBandwidth(proxying).catch(e => {
        log.warn('Bandwidth sync error:', e.message);
      });
    }
  });

  // Android battery refresh: every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
    for (const device of registry.values()) {
      if (device.isAndroid && device.adbSerial) {
        try {
          const info = await android.refreshAndroidStatus(device.adbSerial);
          if (info) {
            device.battery = info.battery;
            device.signal  = info.signal;
            await sync.updateModemStatus(device.id, { ...device, status: device.state === 'proxying' ? 'online' : 'offline' });
          }
        } catch {}
      }
    }
  });

  // Tunnel health check: every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
    const healthy = await tunnel.checkTunnelHealth().catch(() => false);
    if (!healthy) {
      log.warn('Tunnel health check failed — restarting tunnel...');
      await tunnel.startTunnel().catch(e => log.error('Tunnel restart failed:', e.message));
    }
  });

  // Start webhook server (receives commands from Supabase edge functions)
  startWebhookServer();

  // Start real-time database listener for dashboard rotation requests
  startRotationListener();

  log.ok('All services started. Modem manager is running.');
}

// ─── Real-time IP rotation listener from Supabase ─────────────────────────────
function startRotationListener() {
  setInterval(async () => {
    try {
      const { data: modems } = await sync.supabase
        .from('modems')
        .select('id, rotate_requested_at')
        .not('rotate_requested_at', 'is', null);

      if (modems && modems.length > 0) {
        for (const m of modems) {
          const device = [...registry.values()].find(d => d.id === m.id);
          if (device && (!device.last_rotated_at || new Date(m.rotate_requested_at) > new Date(device.last_rotated_at))) {
            log.ok(`⚡ IP Rotation requested from Dashboard for ${device.label}!`);
            device.last_rotated_at = m.rotate_requested_at;
            await executeRotation(device);
          }
        }
      }
    } catch {}
  }, 3000);
}

// ─── Execute IP rotation for a device ─────────────────────────────────────────
async function executeRotation(device) {
  try {
    log.info(`Rotating IP: ${device.label} (${getDeviceTag(device)})...`);

    // 1. Bring proxy offline during rotation
    await bringOffline(device, 'IP rotation');

    // 2. Trigger rotation on hardware / network
    if (device.isAndroid) {
      await android.rotateAndroidIp(device);
    } else if (device.isWifi) {
      await wifi.rotateWifiIp(device);
    } else {
      await detector.rotateModemIp(device);
    }

    // 3. Wait for network negotiation and local DHCP assignment
    await new Promise(r => setTimeout(r, 4000));

    if (device.ipAddress) {
      // 4. Fetch the NEW public IP
      const newPublicIp = await fetchPublicIp(device.ipAddress);
      device.publicIp = newPublicIp || device.ipAddress;

      // 5. Bring proxy back online with new IP
      await bringOnline(device);

      // 6. Explicitly update Supabase DB with the new public IP & clear rotate request flag
      await sync.supabase.from('modems').update({
        status: 'online',
        ip_address: device.publicIp,
        rotate_requested_at: null,
        last_seen: new Date().toISOString(),
      }).eq('id', device.id);

      log.ok(`✅ IP rotated successfully for ${device.label}! New Public IP: ${device.publicIp}`);
    } else {
      log.warn(`No IP found for ${device.label} after rotation attempt.`);
    }
  } catch (e) {
    log.error(`IP rotation failed for ${device.label}:`, e.message);
  }
}

// ─── Webhook server ────────────────────────────────────────────────────────────
const http = require('http');

function startWebhookServer() {
  const port = parseInt(process.env.WEBHOOK_PORT || '9001');

  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405).end('Method Not Allowed');
      return;
    }

    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const secret  = req.headers['x-proxicell-secret'];

        if (secret && secret !== process.env.WEBHOOK_SECRET) {
          res.writeHead(401).end('Unauthorized');
          return;
        }

        // ── Rotate IP ─────────────────────────────────────────────────────
        if (req.url === '/rotate-ip') {
          const { modemId } = payload;
          const device = [...registry.values()].find(d => d.id === modemId);

          if (!device) {
            return res.writeHead(404).end(JSON.stringify({ error: 'Device not found in registry' }));
          }

          await executeRotation(device);

          res.writeHead(200).end(JSON.stringify({
            success: true,
            newIp:   device.ipAddress,
          }));

        // ── Push credentials ───────────────────────────────────────────────
        } else if (req.url === '/push-credentials') {
          const { subscriptionId, username, password, modemId } = payload;
          const device = [...registry.values()].find(d => d.id === modemId);

          if (device) {
            await spawner.addCredential(username, password, modemId);
            log.ok(`Credentials pushed for subscription ${subscriptionId} on ${device.label}`);
          } else {
            // Device not online yet — store in DB only, will be picked up on next cycle
            log.warn(`Device ${modemId} not in registry — credentials stored in DB only`);
          }
          res.writeHead(200).end(JSON.stringify({ success: true }));

        // ── Revoke credentials ─────────────────────────────────────────────
        } else if (req.url === '/revoke-credentials') {
          const { username, modemId } = payload;
          await spawner.removeCredential(username, modemId);
          log.ok(`Credentials revoked: ${username}`);
          res.writeHead(200).end(JSON.stringify({ success: true }));

        // ── Status endpoint ────────────────────────────────────────────────
        } else if (req.url === '/status') {
          const statusList = [...registry.values()].map(d => ({
            id:         d.id,
            label:      d.label,
            type:       d.isAndroid ? 'android' : (d.isWifi ? 'wifi' : 'modem'),
            state:      d.state,
            ip:         d.ipAddress,
            interface:  d.interface,
            ports:      d.portSet,
            signal:     d.signal,
            operator:   d.operator,
            battery:    d.battery,
          }));
          res.writeHead(200).end(JSON.stringify({ devices: statusList }));

        } else {
          res.writeHead(404).end('Not Found');
        }

      } catch (e) {
        log.error('Webhook error:', e.message);
        res.writeHead(500).end(JSON.stringify({ error: e.message }));
      }
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      log.warn(`Webhook port ${port} is already bound by another instance.`);
    } else {
      log.error('Webhook server error:', err.message);
    }
  });

  server.listen(port, '127.0.0.1', () => {
    log.ok(`Webhook server listening on 127.0.0.1:${port}`);
  });
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal) {
  log.warn(`Received ${signal} — shutting down gracefully...`);
  for (const device of registry.values()) {
    if (device.state === 'proxying') {
      await spawner.stopProxy(device).catch(() => {});
    }
  }
  await tunnel.stopTunnel().catch(() => {});
  log.ok('Shutdown complete.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  log.error('Uncaught exception:', err.message, err.stack);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason);
});

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
