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
      modems!inner (
        id, label, operator, signal, status, ip_address, is_android, model, battery
      )
    `)
    .eq('active', true)
    .eq('modems.status', 'online');
  return { data, error };
}

export async function getMySubscriptions() {
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess?.session?.user?.id;
  if (!userId) return { data: [], error: null };

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
    .eq('customer_id', userId)
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

export async function ensureCustomerRecord(userId, userEmail, fullName = '') {
  if (!userId) return;
  try {
    await supabase.from('customers').upsert({
      id:        userId,
      email:     userEmail || '',
      full_name: fullName || '',
      is_admin:  userEmail?.toLowerCase() === 'sammyseth260@gmail.com',
    }, { onConflict: 'id' });
  } catch (e) {
    console.warn('Could not auto-upsert customer record:', e.message);
  }
}

export async function createOrder(planId, proxyId, paymentMethod) {
  const { data: session } = await supabase.auth.getSession();
  const user = session?.session?.user;
  if (!user) throw new Error('Not authenticated');

  // Ensure customer record exists in customers table
  await ensureCustomerRecord(user.id, user.email, user.user_metadata?.full_name);

  const { data: plan } = await supabase
    .from('plans').select('price_usd').eq('id', planId).single();

  const { data, error } = await supabase
    .from('orders')
    .insert({
      customer_id:    user.id,
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
  // 1. Get modem ID for this subscription
  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select('id, proxy_id, proxies(modem_id)')
    .eq('id', subscriptionId)
    .single();

  if (subErr || !sub) throw new Error(subErr?.message || 'Subscription not found');

  const modemId = sub.proxies?.modem_id;
  if (!modemId) throw new Error('No modem device associated with this proxy');

  // 2. Trigger rotation request by updating rotate_requested_at on the modem
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('modems')
    .update({ rotate_requested_at: now })
    .eq('id', modemId);

  if (error) throw new Error('Failed to request IP rotation: ' + error.message);

  // 3. Update subscription last_rotated_at
  await supabase
    .from('subscriptions')
    .update({ last_rotated_at: now })
    .eq('id', subscriptionId);

  return { success: true };
}

export async function isAdmin(userId, userEmail) {
  if (userEmail && userEmail.toLowerCase() === 'sammyseth260@gmail.com') return true;
  if (!userId) return false;

  const { data } = await supabase
    .from('customers')
    .select('is_admin, email')
    .eq('id', userId)
    .single();

  return data?.is_admin === true || data?.email?.toLowerCase() === 'sammyseth260@gmail.com';
}

export async function activateSubscription(orderId, planId, proxyId, paymentMethod, paymentRef) {
  const { data: sess } = await supabase.auth.getSession();
  const user = sess?.session?.user;
  if (!user) throw new Error('You must be signed in.');

  await ensureCustomerRecord(user.id, user.email, user.user_metadata?.full_name);

  const { data: plan } = await supabase.from('plans').select('*').eq('id', planId).single();
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  const username = `usr_${randomSuffix}`;
  const password = `px_${Math.random().toString(36).substring(2, 10)}`;

  let expiresAt = null;
  if (plan?.duration_days) {
    const d = new Date();
    d.setDate(d.getDate() + plan.duration_days);
    expiresAt = d.toISOString();
  }

  // 1. Insert active subscription
  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .insert({
      customer_id:     user.id,
      proxy_id:        proxyId,
      plan_id:         planId,
      proxy_username:  username,
      proxy_password:  password,
      expires_at:      expiresAt,
      gb_limit:        plan?.gb_limit || null,
      gb_used:         0,
      status:          'active',
      payment_method:  paymentMethod,
      payment_ref:     paymentRef || `TX_${Date.now()}`,
    })
    .select()
    .single();

  if (subErr) throw subErr;

  // 2. Update order if exists
  if (orderId) {
    await supabase.from('orders').update({
      payment_status:  'paid',
      payment_ref:     paymentRef,
      subscription_id: sub.id,
      paid_at:         new Date().toISOString(),
    }).eq('id', orderId);
  }

  return sub;
}

export async function simulateAdminSubscription(planId, proxyId) {
  return activateSubscription(null, planId, proxyId, 'manual', `ADMIN_TEST_${Date.now()}`);
}

// ─── Admin Plan Management ───────────────────────────────────────────────────
export async function getAllAdminPlans() {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .order('created_at', { ascending: true });
  return { data, error };
}

export async function savePlan(planData) {
  const payload = {
    name:          planData.name,
    price_usd:     parseFloat(planData.price_usd),
    duration_days: planData.duration_days ? parseInt(planData.duration_days) : null,
    gb_limit:      planData.gb_limit ? parseFloat(planData.gb_limit) : null,
    description:   planData.description || '',
    is_active:     planData.is_active !== undefined ? planData.is_active : true,
  };

  if (planData.id) {
    const { data, error } = await supabase
      .from('plans')
      .update(payload)
      .eq('id', planData.id)
      .select()
      .single();
    return { data, error };
  } else {
    const { data, error } = await supabase
      .from('plans')
      .insert(payload)
      .select()
      .single();
    return { data, error };
  }
}

export async function deletePlan(planId) {
  const { data, error } = await supabase
    .from('plans')
    .delete()
    .eq('id', planId);
  return { data, error };
}

// ─── Admin Proxy & Marketplace Management ────────────────────────────────────
export async function getAllAdminProxies() {
  const { data, error } = await supabase
    .from('proxies')
    .select(`
      *,
      modems (
        id, label, operator, signal, status, ip_address, is_android, model, interface
      )
    `)
    .order('public_port', { ascending: true });
  return { data, error };
}

export async function updateProxyActiveStatus(proxyId, active) {
  const { data, error } = await supabase
    .from('proxies')
    .update({ active })
    .eq('id', proxyId)
    .select()
    .single();
  return { data, error };
}

export async function deleteProxy(proxyId) {
  const { data, error } = await supabase
    .from('proxies')
    .delete()
    .eq('id', proxyId);
  return { data, error };
}

// ─── Admin Credential Revocation ─────────────────────────────────────────────
export async function revokeSubscription(subscriptionId) {
  // 1. Mark subscription as revoked in database
  const { data, error } = await supabase
    .from('subscriptions')
    .update({
      status: 'revoked',
    })
    .eq('id', subscriptionId)
    .select('*, proxies(modem_id)')
    .single();

  if (error) throw error;
  return { data, success: true };
}

