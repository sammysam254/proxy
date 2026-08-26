const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  const script = `
sed -i '/^GatewayPorts/d' /etc/ssh/sshd_config
sed -i '/^AllowTcpForwarding/d' /etc/ssh/sshd_config
echo "GatewayPorts yes" >> /etc/ssh/sshd_config
echo "AllowTcpForwarding yes" >> /etc/ssh/sshd_config
systemctl restart ssh || systemctl restart sshd || service ssh restart || true
echo "SSHD restarted with GatewayPorts yes"
`;
  conn.exec(script, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      console.log('Done configuring sshd on VPS');
      conn.end();
    }).on('data', d => process.stdout.write(d));
  });
}).connect({ host: '104.131.118.5', port: 22, username: 'root', password: '41516512#Sam' });
