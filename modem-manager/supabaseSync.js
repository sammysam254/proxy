/**
 * ProxiCell — Supabase Sync
 * Syncs modem state, proxy registrations, and bandwidth data to Supabase
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');
const spawner          = require('./proxySpawner');

const VPS_HOST = process.env.VPS_HOST || 'YOUR_VPS_IP';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
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

      // Update modem total
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
        // Log usage
        const logEntries = subs.map(s => ({
          subscription_id: s.id,
          bytes_in:        bytesIn,
          bytes_out:       bytesOut,
          logged_at:       new Date().toISOString(),
        }));

        await supabase.from('usage_logs').insert(logEntries);

        // Check if any GB-limited subscriptions are exhausted
        for (const sub of subs) {
          if (sub.gb_limit) {
            const gbUsed = totalBytes / (1024 ** 3);
            if (gbUsed >= sub.gb_limit) {
              // Suspend subscription
              await supabase.from('subscriptions').update({
                status:   'expired',
                gb_used:  gbUsed,
              }).eq('id', sub.id);

              console.log(`[SupabaseSync] Subscription ${sub.id} expired (GB limit reached)`);
            }
          }
        }
      }
    } catch (e) {
      console.warn(`[SupabaseSync] Bandwidth sync error for modem ${modem.id}:`, e.message);
    }
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

module.exports = {
  upsertModem,
  updateModemStatus,
  markModemOffline,
  syncBandwidth,
  expireOldSubscriptions,
  supabase,
};
