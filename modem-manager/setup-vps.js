const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const HOST = '104.131.118.5';
const USER = 'root';
const PASS = '41516512#Sam';

console.log(`Connecting to ${USER}@${HOST}...`);

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connection established successfully!');
  
  const pubKey = fs.readFileSync(path.join(__dirname, 'keys', 'proxicell_tunnel.pub'), 'utf8').trim();
  
  const remoteScript = `
export DEBIAN_FRONTEND=noninteractive
set -e

echo "[*] Setting up authorized_keys..."
mkdir -p /root/.ssh
chmod 700 /root/.ssh
grep -q -F "${pubKey}" /root/.ssh/authorized_keys 2>/dev/null || echo "${pubKey}" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

echo "[*] Configuring SSH gateway forwarding..."
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/99-proxicell.conf << 'EOF'
GatewayPorts yes
AllowTcpForwarding yes
ClientAliveInterval 15
ClientAliveCountMax 4
MaxSessions 65535
MaxStartups 65535:30:65535
IPQoS throughput
EOF

systemctl reload ssh || systemctl reload sshd || service ssh reload || true

echo "[*] Installing build tools and compiling 3proxy..."
apt-get update -y
apt-get install -y build-essential make gcc git ufw curl net-tools

cd /tmp
rm -rf 3proxy
git clone https://github.com/3proxy/3proxy.git
cd 3proxy
make -f Makefile.Linux
make -f Makefile.Linux install

echo "[*] Creating 3proxy configuration..."
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

users $/etc/3proxy/.proxyauth
auth strong none
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

echo "[*] Configuring Firewall..."
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp || true
  ufw allow 2222/tcp || true
  ufw allow 41000:43050/tcp || true
  ufw allow 51001:53010/tcp || true
  ufw --force enable || true
fi

iptables -I INPUT -p tcp --dport 22 -j ACCEPT 2>/dev/null || true
iptables -I INPUT -p tcp --dport 2222 -j ACCEPT 2>/dev/null || true
iptables -I INPUT -p tcp --dport 41000:43050 -j ACCEPT 2>/dev/null || true
iptables -I INPUT -p tcp --dport 51001:53010 -j ACCEPT 2>/dev/null || true

cat > /etc/systemd/system/3proxy.service << 'SVCEOF'
[Unit]
Description=3proxy Tiny Proxy Server
After=network.target

[Service]
Type=forking
ExecStart=/usr/local/bin/3proxy /etc/3proxy/3proxy.cfg
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

echo "=== VPS SETUP COMPLETED SUCCESSFULLY ==="
`;

  conn.exec(remoteScript, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log(`Remote script exited with code: ${code}`);
      conn.end();
      process.exit(code === 0 ? 0 : 1);
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).on('error', (err) => {
  console.error('SSH Connection error:', err.message);
  process.exit(1);
}).connect({
  host: HOST,
  port: 22,
  username: USER,
  password: PASS,
  readyTimeout: 20000,
});
