'use strict';
/**
 * ============================================================
 * N.E.X.A Pulse Monitor — Single-User Auth, Session & Audit Service
 *
 * - Zero external auth dependencies (100% native node:crypto).
 * - Password hashing: scrypt (N=16384, r=8, p=1) + timingSafeEqual.
 * - Server-side session cookies (HttpOnly; Secure; SameSite=Strict; Path=/monitor),
 *   max 4 active sessions, 12h TTL (24h hard ceiling).
 * - Brute-force defense: max 5 failures per IP in 15m -> 15m lockout (HTTP 429)
 *   + Security Audit entry + proactive Mobile Bridge/Telegram alert.
 * - CSRF protection: strict Origin allowlist + custom header `X-Nexa-Monitor: 1`.
 * ============================================================
 */

const crypto = require('crypto');
const env = require('../config/env');
const { buildAllowedOrigins } = require('../utils/cors_config');
const { sanitizeLogToken, redactSecrets } = require('../utils/logger');

const COOKIE_NAME = 'nexa_mon_sid';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;

const DEFAULT_SESSION_TTL_MS = 12 * 3600_000;
const MAX_SESSION_LIFETIME_MS = 24 * 3600_000;
const MAX_ACTIVE_SESSIONS = 4;

const FAIL_WINDOW_MS = 15 * 60_000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60_000;
const MAX_IP_BUCKETS = 512;
const MAX_AUDIT_ENTRIES = 50;

// Dummy hash used so invalid usernames still execute scrypt (constant-time defense)
const DUMMY_SCRYPT_HASH = 'scrypt$16384$8$1$00112233445566778899aabbccddeeff$00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

function sha256Buf(str) {
  return crypto.createHash('sha256').update(String(str || ''), 'utf8').digest();
}

function safeStringEqual(a, b) {
  return crypto.timingSafeEqual(sha256Buf(a), sha256Buf(b));
}

function hashPassword(plainPassword, saltHex = null) {
  const pwd = String(plainPassword || '');
  if (pwd.length < 1) throw new Error('Password cannot be empty');
  const salt = saltHex
    ? Buffer.from(String(saltHex), 'hex')
    : crypto.randomBytes(16);
  const derived = crypto.scryptSync(pwd, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function verifyPasswordHash(plainPassword, storedHash) {
  try {
    const parts = String(storedHash || '').trim().split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const saltHex = parts[4];
    const keyHex = parts[5];

    if (!Number.isInteger(N) || N < 1024 || N > 65536) return false;
    if (!Number.isInteger(r) || r < 1 || r > 16) return false;
    if (!Number.isInteger(p) || p < 1 || p > 4) return false;
    if (!/^[0-9a-f]{16,64}$/i.test(saltHex) || !/^[0-9a-f]{64,128}$/i.test(keyHex)) return false;

    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(keyHex, 'hex');
    const actual = crypto.scryptSync(String(plainPassword || ''), salt, expected.length, { N, r, p });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (_) {
    return false;
  }
}

function parseCookieHeader(cookieHeader) {
  const map = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return map;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name && value) map[name] = value;
  }
  return map;
}

function compactUserAgent(rawUa) {
  const ua = String(rawUa || '').trim();
  if (!ua) return 'Unknown browser';
  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  let os = '';
  if (/Windows NT 10|Windows NT 11/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return os ? `${browser} on ${os}` : browser;
}

class MonitorAuthService {
  /**
   * @param {object} [options]
   * @param {string} [options.username]
   * @param {string} [options.passwordHash]
   * @param {import('./alert_engine').AlertEngine} [options.alertEngine]
   * @param {string[]} [options.allowedOrigins]
   * @param {number} [options.sessionTtlMs]
   * @param {() => number} [options.nowFn]
   */
  constructor(options = {}) {
    this._explicitUser = options.username;
    this._explicitPassHash = options.passwordHash;
    this.alertEngine = options.alertEngine || null;
    this._explicitAllowedOrigins = Array.isArray(options.allowedOrigins) ? options.allowedOrigins : null;
    this.sessionTtlMs = Math.max(60_000, Number(options.sessionTtlMs) || DEFAULT_SESSION_TTL_MS);
    this.nowFn = typeof options.nowFn === 'function' ? options.nowFn : () => Date.now();

    this.sessions = new Map();     // sessionId -> session object
    this.failState = new Map();    // ip -> { fails: number[], lockedUntil: number }
    this.auditLog = [];            // bounded ring (MAX_AUDIT_ENTRIES)
  }

  _getConfiguredCredentials() {
    const username = String(
      this._explicitUser !== undefined
        ? this._explicitUser
        : (process.env.NEXA_MONITOR_USER || env.NEXA_MONITOR_USER || '')
    ).trim();
    const passHash = String(
      this._explicitPassHash !== undefined
        ? this._explicitPassHash
        : (process.env.NEXA_MONITOR_PASS_HASH || env.NEXA_MONITOR_PASS_HASH || '')
    ).trim();
    return { username, passHash };
  }

  isConfigured() {
    const { username, passHash } = this._getConfiguredCredentials();
    return Boolean(username && passHash && passHash.startsWith('scrypt$'));
  }

  getAllowedOrigins() {
    if (this._explicitAllowedOrigins) {
      return this._explicitAllowedOrigins.map(o => String(o).trim().toLowerCase());
    }
    return buildAllowedOrigins({ ...env, ...process.env });
  }

  isAllowedOrigin(origin) {
    const clean = String(origin || '').trim().toLowerCase().replace(/\/+$/, '');
    if (!clean) return false;
    return this.getAllowedOrigins().includes(clean);
  }

  recordAudit(event, detail, meta = {}) {
    const entry = {
      ts: this.nowFn(),
      event: sanitizeLogToken(event, 32),
      severity: ['info', 'warn', 'error'].includes(meta.severity) ? meta.severity : 'info',
      ip: sanitizeLogToken(meta.ip || '-', 64),
      detail: redactSecrets(String(detail || '')).replace(/[\r\n]+/g, ' ').slice(0, 200)
    };
    this.auditLog.push(entry);
    if (this.auditLog.length > MAX_AUDIT_ENTRIES) {
      this.auditLog.splice(0, this.auditLog.length - MAX_AUDIT_ENTRIES);
    }
    console.log(`[NEXA-AUTH] MONITOR_AUDIT event=${entry.event} ip=${entry.ip} detail="${entry.detail}"`);
    return entry;
  }

  getAuditLog() {
    return this.auditLog.slice().reverse();
  }

  sweepExpired() {
    const now = this.nowFn();
    for (const [sid, s] of this.sessions.entries()) {
      if (now >= s.expiresAt || now >= s.hardExpiresAt) {
        this.sessions.delete(sid);
      }
    }
    for (const [ip, state] of this.failState.entries()) {
      const recent = state.fails.filter(ts => now - ts < FAIL_WINDOW_MS);
      if (recent.length === 0 && now >= state.lockedUntil) {
        this.failState.delete(ip);
      } else {
        state.fails = recent;
      }
    }
  }

  _checkLockout(ip) {
    const now = this.nowFn();
    const state = this.failState.get(ip);
    if (!state) return { locked: false, retryAfterSec: 0 };
    if (state.lockedUntil > now) {
      return {
        locked: true,
        retryAfterSec: Math.max(1, Math.ceil((state.lockedUntil - now) / 1000))
      };
    }
    if (state.lockedUntil > 0 && now >= state.lockedUntil) {
      state.lockedUntil = 0;
      state.fails = state.fails.filter(ts => now - ts < FAIL_WINDOW_MS);
      if (state.fails.length === 0) this.failState.delete(ip);
    }
    return { locked: false, retryAfterSec: 0 };
  }

  _recordLoginFailure(ip, reason) {
    const now = this.nowFn();
    const safeIp = sanitizeLogToken(ip || 'unknown', 64);
    let state = this.failState.get(safeIp);
    if (!state) {
      if (this.failState.size >= MAX_IP_BUCKETS) {
        const oldest = this.failState.keys().next().value;
        if (oldest !== undefined) this.failState.delete(oldest);
      }
      state = { fails: [], lockedUntil: 0 };
      this.failState.set(safeIp, state);
    }
    state.fails = state.fails.filter(ts => now - ts < FAIL_WINDOW_MS);
    state.fails.push(now);

    if (state.fails.length >= MAX_FAILED_ATTEMPTS) {
      state.lockedUntil = now + LOCKOUT_MS;
      this.recordAudit('AUTH_LOCKOUT', `IP locked for 15m after ${state.fails.length} failed logins (${reason})`, {
        ip: safeIp,
        severity: 'error'
      });
      if (this.alertEngine && typeof this.alertEngine.notifyImmediate === 'function') {
        this.alertEngine.notifyImmediate(
          `auth_lockout_${safeIp}`,
          `[N.E.X.A Pulse Security] Login brute-force blocked: IP ${safeIp} locked for 15 minutes after ${state.fails.length} failed attempts.`,
          'P0'
        ).catch(() => {});
      }
      return { locked: true, retryAfterSec: Math.ceil(LOCKOUT_MS / 1000) };
    }

    this.recordAudit('AUTH_LOGIN_FAIL', `Failed login attempt ${state.fails.length}/${MAX_FAILED_ATTEMPTS} (${reason})`, {
      ip: safeIp,
      severity: 'warn'
    });
    return { locked: false, retryAfterSec: 0 };
  }

  login(username, password, meta = {}) {
    this.sweepExpired();
    const safeIp = sanitizeLogToken(meta.ip || 'unknown', 64);

    if (!this.isConfigured()) {
      return {
        ok: false,
        status: 503,
        code: 'MONITOR_AUTH_NOT_CONFIGURED',
        message: 'N.E.X.A Pulse Monitor credentials are not configured on server.'
      };
    }

    const lock = this._checkLockout(safeIp);
    if (lock.locked) {
      return {
        ok: false,
        status: 429,
        code: 'LOCKED_OUT',
        retryAfterSec: lock.retryAfterSec,
        message: `Too many failed login attempts. Try again in ${Math.ceil(lock.retryAfterSec / 60)} minute(s).`
      };
    }

    const { username: expectedUser, passHash } = this._getConfiguredCredentials();
    const cleanUser = String(username || '').trim();
    const cleanPass = String(password || '');

    const userMatch = safeStringEqual(cleanUser, expectedUser);
    // Always run scrypt even when username fails to prevent user enumeration timing leaks
    const passMatch = verifyPasswordHash(cleanPass, userMatch ? passHash : DUMMY_SCRYPT_HASH);

    if (!userMatch || !passMatch) {
      const failRes = this._recordLoginFailure(safeIp, 'invalid_credentials');
      if (failRes.locked) {
        return {
          ok: false,
          status: 429,
          code: 'LOCKED_OUT',
          retryAfterSec: failRes.retryAfterSec,
          message: 'Too many failed login attempts. Access temporarily locked for 15 minutes.'
        };
      }
      return {
        ok: false,
        status: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password.'
      };
    }

    // Clear failure state on successful login
    this.failState.delete(safeIp);

    // Enforce max concurrent sessions by evicting oldest
    while (this.sessions.size >= MAX_ACTIVE_SESSIONS) {
      const oldestKey = this.sessions.keys().next().value;
      if (oldestKey === undefined) break;
      this.sessions.delete(oldestKey);
    }

    const now = this.nowFn();
    const sessionId = crypto.randomBytes(32).toString('hex');
    const session = {
      id: sessionId,
      username: expectedUser,
      ip: safeIp,
      userAgent: compactUserAgent(meta.userAgent),
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + this.sessionTtlMs,
      hardExpiresAt: now + MAX_SESSION_LIFETIME_MS
    };
    this.sessions.set(sessionId, session);

    this.recordAudit('AUTH_LOGIN_OK', `Signed in (${session.userAgent})`, { ip: safeIp, severity: 'info' });
    return {
      ok: true,
      status: 200,
      sessionId,
      session: this._publicSession(session, sessionId)
    };
  }

  getSessionFromCookieHeader(cookieHeader) {
    this.sweepExpired();
    const cookies = parseCookieHeader(cookieHeader);
    const sid = cookies[COOKIE_NAME];
    if (!sid || !/^[0-9a-f]{64}$/.test(sid)) return null;
    const session = this.sessions.get(sid);
    if (!session) return null;
    const now = this.nowFn();
    if (now >= session.expiresAt || now >= session.hardExpiresAt) {
      this.sessions.delete(sid);
      return null;
    }
    session.lastSeenAt = now;
    return session;
  }

  logout(sessionId, meta = {}) {
    if (!sessionId) return false;
    const existed = this.sessions.delete(sessionId);
    if (existed) {
      this.recordAudit('AUTH_LOGOUT', 'Operator signed out', { ip: meta.ip || '-', severity: 'info' });
    }
    return existed;
  }

  revokeAllSessions(meta = {}) {
    const count = this.sessions.size;
    this.sessions.clear();
    this.recordAudit('AUTH_REVOKE_ALL', `Revoked ${count} active session(s)`, { ip: meta.ip || '-', severity: 'warn' });
    return count;
  }

  listSessions(currentSessionId = null) {
    this.sweepExpired();
    const now = this.nowFn();
    return Array.from(this.sessions.values()).map(s => this._publicSession(s, currentSessionId, now));
  }

  _publicSession(session, currentSessionId, now = this.nowFn()) {
    const remainingMs = Math.max(0, Math.min(session.expiresAt, session.hardExpiresAt) - now);
    return {
      idPrefix: session.id.slice(0, 8),
      username: session.username,
      ip: session.ip,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: Math.min(session.expiresAt, session.hardExpiresAt),
      ttlSec: Math.floor(remainingMs / 1000),
      current: session.id === currentSessionId
    };
  }

  buildSetCookieHeader(sessionId, isSecure = true) {
    const maxAgeSec = Math.floor(this.sessionTtlMs / 1000);
    const parts = [
      `${COOKIE_NAME}=${sessionId}`,
      'Path=/monitor',
      'HttpOnly',
      'SameSite=Strict',
      `Max-Age=${maxAgeSec}`
    ];
    if (isSecure) parts.push('Secure');
    return parts.join('; ');
  }

  buildClearCookieHeader(isSecure = true) {
    const parts = [
      `${COOKIE_NAME}=`,
      'Path=/monitor',
      'HttpOnly',
      'SameSite=Strict',
      'Max-Age=0'
    ];
    if (isSecure) parts.push('Secure');
    return parts.join('; ');
  }

  isSecureRequest(req) {
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') return true;
    if (req && req.secure) return true;
    const xfp = String(req && req.headers ? (req.headers['x-forwarded-proto'] || '') : '').toLowerCase();
    return xfp.includes('https');
  }

  /**
   * CSRF protection middleware for mutating routes:
   * - Requires custom header `X-Nexa-Monitor: 1`
   * - Validates Origin header against strict allowlist (when present; required for browser requests)
   */
  requireCsrf() {
    return (req, res, next) => {
      const marker = String(req.headers['x-nexa-monitor'] || '').trim();
      if (marker !== '1') {
        return res.status(403).json({ error: 'Forbidden: Missing CSRF verification header' });
      }
      const origin = String(req.headers.origin || '').trim();
      if (origin && !this.isAllowedOrigin(origin)) {
        return res.status(403).json({ error: 'Forbidden: Untrusted Origin' });
      }
      return next();
    };
  }

  requireAuth() {
    return (req, res, next) => {
      const session = this.getSessionFromCookieHeader(req.headers.cookie);
      if (!session) {
        return res.status(401).json({ error: 'Unauthorized: Valid monitor session required' });
      }
      req.monitorSession = session;
      return next();
    };
  }
}

module.exports = {
  MonitorAuthService,
  COOKIE_NAME,
  hashPassword,
  verifyPasswordHash,
  parseCookieHeader,
  compactUserAgent,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_MS,
  MAX_ACTIVE_SESSIONS
};
