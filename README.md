# ProxiCell — Modem Proxy Rental System

Real SIM card proxies with HTTP, SOCKS4, and SOCKS5 support. Auto-detects USB modems, tunnels through Oracle VPS, sells access via Paystack and crypto.

## Architecture

```
Local Machine (SIM modems) → SSH Tunnel → Oracle VPS (public IP)
                                                  ↕
                                        Supabase (DB + Auth + Edge Functions)
                                                  ↕
                                        Netlify (React Storefront)
```

## Quick Start

### Step 1: Set Up the Oracle VPS
```bash
# SSH into your VPS
ssh ubuntu@YOUR_VPS_IP

# Upload and run the VPS setup script
bash vps-setup.sh
```

### Step 2: Set Up Local Machine (where modems / Android phones plug in)

#### On Windows:
1. Open PowerShell or Command Prompt as Administrator:
   ```cmd
   git clone https://github.com/sammysam254/proxy.git
   cd proxy
   setup.bat
   ```
2. To start the proxy system anytime later, double-click `start.bat`.

#### On Linux (Ubuntu / Debian / VirtualBox):
```bash
# Option A: One-liner directly from GitHub
curl -fsSL https://raw.githubusercontent.com/sammysam254/proxy/main/setup.sh -o setup.sh && sudo bash setup.sh

# Option B: Clone repo first
git clone https://github.com/sammysam254/proxy.git
cd proxy
sudo bash setup.sh
```

### Step 3: Supabase Setup
1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in the SQL editor
3. Deploy Edge Functions:
   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_ID
   npx supabase functions deploy activate-subscription
   npx supabase functions deploy create-crypto-invoice
   npx supabase functions deploy rotate-ip
   ```
4. Set Edge Function secrets:
   ```bash
   npx supabase secrets set LOCAL_MACHINE_WEBHOOK_URL=http://YOUR_LOCAL_IP:9001
   npx supabase secrets set WEBHOOK_SECRET=your_random_secret
   npx supabase secrets set NOWPAYMENTS_API_KEY=your_nowpayments_key
   npx supabase secrets set SITE_URL=https://yourapp.netlify.app
   ```

### Step 4: Deploy Frontend to Netlify
1. Push code to GitHub
2. Connect repo to [netlify.com](https://netlify.com)
3. Set environment variables in Netlify dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_VPS_HOST`
   - `VITE_PAYSTACK_PUBLIC_KEY`
4. Deploy!

### Step 5: Make Yourself Admin
```sql
-- Run in Supabase SQL editor after signing up
UPDATE customers SET is_admin = true WHERE email = 'your@email.com';
```

### Step 6: Plug in Modems!
Plug USB modems with SIM cards into your local machine.
The modem manager will auto-detect them and create proxies within 30 seconds.

---

## Proxy Port Layout

| Modem | HTTP Port | SOCKS4 Port | SOCKS5 Port |
|-------|-----------|-------------|-------------|
| 0     | 41000     | 42000       | 43000       |
| 1     | 41001     | 42001       | 43001       |
| N     | 410NN     | 420NN       | 430NN       |

All ports are exposed on your Oracle VPS public IP.

---

## Pricing Plans

| Plan       | Price |
|------------|-------|
| Pay per GB | $3/GB |
| Daily      | $10   |
| Weekly     | $30   |
| Monthly    | $80   |

---

## Project Structure

```
proxy/
├── setup.sh              ← Run on local machine (Linux)
├── vps-setup.sh          ← Run on Oracle VPS
├── modem-manager/        ← Node.js service (runs on local machine)
│   ├── index.js          ← Main service + webhook server
│   ├── modemDetector.js  ← USB modem detection
│   ├── proxySpawner.js   ← 3proxy config generation
│   ├── tunnelManager.js  ← autossh tunnel management
│   └── supabaseSync.js   ← Supabase data sync
├── supabase/
│   ├── schema.sql        ← Database schema (run in Supabase SQL editor)
│   └── functions/        ← Edge Functions (Deno)
│       ├── activate-subscription/
│       ├── create-crypto-invoice/
│       └── rotate-ip/
└── frontend/             ← Vite + React (deploy to Netlify)
    ├── src/
    │   ├── pages/
    │   │   ├── Storefront.jsx   ← Public proxy store
    │   │   ├── Dashboard.jsx    ← Customer portal
    │   │   ├── Admin.jsx        ← Admin panel
    │   │   └── AuthPage.jsx     ← Sign in / sign up
    │   └── components/
    │       ├── Navbar.jsx
    │       └── PurchaseModal.jsx
    └── netlify.toml
```

---

## Modem Support

The system auto-detects modems via:
1. **ModemManager** (mmcli) — best, supports Huawei, ZTE, Quectel, Sierra Wireless
2. **/sys/class/net** scanning — USB network interfaces (usb0, wwan0, ppp0)
3. **/dev/ttyUSB*** fallback — any USB serial device

For WSL2, use `usbipd-win` to attach USB devices to WSL.

---

## Payment Integration

- **Paystack**: Card payments. Get API keys at [paystack.com](https://paystack.com)
- **NOWPayments**: Crypto (USDT, BTC, ETH). Get API key at [nowpayments.io](https://nowpayments.io)

---

## Commands

```bash
# View modem manager logs
journalctl -u proxicell-manager -f

# Check modem status
mmcli -L          # list modems
mmcli -m 0        # modem details

# Test proxy
curl --proxy socks5://user:pass@YOUR_VPS_IP:43000 https://ipinfo.io

# Restart modem manager
systemctl restart proxicell-manager
```
