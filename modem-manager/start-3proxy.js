const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  const cfg = `
daemon
pidfile /var/run/3proxy.pid
nserver 8.8.8.8
nserver 1.1.1.1
nserver 127.0.0.53
nscache 65536
timeouts 1 5 30 60 180 1800 15 60
log /var/log/3proxy.log D
logformat "- +_L%t.%. %N.%p %E %U %C:%c %R:%r %O %I %h %T"
rotate 30

auth none

proxy -p51001
socks -p53001

proxy -p51002
socks -p53002

proxy -p51003
socks -p53003

proxy -p51004
socks -p53004

proxy -p51005
socks -p53005

proxy -p51006
socks -p53006

proxy -p51007
socks -p53007

proxy -p51008
socks -p53008

proxy -p51009
socks -p53009

proxy -p51010
socks -p53010
`;

  const script = `
cat > /etc/3proxy/3proxy.cfg << 'EOF'
${cfg}
EOF

pkill -9 3proxy || true
/bin/3proxy /etc/3proxy/3proxy.cfg
sleep 1
`;

  conn.exec(script, (err, stream) => {
    if (err) throw err;
    stream.on('close', (c) => {
      console.log('3proxy restarted.');
      conn.end();
    });
  });
}).connect({
  host: '104.131.118.5',
  port: 22,
  username: 'root',
  password: '41516512#Sam',
});
