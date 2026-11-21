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
  const set = new Set([
    `https://${DEFAULT_AZURE_DOMAIN}`,
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ]);

  const primary = normalizeOrigin(envConfig.NEXA_DOMAIN);
  if (primary) set.add(primary);

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
