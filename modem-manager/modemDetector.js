/**
 * ProxiCell — Modem Detector
 * Detects USB modems with SIM cards on Windows AND Linux
 * Supports: Huawei, ZTE, Quectel, Sierra Wireless, Generic
 */

'use strict';

const { exec, execSync } = require('child_process');
const { promisify }      = require('util');
const fs                 = require('fs');
const execAsync          = promisify(exec);

const IS_WIN = process.platform === 'win32';

/**
 * @typedef {Object} Modem
 * @property {string}  devicePath   - e.g. /dev/ttyUSB0 or COM3 or windows:Ethernet_USB
 * @property {string}  interface    - network interface name
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

// Keywords that indicate a USB modem / phone tethering interface on Windows
const WIN_MODEM_KEYWORDS = [
  'usb', 'mobile', 'modem', 'cellular', 'lte', '4g', '5g',
  'huawei', 'zte', 'quectel', 'sierra', 'rndis', 'ndis',
  'android', 'phone', 'tether', 'remote ndis', 'cdc', 'ecm',
];

// Interfaces to always skip on Windows
const WIN_SKIP_KEYWORDS = [
  'loopback', 'bluetooth', 'wi-fi', 'wireless', 'local area connection',
  'vethernet', 'vmware', 'virtualbox', 'hyper-v', 'vpn', 'tap-',
  'isatap', 'teredo', '6to4',
];

// ─── Helper: run command, return stdout or null ────────────────────────────────
async function run(cmd, opts = {}) {
  try {
    const { stdout } = await execAsync(cmd, { timeout: 8000, ...opts });
    return stdout.trim();
  } catch {
    return null;
  }
}

// =============================================================================
// ─── WINDOWS DETECTION ───────────────────────────────────────────────────────
// =============================================================================

// Descriptions that are definitely NOT USB modems
const WIN_STANDARD_ADAPTERS = [
  'realtek pcie', 'realtek family', 'intel ethernet', 'intel(r) ethernet',
  'broadcom', 'marvel', 'atheros', 'killer ethernet',
  'virtualbox', 'vmware', 'hyper-v', 'vethernet',
  'tailscale', 'nordvpn', 'expressvpn', 'wireguard',
  'tap-windows', 'tap adapter', 'openvpn',
];

/**
 * Parse `ipconfig /all` output into a list of adapter objects.
 * Each object has: adapterType, name, description, ipv4, connected
 * adapterType: 'Ethernet' | 'Wireless' | 'Unknown' | etc.
 */
async function parseIpconfigAll() {
  const raw = await run('ipconfig /all', { shell: 'cmd.exe' });
  if (!raw) return [];

  const adapters = [];
  // Split on lines that look like adapter headers (not indented, end with ":")
  const lines = raw.split(/\r?\n/);

  let currentAdapter = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Adapter header line looks like "Ethernet adapter Foo:" or "Unknown adapter Bar:"
    const headerMatch = line.match(/^(\S[^:]+) adapter ([^:]+):/);
    if (headerMatch) {
      if (currentAdapter) adapters.push(currentAdapter);
      currentAdapter = {
        adapterType: headerMatch[1].trim(),  // e.g. 'Ethernet', 'Unknown', 'Wireless LAN'
        name:        headerMatch[2].trim(),  // e.g. 'Ethernet', 'Tailscale', 'Wi-Fi'
        description: '',
        ipv4:        null,
        connected:   true,
      };
      continue;
    }

    if (!currentAdapter) continue;

    const trimmed = line.trim();
    if (/^Description/i.test(trimmed)) {
      currentAdapter.description = (trimmed.match(/:\s*(.+)/) || [])[1]?.trim() || '';
    } else if (/^IPv4 Address/i.test(trimmed)) {
      const m = trimmed.match(/(\d+\.\d+\.\d+\.\d+)/);
      if (m) currentAdapter.ipv4 = m[1];
    } else if (/^Media State/i.test(trimmed)) {
      if (trimmed.toLowerCase().includes('disconnected')) {
        currentAdapter.connected = false;
      }
    }
  }
  if (currentAdapter) adapters.push(currentAdapter);

  return adapters;
}

/**
 * Detect modem-like adapters on Windows using ipconfig.
 * Returns array of modem objects compatible with the rest of the system.
 */
async function detectModemsWindows() {
  const adapters = await parseIpconfigAll();
  const detected = [];

  for (const adapter of adapters) {
    if (!adapter.connected) continue;
    if (!adapter.ipv4)      continue;
    // Skip link-local / loopback IPs
    if (adapter.ipv4.startsWith('169.254.') || adapter.ipv4.startsWith('127.')) continue;

    const desc     = (adapter.description || '').toLowerCase();
    const name     = (adapter.name || '').toLowerCase();
    const combined = `${desc} ${name}`;
    const atype    = (adapter.adapterType || '').toLowerCase();

    // Skip well-known non-modem categories
    if (WIN_SKIP_KEYWORDS.some(k => combined.includes(k))) continue;
    if (WIN_STANDARD_ADAPTERS.some(k => desc.includes(k))) continue;
    if (adapter.ipv4.startsWith('192.168.56.') || adapter.ipv4.startsWith('192.168.57.') || adapter.ipv4.startsWith('192.168.99.')) continue;

    // Also skip if the adapter type is 'Wireless LAN' (Wi-Fi) — those aren't SIM cards
    if (/wireless/i.test(atype)) continue;

    // Must match at least one modem keyword
    const isModem = WIN_MODEM_KEYWORDS.some(k => combined.includes(k));
    if (!isModem) continue;

    // Try to identify vendor/model from description
    let vendor = 'USB Modem';
    for (const [, brand] of Object.entries(VENDOR_MAP)) {
      if (desc.includes(brand.toLowerCase())) { vendor = brand; break; }
    }
    if (desc.includes('huawei'))                    vendor = 'Huawei';
    if (desc.includes('zte'))                       vendor = 'ZTE';
    if (desc.includes('quectel'))                   vendor = 'Quectel';
    if (desc.includes('android') || desc.includes('rndis') || desc.includes('samsung')) vendor = 'Android Phone';

    const label = `${vendor} (${adapter.description || adapter.name})`;

    // Use a stable device path so the registry key doesn't change on reconnect
    const devicePath = `windows:${adapter.name.replace(/\s+/g, '_')}`;

    detected.push({
      devicePath,
      interface:  adapter.name,
      ipAddress:  adapter.ipv4,
      operator:   null,       // not available via ipconfig
      iccid:      null,
      signal:     70,         // unknown — assume good
      status:     'online',
      label,
      vendor,
      model:      adapter.description || adapter.name,
      portSet:    null,       // assigned by index.js
    });
  }

  // If no modem-keyword match was found, try ANY non-standard adapter that has an IP
  // (fallback — covers exotic USB adapters with unusual descriptions)
  if (detected.length === 0) {
    for (const adapter of adapters) {
      if (!adapter.connected || !adapter.ipv4) continue;
      if (adapter.ipv4.startsWith('169.254.') || adapter.ipv4.startsWith('127.')) continue;
      if (adapter.ipv4.startsWith('192.168.56.') || adapter.ipv4.startsWith('192.168.57.') || adapter.ipv4.startsWith('192.168.99.')) continue;
      if (adapter.ipv4.startsWith('172.28.') || adapter.ipv4.startsWith('172.29.') || adapter.ipv4.startsWith('172.30.') || adapter.ipv4.startsWith('172.31.')) continue;

      const desc     = (adapter.description || '').toLowerCase();
      const combined = `${desc} ${(adapter.name || '').toLowerCase()}`;
      const atype    = (adapter.adapterType || '').toLowerCase();

      if (WIN_SKIP_KEYWORDS.some(k => combined.includes(k))) continue;
      if (WIN_STANDARD_ADAPTERS.some(k => desc.includes(k))) continue;
      if (/wireless/i.test(atype)) continue;
      if (/virtualbox/i.test(combined)) continue;

      // At this point skip any adapter that still looks like a normal LAN/Ethernet
      if (/ethernet.*adapter/i.test(adapter.name) && !/usb|mobile|modem/i.test(combined)) continue;

      const devicePath = `windows:${adapter.name.replace(/\s+/g, '_')}`;
      detected.push({
        devicePath,
        interface:  adapter.name,
        ipAddress:  adapter.ipv4,
        operator:   null,
        iccid:      null,
        signal:     50,
        status:     'online',
        label:      `USB Adapter (${adapter.description || adapter.name})`,
        vendor:     'Unknown',
        model:      adapter.description || adapter.name,
        portSet:    null,
      });
    }
  }

  return detected;
}

// =============================================================================
// ─── LINUX DETECTION (unchanged) ─────────────────────────────────────────────
// =============================================================================

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

// ─── Main Linux detect function ───────────────────────────────────────────────
async function detectModemsLinux() {
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

// =============================================================================
// ─── UNIFIED ENTRY POINT ─────────────────────────────────────────────────────
// =============================================================================

async function detectModems() {
  if (IS_WIN) {
    return detectModemsWindows();
  }
  return detectModemsLinux();
}

// ─── IP Rotation ─────────────────────────────────────────────────────────────
async function rotateModemIp(modem) {
  if (IS_WIN) {
    // Windows: disable then re-enable the network adapter to get a new IP
    const iface = modem.interface;
    if (!iface) return null;
    console.log(`[ModemDetector] Rotating IP on Windows adapter: ${iface}`);
    await run(`netsh interface set interface "${iface}" disable`, { shell: 'cmd.exe' });
    await new Promise(r => setTimeout(r, 3000));
    await run(`netsh interface set interface "${iface}" enable`, { shell: 'cmd.exe' });
    await new Promise(r => setTimeout(r, 6000));

    // Re-read IP from ipconfig
    const adapters = await parseIpconfigAll();
    const updated  = adapters.find(a => a.name === iface);
    if (updated && updated.ipv4) {
      modem.ipAddress = updated.ipv4;
    }
    return modem.ipAddress;
  }

  // Linux: use mmcli to disconnect/reconnect
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
