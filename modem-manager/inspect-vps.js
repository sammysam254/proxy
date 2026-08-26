const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  const cmd = `
echo "=== SSHD CONFIG ==="
grep -E '^(GatewayPorts|AllowTcpForwarding)' /etc/ssh/sshd_config || true
grep -E '^(GatewayPorts|AllowTcpForwarding)' /etc/ssh/sshd_config.d/* 2>/dev/null || true

echo "=== LISTENING PORTS ==="
netstat -tlpn
`;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.end();
      process.exit(0);
    }).on('data', d => process.stdout.write(d)).stderr.on('data', d => process.stderr.write(d));
  });
}).on('error', e => console.error(e.message)).connect({
  host: '104.131.118.5',
  port: 22,
  username: 'root',
  password: '41516512#Sam',
});
