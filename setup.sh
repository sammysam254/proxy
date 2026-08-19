#!/bin/bash
# ============================================================
# PROXY SYSTEM — LOCAL MACHINE SETUP SCRIPT
# Supports: Ubuntu, Debian, CentOS/RHEL, Fedora, Arch Linux
# Also detects if running under WSL2 on Windows
# Run as root: sudo bash setup.sh
# ============================================================

set -e

# ─── Colors ───────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${BLUE}[i]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }
step() { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}"; }

# ─── Banner ───────────────────────────────────────────────
echo -e "${CYAN}${BOLD}"
cat << 'EOF'
  ____  ____   _____  ____   __   ___  _  _  ____  _  _ 
 (  _ \(  _ \ / _ \\ (_  _) / _) / __)(  )( \(_  _)( \( )
  ) __/ )   /( (_) ) _)(_ ( (_  \__ \ )(__)(  )(   )  ( 
 (__)  (_)\_) \___/ (____)  \__) (___/(____/ (__) (_)\_)
 
          Modem Proxy System — Local Machine Setup
EOF
echo -e "${NC}"

# ─── Check root ───────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  err "This script must be run as root. Use: sudo bash setup.sh"
  exit 1
fi

# ─── Detect OS ────────────────────────────────────────────
step "Detecting Operating System"

IS_WSL=false
IS_LINUX=true

if grep -qi microsoft /proc/version 2>/dev/null; then
  IS_WSL=true
  warn "WSL2 environment detected. USB modem passthrough may require extra configuration."
fi

if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS_ID=$ID
  OS_NAME=$NAME
  OS_VERSION=$VERSION_ID
else
  err "Cannot detect OS. /etc/os-release not found."
  exit 1
fi

log "Detected: ${OS_NAME} ${OS_VERSION} (${OS_ID})"
[ "$IS_WSL" = true ] && info "Running inside WSL2"

# ─── Package manager detection ────────────────────────────
case "$OS_ID" in
  ubuntu|debian|linuxmint|pop|kali|raspbian)
    PKG_MGR="apt-get"
    PKG_UPDATE="apt-get update -qq"
    PKG_INSTALL="apt-get install -y -qq"
    ;;
  centos|rhel|almalinux|rocky)
    PKG_MGR="yum"
    PKG_UPDATE="yum makecache -q"
    PKG_INSTALL="yum install -y -q"
    ;;
  fedora)
    PKG_MGR="dnf"
    PKG_UPDATE="dnf makecache -q"
    PKG_INSTALL="dnf install -y -q"
    ;;
  arch|manjaro)
    PKG_MGR="pacman"
    PKG_UPDATE="pacman -Sy --noconfirm"
    PKG_INSTALL="pacman -S --noconfirm"
    ;;
  *)
    warn "Unknown distro: $OS_ID. Attempting apt-get..."
    PKG_MGR="apt-get"
    PKG_UPDATE="apt-get update -qq"
    PKG_INSTALL="apt-get install -y -qq"
    ;;
esac

log "Package manager: $PKG_MGR"

# ─── Config variables (edit these or pass as env vars) ────
APP_DIR="${APP_DIR:-/opt/proxicell}"
VPS_HOST="${VPS_HOST:-}"
VPS_USER="${VPS_USER:-ubuntu}"
VPS_SSH_PORT="${VPS_SSH_PORT:-22}"
SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_KEY:-}"

# ─── Interactive config if not set ────────────────────────
step "Configuration"

if [ -z "$VPS_HOST" ]; then
  read -rp "  Oracle VPS Public IP: " VPS_HOST
fi

if [ -z "$SUPABASE_URL" ]; then
  read -rp "  Supabase Project URL (https://xxx.supabase.co): " SUPABASE_URL
fi

if [ -z "$SUPABASE_SERVICE_KEY" ]; then
  read -rsp "  Supabase Service Role Key: " SUPABASE_SERVICE_KEY
  echo
fi

log "Config loaded."

# ─── Update system ────────────────────────────────────────
step "Updating System Packages"
$PKG_UPDATE
log "Package index updated."

# ─── Install core dependencies ────────────────────────────
step "Installing Core Dependencies"

COMMON_PKGS="curl wget git unzip build-essential net-tools iproute2"

case "$PKG_MGR" in
  apt-get)
    $PKG_INSTALL $COMMON_PKGS software-properties-common gnupg lsb-release
    ;;
  yum|dnf)
    $PKG_INSTALL $COMMON_PKGS
    ;;
  pacman)
    $PKG_INSTALL base-devel net-tools iproute2 curl wget git unzip
    ;;
esac

log "Core dependencies installed."

# ─── Install Node.js (LTS) ────────────────────────────────
step "Installing Node.js LTS"

if ! command -v node &>/dev/null; then
  case "$PKG_MGR" in
    apt-get)
      curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
      $PKG_INSTALL nodejs
      ;;
    yum|dnf)
      curl -fsSL https://rpm.nodesource.com/setup_lts.x | bash -
      $PKG_INSTALL nodejs
      ;;
    pacman)
      $PKG_INSTALL nodejs npm
      ;;
  esac
else
  info "Node.js already installed: $(node --version)"
fi

log "Node.js: $(node --version) | npm: $(npm --version)"

# ─── Install PM2 ──────────────────────────────────────────
step "Installing PM2"
npm install -g pm2 --silent
log "PM2 installed."

# ─── Install 3proxy ───────────────────────────────────────
step "Installing 3proxy (Proxy Engine)"

if ! command -v 3proxy &>/dev/null; then
  case "$PKG_MGR" in
    apt-get)
      $PKG_INSTALL 3proxy 2>/dev/null || true
      if ! command -v 3proxy &>/dev/null; then
        info "Building 3proxy from source..."
        cd /tmp
        git clone --depth=1 https://github.com/3proxy/3proxy.git
        cd 3proxy
        make -f Makefile.Linux
        cp src/3proxy /usr/local/bin/
        chmod +x /usr/local/bin/3proxy
        cd /
        rm -rf /tmp/3proxy
      fi
      ;;
    yum|dnf)
      info "Building 3proxy from source..."
      cd /tmp
      git clone --depth=1 https://github.com/3proxy/3proxy.git
      cd 3proxy
      make -f Makefile.Linux
      cp src/3proxy /usr/local/bin/
      chmod +x /usr/local/bin/3proxy
      cd /
      rm -rf /tmp/3proxy
      ;;
    pacman)
      $PKG_INSTALL 3proxy 2>/dev/null || {
        cd /tmp
        git clone --depth=1 https://github.com/3proxy/3proxy.git
        cd 3proxy
        make -f Makefile.Linux
        cp src/3proxy /usr/local/bin/
        cd /
        rm -rf /tmp/3proxy
      }
      ;;
  esac
fi

log "3proxy installed: $(3proxy --help 2>&1 | head -1 || echo 'ok')"

# ─── Install modem tools ──────────────────────────────────
step "Installing USB Modem Tools"

case "$PKG_MGR" in
  apt-get)
    $PKG_INSTALL \
      usb-modeswitch usb-modeswitch-data \
      modemmanager ppp \
      usbutils \
      iptables iptables-persistent \
      android-tools-adb \
      jq
    ;;
  yum|dnf)
    $PKG_INSTALL \
      usb_modeswitch ModemManager ppp \
      usbutils iptables jq android-tools
    ;;
  pacman)
    $PKG_INSTALL \
      usb_modeswitch modemmanager ppp \
      usbutils iptables jq android-tools
    ;;
esac

# Enable ModemManager
systemctl enable ModemManager 2>/dev/null || true
systemctl start ModemManager 2>/dev/null || true

log "Modem tools installed."

# ─── Install autossh ──────────────────────────────────────
step "Installing autossh (Persistent SSH Tunnel)"

case "$PKG_MGR" in
  apt-get)  $PKG_INSTALL autossh ;;
  yum|dnf)  $PKG_INSTALL autossh ;;
  pacman)   $PKG_INSTALL autossh ;;
esac

log "autossh installed."

# ─── SSH Key Setup ────────────────────────────────────────
step "Setting Up SSH Key for VPS Tunnel"

SSH_KEY_PATH="/root/.ssh/proxicell_tunnel"

if [ ! -f "$SSH_KEY_PATH" ]; then
  ssh-keygen -t ed25519 -f "$SSH_KEY_PATH" -N "" -C "proxicell-tunnel@$(hostname)"
  log "SSH key generated: $SSH_KEY_PATH"
  echo ""
  warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  warn "IMPORTANT: Copy this public key to your Oracle VPS:"
  warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  cat "${SSH_KEY_PATH}.pub"
  echo ""
  warn "Run on VPS: echo '$(cat ${SSH_KEY_PATH}.pub)' >> ~/.ssh/authorized_keys"
  warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  read -rp "  Press ENTER after you've added the key to the VPS..."
else
  info "SSH key already exists."
fi

# Test connection
info "Testing SSH connection to VPS..."
if ssh -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
   "$VPS_USER@$VPS_HOST" "echo 'Connection OK'" 2>/dev/null; then
  log "VPS SSH connection successful!"
else
  warn "Could not connect to VPS. Tunnel will retry automatically when VPS is reachable."
fi

# ─── Create app directory ─────────────────────────────────
step "Setting Up Application"

mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/proxy-configs"
mkdir -p "$APP_DIR/logs"
mkdir -p "$APP_DIR/modem-manager"

# ─── Write .env file ──────────────────────────────────────
cat > "$APP_DIR/.env" << EOF
VPS_HOST=$VPS_HOST
VPS_USER=$VPS_USER
VPS_SSH_PORT=$VPS_SSH_PORT
VPS_SSH_KEY=$SSH_KEY_PATH
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY
APP_DIR=$APP_DIR
NODE_ENV=production
LOG_LEVEL=info
EOF

chmod 600 "$APP_DIR/.env"
log ".env file created."

# ─── Copy modem manager files ─────────────────────────────
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [ -d "$SCRIPT_DIR/modem-manager" ]; then
  cp -r "$SCRIPT_DIR/modem-manager/"* "$APP_DIR/modem-manager/"
  log "Modem manager files copied."
else
  warn "modem-manager directory not found next to setup.sh — skipping copy."
fi

# ─── Install Node.js dependencies ─────────────────────────
step "Installing Node.js Dependencies"

cd "$APP_DIR/modem-manager"
npm install --silent 2>/dev/null || warn "npm install failed — check package.json"
log "Dependencies installed."

# ─── iptables rules (for bandwidth counting) ──────────────
step "Configuring iptables for Bandwidth Monitoring"

# Create chain for proxy traffic
iptables -N PROXY_TRAFFIC 2>/dev/null || true
iptables -C FORWARD -j PROXY_TRAFFIC 2>/dev/null || iptables -I FORWARD -j PROXY_TRAFFIC
iptables -C OUTPUT -j PROXY_TRAFFIC 2>/dev/null || iptables -I OUTPUT -j PROXY_TRAFFIC

# Save rules
if command -v iptables-save &>/dev/null; then
  iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
fi

log "iptables configured."

# ─── Create systemd services ──────────────────────────────
step "Creating Systemd Services"

# Modem Manager service
cat > /etc/systemd/system/proxicell-manager.service << EOF
[Unit]
Description=ProxiCell Modem Manager
After=network.target ModemManager.service
Wants=ModemManager.service

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR/modem-manager
EnvironmentFile=$APP_DIR/.env
ExecStart=$(which node) index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=proxicell-manager

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable proxicell-manager
systemctl start proxicell-manager
log "Modem manager service started."

# ─── udev rules for modems ────────────────────────────────
step "Configuring udev Rules for USB Modems"

cat > /etc/udev/rules.d/99-proxicell-modems.rules << 'EOF'
# ProxiCell — auto-detect USB modems and trigger modem manager
ACTION=="add", SUBSYSTEM=="tty", ATTRS{idVendor}=="12d1", TAG+="proxicell_modem"
ACTION=="add", SUBSYSTEM=="tty", ATTRS{idVendor}=="19d2", TAG+="proxicell_modem"
ACTION=="add", SUBSYSTEM=="tty", ATTRS{idVendor}=="1e0e", TAG+="proxicell_modem"
ACTION=="add", SUBSYSTEM=="tty", ATTRS{idVendor}=="2c7c", TAG+="proxicell_modem"
ACTION=="add", SUBSYSTEM=="net", ENV{ID_NET_DRIVER}=="cdc_*|rndis*|qmi*|ncm*", \
  RUN+="/bin/systemctl restart proxicell-manager.service"
ACTION=="remove", SUBSYSTEM=="net", ENV{ID_NET_DRIVER}=="cdc_*|rndis*|qmi*|ncm*", \
  RUN+="/bin/systemctl restart proxicell-manager.service"
EOF

udevadm control --reload-rules 2>/dev/null || true
log "udev rules configured."

# ─── WSL2 specific notes ──────────────────────────────────
if [ "$IS_WSL" = true ]; then
  echo ""
  warn "━━━ WSL2 NOTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  warn "USB devices in WSL2 require usbipd-win on Windows host."
  warn "Run in PowerShell (as Admin) on Windows:"
  warn "  winget install usbipd"
  warn "  usbipd list"
  warn "  usbipd bind --busid <BUSID>"
  warn "  usbipd attach --wsl --busid <BUSID>"
  warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi

# ─── Done ─────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   ✓ ProxiCell Setup Complete!            ║"
echo "  ║                                          ║"
echo "  ║  Modem Manager: running                  ║"
echo "  ║  App Directory: $APP_DIR       ║"
echo "  ║                                          ║"
echo "  ║  Next Steps:                             ║"
echo "  ║  1. Plug in USB modems with SIM cards    ║"
echo "  ║  2. Run vps-setup.sh on your Oracle VPS  ║"
echo "  ║  3. Deploy frontend to Netlify           ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"

echo ""
info "View logs: journalctl -u proxicell-manager -f"
info "Check modems: systemctl status proxicell-manager"
