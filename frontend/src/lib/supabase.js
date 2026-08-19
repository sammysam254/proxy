import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase environment variables. Check your .env file.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Auth helpers ─────────────────────────────────────────────────────────────
export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email, password, fullName) {
  const res = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (!res.error && res.data.user) {
    await supabase.from('customers').upsert({
      id:        res.data.user.id,
      email,
      full_name: fullName,
    });
  }
  return res;
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// ─── Data helpers ─────────────────────────────────────────────────────────────
export async function getPlans() {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('price_usd');
  return { data, error };
}

export async function getAvailableProxies() {
  const { data, error } = await supabase
    .from('proxies')
    .select(`
      *,
      modems (
        id, label, operator, signal, status, ip_address
      )
    `)
    .eq('active', true);
  return { data, error };
}

export async function getMySubscriptions() {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(`
      *,
      proxies (
        proxy_type, public_port, vps_host,
        modems ( label, operator, ip_address, signal )
      ),
      plans ( name, duration_days, gb_limit )
    `)
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function getAdminModems() {
  const { data, error } = await supabase
    .from('modems')
    .select(`
      *,
      proxies (*)
    `)
    .order('created_at');
  return { data, error };
}

export async function getAdminStats() {
  const [{ data: subs }, { data: orders }, { data: modems }] = await Promise.all([
    supabase.from('subscriptions').select('status, created_at'),
    supabase.from('orders').select('amount_usd, payment_status, created_at'),
    supabase.from('modems').select('status'),
  ]);

  const totalRevenue = (orders || [])
    .filter(o => o.payment_status === 'paid')
    .reduce((acc, o) => acc + parseFloat(o.amount_usd), 0);

  const activeSubs    = (subs || []).filter(s => s.status === 'active').length;
  const onlineModems  = (modems || []).filter(m => m.status === 'online').length;
  const totalModems   = (modems || []).length;

  return { totalRevenue, activeSubs, onlineModems, totalModems };
}

export async function createOrder(planId, proxyId, paymentMethod) {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session) throw new Error('Not authenticated');

  const { data: plan } = await supabase
    .from('plans').select('price_usd').eq('id', planId).single();

  const { data, error } = await supabase
    .from('orders')
    .insert({
      customer_id:    session.session.user.id,
      plan_id:        planId,
      proxy_id:       proxyId,
      amount_usd:     plan.price_usd,
      payment_method: paymentMethod,
      payment_status: 'pending',
    })
    .select()
    .single();

  return { data, error };
}

export async function requestIpRotation(subscriptionId) {
  const { data, error } = await supabase.rpc('can_rotate_ip', { sub_id: subscriptionId });
  if (!data) throw new Error('IP rotation cooldown active. Please wait before rotating again.');

  // Call Supabase Edge Function
  const { data: result, error: fnError } = await supabase.functions.invoke('rotate-ip', {
    body: { subscriptionId },
  });
  return { data: result, error: fnError };
}

export async function isAdmin(userId) {
  const { data } = await supabase
    .from('customers')
    .select('is_admin')
    .eq('id', userId)
    .single();
  return data?.is_admin === true;
}
