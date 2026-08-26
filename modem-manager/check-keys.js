const { Client } = require('ssh2');
const conn = new Client();

const keyToCheck = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAGXIts1funbauWOhOHJw8JO3O+1E6xGqXcNHZ/VGBCp proxicell-windows-tunnel';

conn.on('ready', () => {
  const cmd = `
cat /root/.ssh/authorized_keys
`;
  conn.exec(cmd, (err, stream) => {
    stream.on('close', () => { conn.end(); process.exit(0); }).on('data', d => process.stdout.write(d));
  });
}).connect({ host: '104.131.118.5', port: 22, username: 'root', password: '41516512#Sam' });
