/**
 * ProxiCell & Vertex Proxies — Country & Geo Helper
 * Accurately detects and formats Country, Flag image, and badges
 * for USA, Kenya, and global proxies.
 */

import React from 'react';

/**
 * Removes Unicode Regional Indicator symbols and raw trailing country abbreviations
 * (which render as ugly literal text like "us" or "ke" on Windows browsers).
 */
export function cleanProxyOperator(text) {
  if (!text) return '';
  return text
    // Remove Unicode flag regional indicators (e.g. 🇺🇸 U+1F1FA U+1F1F8, 🇰🇪 U+1F1F0 U+1F1EA)
    .replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/g, '')
    // Remove trailing raw flag fragments like " us" or " ke" at the end of the line
    .replace(/\s+(?:us|ke|gb)$/i, '')
    .trim();
}

/**
 * Analyzes proxy or modem object to detect country info.
 */
export function getProxyCountryInfo(proxyOrModem) {
  const modem = proxyOrModem?.modems || proxyOrModem || {};
  const label = (modem?.label || '').toLowerCase();
  const operator = (modem?.operator || '').toLowerCase();
  const country = (modem?.country || modem?.country_code || modem?.countryCode || '').toLowerCase();
  const location = (modem?.location || '').toLowerCase();

  const isKenya = label.includes('kenya') ||
                  operator.includes('kenya') ||
                  operator.includes('safaricom') ||
                  location.includes('kenya') ||
                  location.includes('nairobi') ||
                  country === 'ke' ||
                  country === 'kenya';

  if (isKenya) {
    return {
      country: 'Kenya',
      shortName: 'Kenya',
      code: 'KE',
      flag: '🇰🇪',
      flagUrl: 'https://flagcdn.com/w40/ke.png',
      badgeText: '🇰🇪 Kenya',
      residentialLabel: 'Kenya Residential',
      location: 'Nairobi, Kenya',
      city: 'Nairobi',
      region: 'Nairobi County',
      isp: 'Safaricom Limited',
      asn: 'AS33771',
      color: '#10b981', // Emerald green
      bg: 'rgba(16, 185, 129, 0.14)',
      border: 'rgba(16, 185, 129, 0.35)',
    };
  }

  const isUk = label.includes('uk') ||
               label.includes('united kingdom') ||
               country === 'gb' ||
               country === 'uk';
  if (isUk) {
    return {
      country: 'United Kingdom',
      shortName: 'UK',
      code: 'GB',
      flag: '🇬🇧',
      flagUrl: 'https://flagcdn.com/w40/gb.png',
      badgeText: '🇬🇧 UK',
      residentialLabel: 'UK Residential',
      location: 'London, UK',
      city: 'London',
      region: 'Greater London',
      isp: 'BT / Vodafone',
      asn: 'AS2856',
      color: '#3b82f6',
      bg: 'rgba(59, 130, 246, 0.14)',
      border: 'rgba(59, 130, 246, 0.35)',
    };
  }

  // Default USA (or if USA is explicitly mentioned)
  return {
    country: 'United States',
    shortName: 'USA',
    code: 'US',
    flag: '🇺🇸',
    flagUrl: 'https://flagcdn.com/w40/us.png',
    badgeText: '🇺🇸 USA',
    residentialLabel: 'USA Residential',
    location: 'United States',
    city: 'New York / Miami',
    region: 'Florida / NY',
    isp: (operator.includes('digitalocean') || label.includes('datacenter'))
      ? 'DigitalOcean, LLC'
      : 'Comcast Cable / AT&T',
    asn: (operator.includes('digitalocean') || label.includes('datacenter'))
      ? 'AS14061'
      : 'AS7922',
    color: '#3b82f6', // Electric blue
    bg: 'rgba(59, 130, 246, 0.14)',
    border: 'rgba(59, 130, 246, 0.35)',
  };
}

/**
 * Visual Country Badge with Flag image & country name
 */
export function CountryBadge({ proxyOrModem, style = {}, showCode = false, size = 'md' }) {
  const info = getProxyCountryInfo(proxyOrModem);
  const isSmall = size === 'sm';

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: isSmall ? '4px' : '6px',
      background: info.bg,
      color: info.color,
      border: `1px solid ${info.border}`,
      padding: isSmall ? '2px 7px' : '3px 9px',
      borderRadius: '6px',
      fontSize: isSmall ? '0.70rem' : '0.75rem',
      fontWeight: 700,
      letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
      lineHeight: 1.2,
      boxShadow: `0 0 10px ${info.bg}`,
      ...style,
    }}>
      <img
        src={info.flagUrl}
        alt={info.code}
        style={{
          width: isSmall ? '14px' : '16px',
          height: isSmall ? '10px' : '11px',
          objectFit: 'cover',
          borderRadius: '2px',
          boxShadow: '0 0 2px rgba(0,0,0,0.4)',
          display: 'inline-block'
        }}
        onError={(e) => {
          e.target.style.display = 'none';
        }}
      />
      <span>{showCode ? info.code : (info.shortName || info.country)}</span>
    </span>
  );
}
