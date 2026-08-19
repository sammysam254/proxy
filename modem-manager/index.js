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
const spawner  = require('./proxySpawner');
const tunnel   = require('./tunnelManager');
const sync     = require('./supabaseSync');

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
//  key: devicePath  (e.g. /dev/ttyUSB0, android:R52RA2345AB, android:tether:rndis0)
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

// ─── Bring a device fully online (start proxy + tunnel) ──────────────────────
async function bringOnline(device) {
  log.ok(`[${device.isAndroid ? '📱 Android' : '📡 Modem'}] Bringing online: ${device.label}`);
  log.ok(`  ↳ IP: ${device.ipAddress}  Interface: ${device.interface}`);
  log.ok(`  ↳ HTTP :${device.portSet.http}  SOCKS4 :${device.portSet.socks4}  SOCKS5 :${device.portSet.socks5}`);
  log.ok(`  ↳ VPS  HTTP :${device.portSet.publicHttp}  SOCKS4 :${device.portSet.publicSocks4}  SOCKS5 :${device.portSet.publicSocks5}`);

  // 1. Start 3proxy for this device
  await spawner.startProxy(device);

  // 2. Open reverse-tunnel ports on VPS
  await tunnel.addTunnelPorts(device);

  // 3. Update state
  device.state = 'proxying';
  await sync.updateModemStatus(device.id, { ...device, status: 'online' });

  log.ok(`✅ ${device.label} is LIVE — ${Object.keys(spawner).length > 0 ? '' : ''}proxies running`);
}

// ─── Take a device offline (stop proxy + tunnel) ──────────────────────────────
async function bringOffline(device, reason = 'disconnected') {
  if (device.state !== 'proxying') return; // already offline

  log.warn(`[${device.isAndroid ? '📱 Android' : '📡 Modem'}] Going offline: ${device.label} (${reason})`);

  await spawner.stopProxy(device);
  await tunnel.removeTunnelPorts(device);

  device.state      = 'pending';
  device.ipAddress  = null;

  await sync.updateModemStatus(device.id, { ...device, status: 'offline' });
}

// ─── Main detection + reconciliation cycle ────────────────────────────────────
async function runCycle() {
  log.info('─── Detection cycle ───────────────────────────────');

  try {
    // ── 1. Detect all devices in parallel ─────────────────────────────────
    const [usbDetected, androidDetected] = await Promise.all([
      detector.detectModems().catch(e => { log.warn('USB detection error:', e.message); return []; }),
      android.detectAndroidDevices().catch(e => { log.warn('Android detection error:', e.message); return []; }),
    ]);

    androidDetected.forEach(d => { d.isAndroid = true; });

    // ── Deduplicate: if a Windows USB adapter and an ADB Android device share
    //    the same IP, prefer the Android (ADB) entry — it has richer metadata.
    const androidIps = new Set(androidDetected.filter(d => d.ipAddress).map(d => d.ipAddress));
    const filteredUsb = usbDetected.filter(d => {
      if (d.ipAddress && androidIps.has(d.ipAddress)) {
        log.info(`Dedup: skipping USB adapter ${d.interface} (${d.ipAddress}) — already covered by Android ADB device`);
        return false;
      }
      return true;
    });

    const detected = [...filteredUsb, ...androidDetected];

    const onlineCount  = detected.filter(d => d.ipAddress).length;
    const offlineCount = detected.length - onlineCount;
    log.info(`Found: ${filteredUsb.length} USB modem(s) + ${androidDetected.length} Android device(s)`);
    log.info(`Status: ${onlineCount} online, ${offlineCount} offline / no IP yet`);

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
        const deviceType = freshDevice.isAndroid ? '📱 Android' : '📡 Modem';
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

    // ── 4. Rebuild 3proxy config to pick up any changes ───────────────────
    const proxying = [...registry.values()].filter(d => d.state === 'proxying');
    if (proxying.length > 0) {
      await spawner.reloadConfig().catch(e => {
        log.error('3proxy reload error:', e.message);
      });
    }

    // ── 5. Print status table ──────────────────────────────────────────────
    printStatusTable();

    // ── 6. Expire overdue subscriptions & sync credentials ───────────────
    await sync.expireOldSubscriptions().catch(() => {});
    await sync.syncActiveCredentials().catch(() => {});

  } catch (err) {
    log.error('Cycle failed:', err.message, err.stack);
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
  console.log(chalk.cyan('  │ DEVICE                    │ TYPE    │ STATUS   │ IP              │ PORTS'));
  console.log(chalk.cyan('  ├─────────────────────────────────────────────────────────────────────┤'));

  for (const d of devices) {
    const type    = d.isAndroid ? 'Android' : 'Modem  ';
    const status  = d.state === 'proxying'
      ? chalk.green('LIVE    ')
      : chalk.yellow('PENDING ');
    const ip      = (d.ipAddress || 'no IP').padEnd(16);
    const ports   = d.portSet
      ? `HTTP:${d.portSet.publicHttp} S4:${d.portSet.publicSocks4} S5:${d.portSet.publicSocks5}`
      : 'not assigned';
    const label   = d.label.slice(0, 26).padEnd(26);

    console.log(chalk.cyan('  │ ') + `${label} │ ${type} │ ${status}│ ${ip}│ ${ports}`);
  }

  console.log(chalk.cyan('  └─────────────────────────────────────────────────────────────────────┘\n'));
}

// ─── Startup ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(chalk.cyan.bold('\n  ╔══════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('  ║  ProxiCell Modem Manager v2.0.0          ║'));
  console.log(chalk.cyan.bold('  ║  USB Modems + Android Phones             ║'));
  console.log(chalk.cyan.bold('  ╚══════════════════════════════════════════╝\n'));

  log.info('Starting up...');
  log.info(`VPS Host:  ${process.env.VPS_HOST || '(not set)'}`);
  log.info(`Supabase:  ${process.env.SUPABASE_URL || '(not set)'}`);
  log.info('Watching for USB modems and Android phones every 30s');

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

  // Bandwidth sync: every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
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

  log.ok('All services started. Modem manager is running.');
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

        if (secret !== process.env.WEBHOOK_SECRET) {
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

          log.info(`IP rotation requested: ${device.label} (${device.isAndroid ? 'Android' : 'Modem'})`);

          // Bring offline, rotate, bring back online
          await bringOffline(device, 'IP rotation');

          if (device.isAndroid) {
            await android.rotateAndroidIp(device);
          } else {
            await detector.rotateModemIp(device);
          }

          // Wait for new IP
          await new Promise(r => setTimeout(r, 5000));

          if (device.ipAddress) {
            await bringOnline(device);
            await sync.updateModemStatus(device.id, { ...device, status: 'online', last_rotated_at: new Date().toISOString() });
          }

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
            type:       d.isAndroid ? 'android' : 'modem',
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
