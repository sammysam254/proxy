const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  const cfg = `
daemon
pidfile /var/run/3proxy.pid
maxconn 25000
stacksize 262144
nserver 1.1.1.1
nserver 8.8.8.8
nscache 65536
nscache6 65536
timeouts 1 5 30 60 180 1800 15 60
log /var/log/3proxy.log D
logformat "- +_L%t.%. %N.%p %E %U %C:%c %R:%r %O %I %h %T"
rotate 30

auth none

proxy -p51001 -n
socks -p53001 -n

proxy -p51002 -n
socks -p53002 -n

proxy -p51003 -n
socks -p53003 -n

proxy -p51004 -n
socks -p53004 -n

proxy -p51005 -n
socks -p53005 -n

proxy -p51006 -n
socks -p53006 -n

proxy -p51007 -n
socks -p53007 -n

proxy -p51008 -n
socks -p53008 -n

proxy -p51009 -n
socks -p53009 -n

proxy -p51010 -n
socks -p53010 -n
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
    stream.on('close', () => {
      console.log('Zero-copy streaming configuration applied.');
      conn.end();
    });
  });
}).connect({ host: '104.131.118.5', port: 22, username: 'root', password: '41516512#Sam' });
