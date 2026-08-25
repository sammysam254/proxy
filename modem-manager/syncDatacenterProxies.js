/**
 * Vertex Proxies — Sync Datacenter Proxies & Plan to Supabase
 * DigitalOcean VPS (64.227.3.211) — Dedicated Datacenter Nodes (10 USD / Month)
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const VPS_HOST = process.env.VPS_HOST || '64.227.3.211';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zsfijzjzioaragnlopgn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzZmlqemp6aW9hcmFnbmxvcGduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjMwNDksImV4cCI6MjEwMjY5OTA0OX0.Z-VBaoutWmZUW6S_G3SECl5ylWUfECs5iR7E4aMNASI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const DATACENTER_SLOTS = 10;

async function syncDatacenter() {
  console.log('\n[DatacenterSync] ─── Syncing DigitalOcean Datacenter Proxies & Plan ───');
  console.log(`[DatacenterSync] VPS Host: ${VPS_HOST}`);

  // 1. Ensure "Datacenter Monthly" plan exists ($10.00 USD / month)
  const { data: existingPlan, error: planErr } = await supabase
    .from('plans')
    .select('id, name, price_usd')
    .eq('name', 'Datacenter Monthly')
    .maybeSingle();

  if (!existingPlan) {
    const { data: newPlan, error: insertPlanErr } = await supabase
      .from('plans')
      .insert({
        name: 'Datacenter Monthly',
        price_usd: 10.00,
        duration_days: 30,
        gb_limit: null,
        description: 'Dedicated High-Speed DigitalOcean Datacenter Proxy (10 USD / Month, 99.99% SLA, 10 Gbps Port, Unlimited Bandwidth)',
        is_active: true,
      })
      .select()
      .single();

    if (insertPlanErr) {
      console.warn('[DatacenterSync] Could not insert Datacenter plan:', insertPlanErr.message);
    } else {
      console.log(`[DatacenterSync] ✅ Created Plan: "Datacenter Monthly" — $10.00 / mo (ID: ${newPlan.id})`);
    }
  } else {
    console.log(`[DatacenterSync] Plan "Datacenter Monthly" active (ID: ${existingPlan.id}, $${existingPlan.price_usd})`);
  }

  // 2. Ensure 10 Dedicated Datacenter Modem/Proxy Nodes exist
  for (let slot = 1; slot <= DATACENTER_SLOTS; slot++) {
    const devicePath = `datacenter_vps_slot_${slot}`;
    const label = `USA Datacenter Proxy #${slot}`;
    const httpPort   = 51000 + slot;
    const socks4Port = 52000 + slot;
    const socks5Port = 53000 + slot;

    // Upsert modem record
    const { data: modem, error: modemErr } = await supabase
      .from('modems')
      .upsert({
        device_path: devicePath,
        label,
        operator: 'DigitalOcean Datacenter 🇺🇸',
        status: 'online',
        ip_address: VPS_HOST,
        interface: 'eth0',
        signal: 100,
        model: `DigitalOcean High-Speed Tier-1 Datacenter Node #${slot}`,
        is_android: false,
        last_seen: new Date().toISOString(),
      }, { onConflict: 'device_path' })
      .select('id')
      .single();

    if (modemErr) {
      console.warn(`[DatacenterSync] Error upserting slot #${slot}:`, modemErr.message);
      continue;
    }

    if (modem?.id) {
      // Upsert proxy records for HTTP, SOCKS4, SOCKS5
      const proxyTypes = [
        { type: 'http',   local: httpPort,   public: httpPort },
        { type: 'socks4', local: socks4Port, public: socks4Port },
        { type: 'socks5', local: socks5Port, public: socks5Port },
      ];

      for (const p of proxyTypes) {
        await supabase
          .from('proxies')
          .upsert({
            modem_id:    modem.id,
            proxy_type:  p.type,
            local_port:  p.local,
            public_port: p.public,
            vps_host:    VPS_HOST,
            active:      true,
          }, { onConflict: 'modem_id,proxy_type' });
      }

      console.log(`[DatacenterSync] ✅ Slot #${slot} online: HTTP:${httpPort} S4:${socks4Port} S5:${socks5Port}`);
    }
  }

  console.log('[DatacenterSync] ─── Datacenter Synchronization Complete ───\n');
}

if (require.main === module) {
  syncDatacenter().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { syncDatacenter };
