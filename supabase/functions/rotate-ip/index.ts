// Supabase Edge Function: rotate-ip
// Sends IP rotation request to the local machine modem manager

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  const { subscriptionId, modemId } = await req.json();
  const LOCAL_MACHINE_URL = Deno.env.get('LOCAL_MACHINE_WEBHOOK_URL')!;
  const WEBHOOK_SECRET    = Deno.env.get('WEBHOOK_SECRET')!;

  // Check rotation cooldown (database function)
  if (subscriptionId) {
    const { data: canRotate } = await supabase.rpc('can_rotate_ip', { sub_id: subscriptionId });
    if (!canRotate) {
      return new Response(JSON.stringify({
        error: 'IP rotation cooldown active. Please wait before rotating again.',
      }), { status: 429 });
    }
  }

  // Determine modem ID
  let targetModemId = modemId;
  if (!targetModemId && subscriptionId) {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('proxies(modem_id)')
      .eq('id', subscriptionId)
      .single();
    targetModemId = sub?.proxies?.modem_id;
  }

  // Send rotation request to local machine
  if (LOCAL_MACHINE_URL) {
    const res = await fetch(`${LOCAL_MACHINE_URL}/rotate-ip`, {
      method:  'POST',
      headers: {
        'Content-Type':       'application/json',
        'X-ProxiCell-Secret': WEBHOOK_SECRET,
      },
      body: JSON.stringify({ modemId: targetModemId }),
    });

    const result = await res.json();

    // Update last_rotated_at
    if (subscriptionId) {
      await supabase.from('subscriptions').update({
        last_rotated_at: new Date().toISOString(),
      }).eq('id', subscriptionId);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Local machine not reachable' }), {
    status: 503,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
