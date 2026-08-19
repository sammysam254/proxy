-- ============================================
-- PROXY RENTAL SYSTEM — SUPABASE SCHEMA
-- Run this in your Supabase SQL editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- MODEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS modems (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label       TEXT NOT NULL,                          -- e.g. "Modem 1 (SIM: +254xxx)"
  interface   TEXT,                                   -- e.g. ppp0, usb0, wwan0, rndis0
  status      TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'error')),
  ip_address  TEXT,                                   -- current IP from SIM
  signal      INTEGER DEFAULT 0,                     -- signal strength 0-100
  operator    TEXT,                                   -- carrier name
  iccid       TEXT,                                   -- SIM card ICCID
  device_path TEXT,                                   -- /dev/ttyUSB0, COM3, or ADB serial
  data_used_bytes BIGINT DEFAULT 0,
  -- Android phone columns
  is_android       BOOLEAN DEFAULT false,             -- true = Android phone via ADB/tethering
  adb_serial       TEXT,                              -- ADB device serial
  model            TEXT,                              -- Device model (e.g. "Samsung Galaxy A54")
  android_version  TEXT,                              -- Android OS version
  battery          INTEGER,                           -- Battery % 0-100
  last_seen   TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PROXIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS proxies (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  modem_id      UUID REFERENCES modems(id) ON DELETE CASCADE,
  proxy_type    TEXT NOT NULL CHECK (proxy_type IN ('http', 'socks4', 'socks5')),
  local_port    INTEGER NOT NULL,
  public_port   INTEGER NOT NULL,
  vps_host      TEXT NOT NULL,                        -- Oracle VPS public IP or hostname
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(modem_id, proxy_type)
);

-- ============================================
-- PLANS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS plans (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  price_usd     NUMERIC(10,2) NOT NULL,
  duration_days INTEGER,                              -- NULL = pay-per-gb
  gb_limit      NUMERIC(10,3),                       -- NULL = unlimited (time-based)
  description   TEXT,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default plans
INSERT INTO plans (name, price_usd, duration_days, gb_limit, description) VALUES
  ('Pay Per GB',  3.00,  NULL, 1,    '3 USD per GB of data used'),
  ('Daily',      10.00,  1,    NULL, 'Unlimited data for 1 day'),
  ('Weekly',     30.00,  7,    NULL, 'Unlimited data for 7 days'),
  ('Monthly',    80.00,  30,   NULL, 'Unlimited data for 30 days');

-- ============================================
-- CUSTOMERS TABLE (extends Supabase auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS customers (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  full_name     TEXT,
  is_admin      BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SUBSCRIPTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     UUID REFERENCES customers(id) ON DELETE CASCADE,
  proxy_id        UUID REFERENCES proxies(id) ON DELETE SET NULL,
  plan_id         UUID REFERENCES plans(id),
  proxy_username  TEXT NOT NULL,
  proxy_password  TEXT NOT NULL,
  expires_at      TIMESTAMPTZ,                        -- NULL = pay-per-gb (no expiry)
  gb_limit        NUMERIC(10,3),                      -- copied from plan at purchase time
  gb_used         NUMERIC(10,3) DEFAULT 0,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'suspended')),
  payment_method  TEXT CHECK (payment_method IN ('paystack', 'crypto', 'manual')),
  payment_ref     TEXT,                               -- payment reference/tx hash
  last_rotated_at TIMESTAMPTZ,                       -- last IP rotation
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- USAGE LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS usage_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  bytes_in        BIGINT DEFAULT 0,
  bytes_out       BIGINT DEFAULT 0,
  logged_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ORDERS TABLE (payment tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     UUID REFERENCES customers(id),
  plan_id         UUID REFERENCES plans(id),
  proxy_id        UUID REFERENCES proxies(id),
  amount_usd      NUMERIC(10,2) NOT NULL,
  payment_method  TEXT CHECK (payment_method IN ('paystack', 'crypto', 'manual')),
  payment_status  TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_ref     TEXT,
  subscription_id UUID REFERENCES subscriptions(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  paid_at         TIMESTAMPTZ
);

-- ============================================
-- SYSTEM CONFIG TABLE (admin settings)
-- ============================================
CREATE TABLE IF NOT EXISTS system_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO system_config (key, value) VALUES
  ('vps_host', 'YOUR_ORACLE_VPS_IP'),
  ('rotation_cooldown_minutes', '60'),
  ('paystack_enabled', 'true'),
  ('crypto_enabled', 'true'),
  ('maintenance_mode', 'false');

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE modems          ENABLE ROW LEVEL SECURITY;
ALTER TABLE proxies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans           ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config   ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is admin (prevents RLS recursion)
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT is_admin FROM customers WHERE id = auth.uid()), false);
$$ LANGUAGE sql SECURITY DEFINER;

-- Plans are public (anyone can read)
CREATE POLICY "plans_public_read" ON plans FOR SELECT USING (true);

-- Modems: public can see count/status only (not internal details) — admins see all
CREATE POLICY "modems_admin_all" ON modems USING (is_admin_user());
CREATE POLICY "modems_public_read" ON modems FOR SELECT USING (true);

-- Proxies: admins see all, customers see their subscribed proxies
CREATE POLICY "proxies_admin_all" ON proxies USING (is_admin_user());
CREATE POLICY "proxies_public_read" ON proxies FOR SELECT USING (active = true);

-- Customers: can read/update their own profile; admins see all
CREATE POLICY "customers_self" ON customers USING (id = auth.uid());
CREATE POLICY "customers_admin" ON customers USING (is_admin_user());

-- Subscriptions: customers see only their own, admins see all
CREATE POLICY "subscriptions_self" ON subscriptions USING (customer_id = auth.uid());
CREATE POLICY "subscriptions_admin" ON subscriptions USING (is_admin_user());

-- Orders: customers see only their own, admins see all
CREATE POLICY "orders_self" ON orders USING (customer_id = auth.uid());
CREATE POLICY "orders_admin" ON orders USING (is_admin_user());

-- Usage logs: customers see their own, admins see all
CREATE POLICY "usage_self" ON usage_logs USING (
  is_admin_user() OR EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.id = subscription_id AND s.customer_id = auth.uid()
  )
);

-- System config: admins only
CREATE POLICY "sysconfig_admin" ON system_config USING (is_admin_user());

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-create customer profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.customers (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to check if rotation is allowed (once per hour)
CREATE OR REPLACE FUNCTION can_rotate_ip(sub_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  last_rot TIMESTAMPTZ;
  cooldown INTEGER;
BEGIN
  SELECT last_rotated_at INTO last_rot
  FROM subscriptions WHERE id = sub_id AND customer_id = auth.uid();
  
  SELECT value::INTEGER INTO cooldown
  FROM system_config WHERE key = 'rotation_cooldown_minutes';
  
  IF last_rot IS NULL THEN RETURN TRUE; END IF;
  RETURN (NOW() - last_rot) > (cooldown || ' minutes')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_proxy    ON subscriptions(proxy_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status   ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer        ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_usage_sub              ON usage_logs(subscription_id);
CREATE INDEX IF NOT EXISTS idx_modems_status          ON modems(status);
