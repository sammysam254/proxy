#!/bin/bash
# ============================================================
# PROXY SYSTEM — ORACLE VPS SETUP SCRIPT
# Run as root: sudo bash vps-setup.sh
# Tested on Oracle Cloud Ubuntu 22.04 LTS
# ============================================================

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${BLUE}[i]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
step() { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}"; }

echo -e "${CYAN}${BOLD}"
echo "  ProxiCell — Oracle VPS Setup"
echo -e "${NC}"

[[ $EUID -ne 0 ]] && echo "Run as root." && exit 1

# Max number of modems you plan to support
MAX_MODEMS="${MAX_MODEMS:-20}"

# Detect Package Manager
if command -v dnf &>/dev/null; then
  PKG_MGR="dnf"
  PKG_INSTALL="dnf install -y -q"
elif command -v yum &>/dev/null; then
  PKG_MGR="yum"
  PKG_INSTALL="yum install -y -q"
elif command -v apt-get &>/dev/null; then
  PKG_MGR="apt-get"
  PKG_INSTALL="apt-get install -y -qq"
else
  PKG_MGR="unknown"
fi

step "Installing Packages ($PKG_MGR)"

if [ "$PKG_MGR" = "dnf" ] || [ "$PKG_MGR" = "yum" ]; then
  # Oracle Linux / RHEL / CentOS
  $PKG_INSTALL epel-release 2>/dev/null || true
  $PKG_INSTALL nginx iptables iptables-services net-tools curl jq unzip firewalld autossh 2>/dev/null || true
else
  # Ubuntu / Debian
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y --no-install-recommends nginx ufw curl net-tools jq unzip autossh || apt-get install -y nginx ufw curl
fi

log "Packages installed."

step "Configuring SSH Server (for reverse tunnels)"

# Allow gateway ports (needed for reverse tunnel to bind on 0.0.0.0)
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/99-proxicell.conf << 'SSHEOF'
GatewayPorts yes
TCPKeepAlive yes
ClientAliveInterval 60
ClientAliveCountMax 10
SSHEOF

SSH_CFG=/etc/ssh/sshd_config
if [ -f "$SSH_CFG" ]; then
  grep -q "^GatewayPorts" "$SSH_CFG" && \
    sed -i 's/^GatewayPorts.*/GatewayPorts yes/' "$SSH_CFG" || \
    echo "GatewayPorts yes" >> "$SSH_CFG"

  grep -q "^TCPKeepAlive" "$SSH_CFG" && \
    sed -i 's/^TCPKeepAlive.*/TCPKeepAlive yes/' "$SSH_CFG" || \
    echo "TCPKeepAlive yes" >> "$SSH_CFG"
fi

systemctl restart ssh 2>/dev/null || systemctl restart sshd 2>/dev/null || true
log "SSH configured for reverse tunnels."

step "Configuring Firewall"

if command -v firewalld &>/dev/null || systemctl is-active firewalld &>/dev/null; then
  systemctl enable --now firewalld 2>/dev/null || true
  firewall-cmd --permanent --add-port=22/tcp 2>/dev/null || true
  firewall-cmd --permanent --add-port=80/tcp 2>/dev/null || true
  firewall-cmd --permanent --add-port=443/tcp 2>/dev/null || true
  for i in $(seq 0 $((MAX_MODEMS - 1))); do
    firewall-cmd --permanent --add-port=$((41000 + i))/tcp 2>/dev/null || true
    firewall-cmd --permanent --add-port=$((42000 + i))/tcp 2>/dev/null || true
    firewall-cmd --permanent --add-port=$((43000 + i))/tcp 2>/dev/null || true
  done
  firewall-cmd --reload 2>/dev/null || true
  log "firewalld configured."
elif command -v ufw &>/dev/null; then
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp    comment "SSH"
  ufw allow 80/tcp    comment "HTTP"
  ufw allow 443/tcp   comment "HTTPS"
  for i in $(seq 0 $((MAX_MODEMS - 1))); do
    ufw allow $((41000 + i))/tcp comment "HTTP proxy modem $i"
    ufw allow $((42000 + i))/tcp comment "SOCKS4 proxy modem $i"
    ufw allow $((43000 + i))/tcp comment "SOCKS5 proxy modem $i"
  done
  ufw --force enable
  log "ufw configured."
else
  # Direct iptables
  iptables -I INPUT -p tcp --dport 22 -j ACCEPT
  for i in $(seq 0 $((MAX_MODEMS - 1))); do
    iptables -I INPUT -p tcp --dport $((41000 + i)) -j ACCEPT
    iptables -I INPUT -p tcp --dport $((42000 + i)) -j ACCEPT
    iptables -I INPUT -p tcp --dport $((43000 + i)) -j ACCEPT
  done
fi

log "Firewall configured. Opened ports for $MAX_MODEMS modems."

step "Configuring Nginx"

NGINX_USER="www-data"
id -u nginx &>/dev/null && NGINX_USER="nginx"

# Main config
cat > /etc/nginx/nginx.conf << NGINXEOF
user $NGINX_USER;
worker_processes auto;
pid /run/nginx.pid;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent"';

    access_log /var/log/nginx/access.log main;
    error_log  /var/log/nginx/error.log warn;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}

# TCP/UDP stream proxy for proxy ports
stream {
    include /etc/nginx/stream.d/*.conf;
}
NGINXEOF

mkdir -p /etc/nginx/stream.d
mkdir -p /etc/nginx/conf.d

# Generate stream config for each modem's proxy ports
cat > /etc/nginx/stream.d/proxies.conf << STREAMEOF
# Auto-generated by proxicell vps-setup.sh
# HTTP Proxy ports (tunnel from local machine)
STREAMEOF

# We'll manage stream config dynamically via the modem manager
# For now, set up the placeholder

# Health check / admin endpoint
cat > /etc/nginx/conf.d/proxicell.conf << 'CONFEOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    # Health check endpoint (called by modem manager)
    location /health {
        return 200 '{"status":"ok","service":"proxicell-vps"}';
        add_header Content-Type application/json;
    }

    # VPS info endpoint
    location /info {
        return 200 '{"version":"1.0.0","ready":true}';
        add_header Content-Type application/json;
    }
}
CONFEOF

nginx -t && systemctl enable nginx && systemctl reload nginx
log "Nginx configured."

step "Creating ProxiCell VPS Service Account"

# Create a non-root user for tunnel connections (more secure)
if ! id proxicell &>/dev/null; then
  useradd -r -m -s /bin/bash proxicell
  mkdir -p /home/proxicell/.ssh
  touch /home/proxicell/.ssh/authorized_keys
  chmod 700 /home/proxicell/.ssh
  chmod 600 /home/proxicell/.ssh/authorized_keys
  chown -R proxicell:proxicell /home/proxicell/.ssh
  log "User 'proxicell' created."
fi

warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
warn "Add your local machine's SSH public key to:"
warn "  /home/proxicell/.ssh/authorized_keys"
warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
read -rp "  Paste the public key now (or press ENTER to skip): " PUBKEY
if [ -n "$PUBKEY" ]; then
  echo "$PUBKEY" >> /home/proxicell/.ssh/authorized_keys
  log "Public key added."
fi

step "Setting Up Port Forwarding Script"

# Script that the modem manager can call to update iptables/nginx for new ports
cat > /usr/local/bin/proxicell-open-port << 'PORTSCRIPT'
#!/bin/bash
# Usage: proxicell-open-port <local_port> <public_port>
LOCAL_PORT=$1
PUBLIC_PORT=$2
if [ -z "$LOCAL_PORT" ] || [ -z "$PUBLIC_PORT" ]; then
  echo "Usage: proxicell-open-port <local_port> <public_port>"
  exit 1
fi
ufw allow $PUBLIC_PORT/tcp comment "ProxiCell dynamic" 2>/dev/null || true
echo "Port $PUBLIC_PORT opened."
PORTSCRIPT

chmod +x /usr/local/bin/proxicell-open-port

log "Port management script created."

step "Oracle Cloud Security List Reminder"

echo ""
warn "━━━ ORACLE CLOUD CONSOLE — IMPORTANT ━━━━━━━━━━━━━━━━━━"
warn "You MUST open proxy ports in Oracle Cloud's Security List:"
warn ""
warn "1. Login to cloud.oracle.com"
warn "2. Go to: Networking → Virtual Cloud Networks"
warn "3. Click your VCN → Security Lists → Default Security List"
warn "4. Add Ingress Rules:"
warn "   Source: 0.0.0.0/0"
warn "   Protocol: TCP"
warn "   Ports: 41000-41019, 42000-42019, 43000-43019"
warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Get public IP
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}${BOLD}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   ✓ VPS Setup Complete!                  ║"
echo "  ║                                          ║"
echo "  ║  VPS Public IP: $PUBLIC_IP"
echo "  ║  Tunnel User:   proxicell                ║"
echo "  ║  SSH Port:      22                       ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"
