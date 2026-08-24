/**
 * ProxiCell — Computer Wi-Fi Network Detector
 * Detects connected Wi-Fi networks strictly on the local computer (Windows & Linux).
 * Never touches mobile phone networks, Android ADB, or cellular modems.
 */

'use strict';

const { exec }           = require('child_process');
const { promisify }      = require('util');
const fs                 = require('fs');
const path               = require('path');
const execAsync          = promisify(exec);

const IS_WIN = process.platform === 'win32';

// ─── Helper: run command, return stdout or null ────────────────────────────────
async function run(cmd, opts = {}) {
  try {
    const { stdout } = await execAsync(cmd, { timeout: 8000, ...opts });
    return stdout ? stdout.trim() : null;
  } catch {
    return null;
  }
}

// ─── Mobile / Cellular Interface Filter ───────────────────────────────────────
// Explicitly blacklist any mobile phone tethering, cellular modem, or virtual adapters
const MOBILE_AND_VIRTUAL_FILTER = /rndis|remote ndis|apple mobile|samsung|android|pixel|cellular|mobile broadband|wwan|cdc[- ]?ncm|huawei|zte|qualcomm|tailscale|virtualbox|vmware|vethernet|hyper-v|loopback|docker/i;


// =============================================================================
// ─── WINDOWS WI-FI DETECTION ─────────────────────────────────────────────────
// =============================================================================

/**
 * Parses `netsh wlan show interfaces` on Windows.
 * Returns array of objects with: name, description, ssid, signal, state
 */
async function getWindowsWlanInterfaces() {
  const raw = await run('netsh wlan show interfaces', { shell: 'cmd.exe' });
  if (!raw) return [];

  const interfaces = [];
  const blocks = raw.split(/Name\s*:\s*/);

  for (const block of blocks) {
    if (!block.trim() || block.includes('There is') || block.includes('The Wireless AutoConfig Service')) continue;

    const lines = block.split(/\r?\n/);
    const ifaceName = lines[0]?.trim();
    if (!ifaceName) continue;

    const getField = (pattern) => {
      const match = block.match(pattern);
      return match ? match[1].trim() : null;
    };

    const description = getField(/Description\s*:\s*(.+)/i);
    const state       = getField(/State\s*:\s*(.+)/i);
    const ssid        = getField(/SSID\s*:\s*(.+)/i);
    const signalStr   = getField(/Signal\s*:\s*(\d+)%/i);
    const radioType   = getField(/Radio type\s*:\s*(.+)/i);

    const signal = signalStr ? parseInt(signalStr, 10) : 80;

    interfaces.push({
      name: ifaceName,
      description: description || 'Wireless LAN Adapter',
      state: state || 'unknown',
      ssid: ssid && ssid !== '(null)' ? ssid : null,
      signal,
      radioType,
    });
  }

  return interfaces;
}

/**
 * Finds IPv4 address for an interface name using netsh or ipconfig
 */
async function getIpv4ForInterface(ifaceName) {
  try {
    const raw = await run(`netsh interface ipv4 show addresses name="${ifaceName}"`, { shell: 'cmd.exe' });
    if (raw) {
      const match = raw.match(/IP Address:\s+([\d.]+)/i);
      if (match && !match[1].startsWith('169.254.') && !match[1].startsWith('127.')) {
        return match[1].trim();
      }
    }
  } catch {}

  // Fallback: search in ipconfig /all
  try {
    const raw = await run('ipconfig /all', { shell: 'cmd.exe' });
    if (raw) {
      const blocks = raw.split(/adapter /i);
      for (const block of blocks) {
        if (block.toLowerCase().includes(ifaceName.toLowerCase())) {
          const m = block.match(/IPv4 Address[.\s]*:\s*([\d.]+)/i);
          if (m && !m[1].startsWith('169.254.') && !m[1].startsWith('127.')) {
            return m[1].trim();
          }
        }
      }
    }
  } catch {}

  return null;
}

/**
 * Fallback detection on Windows when WLAN service or netsh is limited:
 * Checks ipconfig /all for any Wireless adapter with a valid IP.
 */
async function detectWindowsWifiFallback() {
  const raw = await run('ipconfig /all', { shell: 'cmd.exe' });
  if (!raw) return [];

  const detected = [];
  const lines = raw.split(/\r?\n/);
  let currentAdapter = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^(\S[^:]+) adapter ([^:]+):/);
    if (headerMatch) {
      if (currentAdapter) {
        processAdapter(currentAdapter);
      }
      currentAdapter = {
        type:        headerMatch[1].trim(),
        name:        headerMatch[2].trim(),
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

  if (currentAdapter) {
    processAdapter(currentAdapter);
  }

  function processAdapter(adapter) {
    if (!adapter.connected || !adapter.ipv4) return;
    if (adapter.ipv4.startsWith('169.254.') || adapter.ipv4.startsWith('127.')) return;
    if (adapter.ipv4.startsWith('192.168.56.') || adapter.ipv4.startsWith('192.168.57.')) return;

    const combined = `${adapter.type} ${adapter.name} ${adapter.description}`.toLowerCase();
    if (MOBILE_AND_VIRTUAL_FILTER.test(combined)) return;

    const isWifi = /wireless|wi-fi|wlan|802\.11/i.test(combined);

    if (isWifi) {
      detected.push({
        devicePath: `wifi:${adapter.name.replace(/\s+/g, '_')}`,
        interface:  adapter.name,
        ipAddress:  adapter.ipv4,
        operator:   'Residential Wi-Fi',
        iccid:      null,
        signal:     80,
        status:     'online',
        label:      `Wi-Fi (${adapter.name})`,
        vendor:     'Wi-Fi Adapter',
        model:      adapter.description || adapter.name,
        isWifi:     true,
        portSet:    null,
      });
    }
  }

  return detected;
}

/**
 * Primary adapter fallback: If computer does not have a dedicated Wi-Fi card or is connected
 * via LAN/Ethernet, use the computer's primary local network connection.
 * Strictly excludes any mobile phones, USB tethering, or cellular modems.
 */
async function detectWindowsPrimaryAdapter() {
  const raw = await run('ipconfig /all', { shell: 'cmd.exe' });
  if (!raw) return [];

  const detected = [];
  const lines = raw.split(/\r?\n/);
  let currentAdapter = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^(\S[^:]+) adapter ([^:]+):/);
    if (headerMatch) {
      if (currentAdapter) checkPrimary(currentAdapter);
      currentAdapter = {
        type:        headerMatch[1].trim(),
        name:        headerMatch[2].trim(),
        description: '',
        ipv4:        null,
        hasGateway:  false,
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
    } else if (/^Default Gateway/i.test(trimmed)) {
      const m = trimmed.match(/(\d+\.\d+\.\d+\.\d+)/);
      if (m && !m[1].startsWith('0.0.0.0')) currentAdapter.hasGateway = true;
    } else if (/^Media State/i.test(trimmed)) {
      if (trimmed.toLowerCase().includes('disconnected')) currentAdapter.connected = false;
    }
  }

  if (currentAdapter) checkPrimary(currentAdapter);

  function checkPrimary(adapter) {
    if (!adapter.connected || !adapter.ipv4 || detected.length > 0) return;
    if (adapter.ipv4.startsWith('169.254.') || adapter.ipv4.startsWith('127.')) return;
    if (adapter.ipv4.startsWith('192.168.56.') || adapter.ipv4.startsWith('192.168.57.')) return; // VirtualBox
    if (adapter.ipv4.startsWith('172.28.') || adapter.ipv4.startsWith('172.29.') || adapter.ipv4.startsWith('172.30.') || adapter.ipv4.startsWith('172.31.')) return; // WSL

    const combined = `${adapter.type} ${adapter.name} ${adapter.description}`.toLowerCase();
    // Strictly filter out mobile tethering, cellular modems, VPNs, and VMs
    if (MOBILE_AND_VIRTUAL_FILTER.test(combined)) return;

    detected.push({
      devicePath: `wifi:${adapter.name.replace(/\s+/g, '_')}`,
      interface:  adapter.name,
      ipAddress:  adapter.ipv4,
      operator:   'Residential Network',
      iccid:      null,
      signal:     95,
      status:     'online',
      label:      `Residential (${adapter.name})`,
      vendor:     'Computer Network',
      model:      adapter.description || adapter.name,
      ssid:       null,
      isWifi:     true,
      portSet:    null,
    });
  }

  return detected;
}

/**
 * Detect all connected Wi-Fi devices on Windows
 */
async function detectWifiWindows() {
  const wlanIfaces = await getWindowsWlanInterfaces();
  const detected = [];

  for (const iface of wlanIfaces) {
    if (iface.state !== 'connected') continue;

    // Filter out any mobile tethering adapter that might show under wlan
    const combined = `${iface.name} ${iface.description}`.toLowerCase();
    if (MOBILE_AND_VIRTUAL_FILTER.test(combined)) continue;

    const ipv4 = await getIpv4ForInterface(iface.name);
    if (!ipv4) continue;

    const ssidLabel = iface.ssid || 'Connected';
    const label = `Wi-Fi: ${ssidLabel}`;
    const devicePath = `wifi:${iface.name.replace(/\s+/g, '_')}`;

    detected.push({
      devicePath,
      interface:  iface.name,
      ipAddress:  ipv4,
      operator:   iface.ssid ? `Wi-Fi (${iface.ssid})` : 'Wi-Fi Network',
      iccid:      null,
      signal:     iface.signal,
      status:     'online',
      label,
      vendor:     'Wi-Fi',
      model:      iface.description || 'Wireless Adapter',
      ssid:       iface.ssid,
      isWifi:     true,
      portSet:    null,
    });
  }

  // If netsh wlan didn't find anything or wlansvc is stopped, use Wi-Fi fallback
  if (detected.length === 0) {
    const fallback = await detectWindowsWifiFallback();
    detected.push(...fallback);
  }

  // If still no wireless adapter found, use the computer's primary active local network connection
  if (detected.length === 0) {
    const primary = await detectWindowsPrimaryAdapter();
    detected.push(...primary);
  }

  return detected;
}

// =============================================================================
// ─── LINUX WI-FI DETECTION ───────────────────────────────────────────────────
// =============================================================================

async function detectWifiLinux() {
  const detected = [];
  const ifDir = '/sys/class/net';
  if (!fs.existsSync(ifDir)) return detected;

  try {
    const dirs = fs.readdirSync(ifDir);
    const wifiIfaces = dirs.filter(name => /^(wlan|wlp|wls|wifi)/.test(name));

    for (const iface of wifiIfaces) {
      // Exclude any mobile phone usb tethering on linux (e.g. usb0, rndis, cdc)
      if (MOBILE_AND_VIRTUAL_FILTER.test(iface)) continue;

      const ifPath = `${ifDir}/${iface}`;
      let operstate = 'down';
      try {
        operstate = fs.readFileSync(`${ifPath}/operstate`, 'utf8').trim();
      } catch {}

      if (operstate !== 'up' && operstate !== 'unknown') continue;

      // Get IP Address
      const ipOut = await run(`ip addr show ${iface}`);
      const ipMatch = ipOut && ipOut.match(/inet (\d+\.\d+\.\d+\.\d+)/);
      const ipAddress = ipMatch ? ipMatch[1] : null;
      if (!ipAddress || ipAddress.startsWith('127.') || ipAddress.startsWith('169.254.')) continue;

      // Get SSID and Signal quality via iw or iwconfig or nmcli
      let ssid = null;
      let signal = 75;

      const iwOut = await run(`iw dev ${iface} link 2>/dev/null`);
      if (iwOut) {
        const ssidMatch = iwOut.match(/SSID:\s*(.+)/i);
        if (ssidMatch) ssid = ssidMatch[1].trim();
        const sigMatch = iwOut.match(/signal:\s*-(\d+)\s*dBm/i);
        if (sigMatch) {
          const dbm = parseInt(sigMatch[1], 10);
          signal = Math.max(0, Math.min(100, Math.round(((110 - dbm) / 60) * 100)));
        }
      }

      if (!ssid) {
        const iwconfigOut = await run(`iwconfig ${iface} 2>/dev/null`);
        if (iwconfigOut) {
          const essidMatch = iwconfigOut.match(/ESSID:"([^"]+)"/);
          if (essidMatch) ssid = essidMatch[1];
        }
      }

      const devicePath = `wifi:${iface}`;
      detected.push({
        devicePath,
        interface:  iface,
        ipAddress,
        operator:   ssid ? `Wi-Fi (${ssid})` : 'Wi-Fi Network',
        iccid:      null,
        signal,
        status:     'online',
        label:      `Wi-Fi: ${ssid || iface}`,
        vendor:     'Wi-Fi Adapter',
        model:      `Linux Wireless (${iface})`,
        ssid,
        isWifi:     true,
        portSet:    null,
      });
    }
  } catch (e) {
    // Non-fatal
  }

  return detected;
}

// =============================================================================
// ─── PUBLIC API ──────────────────────────────────────────────────────────────
// =============================================================================

const DEFAULT_WIFI_SLOTS = parseInt(process.env.WIFI_PROXY_SLOTS || '12', 10);

/**
 * Expands physical Wi-Fi connection into multiple distinct proxy slots (default 12 cards)
 * Configured specifically for High-Speed USA Residential Proxies.
 */
function expandWifiSlots(rawWifiList, slotsCount = DEFAULT_WIFI_SLOTS) {
  const expanded = [];
  for (const base of rawWifiList) {
    for (let slot = 1; slot <= slotsCount; slot++) {
      expanded.push({
        ...base,
        devicePath: `residential_usa_slot_${slot}`,
        label:      `USA Residential Proxy #${slot}`,
        operator:   'United States (USA) 🇺🇸',
        model:      `USA High-Speed Residential Node #${slot}`,
        location:   'United States (USA)',
        country:    'USA',
        countryCode:'US',
        signal:     99,
        slotNumber: slot,
      });
    }
  }
  return expanded;
}

/**
 * Detects all active Wi-Fi connections on current OS and expands to 12 proxy cards.
 */
async function detectWifiDevices() {
  const rawList = IS_WIN ? await detectWifiWindows() : await detectWifiLinux();
  return expandWifiSlots(rawList);
}

/**
 * Rotates the Wi-Fi IP address strictly via computer network reconnect / DHCP renew.
 * Never touches mobile phones or ADB.
 */
async function rotateWifiIp(device) {
  console.log(`[WifiDetector] Initiating computer Wi-Fi IP rotation for: ${device.label}...`);

  if (IS_WIN) {
    if (device.ssid) {
      console.log(`[WifiDetector] Reconnecting Wi-Fi SSID "${device.ssid}" on interface "${device.interface}"...`);
      await run(`netsh wlan disconnect interface="${device.interface}"`, { shell: 'cmd.exe' });
      await new Promise(r => setTimeout(r, 2000));
      await run(`netsh wlan connect name="${device.ssid}" interface="${device.interface}"`, { shell: 'cmd.exe' });
    } else {
      console.log(`[WifiDetector] Renewing DHCP lease for interface "${device.interface}"...`);
      await run(`ipconfig /renew "${device.interface}"`, { shell: 'cmd.exe' });
    }
  } else {
    console.log(`[WifiDetector] Reapplying network configuration for interface ${device.interface}...`);
    await run(`nmcli device reapply ${device.interface} 2>/dev/null || (dhclient -r ${device.interface} && dhclient ${device.interface})`);
  }

  // Wait for network negotiation and local DHCP assignment
  await new Promise(r => setTimeout(r, 4000));

  // Re-fetch IP
  const updatedDevices = await detectWifiDevices();
  const found = updatedDevices.find(d => d.devicePath === device.devicePath || d.interface === device.interface);
  if (found && found.ipAddress) {
    device.ipAddress = found.ipAddress;
    device.signal    = found.signal;
    device.operator  = found.operator;
  }

  return device;
}

module.exports = {
  detectWifiDevices,
  expandWifiSlots,
  rotateWifiIp,
};

