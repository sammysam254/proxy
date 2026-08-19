// Supabase Edge Function: activate-subscription
// Called after successful Paystack payment confirmation

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { v4 as uuid } from 'https://esm.sh/uuid@10';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const LOCAL_MACHINE_URL = Deno.env.get('LOCAL_MACHINE_WEBHOOK_URL')!;
const WEBHOOK_SECRET    = Deno.env.get('WEBHOOK_SECRET')!;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const { orderId, payRef } = await req.json();

  if (!orderId) {
    return new Response(JSON.stringify({ error: 'orderId required' }), { status: 400 });
  }

  // 1. Fetch the order
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('*, plans(*), proxies(*)')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) {
    return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404 });
  }

  // 2. Mark order as paid
  await supabase.from('orders').update({
    payment_status: 'paid',
    payment_ref:    payRef,
    paid_at:        new Date().toISOString(),
  }).eq('id', orderId);

  // 3. Generate credentials
  const username = `pc_${uuid().replace(/-/g, '').slice(0, 10)}`;
  const password = uuid().replace(/-/g, '').slice(0, 16);

  // 4. Calculate expiry
  const durationDays = order.plans?.duration_days;
  const expiresAt    = durationDays
    ? new Date(Date.now() + durationDays * 86400000).toISOString()
    : null;

  // 5. Create subscription
  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .insert({
      customer_id:    order.customer_id,
      proxy_id:       order.proxy_id,
      plan_id:        order.plan_id,
      proxy_username: username,
      proxy_password: password,
      expires_at:     expiresAt,
      gb_limit:       order.plans?.gb_limit || null,
      status:         'active',
      payment_method: order.payment_method,
      payment_ref:    payRef,
    })
    .select()
    .single();

  if (subErr) {
    console.error('Subscription creation failed:', subErr);
    return new Response(JSON.stringify({ error: subErr.message }), { status: 500 });
  }

  // 6. Update order with subscription ID
  await supabase.from('orders').update({ subscription_id: sub.id }).eq('id', orderId);

  // 7. Push credentials to local machine (modem manager)
  if (LOCAL_MACHINE_URL && order.proxies) {
    try {
      await fetch(`${LOCAL_MACHINE_URL}/push-credentials`, {
        method:  'POST',
        headers: {
          'Content-Type':       'application/json',
          'X-ProxiCell-Secret': WEBHOOK_SECRET,
        },
        body: JSON.stringify({
          subscriptionId: sub.id,
          username,
          password,
          modemId: order.proxies.modem_id,
        }),
      });
    } catch (e) {
      console.warn('Could not push credentials to modem manager:', e.message);
      // Non-fatal — credentials are in DB, modem manager polls and syncs
    }
  }

  return new Response(JSON.stringify({
    success:  true,
    username,
    password,
    expiresAt,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
