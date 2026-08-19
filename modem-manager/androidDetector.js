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

'use strict';

const { promisify }  = require('util');
const { exec }       = require('child_process');
const execAsync      = promisify(exec);

// ─── Helper: run adb shell command on a device ────────────────────────────────
async function adb(serial, cmd) {
  try {
    const { stdout } = await execAsync(`adb -s ${serial} shell ${cmd}`, { timeout: 8000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

// ─── Helper: run adb command (not shell) ─────────────────────────────────────
async function adbCmd(cmd) {
  try {
    const { stdout } = await execAsync(`adb ${cmd}`, { timeout: 8000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

// ─── Check if adb is installed ───────────────────────────────────────────────
async function isAdbAvailable() {
  try {
    await execAsync('adb version', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
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
      const { stdout } = await execAsync('ipconfig', { timeout: 4000 });
      // Look for Remote NDIS, USB Ethernet, or Cellular adapter sections
      const sections = stdout.split(/\r?\n\r?\n/);
      for (const sec of sections) {
        if (/NDIS|USB|Cellular|Android|RNDIS/i.test(sec) || (sec.includes('Ethernet adapter') && !sec.includes('vEthernet'))) {
          const ipMatch = sec.match(/IPv4 Address[ .:]+([\d.]+)/i) || sec.match(/IP Address[ .:]+([\d.]+)/i);
          const nameMatch = sec.match(/adapter ([^:\r\n]+):/i);
          if (ipMatch && !ipMatch[1].startsWith('169.254.') && !ipMatch[1].startsWith('127.')) {
            return {
              iface: (nameMatch ? nameMatch[1].trim() : 'Ethernet'),
              ipAddress: ipMatch[1].trim(),
            };
          }
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
  // Method 1: Check tethering state
  const tetheringOut = await adb(serial, 'dumpsys connectivity | grep -i "usb tethering"');
  if (tetheringOut && tetheringOut.toLowerCase().includes('true')) return true;

  // Method 2: Check if rndis interface shows up
  const ifaceInfo = await getAndroidTetheredInterface(serial);
  return ifaceInfo !== null;
}

// ─── Enable USB tethering via ADB (requires root or specific Android versions) ─
async function enableTethering(serial) {
  // Try service call (works on some versions)
  await adbCmd(`-s ${serial} shell service call connectivity 34 i32 1`).catch(() => {});
  // Try settings (Android 6+)
  await adbCmd(`-s ${serial} shell settings put global tether_dun_required 0`).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
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
    // (phone may have tethering but ADB not enabled)
    const ifaceInfo = await getAndroidTetheredInterface(null);
    if (ifaceInfo) {
      detected.push({
        devicePath:     `android:tether:${ifaceInfo.iface}`,
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
    }
    return detected;
  }

  for (const serial of serials) {
    console.log(`[AndroidDetector] Found ADB device: ${serial}`);

    // Get device info
    const info = await getAndroidDeviceInfo(serial);

    // Check tethering & get network interface
    let ifaceInfo = await getAndroidTetheredInterface(serial);

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

// ─── Rotate IP via ADB (toggle airplane mode) ─────────────────────────────────
async function rotateAndroidIp(device) {
  const serial = device.adbSerial;
  if (!serial) {
    // If no ADB, try bouncing the interface
    if (device.interface) {
      const execAsync = promisify(exec);
      await execAsync(`ip link set ${device.interface} down`).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));
      await execAsync(`ip link set ${device.interface} up`).catch(() => {});
      await new Promise(r => setTimeout(r, 3000));
    }
    return;
  }

  // Toggle airplane mode ON then OFF to get new IP
  await adbCmd(`-s ${serial} shell settings put global airplane_mode_on 1`);
  await adbCmd(`-s ${serial} shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true`);
  await new Promise(r => setTimeout(r, 4000));

  await adbCmd(`-s ${serial} shell settings put global airplane_mode_on 0`);
  await adbCmd(`-s ${serial} shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state false`);
  await new Promise(r => setTimeout(r, 6000));

  // Get new IP
  const ifaceInfo = await getAndroidTetheredInterface(serial);
  if (ifaceInfo) {
    device.ipAddress = ifaceInfo.ipAddress;
  }

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
