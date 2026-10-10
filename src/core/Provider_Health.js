'use strict';
// =====================================================================
// Provider_Health.js - Cross-request AI Provider Health & Breaker State
// Features:
//   - Retry-After header / message regex parsing
//   - Exponential reopen backoff for server 5xx outages
//   - Single half-open probe
//   - Key round-robin rotation (prevents burning Key #1 first)
//   - Daily quota detection (30m cooldown for RPD)
//   - Deep snapshot() for /health monitoring
// =====================================================================

const DEFAULTS = {
  failThreshold: 2,            // consecutive hard failures before a group opens
  baseOpenMs: 30 * 1000,       // first open window (30s)
  maxOpenMs: 10 * 60 * 1000,   // cap for exponential backoff (10m)
  default429Ms: 60 * 1000,     // key cooldown when no Retry-After is available (60s)
  dailyQuotaMs: 30 * 60 * 1000,// daily quota exhausted (30m)
  badKeyMs: 10 * 60 * 1000,    // 401/403 invalid key cooldown (10m)
  probeTimeoutMs: 30 * 1000    // half-open probe timeout (30s)
};

let cfg = { ...DEFAULTS };
let clock = () => Date.now();
const groups = new Map();       // group -> { fails, openUntil, backoffMs, probingSince }
const keyCooldown = new Map();  // `${group}#${keyId}` -> resume timestamp
const cursors = new Map();      // group -> next start index for round-robin

function configure(overrides = {}) { cfg = { ...cfg, ...overrides }; }

function _group(name) {
  let g = groups.get(name);
  if (!g) {
    g = { fails: 0, openUntil: 0, backoffMs: cfg.baseOpenMs, probingSince: 0 };
    groups.set(name, g);
  }
  return g;
}
const _kid = (group, keyId) => `${group}#${keyId}`;

/**
 * Ask permission to call a provider. Returns false when the key is cooling
 * down or the group is open. In half-open state exactly one caller is let
 * through. Pass { force: true } for the "everything is blocked" last resort.
 */
function acquire(group, keyId = '0', { force = false } = {}) {
  if (force) return true;
  const t = clock();
  if ((keyCooldown.get(_kid(group, keyId)) || 0) > t) return false;
  const g = _group(group);
  if (g.fails >= cfg.failThreshold) {
    if (g.openUntil > t) return false;
    if (g.probingSince && t - g.probingSince < cfg.probeTimeoutMs) return false;
    g.probingSince = t; // half-open: this caller is the probe
  }
  return true;
}

function reportSuccess(group, keyId = '0') {
  const g = _group(group);
  g.fails = 0;
  g.openUntil = 0;
  g.probingSince = 0;
  g.backoffMs = cfg.baseOpenMs;
  keyCooldown.delete(_kid(group, keyId));
}

function classifyError(err) {
  if (err && err.isValidation) return 'VALIDATION';
  const status = err?.status ?? err?.response?.status;
  const msg = String(err?.message || err?.response?.data?.error?.message || err || '');
  if (status === 429 || /\b429\b|quota|rate.?limit|too many requests|resource_exhausted/i.test(msg)) {
    return /per day|daily|\bRPD\b/i.test(msg) ? 'QUOTA_DAILY' : 'RATE_LIMIT';
  }
  if (status === 401 || status === 403) return 'BAD_KEY';
  if (status === 400) return 'CLIENT_ERROR';
  return 'SERVER'; // 404 / 5xx / timeout / network
}

function retryAfterMs(err) {
  const h = err?.response?.headers;
  const raw = h && (typeof h.get === 'function' ? h.get('retry-after') : h['retry-after']);
  if (raw && !isNaN(Number(raw))) return Number(raw) * 1000;
  const m = /retry (?:in|after) ([\d.]+)\s*s/i.exec(String(err?.message || ''));
  return m ? Math.ceil(parseFloat(m[1]) * 1000) : null;
}

/** Record a failure. Returns the error class so callers can log it. */
function reportFailure(group, keyId = '0', err) {
  const kind = classifyError(err);
  const t = clock();
  const g = _group(group);
  switch (kind) {
    case 'VALIDATION':
    case 'CLIENT_ERROR':          // the provider answered: it is alive
      g.fails = 0; g.probingSince = 0;
      break;
    case 'RATE_LIMIT':
      keyCooldown.set(_kid(group, keyId), t + (retryAfterMs(err) ?? cfg.default429Ms));
      g.probingSince = 0;
      break;
    case 'QUOTA_DAILY':
      keyCooldown.set(_kid(group, keyId), t + cfg.dailyQuotaMs);
      g.probingSince = 0;
      break;
    case 'BAD_KEY':
      keyCooldown.set(_kid(group, keyId), t + cfg.badKeyMs);
      g.probingSince = 0;
      break;
    default: // SERVER
      g.fails += 1;
      g.probingSince = 0;
      if (g.fails >= cfg.failThreshold) {
        g.openUntil = t + g.backoffMs;
        g.backoffMs = Math.min(g.backoffMs * 2, cfg.maxOpenMs);
      }
  }
  return kind;
}

/** Rotate the starting key per call so key #1 is not always exhausted first. */
function orderKeys(group, count) {
  if (count <= 0) return [];
  const start = (cursors.get(group) || 0) % count;
  cursors.set(group, (start + 1) % count);
  return Array.from({ length: count }, (_, i) => (start + i) % count);
}

function snapshot() {
  const t = clock();
  return {
    groups: Object.fromEntries([...groups].map(([name, g]) => [name, {
      state: g.fails < cfg.failThreshold ? 'CLOSED' : (g.openUntil > t ? 'OPEN' : 'HALF_OPEN'),
      fails: g.fails,
      reopenInMs: Math.max(0, g.openUntil - t)
    }])),
    keysCoolingDown: [...keyCooldown]
      .filter(([, until]) => until > t)
      .map(([key, until]) => ({ key, resumeInMs: until - t }))
  };
}

function _setClock(fn) { clock = fn; }
function _reset() { groups.clear(); keyCooldown.clear(); cursors.clear(); cfg = { ...DEFAULTS }; clock = () => Date.now(); }

module.exports = {
  configure,
  acquire,
  reportSuccess,
  reportFailure,
  classifyError,
  retryAfterMs,
  orderKeys,
  snapshot,
  _setClock,
  _reset
};
