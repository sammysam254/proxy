/**
 * ProxiCell — Modem Detector
 * Detects USB modems with SIM cards on Linux (and WSL2)
 * Supports: Huawei, ZTE, Quectel, Sierra Wireless, Generic
 */

'use strict';

const { exec, execSync } = require('child_process');
const { promisify }      = require('util');
const fs                 = require('fs');
const execAsync          = promisify(exec);

/**
 * @typedef {Object} Modem
 * @property {string}  devicePath   - e.g. /dev/ttyUSB0 or /dev/cdc-wdm0
 * @property {string}  interface    - network interface e.g. ppp0, usb0, wwan0
 * @property {string}  ipAddress    - current SIM IP
 * @property {string}  operator     - carrier name
 * @property {string}  iccid        - SIM card ID
 * @property {number}  signal       - 0-100 signal strength
 * @property {string}  status       - online | offline | error
 * @property {string}  label        - human-readable label
 * @property {string}  vendor       - modem vendor
 * @property {string}  model        - modem model
 * @property {Object}  portSet      - assigned proxy ports
 * @property {string}  [id]         - Supabase DB id (set after sync)
 */

// ─── Vendor ID → brand name map ───────────────────────────────────────────────
const VENDOR_MAP = {
  '12d1': 'Huawei',
  '19d2': 'ZTE',
  '1e0e': 'Quectel',
  '2c7c': 'Quectel',
  '1199': 'Sierra Wireless',
  '0846': 'Netgear',
  '1076': 'GCT',
  '05c6': 'Qualcomm',
};

// ─── Helper: run command, return stdout or null ────────────────────────────────
async function run(cmd) {
  try {
    const { stdout } = await execAsync(cmd, { timeout: 8000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

// ─── Detect network interfaces created by USB modems ─────────────────────────
async function getModemInterfaces() {
  const interfaces = [];

  // Read /sys/class/net for modem-type interfaces
  const ifaceDir = '/sys/class/net';
  if (!fs.existsSync(ifaceDir)) return interfaces;

  const dirs = fs.readdirSync(ifaceDir);

  for (const iface of dirs) {
    // Skip loopback and ethernet
    if (/^(lo|eth|ens|enp|br|docker|veth|virbr|wl)/.test(iface)) continue;

    const ifacePath = `${ifaceDir}/${iface}`;

    // Check if it's a modem-type interface (usb, ppp, wwan, wwp, mhi)
    const isModem = /^(usb|ppp|wwan|wwp|mhi|rmnet|qmi|cdc|wdm)/.test(iface);
    if (!isModem) continue;

    // Get IP address
    const ipOut = await run(`ip addr show ${iface} 2>/dev/null`);
    const ipMatch = ipOut && ipOut.match(/inet (\d+\.\d+\.\d+\.\d+)/);
    const ipAddress = ipMatch ? ipMatch[1] : null;

    // Only include interfaces that are UP
    const stateOut = await run(`cat ${ifacePath}/operstate 2>/dev/null`);
    if (stateOut !== 'up' && stateOut !== 'unknown') continue;

    interfaces.push({ iface, ipAddress });
  }

  return interfaces;
}

// ─── Get modem info via mmcli (ModemManager) ─────────────────────────────────
async function getModemManagerInfo() {
  const modems = [];

  const listOut = await run('mmcli -L 2>/dev/null');
  if (!listOut) return modems;

  // Parse modem paths: /org/freedesktop/ModemManager1/Modem/0
  const modemPaths = listOut.match(/\/org\/freedesktop\/ModemManager1\/Modem\/\d+/g) || [];

  for (const modemPath of modemPaths) {
    const idx = modemPath.match(/\/(\d+)$/)[1];
    const info = await run(`mmcli -m ${idx} 2>/dev/null`);
    if (!info) continue;

    const get = (pattern) => {
      const m = info.match(pattern);
      return m ? m[1].trim() : null;
    };

    modems.push({
      mmIndex:   idx,
      device:    get(/device:\s+(.+)/i),
      state:     get(/state:\s+(.+)/i),
      operator:  get(/operator name:\s+(.+)/i),
      signal:    parseInt(get(/signal quality:\s+(\d+)/i) || '0'),
      iccid:     get(/iccid:\s+(.+)/i),
      vendor:    get(/manufacturer:\s+(.+)/i),
      model:     get(/model:\s+(.+)/i),
      interface: get(/primary port:\s+(.+)/i),
    });
  }

  return modems;
}

// ─── Get SIM IP from ppp or usb interface ─────────────────────────────────────
async function getInterfaceIp(iface) {
  const out = await run(`ip addr show ${iface} 2>/dev/null`);
  if (!out) return null;
  const m = out.match(/inet (\d+\.\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

// ─── Main detect function ─────────────────────────────────────────────────────
async function detectModems() {
  const detected = [];

  // Method 1: ModemManager (best, most complete info)
  const mmModems = await getModemManagerInfo();

  // Method 2: Scan network interfaces for USB-modem-type interfaces
  const netIfaces = await getModemInterfaces();

  // Merge: prefer ModemManager info
  const usedIfaces = new Set();

  for (const mm of mmModems) {
    if (mm.state === 'failed' || mm.state === 'unknown') continue;

    // Find matching network interface
    const matchedIface = netIfaces.find(n =>
      !usedIfaces.has(n.iface) &&
      (n.iface.includes('wwan') || n.iface.includes('usb') || n.iface.includes('ppp'))
    );

    const iface = mm.interface || (matchedIface && matchedIface.iface) || `wwan${mm.mmIndex}`;
    const ip    = await getInterfaceIp(iface) || (matchedIface && matchedIface.ipAddress);

    if (matchedIface) usedIfaces.add(matchedIface.iface);

    const vendor  = mm.vendor || 'Unknown';
    const simInfo = mm.iccid ? `SIM: ${mm.iccid.slice(-4)}` : '';
    const label   = `${vendor} ${mm.model || 'Modem'} #${mm.mmIndex} (${mm.operator || simInfo || 'No SIM'})`;

    detected.push({
      devicePath: mm.device || `/dev/cdc-wdm${mm.mmIndex}`,
      interface:  iface,
      ipAddress:  ip,
      operator:   mm.operator,
      iccid:      mm.iccid,
      signal:     mm.signal,
      status:     mm.state === 'connected' ? 'online' : 'offline',
      label,
      vendor:     mm.vendor,
      model:      mm.model,
      portSet:    null, // assigned by index.js
    });
  }

  // Fallback: scan /dev/ttyUSB* for any modems not caught by ModemManager
  if (detected.length === 0) {
    const ttyDevs = await run('ls /dev/ttyUSB* /dev/ttyACM* 2>/dev/null');
    if (ttyDevs) {
      const devPaths = ttyDevs.split('\n').filter(Boolean);
      
      for (let i = 0; i < devPaths.length; i++) {
        const devPath = devPaths[i];

        // Try to get vendor from udev
        const udevInfo = await run(`udevadm info --query=all --name=${devPath} 2>/dev/null`);
        const vendorId = (udevInfo && udevInfo.match(/ID_VENDOR_ID=(\w+)/)?.[1]) || 'unknown';
        const modelId  = (udevInfo && udevInfo.match(/ID_MODEL=([^\n]+)/)?.[1]) || '';
        const vendor   = VENDOR_MAP[vendorId] || 'USB Modem';

        // Find matching USB network interface
        const netIface = netIfaces.find(n => !usedIfaces.has(n.iface));
        if (netIface) usedIfaces.add(netIface.iface);

        const ip = netIface ? netIface.ipAddress : null;

        detected.push({
          devicePath: devPath,
          interface:  netIface ? netIface.iface : `usb${i}`,
          ipAddress:  ip,
          operator:   null,
          iccid:      null,
          signal:     50, // unknown
          status:     ip ? 'online' : 'offline',
          label:      `${vendor} #${i + 1}${modelId ? ` (${modelId})` : ''}`,
          vendor,
          model:      modelId,
          portSet:    null,
        });
      }
    }
  }

  return detected;
}

// ─── IP Rotation (reconnect modem) ───────────────────────────────────────────
async function rotateModemIp(modem) {
  // Method 1: Use mmcli to disconnect/reconnect
  try {
    const mmIdx = modem.devicePath.match(/\d+$/)?.[0];
    if (mmIdx !== undefined) {
      await execAsync(`mmcli -m ${mmIdx} --simple-disconnect`, { timeout: 10000 });
      await new Promise(r => setTimeout(r, 3000));
      await execAsync(`mmcli -m ${mmIdx} --simple-connect`, { timeout: 10000 });
      await new Promise(r => setTimeout(r, 5000));
    }
  } catch {}

  // Method 2: Bring interface down/up
  if (modem.interface) {
    await run(`ip link set ${modem.interface} down`);
    await new Promise(r => setTimeout(r, 2000));
    await run(`ip link set ${modem.interface} up`);
    await new Promise(r => setTimeout(r, 5000));
  }

  // Get new IP
  modem.ipAddress = await getInterfaceIp(modem.interface);
  return modem.ipAddress;
}

module.exports = { detectModems, rotateModemIp };
