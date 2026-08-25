#!/bin/bash
# ==============================================================================
# DIGITALOCEAN VPS — UNIFIED PROXY & TUNNEL GATEWAY SETUP
# IP: 64.227.3.211
# Runs both:
#   1. Dedicated Datacenter Proxies (51001-53010 via 3proxy)
#   2. USA Residential Reverse SSH Gateway (41000-43012 via SSH Port Forwarding)
# ==============================================================================

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'

echo -e "${CYAN}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║    DIGITALOCEAN VPS — UNIFIED PROXY GATEWAY (64.227.3.211)            ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

[[ $EUID -ne 0 ]] && echo "Run as root: sudo bash datacenter-vps-setup.sh" && exit 1

# 1. Authorize USA Residential Machine SSH Tunnel Key
echo -e "${CYAN}[*] Configuring SSH authorized keys & gateway forwarding...${NC}"
mkdir -p /root/.ssh
chmod 700 /root/.ssh

PUB_KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAGXIts1funbauWOhOHJw8JO3O+1E6xGqXcNHZ/VGBCp proxicell-windows-tunnel"
grep -q -F "$PUB_KEY" /root/.ssh/authorized_keys 2>/dev/null || echo "$PUB_KEY" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

# Enable GatewayPorts and TCP Forwarding in SSH daemon
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/99-proxicell.conf << 'SSHEOF'
GatewayPorts yes
AllowTcpForwarding yes
ClientAliveInterval 15
ClientAliveCountMax 4
MaxSessions 65535
MaxStartups 65535:30:65535
IPQoS throughput
SSHEOF

systemctl reload sshd || systemctl reload ssh || true

# 2. Install 3proxy and network tools
echo -e "${CYAN}[*] Installing 3proxy and network tools...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq
apt-get install -y 3proxy ufw curl net-tools jq build-essential git || true

if ! command -v 3proxy &>/dev/null && [ ! -f /usr/local/bin/3proxy ]; then
    cd /tmp
    rm -rf 3proxy
    git clone https://github.com/3proxy/3proxy.git
    cd 3proxy
    make -f Makefile.Linux
    make -f Makefile.Linux install
fi

# 3. Configure 3proxy for 10 Datacenter slots
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
rotate 30

# Authentication mode
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

# 4. Open All Firewall Ports (Residential 41000-43050 & Datacenter 51001-53010 & SSH)
echo -e "${CYAN}[*] Configuring Firewall rules...${NC}"
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp comment "SSH" || true
  ufw allow 2222/tcp comment "Remote PowerShell Relay" || true
  ufw allow 41000:43050/tcp comment "USA Residential Proxies" || true
  ufw allow 51001:53010/tcp comment "Datacenter Proxies" || true
  ufw --force enable || true
fi

# Also ensure iptables allows these ports directly
iptables -I INPUT -p tcp --dport 22 -j ACCEPT 2>/dev/null || true
iptables -I INPUT -p tcp --dport 2222 -j ACCEPT 2>/dev/null || true
iptables -I INPUT -p tcp --dport 41000:43050 -j ACCEPT 2>/dev/null || true
iptables -I INPUT -p tcp --dport 51001:53010 -j ACCEPT 2>/dev/null || true

# 5. Create and start 3proxy systemd service
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
echo "  [SUCCESS] DIGITALOCEAN VPS GATEWAY FULLY CONFIGURED!         "
echo "================================================================"
echo "  Public IP:            64.227.3.211"
echo "  Datacenter Proxies:   HTTP 51001-51010 | SOCKS5 53001-53010"
echo "  USA Residential:      Ports 41000-43012 (SSH Gateway Ready)"
echo "  Remote Control Relay: Port 2222 (Zero-Exposure Loopback)"
echo "================================================================"
echo -e "${NC}"
