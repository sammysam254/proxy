const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  const testScript = `
curl -s -L -o /dev/null -w "Direct VPS Download Speed: %{speed_download} B/s (%{time_total}s)\n" https://ash-speed.hetzner.com/100MB.bin
curl -s -L -o /dev/null -w "3proxy Port 51001 Speed: %{speed_download} B/s (%{time_total}s)\n" -x http://127.0.0.1:51001 https://ash-speed.hetzner.com/100MB.bin
`;
  conn.exec(testScript, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.end();
      process.exit(0);
    }).on('data', d => process.stdout.write(d)).stderr.on('data', d => process.stderr.write(d));
  });
}).connect({ host: '104.131.118.5', port: 22, username: 'root', password: '41516512#Sam' });
