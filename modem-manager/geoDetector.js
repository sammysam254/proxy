/**
 * ProxiCell — Geo Location & ISP Detector
 * Dynamically resolves public IP, country, city, ISP, and flag emoji.
 * Supports auto-detection for Kenya, USA, UK, and any global location.
 */

'use strict';

const http  = require('http');
const https = require('https');

let _cachedGeo = null;
let _lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

/**
 * Converts a 2-letter ISO country code (e.g. 'KE', 'US') to a Unicode flag emoji (🇰🇪, 🇺🇸).
 */
function getFlagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '🌐';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

/**
 * Cleans up raw ISP names for a cleaner, professional display
 * e.g. "Safaricom Limited" -> "Safaricom", "Comcast Cable Communications, LLC" -> "Comcast"
 */
function cleanIspName(rawIsp) {
  if (!rawIsp) return 'Residential';
  let clean = rawIsp
    .replace(/,?\s*(LLC|Inc\.?|Ltd\.?|Limited|Corp\.?|Corporation|Communications|Telecommunications)/gi, '')
    .trim();
  return clean || rawIsp;
}

/**
 * Makes an HTTP/HTTPS GET request and returns parsed JSON.
 */
function httpGetJson(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      timeout: timeoutMs,
      headers: { 'User-Agent': 'ProxiCell-GeoDetector/1.0' }
    }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let raw = '';
      res.on('data', chunk => (raw += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.on('error', reject);
  });
}

/**
 * Detects current machine's public internet geo-location and ISP.
 * Tries ip-api.com first, then ipwho.is, then ipify fallback.
 */
async function detectGeoLocation(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _cachedGeo && (now - _lastFetchTime < CACHE_TTL_MS)) {
    return _cachedGeo;
  }

  // 1. Primary: http://ip-api.com/json/ (fast, detailed, unauthenticated)
  try {
    const data = await httpGetJson('http://ip-api.com/json/?fields=status,message,country,countryCode,city,regionName,isp,org,query');
    if (data && data.status === 'success' && data.countryCode) {
      const cc = data.countryCode.toUpperCase();
      const flag = getFlagEmoji(cc);
      const isUs = cc === 'US';
      const displayName = isUs ? 'USA' : data.country;
      const cleanIsp = cleanIspName(data.isp || data.org);

      _cachedGeo = {
        country:     data.country,
        countryCode: cc,
        city:        data.city || '',
        region:      data.regionName || '',
        isp:         cleanIsp,
        rawIsp:      data.isp || data.org || cleanIsp,
        flag:        flag,
        displayName: displayName,
        publicIp:    data.query,
      };
      _lastFetchTime = now;
      return _cachedGeo;
    }
  } catch (err) {
    // try next provider
  }

  // 2. Secondary: https://ipwho.is/
  try {
    const data = await httpGetJson('https://ipwho.is/');
    if (data && data.success && data.country_code) {
      const cc = data.country_code.toUpperCase();
      const flag = getFlagEmoji(cc);
      const isUs = cc === 'US';
      const displayName = isUs ? 'USA' : data.country;
      const rawIsp = data.connection?.isp || data.connection?.org || 'Residential';
      const cleanIsp = cleanIspName(rawIsp);

      _cachedGeo = {
        country:     data.country,
        countryCode: cc,
        city:        data.city || '',
        region:      data.region || '',
        isp:         cleanIsp,
        rawIsp:      rawIsp,
        flag:        flag,
        displayName: displayName,
        publicIp:    data.ip,
      };
      _lastFetchTime = now;
      return _cachedGeo;
    }
  } catch (err) {
    // try fallback
  }

  // 3. Fallback: If cached value exists, reuse it even if expired
  if (_cachedGeo) {
    return _cachedGeo;
  }

  // 4. Default safe fallback if network is completely unreachable
  return {
    country:     'United States',
    countryCode: 'US',
    city:        'Residential',
    region:      'Node',
    isp:         'Residential',
    rawIsp:      'Residential Wi-Fi',
    flag:        '🇺🇸',
    displayName: 'USA',
    publicIp:    null,
  };
}

module.exports = {
  detectGeoLocation,
  getFlagEmoji,
  cleanIspName,
};
