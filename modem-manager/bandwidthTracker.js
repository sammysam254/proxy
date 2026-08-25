/**
 * Vertex Proxies — Standalone Bandwidth Tracker
 *
 * Reads actual network byte counts DIRECTLY from Windows OS interface stats
 * using PowerShell Get-NetAdapterStatistics.
 *
 * ✅ Safe to run ALONGSIDE the modem manager — does NOT interfere.
 * ✅ No modem manager restart needed.
 * ✅ Updates Supabase subscriptions.gb_used every 10 seconds.
 * ✅ Automatically revokes credentials when GB cap is hit.
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { execSync }    = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const { sendLog }      = require('./supabaseSync');

const origLog = console.log;
console.log = (...args) => {
  origLog(...args);
  try {
    const text = args.join(' ');
    if (text.includes('[BandwidthTracker]')) {
      sendLog('info', text, 'bandwidth');
    }
  } catch (_) {}
};

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zsfijzjzioaragnlopgn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const INTERVAL_MS  = 10_000; // 10 seconds

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ─── Per-modem byte snapshots (previous reading) ─────────────────────────────
// modemId → { bytesIn, bytesOut }
const snapshots = new Map();

// ─── Fetch Windows interface byte stats via PowerShell ───────────────────────
let cachedActiveAdapter = null;

function getInterfaceStats(interfaceName) {
  try {
    const targetName = interfaceName || cachedActiveAdapter || 'Ethernet';
    const safeName = targetName.replace(/'/g, "''");
    const ps = `$stat = Get-NetAdapterStatistics -Name '${safeName}' -ErrorAction SilentlyContinue; ` +
               `if (-not $stat) { $stat = Get-NetAdapterStatistics -ErrorAction SilentlyContinue | Select-Object -First 1 }; ` +
               `if ($stat) { $stat | Select-Object Name, ReceivedBytes, SentBytes | ConvertTo-Json }`;
    const raw = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, {
      timeout: 6000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();

    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.Name && !cachedActiveAdapter) {
      cachedActiveAdapter = data.Name;
    }
    return {
      bytesIn:  parseInt(data.ReceivedBytes || 0),
      bytesOut: parseInt(data.SentBytes     || 0),
    };
  } catch {
    return null;
  }
}

// ─── List all Windows adapter names (for debugging) ──────────────────────────
function listAdapters() {
  try {
    const raw = execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetAdapter -ErrorAction SilentlyContinue | Select-Object Name,Status | ConvertTo-Json"`,
      { timeout: 6000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString().trim();
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ─── Revoke credentials for a subscription in proxySpawner via webhook ───────
async function revokeCredentials(username, modemId) {
  try {
    const webhookPort = parseInt(process.env.WEBHOOK_PORT || '9001');
    const http = require('http');
    const body = JSON.stringify({ username, modemId });

    return new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port:     webhookPort,
        path:     '/revoke-credentials',
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, (res) => resolve(res.statusCode === 200));
      req.on('error', () => resolve(false));
      req.write(body);
      req.end();
    });
  } catch {
    return false;
  }
}

// ─── Main tick ────────────────────────────────────────────────────────────────
async function tick() {
  // 1. Fetch all ONLINE modems with their network interface + active subscriptions
  const { data: modems, error } = await supabase
    .from('modems')
    .select(`
      id,
      label,
      interface,
      proxies (
        id,
        subscriptions (
          id,
          gb_used,
          gb_limit,
          proxy_username,
          status
        )
      )
    `)
    .eq('status', 'online');

  if (error) {
    console.error('[BandwidthTracker] Failed to fetch modems:', error.message);
    return;
  }

  if (!modems || modems.length === 0) {
    console.log('[BandwidthTracker] No online modems found.');
    return;
  }

  for (const modem of modems) {
    const iface = modem.interface;
    if (!iface) {
      console.warn(`[BandwidthTracker] Modem ${modem.label} has no interface stored — skipping.`);
      continue;
    }

    // 2. Read current byte counts from Windows
    const stats = getInterfaceStats(iface);
    if (!stats) {
      console.warn(`[BandwidthTracker] Could not read stats for interface '${iface}' (${modem.label})`);
      continue;
    }

    // 3. Compute delta since last reading
    const prev     = snapshots.get(modem.id);
    if (!prev) {
      // First reading — just store baseline, don't write anything yet
      snapshots.set(modem.id, stats);
      console.log(`[BandwidthTracker] Baseline set for ${modem.label} (${iface}): In=${stats.bytesIn}, Out=${stats.bytesOut}`);
      continue;
    }

    const deltaIn    = Math.max(0, stats.bytesIn  - prev.bytesIn);
    const deltaOut   = Math.max(0, stats.bytesOut - prev.bytesOut);
    const deltaBytes = deltaIn + deltaOut;

    // Update snapshot
    snapshots.set(modem.id, stats);

    if (deltaBytes === 0) continue;

    console.log(`[BandwidthTracker] ${modem.label}: +${(deltaBytes / 1024).toFixed(1)} KB (↓${(deltaIn/1024).toFixed(1)} KB ↑${(deltaOut/1024).toFixed(1)} KB)`);

    // 4. Apply delta to all active subscriptions on this modem
    const activeSubs = (modem.proxies || [])
      .flatMap(p => (p.subscriptions || []).filter(s => s.status === 'active'));

    if (activeSubs.length === 0) continue;

    const deltaGb = deltaBytes / (1024 ** 3);

    for (const sub of activeSubs) {
      const currentGb = parseFloat(sub.gb_used || 0);
      const newGbUsed = parseFloat((currentGb + deltaGb).toFixed(6));
      const update    = { gb_used: newGbUsed };

      // Auto-expire if per-GB cap is hit
      if (sub.gb_limit && newGbUsed >= parseFloat(sub.gb_limit)) {
        update.status = 'expired';
        console.log(`[BandwidthTracker] 📛 Subscription ${sub.id} EXPIRED — ${newGbUsed.toFixed(4)} GB / ${sub.gb_limit} GB used`);

        // Revoke credentials via modem manager webhook
        if (sub.proxy_username) {
          const revoked = await revokeCredentials(sub.proxy_username, modem.id);
          console.log(`[BandwidthTracker] 🔒 Credential revoke for '${sub.proxy_username}': ${revoked ? 'SUCCESS' : 'webhook not reachable — will expire in DB only'}`);
        }
      }

      await supabase
        .from('subscriptions')
        .update(update)
        .eq('id', sub.id)
        .then(({ error: e }) => {
          if (e) console.warn(`[BandwidthTracker] DB update failed for sub ${sub.id}:`, e.message);
          else   console.log(`[BandwidthTracker]   ↳ Sub ${sub.id}: ${currentGb.toFixed(4)} → ${newGbUsed.toFixed(4)} GB`);
        });
    }
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  Vertex Proxies — Standalone Bandwidth Tracker  ║');
  console.log('╚══════════════════════════════════════════════╝\n');
  console.log(`[BandwidthTracker] Supabase: ${SUPABASE_URL}`);
  console.log(`[BandwidthTracker] Interval: ${INTERVAL_MS / 1000}s`);

  // Show available adapters so user can verify interface names
  const adapters = listAdapters();
  if (adapters.length > 0) {
    console.log('\n[BandwidthTracker] Available Windows network adapters:');
    const list = Array.isArray(adapters) ? adapters : [adapters];
    list.forEach(a => console.log(`  • ${a.Name} [${a.Status}]`));
    console.log('');
  }

  // First tick to set baselines
  console.log('[BandwidthTracker] Setting initial baselines...');
  await tick();

  // Recurring ticks
  setInterval(async () => {
    try { await tick(); } catch (e) {
      console.warn('[BandwidthTracker] Tick error:', e.message);
    }
  }, INTERVAL_MS);

  console.log(`\n[BandwidthTracker] ✅ Running — updates Supabase every ${INTERVAL_MS / 1000}s`);
}

main().catch(err => {
  console.error('[BandwidthTracker] Fatal:', err.message);
  process.exit(1);
});
