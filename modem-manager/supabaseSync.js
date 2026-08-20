/**
 * ProxiCell — Supabase Sync
 * Syncs modem state, proxy registrations, and bandwidth data to Supabase
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');
const spawner          = require('./proxySpawner');

const VPS_HOST     = process.env.VPS_HOST || '157.151.206.163';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zsfijzjzioaragnlopgn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'dummy_key';

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  { auth: { persistSession: false } }
);

// ─── Upsert modem record ──────────────────────────────────────────────────────
async function upsertModem(modem) {
  const { data, error } = await supabase
    .from('modems')
    .upsert({
      label:           modem.label,
      interface:       modem.interface,
      status:          modem.status,
      ip_address:      modem.ipAddress,
      signal:          modem.signal,
      operator:        modem.operator,
      iccid:           modem.iccid,
      device_path:     modem.devicePath,
      last_seen:       new Date().toISOString(),
      // Android-specific
      is_android:      modem.isAndroid || false,
      adb_serial:      modem.adbSerial || null,
      model:           modem.model || null,
      android_version: modem.androidVersion || null,
      battery:         modem.battery || null,
    }, {
      onConflict: 'device_path',
      returning:  'representation',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[SupabaseSync] Failed to upsert modem:', error.message);
    throw error;
  }

  // Upsert proxy records for each type
  if (modem.portSet && data?.id) {
    const proxies = [
      { type: 'http',   localPort: modem.portSet.http,   publicPort: modem.portSet.publicHttp },
      { type: 'socks4', localPort: modem.portSet.socks4, publicPort: modem.portSet.publicSocks4 },
      { type: 'socks5', localPort: modem.portSet.socks5, publicPort: modem.portSet.publicSocks5 },
    ];

    for (const p of proxies) {
      await supabase.from('proxies').upsert({
        modem_id:    data.id,
        proxy_type:  p.type,
        local_port:  p.localPort,
        public_port: p.publicPort,
        vps_host:    VPS_HOST,
        active:      true,
      }, { onConflict: 'modem_id,proxy_type' });
    }
  }

  return data?.id;
}

// ─── Update modem status ──────────────────────────────────────────────────────
async function updateModemStatus(modemId, modem) {
  if (!modemId) return;

  await supabase.from('modems').update({
    status:     modem.status,
    ip_address: modem.ipAddress,
    signal:     modem.signal,
    last_seen:  new Date().toISOString(),
  }).eq('id', modemId);
}

// ─── Mark modem offline ───────────────────────────────────────────────────────
async function markModemOffline(modemId) {
  if (!modemId) return;

  await supabase.from('modems').update({
    status:    'offline',
    last_seen: new Date().toISOString(),
  }).eq('id', modemId);

  // Mark proxies inactive
  await supabase.from('proxies').update({ active: false }).eq('modem_id', modemId);
}

// Track per-modem byte snapshots so we only sync the DELTA on each interval
const _lastSyncedBytes = new Map(); // modemId → { bytesIn, bytesOut }

// ─── Sync bandwidth usage ─────────────────────────────────────────────────────
async function syncBandwidth(modems) {
  for (const modem of modems) {
    if (!modem.id) continue;

    try {
      const { bytesIn, bytesOut } = await spawner.getModemBandwidth(modem);

      // Compute delta since last sync (avoids counting same bytes twice)
      const prev       = _lastSyncedBytes.get(modem.id) || { bytesIn: 0, bytesOut: 0 };
      const deltaIn    = Math.max(0, bytesIn  - prev.bytesIn);
      const deltaOut   = Math.max(0, bytesOut - prev.bytesOut);
      const deltaBytes = deltaIn + deltaOut;

      // Remember current totals for next iteration
      _lastSyncedBytes.set(modem.id, { bytesIn, bytesOut });

      // Nothing new since last sync — skip
      if (deltaBytes === 0) continue;

      // Update modem-level cumulative counter in DB
      await supabase.rpc('increment_modem_bytes', {
        modem_id_input:  modem.id,
        delta_bytes: deltaBytes,
      }).catch(async () => {
        // Fallback: manual fetch + update if RPC doesn't exist yet
        const { data: m } = await supabase
          .from('modems').select('data_used_bytes').eq('id', modem.id).single();
        const prev_bytes = m?.data_used_bytes || 0;
        await supabase.from('modems').update({
          data_used_bytes: prev_bytes + deltaBytes,
        }).eq('id', modem.id);
      });

      // Find all active subscriptions for proxies on this modem
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('id, gb_used, gb_limit, proxy_id, proxies!inner(modem_id)')
        .eq('proxies.modem_id', modem.id)
        .eq('status', 'active');

      if (subs && subs.length > 0) {
        const deltaGb = deltaBytes / (1024 ** 3);

        for (const sub of subs) {
          // Accumulate: add new delta on top of current stored value
          const currentGb  = parseFloat(sub.gb_used || 0);
          const newGbUsed  = parseFloat((currentGb + deltaGb).toFixed(6));
          const updateData = { gb_used: newGbUsed };

          // Auto-expire if GB cap hit
          if (sub.gb_limit && newGbUsed >= parseFloat(sub.gb_limit)) {
            updateData.status = 'expired';
            console.log(`[SupabaseSync] 📛 Subscription ${sub.id} expired (${newGbUsed.toFixed(4)} GB / ${sub.gb_limit} GB limit)`);
            // ── Immediately revoke credentials so the user CANNOT connect anymore ──
            if (sub.proxy_username && sub.proxies?.modem_id) {
              await spawner.removeCredential(sub.proxy_username, sub.proxies.modem_id).catch(() => {});
              console.log(`[SupabaseSync] 🔒 Credentials revoked for expired user '${sub.proxy_username}'`);
            }
          }

          await supabase.from('subscriptions').update(updateData).eq('id', sub.id);
        }

        // Append to usage_logs for history
        const logEntries = subs.map(s => ({
          subscription_id: s.id,
          bytes_in:        deltaIn,
          bytes_out:       deltaOut,
          logged_at:       new Date().toISOString(),
        }));
        await supabase.from('usage_logs').insert(logEntries).catch(() => {});

        console.log(`[SupabaseSync] 📊 Bandwidth sync: +${(deltaBytes / 1024).toFixed(1)} KB for ${modems.length} modem(s), ${subs.length} subscription(s)`);
      }
    } catch (e) {
      console.warn(`[SupabaseSync] Bandwidth sync error for modem ${modem.id}:`, e.message);
    }
  }
}

// ─── Sync active credentials from DB into proxySpawner memory ────────────────
async function syncActiveCredentials() {
  try {
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('id, proxy_username, proxy_password, proxy_id, proxies!inner(modem_id)')
      .eq('status', 'active');

    if (subs && subs.length > 0) {
      for (const sub of subs) {
        if (sub.proxies?.modem_id && sub.proxy_username && sub.proxy_password) {
          await spawner.addCredential(sub.proxy_username, sub.proxy_password, sub.proxies.modem_id);
        }
      }
    }
  } catch (e) {
    // ignore
  }
}

// ─── Expire old subscriptions AND revoke their credentials ──────────────────────────
async function expireOldSubscriptions() {
  // 1. Find subscriptions that have passed their expiry date
  const { data: toExpire } = await supabase
    .from('subscriptions')
    .select('id, proxy_username, proxies(modem_id)')
    .lt('expires_at', new Date().toISOString())
    .eq('status', 'active');

  if (toExpire && toExpire.length > 0) {
    for (const sub of toExpire) {
      // Revoke credentials immediately so connections are rejected NOW
      if (sub.proxy_username && sub.proxies?.modem_id) {
        await spawner.removeCredential(sub.proxy_username, sub.proxies.modem_id).catch(() => {});
        console.log(`[SupabaseSync] 🔒 Revoked credentials for expired subscription: '${sub.proxy_username}'`);
      }
    }

    // Mark all as expired in DB
    const { error } = await supabase
      .from('subscriptions')
      .update({ status: 'expired' })
      .lt('expires_at', new Date().toISOString())
      .eq('status', 'active');

    if (error) {
      console.warn('[SupabaseSync] Failed to expire subscriptions:', error.message);
    } else {
      console.log(`[SupabaseSync] ⛔ Expired & blocked ${toExpire.length} subscription(s).`);
    }
  }
}

// ─── Reconcile online modems in DB with local manager ────────────────────────
//
//  Ensures that ONLY modems currently active in local memory are marked 'online'
//  in the database. Any ghost records from past runs or changed network adapter
//  names are automatically marked 'offline' and their proxies set to active: false.
//
async function reconcileOnlineModems(activeModemIds = []) {
  try {
    const { data: dbModems, error } = await supabase
      .from('modems')
      .select('id, label, status')
      .eq('status', 'online');

    if (error || !dbModems) return;

    const activeSet = new Set(activeModemIds.filter(Boolean));

    for (const m of dbModems) {
      if (!activeSet.has(m.id)) {
        console.log(`[SupabaseSync] Deactivating stale online modem: ${m.label} (${m.id})`);
        await markModemOffline(m.id);
      }
    }
  } catch (e) {
    console.warn('[SupabaseSync] Reconcile error:', e.message);
  }
}

// ─── Startup cleanup: remove duplicate modem records ─────────────────────────
async function cleanupDuplicateModems() {
  try {
    // Fetch all modems
    const { data: modems, error } = await supabase
      .from('modems')
      .select('id, label, device_path, ip_address, status, last_seen')
      .order('last_seen', { ascending: false });

    if (error || !modems) return;

    // Group by base label (e.g. "Android Phone") or IP
    const byKey = new Map();
    for (const m of modems) {
      const baseKey = (m.label || '').replace(/\s*\([^)]*\)/g, '').trim() || m.id;
      if (!byKey.has(baseKey)) byKey.set(baseKey, []);
      byKey.get(baseKey).push(m);
    }

    let cleaned = 0;
    for (const [key, group] of byKey) {
      if (group.length <= 1) continue;

      // Keep only the most recently seen one, mark the rest offline
      const [keep, ...stale] = group;
      for (const s of stale) {
        if (s.status === 'online') {
          await markModemOffline(s.id);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`[SupabaseSync] Cleaned up ${stale.length} duplicate record(s) for: ${key}`);
      }
    }

    if (cleaned === 0) {
      console.log('[SupabaseSync] No duplicate modem records found.');
    }
  } catch (e) {
    console.warn('[SupabaseSync] Cleanup error (non-fatal):', e.message);
  }
}

module.exports = {
  upsertModem,
  updateModemStatus,
  markModemOffline,
  reconcileOnlineModems,
  syncBandwidth,
  syncActiveCredentials,
  expireOldSubscriptions,
  cleanupDuplicateModems,
  supabase,
};
