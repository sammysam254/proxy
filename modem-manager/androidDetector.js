/**
 * ProxiCell — Android Device Detector
 * Detects Android phones connected via USB with:
 *   1. ADB (Android Debug Bridge) — device info, signal, carrier
 *   2. USB tethering network interface — rndis0, usb0, etc.
 *
 * Requirements on local machine:
 *   - adb installed (apt install adb / brew install android-platform-tools)
 *   - USB Debugging enabled on Android phone
 *   - USB Tethering enabled on Android phone
 *   - Phone connected via USB cable
 */

const { execFile, exec } = require('child_process');
const { promisify }       = require('util');
const execAsync           = promisify(exec);
const fs                  = require('fs');
const path                = require('path');

// ─── Find adb binary path ───────────────────────────────────────────────────
function getAdbBin() {
  const candidates = [
    path.join(__dirname, 'bin', 'platform-tools', 'adb.exe'),
    path.join(__dirname, 'bin', 'platform-tools', 'adb'),
    path.join(process.cwd(), 'modem-manager', 'bin', 'platform-tools', 'adb.exe'),
    path.join(process.cwd(), 'bin', 'platform-tools', 'adb.exe'),
    'adb.exe',
    'adb',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'adb';
}

// ─── Run adb with args via execFile ──────────────────────────────────────────
function runAdb(args) {
  return new Promise((resolve) => {
    const bin = getAdbBin();
    execFile(bin, args, { timeout: 8000 }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(stdout ? stdout.trim() : null);
    });
  });
}

// ─── Helper: run adb shell command on a device ────────────────────────────────
async function adb(serial, shellCmd) {
  // shellCmd can be a string, we split or pass to sh -c
  return runAdb(['-s', serial, 'shell', shellCmd]);
}

// ─── Helper: run adb command (not shell) ─────────────────────────────────────
async function adbCmd(cmdStr) {
  const args = cmdStr.trim().split(/\s+/);
  return runAdb(args);
}

// ─── Check if adb is installed ───────────────────────────────────────────────
async function isAdbAvailable() {
  const out = await runAdb(['version']);
  return !!out;
}

// ─── Get list of connected ADB devices ───────────────────────────────────────
async function getAdbDevices() {
  const out = await adbCmd('devices');
  if (!out) return [];

  const devices = [];
  const lines = out.split('\n').slice(1); // skip "List of devices attached"

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2 && parts[1] === 'device') {
      devices.push(parts[0]); // serial number
    }
  }

  return devices;
}

// ─── Get network interface created by Android USB tethering ──────────────────
async function getAndroidTetheredInterface(serial) {
  // ── Windows implementation ────────────────────────────────────────────────
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execAsync('netsh interface ipv4 show addresses', { timeout: 4000 });
      const blocks = stdout.split(/Configuration for interface /);

      // IPs that are definitely NOT a SIM card / USB tethering
      const isVirtualIp = (ip) => {
        if (!ip) return true;
        if (ip.startsWith('169.254.')) return true;  // APIPA / link-local
        if (ip.startsWith('127.'))     return true;  // loopback
        if (ip.startsWith('192.168.56.')) return true; // VirtualBox host-only
        if (ip.startsWith('192.168.57.')) return true; // VirtualBox alt
        if (ip.startsWith('192.168.99.')) return true; // Docker / VMware
        if (ip.startsWith('172.28.'))   return true;  // WSL2 / Hyper-V
        if (ip.startsWith('172.29.'))   return true;
        if (ip.startsWith('172.30.'))   return true;
        if (ip.startsWith('172.31.'))   return true;
        return false;
      };

      const isVirtualName = (name) =>
        /loopback|tailscale|virtualbox|vmware|vethernet|wsl|hyper-v|docker/i.test(name);

      // Pass 1: adapter with a Default Gateway (real routed tethering connection)
      for (const block of blocks) {
        if (!block.trim()) continue;
        const nameMatch = block.match(/^"([^"]+)"/);
        const ifaceName = nameMatch ? nameMatch[1] : '';

        if (isVirtualName(ifaceName)) continue;
        if (ifaceName.toLowerCase() === 'ethernet') continue; // skip primary LAN

        const ipMatch = block.match(/IP Address:\s+([\d.]+)/i);
        const gwMatch = block.match(/Default Gateway:\s+([\d.]+)/i);

        if (ipMatch && gwMatch && !isVirtualIp(ipMatch[1])) {
          return { iface: ifaceName, ipAddress: ipMatch[1].trim() };
        }
      }

      // Pass 2: any non-virtual adapter with a valid IP (tethering w/o gateway)
      for (const block of blocks) {
        const nameMatch = block.match(/^"([^"]+)"/);
        const ifaceName = nameMatch ? nameMatch[1] : '';

        if (isVirtualName(ifaceName)) continue;
        if (ifaceName.toLowerCase() === 'ethernet') continue;

        const ipMatch = block.match(/IP Address:\s+([\d.]+)/i);
        if (ipMatch && !isVirtualIp(ipMatch[1])) {
          return { iface: ifaceName, ipAddress: ipMatch[1].trim() };
        }
      }
    } catch {}
    return null;
  }

  // ── Linux implementation ──────────────────────────────────────────────────
  const fs   = require('fs');
  const ifDir = '/sys/class/net';
  if (!fs.existsSync(ifDir)) return null;

  // Candidate interface names for USB tethering
  const candidates = ['rndis0', 'usb0', 'usb1', 'usb2',
                       'enp0s20f0u1', 'enp0s20f0u2'];  // common USB eth names

  for (const iface of candidates) {
    try {
      const ifPath = `${ifDir}/${iface}`;
      if (!fs.existsSync(ifPath)) continue;

      // Check if this interface is up
      const state = fs.readFileSync(`${ifPath}/operstate`, 'utf8').trim();
      if (state !== 'up' && state !== 'unknown') continue;

      // Get IP address
      const { stdout } = await execAsync(`ip addr show ${iface}`, { timeout: 3000 });
      const ipMatch = stdout.match(/inet (\d+\.\d+\.\d+\.\d+)/);
      if (ipMatch) {
        return { iface, ipAddress: ipMatch[1] };
      }
    } catch {}
  }

  // Fallback: scan all net interfaces for rndis/usb driver
  try {
    const { stdout } = await execAsync('ip link show type ether', { timeout: 3000 });
    const rndisMatch = stdout.match(/(\w+)@/g);
    if (rndisMatch) {
      for (const match of rndisMatch) {
        const iface = match.replace('@', '');
        const { stdout: addrOut } = await execAsync(`ip addr show ${iface}`, { timeout: 3000 });
        const ipM = addrOut.match(/inet (\d+\.\d+\.\d+\.\d+)/);
        if (ipM) return { iface, ipAddress: ipM[1] };
      }
    }
  } catch {}

  return null;
}

// ─── Get Android device info via ADB ─────────────────────────────────────────
async function getAndroidDeviceInfo(serial) {
  const [
    model,
    brand,
    androidVer,
    batteryRaw,
    operatorRaw,
    signalRaw,
  ] = await Promise.all([
    adb(serial, 'getprop ro.product.model'),
    adb(serial, 'getprop ro.product.brand'),
    adb(serial, 'getprop ro.build.version.release'),
    adb(serial, 'dumpsys battery | grep level'),
    adb(serial, 'getprop gsm.operator.alpha'),
    adb(serial, 'dumpsys telephony.registry | grep -i "mSignalStrength"'),
  ]);

  // Parse battery level
  const batteryMatch = batteryRaw && batteryRaw.match(/level:\s*(\d+)/);
  const battery = batteryMatch ? parseInt(batteryMatch[1]) : null;

  // Parse signal (dBm or asu)
  let signal = 50; // default
  if (signalRaw) {
    const dbmMatch = signalRaw.match(/-(\d+) dBm/);
    if (dbmMatch) {
      const dbm = -parseInt(dbmMatch[1]);
      // Convert dBm to 0-100 percentage: -50 = 100%, -110 = 0%
      signal = Math.max(0, Math.min(100, Math.round(((dbm + 110) / 60) * 100)));
    }
  }

  // Get operator name (try multiple props)
  let operator = operatorRaw || null;
  if (!operator || operator === 'null') {
    operator = await adb(serial, 'getprop gsm.sim.operator.alpha') ||
               await adb(serial, 'getprop ril.operatorname.registered') ||
               'Mobile Network';
  }
  if (operator === 'null') operator = 'Mobile Network';
  operator = operator.replace(/[, \r\n\t]+$/, '').trim() || 'Mobile Network';

  // Get SIM info
  const iccid = await adb(serial, 'service call iphonesubinfo 11 | grep -o "[0-9A-Fa-f ]*" | head -1').catch(() => null);

  return {
    model:          `${brand || ''} ${model || 'Android'}`.trim(),
    androidVersion: androidVer || 'Unknown',
    battery,
    signal,
    operator,
    iccid,
  };
}

// ─── Check if USB tethering is enabled ───────────────────────────────────────
async function isTetheringEnabled(serial) {
  // Method 1: Check usb functions
  const funcs = await adb(serial, 'svc usb getFunctions').catch(() => null);
  if (funcs && funcs.toLowerCase().includes('rndis')) return true;

  // Method 2: Check tethering state via dumpsys
  const tetheringOut = await adb(serial, 'dumpsys connectivity | grep -i "usb tethering"').catch(() => null);
  if (tetheringOut && tetheringOut.toLowerCase().includes('true')) return true;

  // Method 3: Check if rndis interface shows up in OS
  const ifaceInfo = await getAndroidTetheredInterface(serial);
  return ifaceInfo !== null;
}

// ─── Permanently configure default USB configuration to USB Tethering (RNDIS) ─
async function configurePersistentUsbTethering(serial) {
  try {
    // Sets the permanent Android "Default USB configuration" to RNDIS + ADB
    await adb(serial, 'svc usb setScreenUnlockedFunctions rndis,adb').catch(() => {});
    await adb(serial, 'svc usb setScreenUnlockedFunctions rndis').catch(() => {});
    await adb(serial, 'settings put global default_usb_mode rndis').catch(() => {});
    await adb(serial, 'settings put secure default_usb_mode rndis').catch(() => {});
    await adb(serial, 'settings put global usb_tethering 1').catch(() => {});
    await adb(serial, 'settings put system usb_tethering 1').catch(() => {});
    await adb(serial, 'settings put global tether_dun_required 0').catch(() => {});
    await adb(serial, 'setprop persist.sys.usb.config rndis,adb').catch(() => {});
    await adb(serial, 'setprop persist.sys.usb.config.default rndis,adb').catch(() => {});
  } catch {}
}

// ─── Enable USB tethering via ADB (multi-method Android support) ─────────────
async function enableTethering(serial) {
  console.log(`[AndroidDetector] Automatically triggering USB tethering on ${serial}...`);
  try {
    // 1. Permanently configure default USB configuration on the phone
    await configurePersistentUsbTethering(serial);

    // 2. Ensure Wi-Fi is enabled on Android for Wi-Fi proxy routing
    await adb(serial, 'svc wifi enable').catch(() => {});
    await adb(serial, 'svc data enable').catch(() => {});

    // 3. Try Android 11-14+ modular tethering commands
    await adb(serial, 'cmd tethering start-tethering 1').catch(() => {});
    await adb(serial, 'cmd tethering start-tethering usb').catch(() => {});
    await adb(serial, 'cmd connectivity start-tethering usb').catch(() => {});

    // 4. Switch USB function to RNDIS + ADB (maintains ADB connection while enabling network)
    await adb(serial, 'svc usb setFunctions rndis,adb').catch(() => {});
    await adb(serial, 'svc usb setFunctions rndis').catch(() => {});

    // 5. Legacy service call fallbacks (Android 5 - 10)
    await adb(serial, 'service call connectivity 33 i32 1').catch(() => {});
    await adb(serial, 'service call connectivity 34 i32 1').catch(() => {});

    // 6. Direct USB config property fallback
    await adb(serial, 'setprop sys.usb.config rndis,adb').catch(() => {});

    // 7. Poll host OS for tethered interface & IP assignment (up to 12s)
    for (let attempt = 1; attempt <= 6; attempt++) {
      await new Promise(r => setTimeout(r, 2000));
      const iface = await getAndroidTetheredInterface(serial);
      if (iface && iface.ipAddress) {
        console.log(`[AndroidDetector] ✅ USB tethering active on ${serial} -> Interface: ${iface.iface} (${iface.ipAddress})`);
        return iface;
      }
    }
  } catch (e) {
    console.warn(`[AndroidDetector] Failed to enable tethering on ${serial}:`, e.message);
  }
  return null;
}

// ─── Main Android detection function ─────────────────────────────────────────
async function detectAndroidDevices() {
  const detected = [];

  // Check if ADB is available
  if (!(await isAdbAvailable())) {
    console.log('[AndroidDetector] adb not found. Install with: apt install adb');
    return detected;
  }

  // Restart ADB server if needed (ensures device list is fresh)
  await adbCmd('start-server').catch(() => {});

  const serials = await getAdbDevices();
  if (serials.length === 0) {
    // No ADB devices — but still scan for rndis interfaces from tethered phones
    // (phone may have tethering but ADB not enabled/authorized)
    const ifaceInfo = await getAndroidTetheredInterface(null);
    if (ifaceInfo) {
      const stableKey  = ifaceInfo.iface.replace(/\s+/g, '_');
      const devicePath = `android:tether:${stableKey}`;

      detected.push({
        devicePath,
        interface:      ifaceInfo.iface,
        ipAddress:      ifaceInfo.ipAddress,
        operator:       'Mobile Network',
        iccid:          null,
        signal:         50,
        status:         'online',
        label:          `Android Phone (${ifaceInfo.iface})`,
        vendor:         'Android',
        model:          'Android Phone',
        androidVersion: null,
        battery:        null,
        adbSerial:      null,
        isAndroid:      true,
        portSet:        null,
      });
      console.log(`[AndroidDetector] No ADB auth — tethering-only device on ${ifaceInfo.iface} (${ifaceInfo.ipAddress})`);
      console.log(`[AndroidDetector] TIP: Unlock your phone and accept the "Allow USB debugging?" prompt for full info.`);
    }
    return detected;
  }

  for (const serial of serials) {
    console.log(`[AndroidDetector] Found ADB device: ${serial}`);

    // Get device info
    const info = await getAndroidDeviceInfo(serial);

    // Check tethering & get network interface
    let ifaceInfo = await getAndroidTetheredInterface(serial);

    if (!ifaceInfo || !ifaceInfo.ipAddress) {
      console.log(`[AndroidDetector] ${serial}: USB tethering not active / no IP. Automatically enabling...`);
      ifaceInfo = await enableTethering(serial);
      if (!ifaceInfo) {
        ifaceInfo = await getAndroidTetheredInterface(serial);
      }
    }

    if (!ifaceInfo) {
      console.log(`[AndroidDetector] ${serial}: USB tethering not active. Attempting to enable...`);
      await enableTethering(serial);
      await new Promise(r => setTimeout(r, 3000));
      ifaceInfo = await getAndroidTetheredInterface(serial);
    }

    const iface     = ifaceInfo ? ifaceInfo.iface     : null;
    const ipAddress = ifaceInfo ? ifaceInfo.ipAddress : null;
    const status    = iface && ipAddress ? 'online' : 'offline';

    const label = `${info.model} (Android ${info.androidVersion || '?'})`;

    detected.push({
      devicePath:     `android:${serial}`,
      interface:      iface,
      ipAddress,
      operator:       info.operator,
      iccid:          info.iccid,
      signal:         info.signal,
      status,
      label,
      vendor:         'Android',
      model:          info.model,
      androidVersion: info.androidVersion,
      battery:        info.battery,
      adbSerial:      serial,
      isAndroid:      true,
      portSet:        null,
    });

    console.log(`[AndroidDetector] ${serial}: ${label} | IP: ${ipAddress || 'N/A'} | Status: ${status}`);
  }

  return detected;
}

// ─── Rotate IP via ADB (toggle cellular data & airplane mode) ─────────────────
async function rotateAndroidIp(device) {
  const serial = device.adbSerial;
  console.log(`[AndroidDetector] Rotating cellular IP for ${device.label}...`);

  if (serial) {
    // 1. Cycle Wi-Fi connection (for Android phones routing through Wi-Fi)
    await adb(serial, 'svc wifi disable').catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    await adb(serial, 'svc wifi enable').catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    // 2. Cycle mobile cellular data fallback
    await adb(serial, 'svc data disable').catch(() => {});
    await new Promise(r => setTimeout(r, 2500));
    await adb(serial, 'svc data enable').catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    // 3. Toggle Airplane Mode as secondary trigger
    await adb(serial, 'cmd connectivity airplane-mode enable').catch(() => {});
    await adb(serial, 'settings put global airplane_mode_on 1').catch(() => {});
    await adb(serial, 'am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true').catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    await adb(serial, 'cmd connectivity airplane-mode disable').catch(() => {});
    await adb(serial, 'settings put global airplane_mode_on 0').catch(() => {});
    await adb(serial, 'am broadcast -a android.intent.action.AIRPLANE_MODE --ez state false').catch(() => {});
    await new Promise(r => setTimeout(r, 4000));
  } else {
    // Fallback: bounce the Windows network interface
    if (process.platform === 'win32' && device.interface) {
      await execAsync(`netsh interface set interface "${device.interface}" disable`).catch(() => {});
      await new Promise(r => setTimeout(r, 3000));
      await execAsync(`netsh interface set interface "${device.interface}" enable`).catch(() => {});
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // Refresh local interface IP
  const ifaceInfo = await getAndroidTetheredInterface(serial);
  if (ifaceInfo && ifaceInfo.ipAddress) {
    device.ipAddress = ifaceInfo.ipAddress;
  }

  console.log(`[AndroidDetector] Cellular rotation trigger sent for ${device.label}. Local interface IP: ${device.ipAddress}`);
  return device.ipAddress;
}

// ─── Lightweight status refresh for already-known devices ────────────────────
async function refreshAndroidStatus(serial) {
  if (!serial) return null;
  try {
    const [batteryRaw, signalRaw, operatorRaw] = await Promise.all([
      adb(serial, 'dumpsys battery | grep level'),
      adb(serial, 'dumpsys telephony.registry | grep -i "mSignalStrength"'),
      adb(serial, 'getprop gsm.operator.alpha'),
    ]);

    const batteryMatch = batteryRaw && batteryRaw.match(/level:\s*(\d+)/);
    const battery = batteryMatch ? parseInt(batteryMatch[1]) : null;

    let signal = 50;
    if (signalRaw) {
      const dbmMatch = signalRaw.match(/-(\d+) dBm/);
      if (dbmMatch) {
        signal = Math.max(0, Math.min(100, Math.round(((- parseInt(dbmMatch[1]) + 110) / 60) * 100)));
      }
    }

    return { battery, signal, operator: operatorRaw || null };
  } catch {
    return null;
  }
}

module.exports = { detectAndroidDevices, rotateAndroidIp, isAdbAvailable, refreshAndroidStatus };
