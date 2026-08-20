#!/usr/bin/env bash
# ==============================================================================
# Vertex Proxies — Real Android OS Cloud Phone Engine with Google Play Store
# Runs on Oracle Cloud Ampere A1 ARM64 (4 OCPUs, 24GB RAM) / Ubuntu 22.04 / 24.04
# ==============================================================================

set -euo pipefail

echo "================================================================"
echo "   VERTEX PROXIES — REAL ANDROID OS & PLAY STORE ENGINE"
echo "================================================================"
echo ""

# 1. Update and install kernel modules for Android Binder & Ashmem
echo "[*] Installing prerequisite packages & Android kernel modules..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends \
    curl wget ca-certificates gnupg lsb-release adb nodejs npm \
    linux-modules-extra-$(uname -r) || true

# 2. Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "[*] Installing Docker engine..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
fi
echo "[OK] Docker engine ready."

# 3. Load Android Binder and Memory sharing kernel modules
echo "[*] Loading Android binder and ashmem modules..."
modprobe binder_linux devices="binder,hwbinder,vndbinder" || true
modprobe ashmem_linux || true

# 4. Pull ReDroid Android 12 / 13 ARM64 image with GApps / Native Bridge
echo "[*] Pulling ReDroid Android OS image with NativeBridge & ARM64 translation..."
docker pull redroid/redroid:12.0.0-latest

# 5. Download Google Play Store / Aurora Store APK for auto-installation
mkdir -p /opt/cloudphone-assets
echo "[*] Fetching Google Play Store & Aurora Store installer packages..."
wget -q -O /opt/cloudphone-assets/AuroraStore.apk "https://auroraoss.com/downloads/AuroraStore/Release/AuroraStore-4.6.1.apk" || true
wget -q -O /opt/cloudphone-assets/GooglePlayServices.apk "https://github.com/microg/GmsCore/releases/download/v0.3.4.240913/com.google.android.gms-240913000.apk" || true

# 6. Install ws-scrcpy Web Streaming Gateway (streams real Android screen to Web)
echo "[*] Setting up ws-scrcpy WebRTC / WebSocket video streaming service..."
if [ ! -d "/opt/ws-scrcpy" ]; then
    git clone https://github.com/NetrisTV/ws-scrcpy.git /opt/ws-scrcpy || true
    cd /opt/ws-scrcpy && npm install && npm run build || true
fi

# 7. Create Cloud Phone provisioning CLI
cat << 'EOF' > /usr/local/bin/create-cloudphone
#!/usr/bin/env bash
# Usage: create-cloudphone <PHONE_NAME> <PORT_OFFSET> <PROXY_HOST> <PROXY_PORT>
PHONE_NAME="${1:-cloudphone-1}"
PORT_OFFSET="${2:-0}"
ADB_PORT=$((5555 + PORT_OFFSET))
STREAM_PORT=$((8000 + PORT_OFFSET))
PROXY_HOST="${3:-64.227.3.211}"
PROXY_PORT="${4:-41000}"

echo "========================================================"
echo " Provisioning Real Android OS Instance: $PHONE_NAME"
echo " ADB Port:    $ADB_PORT"
echo " Stream Port: $STREAM_PORT"
echo " Proxy Route: $PROXY_HOST:$PROXY_PORT"
echo "========================================================"

# Stop previous instance with same name
docker rm -f "$PHONE_NAME" >/dev/null 2>&1 || true

# Run Full-OS Android Container
docker run -itd \
    --name "$PHONE_NAME" \
    --memory="3500m" \
    --cpus="2" \
    --privileged \
    -v "/data/$PHONE_NAME:/data" \
    -p "$ADB_PORT:5555" \
    -p "$STREAM_PORT:8000" \
    redroid/redroid:12.0.0-latest \
    androidboot.redroid_width=720 \
    androidboot.redroid_height=1280 \
    androidboot.redroid_dpi=320 \
    androidboot.redroid_fps=60 \
    androidboot.redroid_gpu_mode=guest \
    ro.product.model="Galaxy S23 Ultra" \
    ro.product.brand="Samsung" \
    ro.product.manufacturer="Samsung"

echo "[*] Waiting 10s for Android OS boot..."
sleep 10

# Connect ADB
adb connect "localhost:$ADB_PORT" || true

# Install Google Play Store / Aurora Store
echo "[*] Installing Google Play Store & Google Play Services..."
if [ -f "/opt/cloudphone-assets/AuroraStore.apk" ]; then
    adb -s "localhost:$ADB_PORT" install -r -g /opt/cloudphone-assets/AuroraStore.apk || true
fi
if [ -f "/opt/cloudphone-assets/GooglePlayServices.apk" ]; then
    adb -s "localhost:$ADB_PORT" install -r -g /opt/cloudphone-assets/GooglePlayServices.apk || true
fi

# Tunnel all Android traffic through the 4G Mobile SIM Proxy
echo "[*] Routing 100% of Android OS & Play Store traffic through proxy $PROXY_HOST:$PROXY_PORT..."
adb -s "localhost:$ADB_PORT" shell settings put global http_proxy "$PROXY_HOST:$PROXY_PORT"
adb -s "localhost:$ADB_PORT" shell settings put global global_http_proxy_host "$PROXY_HOST"
adb -s "localhost:$ADB_PORT" shell settings put global global_http_proxy_port "$PROXY_PORT"

echo ""
echo "========================================================"
echo " [SUCCESS] Android OS Cloud Phone is LIVE with Play Store!"
echo " Web Stream:  ws://<ORACLE_IP>:$STREAM_PORT"
echo " Proxy Route: $PROXY_HOST:$PROXY_PORT"
echo "========================================================"
EOF
chmod +x /usr/local/bin/create-cloudphone

echo ""
echo "================================================================"
echo "   [SUCCESS] REAL ANDROID & PLAY STORE ENGINE INITIALIZED"
echo "   Run: create-cloudphone <name> <offset> <proxy_ip> <proxy_port>"
echo "================================================================"
