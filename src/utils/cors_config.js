'use strict';
/**
 * Builds the strict CORS allowlist dynamically from NEXA_DOMAIN and
 * NEXA_ALLOWED_ORIGINS so domain/VPS cutover (FR-SRV-05) requires no code edit.
 */

const DEFAULT_AZURE_DOMAIN = 'nexa-server.indonesiacentral.cloudapp.azure.com';

function normalizeOrigin(raw) {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin.toLowerCase();
  } catch (_) {
    return null;
  }
}

function buildAllowedOrigins(envConfig = process.env) {
  const isProd = String(envConfig.NODE_ENV || '').trim().toLowerCase() === 'production';
  const primary = normalizeOrigin(envConfig.NEXA_DOMAIN);
  const set = new Set();

  if (primary) {
    set.add(primary);
  } else {
    set.add(`https://${DEFAULT_AZURE_DOMAIN}`);
  }

  // Only allow localhost origins in non-production environments (H-13)
  if (!isProd) {
    set.add('http://localhost:3000');
    set.add('http://127.0.0.1:3000');
  }

  const extra = String(envConfig.NEXA_ALLOWED_ORIGINS || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
  for (const origin of extra) {
    set.add(origin);
  }

  return Array.from(set);
}

module.exports = {
  DEFAULT_AZURE_DOMAIN,
  normalizeOrigin,
  buildAllowedOrigins
};
