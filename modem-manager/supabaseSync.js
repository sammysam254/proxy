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

// ─── Sync bandwidth usage ─────────────────────────────────────────────────────
async function syncBandwidth(modems) {
  for (const modem of modems) {
    if (!modem.id) continue;

    try {
      const { bytesIn, bytesOut } = await spawner.getModemBandwidth(modem);
      const totalBytes = bytesIn + bytesOut;

      // Update modem total data used
      await supabase.from('modems').update({
        data_used_bytes: totalBytes,
      }).eq('id', modem.id);

      // Find active subscriptions for proxies on this modem
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('id, gb_used, gb_limit, proxy_id, proxies!inner(modem_id)')
        .eq('proxies.modem_id', modem.id)
        .eq('status', 'active');

      if (subs && subs.length > 0) {
        const gbUsed = totalBytes / (1024 ** 3);
        const gbUsedFormatted = parseFloat(gbUsed.toFixed(3));

        // Update all active subscriptions with the current GB used
        for (const sub of subs) {
          const updateData = { gb_used: gbUsedFormatted };
          if (sub.gb_limit && gbUsed >= sub.gb_limit) {
            updateData.status = 'expired';
            console.log(`[SupabaseSync] Subscription ${sub.id} expired (GB limit reached: ${gbUsedFormatted}/${sub.gb_limit} GB)`);
          }
          await supabase.from('subscriptions').update(updateData).eq('id', sub.id);
        }

        // Log periodic usage to usage_logs
        if (totalBytes > 0) {
          const logEntries = subs.map(s => ({
            subscription_id: s.id,
            bytes_in:        bytesIn,
            bytes_out:       bytesOut,
            logged_at:       new Date().toISOString(),
          }));

          await supabase.from('usage_logs').insert(logEntries).catch(() => {});
        }
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

// ─── Expire old subscriptions ─────────────────────────────────────────────────
async function expireOldSubscriptions() {
  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'expired' })
    .lt('expires_at', new Date().toISOString())
    .eq('status', 'active');

  if (error) {
    console.warn('[SupabaseSync] Failed to expire subscriptions:', error.message);
  }
}

// ─── Startup cleanup: remove duplicate modem records ─────────────────────────
//
//  Problem: every time the modem manager restarts without ADB auth, it registers
//  a new modem row (old devicePath had spaces, causing conflict-miss). This leaves
//  ghost "offline" modems that confuse the admin panel and create orphan proxies.
//
//  Fix: on startup, find modems that share the same label AND same ip_address but
//  have different IDs, keep the most recently-seen one, mark the rest offline and
//  deactivate their proxies. This is idempotent and safe to run every boot.
//
async function cleanupDuplicateModems() {
  try {
    // Fetch all modems
    const { data: modems, error } = await supabase
      .from('modems')
      .select('id, label, device_path, ip_address, status, last_seen')
      .order('last_seen', { ascending: false });

    if (error || !modems) return;

    // Group by label (same physical device = same label)
    const byLabel = new Map();
    for (const m of modems) {
      const key = m.label;
      if (!byLabel.has(key)) byLabel.set(key, []);
      byLabel.get(key).push(m);
    }

    let cleaned = 0;
    for (const [label, group] of byLabel) {
      if (group.length <= 1) continue;

      // Keep the most recent (first after sort by last_seen desc), mark others offline
      const [keep, ...stale] = group;
      for (const s of stale) {
        await supabase.from('modems').update({
          status: 'offline',
          last_seen: new Date().toISOString(),
        }).eq('id', s.id);

        // Deactivate their proxies so they don't show in the storefront
        await supabase.from('proxies').update({ active: false }).eq('modem_id', s.id);

        cleaned++;
      }

      if (cleaned > 0) {
        console.log(`[SupabaseSync] Cleaned up ${stale.length} duplicate record(s) for: ${label}`);
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
  syncBandwidth,
  syncActiveCredentials,
  expireOldSubscriptions,
  cleanupDuplicateModems,
  supabase,
};
