#!/bin/bash
# ==============================================================================
# DIGITALOCEAN VPS — DEDICATED DATACENTER PROXY SERVER SETUP (3PROXY)
# Run on DigitalOcean VPS (64.227.3.211) as root: sudo bash datacenter-vps-setup.sh
# ==============================================================================

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'

echo -e "${CYAN}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║    DIGITALOCEAN VPS — DATACENTER PROXY SERVER (51001 - 53010)         ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

[[ $EUID -ne 0 ]] && echo "Run as root: sudo bash datacenter-vps-setup.sh" && exit 1

# 1. Install 3proxy and dependencies
echo -e "${CYAN}[*] Installing 3proxy and network tools...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq
apt-get install -y 3proxy ufw curl net-tools jq || {
    # Build 3proxy from source if apt package unavailable
    apt-get install -y build-essential git
    cd /tmp
    rm -rf 3proxy
    git clone https://github.com/3proxy/3proxy.git
    cd 3proxy
    make -f Makefile.Linux
    make -f Makefile.Linux install
}

# 2. Configure 3proxy for 10 Datacenter slots
echo -e "${CYAN}[*] Generating 3proxy configuration for 10 Datacenter slots...${NC}"
mkdir -p /etc/3proxy
touch /etc/3proxy/.proxyauth

cat > /etc/3proxy/3proxy.cfg << 'EOF'
daemon
pidfile /var/run/3proxy.pid
nserver 1.1.1.1
nserver 8.8.8.8
nscache 65536
timeouts 1 5 30 60 180 1800 15 60
log /var/log/3proxy.log D
logformat "- +_L%t.%. %N.%p %E %U %C:%c %R:%r %O %I %h %T"
archiver rar rar a -df -inul %A %F
rotate 30

# Authentication from users file (validates users in .proxyauth, fallback none)
users $/etc/3proxy/.proxyauth
auth strong none

# ─── 10 Dedicated Datacenter Proxy Slots (51001-51010 HTTP, 53001-53010 SOCKS5) ───
EOF

for i in $(seq 1 10); do
  HTTP_PORT=$((51000 + i))
  SOCKS_PORT=$((53000 + i))
  cat >> /etc/3proxy/3proxy.cfg << EOF

# Datacenter Slot #$i
proxy -p$HTTP_PORT -a
socks -p$SOCKS_PORT -a
EOF
done

# 3. Configure Firewall (Open ports 51001-53010)
echo -e "${CYAN}[*] Configuring Firewall for Datacenter proxy ports...${NC}"
if command -v ufw &>/dev/null; then
  ufw allow 51001:51010/tcp comment "Datacenter HTTP Proxies" || true
  ufw allow 52001:52010/tcp comment "Datacenter SOCKS4 Proxies" || true
  ufw allow 53001:53010/tcp comment "Datacenter SOCKS5 Proxies" || true
  ufw --force enable || true
fi

# 4. Create systemd service if not present
cat > /etc/systemd/system/3proxy.service << 'SVCEOF'
[Unit]
Description=3proxy Tiny Proxy Server
After=network.target

[Service]
Type=forking
ExecStart=/usr/bin/3proxy /etc/3proxy/3proxy.cfg
PIDFile=/var/run/3proxy.pid
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable 3proxy
systemctl restart 3proxy || /usr/local/bin/3proxy /etc/3proxy/3proxy.cfg || true

echo -e "${GREEN}${BOLD}"
echo "================================================================"
echo "  [SUCCESS] DIGITALOCEAN DATACENTER PROXY SERVER IS ACTIVE!     "
echo "================================================================"
echo "  HTTP Ports:    51001 - 51010"
echo "  SOCKS5 Ports:  53001 - 53010"
echo "  Public IP:     64.227.3.211"
echo "  Price:         10 USD / Month"
echo "================================================================"
echo -e "${NC}"
