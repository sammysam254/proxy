#!/usr/bin/env bash
# ==============================================================================
# Vertex Proxies — Oracle Cloud VPS Cloud Phone Engine (ReDroid Virtualization)
# Optimized for Oracle Cloud Ampere A1 ARM64 (4 OCPUs, 24GB RAM) & Ubuntu LTS
# ==============================================================================

set -euo pipefail

echo "================================================================"
echo "   VERTEX PROXIES — ORACLE CLOUD PHONE ENGINE SETUP"
echo "================================================================"
echo ""

# 1. Update and install kernel modules for Android Binder & Ashmem
echo "[*] Installing prerequisite packages & Android kernel modules..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends \
    curl wget ca-certificates gnupg lsb-release \
    linux-modules-extra-$(uname -r) || true

# 2. Install Docker
if ! command -v docker &> /dev/null; then
    echo "[*] Installing Docker engine..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
fi
echo "[OK] Docker engine ready."

# 3. Load Android Binder modules
echo "[*] Loading Android binder and ashmem modules..."
modprobe binder_linux devices="binder,hwbinder,vndbinder" || true
modprobe ashmem_linux || true

# 4. Pull ReDroid Android 13 ARM64 image
echo "[*] Pulling ReDroid Android 13 image..."
docker pull redroid/redroid:13.0.0-latest

# 5. Create Cloud Phone deployment helper script
cat << 'EOF' > /usr/local/bin/create-cloudphone
#!/usr/bin/env bash
# Usage: create-cloudphone <PHONE_NAME> <PORT_OFFSET> <PROXY_HOST> <PROXY_PORT>
PHONE_NAME="${1:-cloudphone-1}"
PORT_OFFSET="${2:-0}"
ADB_PORT=$((5555 + PORT_OFFSET))
WEB_PORT=$((8000 + PORT_OFFSET))
PROXY_HOST="${3:-64.227.3.211}"
PROXY_PORT="${4:-41000}"

echo "Provisioning Cloud Phone: $PHONE_NAME (ADB: $ADB_PORT, Web: $WEB_PORT)..."

docker run -itd \
    --name "$PHONE_NAME" \
    --memory="3g" \
    --cpus="2" \
    --privileged \
    -v "/data/$PHONE_NAME:/data" \
    -p "$ADB_PORT:5555" \
    redroid/redroid:13.0.0-latest \
    androidboot.redroid_width=720 \
    androidboot.redroid_height=1280 \
    androidboot.redroid_dpi=320 \
    androidboot.redroid_fps=30 \
    androidboot.redroid_gpu_mode=guest

echo "[OK] Cloud Phone $PHONE_NAME is running!"
echo "To tunnel through proxy: adb -s localhost:$ADB_PORT shell settings put global http_proxy $PROXY_HOST:$PROXY_PORT"
EOF
chmod +x /usr/local/bin/create-cloudphone

echo ""
echo "================================================================"
echo "   [SUCCESS] ORACLE CLOUD PHONE ENGINE READY!"
echo "   Provision instances with: create-cloudphone <name> <offset> <proxy_ip> <port>"
echo "================================================================"
