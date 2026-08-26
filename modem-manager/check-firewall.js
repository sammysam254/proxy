const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  const cmd = `
echo "=== UFW STATUS ==="
ufw status verbose || true

echo "=== IPTABLES ==="
iptables -L INPUT -n -v | head -n 30 || true

echo "=== ACTIVE LISTENING PORTS ==="
netstat -tlpn | grep -E '(4100|4200|4300|2222|sshd|ssh)' || echo "NO 41000/43000 PORTS LISTENING ON VPS"

echo "=== ACTIVE SSH SESSIONS ==="
w || true
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
