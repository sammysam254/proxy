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
  rotate_requested_at TIMESTAMPTZ,                    -- Trigger for real-time IP rotation
  last_seen   TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure rotate_requested_at column exists if table was already created
ALTER TABLE modems ADD COLUMN IF NOT EXISTS rotate_requested_at TIMESTAMPTZ;

-- Ensure device_path has unique constraint if table already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'modems_device_path_key'
  ) THEN
    ALTER TABLE modems ADD CONSTRAINT modems_device_path_key UNIQUE (device_path);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

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

-- Insert default plans safely without requiring unique constraints
INSERT INTO plans (name, price_usd, duration_days, gb_limit, description)
SELECT 'Pay Per GB', 3.00, NULL, 1, '3 USD per GB of data used'
WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = 'Pay Per GB');

INSERT INTO plans (name, price_usd, duration_days, gb_limit, description)
SELECT 'Daily', 10.00, 1, NULL, 'Unlimited data for 1 day'
WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = 'Daily');

INSERT INTO plans (name, price_usd, duration_days, gb_limit, description)
SELECT 'Weekly', 30.00, 7, NULL, 'Unlimited data for 7 days'
WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = 'Weekly');

INSERT INTO plans (name, price_usd, duration_days, gb_limit, description)
SELECT 'Monthly', 80.00, 30, NULL, 'Unlimited data for 30 days'
WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = 'Monthly');

INSERT INTO plans (name, price_usd, duration_days, gb_limit, description)
SELECT 'Cloud Phone Only', 15.00, 30, NULL, 'Virtual Android 12 Cloud Phone (30 days)'
WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = 'Cloud Phone Only');

INSERT INTO plans (name, price_usd, duration_days, gb_limit, description)
SELECT 'Cloud Phone + 4G Proxy Combo', 89.00, 30, NULL, 'Virtual Cloud Phone + Unlimited 4G Mobile SIM Proxy (30 days)'
WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = 'Cloud Phone + 4G Proxy Combo');

-- ============================================
-- CLOUD PHONES TABLE (Virtual Android Instances)
-- ============================================
CREATE TABLE IF NOT EXISTS cloud_phones (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id      UUID REFERENCES customers(id) ON DELETE CASCADE,
  proxy_id         UUID REFERENCES proxies(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,                           -- e.g. "Cloud Phone #1"
  brand            TEXT DEFAULT 'Samsung',                  -- e.g. "Samsung", "Google", "Xiaomi"
  model            TEXT DEFAULT 'Galaxy S23',               -- e.g. "Galaxy S23", "Pixel 8 Pro"
  android_version  TEXT DEFAULT '12.0',                     -- e.g. "11.0", "12.0", "13.0"
  imei             TEXT,
  android_id       TEXT,
  mac_address      TEXT,
  status           TEXT DEFAULT 'running' CHECK (status IN ('running', 'stopped', 'provisioning', 'error')),
  vps_engine       TEXT DEFAULT 'oracle',                   -- 'oracle' or 'local'
  stream_url       TEXT,                                    -- ws:// or webrtc:// endpoint
  ws_port          INTEGER,                                 -- WebSocket streaming port
  installed_apps   JSONB DEFAULT '["TikTok", "Instagram", "WhatsApp", "Chrome"]'::jsonb,
  battery_level    INTEGER DEFAULT 95,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  last_active_at   TIMESTAMPTZ DEFAULT NOW()
);

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

-- Sync all existing auth.users into customers table
INSERT INTO customers (id, email, is_admin)
SELECT id, email, (LOWER(email) = 'sammyseth260@gmail.com')
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  is_admin = CASE WHEN LOWER(EXCLUDED.email) = 'sammyseth260@gmail.com' THEN true ELSE customers.is_admin END;

-- ============================================
-- SUBSCRIPTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     UUID REFERENCES customers(id) ON DELETE CASCADE,
  proxy_id        UUID REFERENCES proxies(id) ON DELETE SET NULL,
  plan_id         UUID REFERENCES plans(id),
  proxy_username  TEXT NOT NULL,                      -- credentials for 3proxy auth
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
  ('vps_host', '157.151.206.163'),
  ('rotation_cooldown_minutes', '60'),
  ('paystack_enabled', 'true'),
  ('crypto_enabled', 'true'),
  ('min_gb_purchase', '1'),
  ('max_gb_purchase', '100')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
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

-- Modems (public read, full access for modem manager sync)
DROP POLICY IF EXISTS "modems_admin_all" ON modems;
DROP POLICY IF EXISTS "modems_public_read" ON modems;
DROP POLICY IF EXISTS "modems_all" ON modems;
CREATE POLICY "modems_all" ON modems FOR ALL USING (true) WITH CHECK (true);

-- Proxies (public read, full access for proxy manager)
DROP POLICY IF EXISTS "proxies_admin_all" ON proxies;
DROP POLICY IF EXISTS "proxies_public_read" ON proxies;
DROP POLICY IF EXISTS "proxies_all" ON proxies;
CREATE POLICY "proxies_all" ON proxies FOR ALL USING (true) WITH CHECK (true);

-- Customers
DROP POLICY IF EXISTS "customers_self" ON customers;
CREATE POLICY "customers_self" ON customers USING (id = auth.uid());
DROP POLICY IF EXISTS "customers_admin" ON customers;
CREATE POLICY "customers_admin" ON customers USING (is_admin_user());

-- Subscriptions
DROP POLICY IF EXISTS "subscriptions_self" ON subscriptions;
CREATE POLICY "subscriptions_self" ON subscriptions USING (customer_id = auth.uid());
DROP POLICY IF EXISTS "subscriptions_admin" ON subscriptions;
CREATE POLICY "subscriptions_admin" ON subscriptions USING (is_admin_user());
DROP POLICY IF EXISTS "subscriptions_all_read" ON subscriptions;
CREATE POLICY "subscriptions_all_read" ON subscriptions FOR SELECT USING (true);
DROP POLICY IF EXISTS "subscriptions_all_update" ON subscriptions;
CREATE POLICY "subscriptions_all_update" ON subscriptions FOR UPDATE USING (true);

-- Orders
DROP POLICY IF EXISTS "orders_self" ON orders;
CREATE POLICY "orders_self" ON orders USING (customer_id = auth.uid());
DROP POLICY IF EXISTS "orders_admin" ON orders;
CREATE POLICY "orders_admin" ON orders USING (is_admin_user());

-- Usage logs (full access for bandwidth recorder)
DROP POLICY IF EXISTS "usage_self" ON usage_logs;
DROP POLICY IF EXISTS "usage_all" ON usage_logs;
CREATE POLICY "usage_all" ON usage_logs FOR ALL USING (true) WITH CHECK (true);

-- System config
DROP POLICY IF EXISTS "sysconfig_admin" ON system_config;
CREATE POLICY "sysconfig_admin" ON system_config USING (is_admin_user());

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.customers (id, email, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    (LOWER(NEW.email) = 'sammyseth260@gmail.com')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    is_admin = CASE WHEN LOWER(EXCLUDED.email) = 'sammyseth260@gmail.com' THEN true ELSE customers.is_admin END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
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
