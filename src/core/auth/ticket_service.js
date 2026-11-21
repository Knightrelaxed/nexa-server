'use strict';
/**
 * ============================================================
 * N.E.X.A Server - Challenge & Ed25519 Ticket Service
 * Implements FR-AUTH-04, 05, 06, 09, 10 & PRD Appendix C:
 * - 32-byte single-use nonce (30s TTL, max 8 pending per device, periodic sweep)
 * - Canonical signature verification: "nexa-ticket-v1\n<nonce>\n<scope>\n<sid>"
 * - Authoritative server-assigned session ID (sid) with ownership check on resume
 * - Ed25519 ticket issuance (45s TTL, claims: { scope, sid, exp, jti, dev })
 * - Per-device rate limit (5 req/min) & 15m lockout after 3 failed verifications
 *   (ticket issuance only; never blocks chat or telemetry)
 * ============================================================
 */

const fs = require('fs');
const crypto = require('crypto');
const env = require('../../config/env');
const { EnrolledDevicesStore } = require('./enrolled_devices_store');
const { sanitizeLogToken } = require('../../utils/logger');

const ALLOWED_SCOPES = new Set(['logs', 'term', 'finance']);
const MAX_PENDING_PER_DEVICE = 8;
const MAX_ACTIVE_SESSIONS_PER_DEVICE = 2; // FR-AUTH-11: 1 active + 1 resuming max per device
const MAX_GLOBAL_ACTIVE_SESSIONS = 8;
const CHALLENGE_TTL_MS = 30_000;
const TICKET_TTL_SEC = 45;
const SESSION_TTL_MS = 4 * 3600_000;
const RATE_WINDOW_MS = 60_000;
const MAX_TICKET_REQ_PER_MIN = 5;
const MAX_VERIFY_REQ_PER_MIN = 15;
const MAX_CONSECUTIVE_FAILS = 3;
const LOCKOUT_DURATION_MS = 15 * 60_000;
const UNKNOWN_BUCKET_KEY = '__unknown__';

function buildCanonicalTicketMessage(nonce, scope, sid) {
  return Buffer.from(`nexa-ticket-v1\n${nonce}\n${scope}\n${sid || ''}`, 'utf8');
}

class TicketService {
  constructor(options = {}) {
    this.deviceStore = options.deviceStore || new EnrolledDevicesStore({
      filePath: options.enrolledPath || env.NEXA_ENROLLED_DEVICES_PATH
    });
    this.privKeyPath = options.privKeyPath || env.NEXA_TICKET_PRIV_PATH;
    this.nowFn = options.nowFn || (() => Date.now());
    this._serverPrivKey = options.serverPrivKey || null;
    this._explicitTermEnabled = options.termEnabled;
    this.termKillSwitchFile = options.termKillSwitchFile || env.NEXA_TERM_KILL_SWITCH_FILE || '/opt/nexa/etc/terminal.enabled';

    this.pendingChallenges = new Map(); // nonce -> { deviceId, scope, sid, exp, isResume, sessionExp }
    this.activeSessions = new Map();    // sid -> { deviceId, scope, exp }
    this.requestBuckets = new Map();    // deviceId -> number[] (timestamps in RATE_WINDOW_MS)
    this.verifyBuckets = new Map();     // deviceId -> number[] (CHALLENGE_RESP rate limit)
    this.failureState = new Map();      // deviceId -> { count, lockedUntil, lastFailAt }

    this._sweepTimer = setInterval(() => this.sweepExpired(), 10_000);
    if (typeof this._sweepTimer.unref === 'function') {
      this._sweepTimer.unref();
    }
  }

  _isTermEnabled() {
    if (this._explicitTermEnabled !== undefined) {
      return Boolean(this._explicitTermEnabled);
    }
    if (env.NEXA_TERM_ENABLED) return true;
    const rawEnv = String(process.env.NEXA_TERM_ENABLED || process.env.NEXA_TERMINAL_ENABLED || '').trim().toLowerCase();
    if (rawEnv === 'true' || rawEnv === '1' || rawEnv === 'yes') return true;
    try {
      return fs.existsSync(this.termKillSwitchFile);
    } catch (_) {
      return false;
    }
  }

  _getServerPrivateKey() {
    if (this._serverPrivKey) return this._serverPrivKey;
    const pem = fs.readFileSync(this.privKeyPath, 'utf8');
    this._serverPrivKey = crypto.createPrivateKey(pem);
    if (this._serverPrivKey.asymmetricKeyType !== 'ed25519') {
      this._serverPrivKey = null;
      throw new Error('SERVER_TICKET_KEY_MUST_BE_ED25519');
    }
    return this._serverPrivKey;
  }

  sweepExpired() {
    const now = this.nowFn();
    for (const [nonce, entry] of this.pendingChallenges.entries()) {
      if (now > entry.exp) this.pendingChallenges.delete(nonce);
    }
    for (const [sid, session] of this.activeSessions.entries()) {
      if (now > session.exp) this.activeSessions.delete(sid);
    }
    for (const [devId, timestamps] of this.requestBuckets.entries()) {
      const kept = timestamps.filter(ts => now - ts < RATE_WINDOW_MS);
      if (kept.length === 0) this.requestBuckets.delete(devId);
      else this.requestBuckets.set(devId, kept);
    }
    for (const [devId, timestamps] of this.verifyBuckets.entries()) {
      const kept = timestamps.filter(ts => now - ts < RATE_WINDOW_MS);
      if (kept.length === 0) this.verifyBuckets.delete(devId);
      else this.verifyBuckets.set(devId, kept);
    }
    for (const [devId, state] of this.failureState.entries()) {
      if (state.lockedUntil > 0 && now >= state.lockedUntil) {
        this.failureState.delete(devId);
      } else if (state.lockedUntil === 0 && state.lastFailAt && now - state.lastFailAt > LOCKOUT_DURATION_MS) {
        this.failureState.delete(devId);
      }
    }
  }

  _bucketKeyFor(cleanId) {
    if (!cleanId) return UNKNOWN_BUCKET_KEY;
    const dev = this.deviceStore.getDevice(cleanId);
    return dev ? cleanId : UNKNOWN_BUCKET_KEY;
  }

  _checkLockout(deviceId) {
    const now = this.nowFn();
    const state = this.failureState.get(deviceId);
    if (state && state.lockedUntil > now) {
      return {
        locked: true,
        retryAfterSec: Math.ceil((state.lockedUntil - now) / 1000)
      };
    }
    if (state && state.lockedUntil > 0 && now >= state.lockedUntil) {
      this.failureState.delete(deviceId);
    }
    return { locked: false, retryAfterSec: 0 };
  }

  _recordFailure(deviceId, reason) {
    const now = this.nowFn();
    const key = this._bucketKeyFor(deviceId);
    const prev = this.failureState.get(key) || { count: 0, lockedUntil: 0, lastFailAt: now };
    const nextCount = prev.count + 1;
    let lockedUntil = prev.lockedUntil;
    if (key !== UNKNOWN_BUCKET_KEY && nextCount >= MAX_CONSECUTIVE_FAILS) {
      lockedUntil = now + LOCKOUT_DURATION_MS;
      console.warn(`[NEXA-AUTH] LOCKED_OUT device=${deviceId} failures=${nextCount} duration_min=15 reason=${reason}`);
    } else {
      console.warn(`[NEXA-AUTH] VERIFY_FAILED device=${deviceId} failures=${nextCount}/${MAX_CONSECUTIVE_FAILS} reason=${reason}`);
    }
    this.failureState.set(key, { count: nextCount, lockedUntil, lastFailAt: now });
  }

  _clearFailures(deviceId) {
    this.failureState.delete(deviceId);
  }

  _consumeRateLimit(bucketKey, maxPerMin = MAX_TICKET_REQ_PER_MIN, bucketMap = this.requestBuckets) {
    const now = this.nowFn();
    const prev = bucketMap.get(bucketKey) || [];
    const active = prev.filter(ts => now - ts < RATE_WINDOW_MS);
    if (active.length >= maxPerMin) {
      bucketMap.set(bucketKey, active);
      return false;
    }
    active.push(now);
    bucketMap.set(bucketKey, active);
    return true;
  }

  /**
   * Step 1: Issue a 32-byte single-use challenge nonce for an enrolled device.
   * @param {string} deviceId
   * @param {string} scope - 'logs' | 'term' | 'finance'
   * @param {string} [resumeSid]
   * @param {{ clientIp?: string }} [meta]
   */
  makeChallenge(deviceId, scope, resumeSid = '', meta = {}) {
    const cleanId = String(deviceId || '').trim();
    const safeLogId = sanitizeLogToken(cleanId, 64);
    const cleanScope = String(scope || '').trim().toLowerCase();
    const clientIp = sanitizeLogToken(meta.clientIp || 'unknown', 64);

    if (!cleanId) {
      return { ok: false, code: 'INVALID_DEVICE', message: 'Device ID tidak valid.' };
    }
    if (!ALLOWED_SCOPES.has(cleanScope)) {
      return { ok: false, code: 'INVALID_SCOPE', message: `Scope tidak dikenal: ${cleanScope}` };
    }

    // N-M1: Enforce terminal kill switch before challenge issuance
    if (cleanScope === 'term' && !this._isTermEnabled()) {
      console.warn(`[NEXA-AUTH] TICKET_AUDIT ip=${clientIp} device=${safeLogId} scope=term jti=- result=FEATURE_DISABLED`);
      return {
        ok: false,
        code: 'FEATURE_DISABLED',
        message: 'Terminal inspeksi sedang dinonaktifkan oleh kill switch server.'
      };
    }

    const device = this.deviceStore.getDevice(cleanId);
    const bucketKey = device ? cleanId : UNKNOWN_BUCKET_KEY;

    if (device) {
      const lock = this._checkLockout(cleanId);
      if (lock.locked) {
        console.warn(`[NEXA-AUTH] TICKET_AUDIT ip=${clientIp} device=${safeLogId} scope=${cleanScope} jti=- result=LOCKED_OUT`);
        return {
          ok: false,
          code: 'LOCKED_OUT',
          retryAfterSec: lock.retryAfterSec,
          message: `Penerbitan tiket terkunci sementara (${lock.retryAfterSec} dtk).`
        };
      }
    }

    // N-H4: Unknown/spoofed device IDs share bounded bucket so maps cannot grow unbounded
    const rateCap = device ? MAX_TICKET_REQ_PER_MIN : 30;
    if (!this._consumeRateLimit(bucketKey, rateCap)) {
      console.warn(`[NEXA-AUTH] TICKET_AUDIT ip=${clientIp} device=${safeLogId} scope=${cleanScope} jti=- result=RATE_LIMITED`);
      return {
        ok: false,
        code: 'RATE_LIMITED',
        message: 'Terlalu banyak permintaan tiket (maks 5/menit).'
      };
    }

    if (!device || device.status !== 'ACTIVE') {
      console.warn(`[NEXA-AUTH] TICKET_AUDIT ip=${clientIp} device=${safeLogId} scope=${cleanScope} jti=- result=DEVICE_NOT_ENROLLED`);
      return {
        ok: false,
        code: 'DEVICE_NOT_ENROLLED',
        message: 'Perangkat belum terdaftar atau telah dicabut. Jalankan nexa-enroll di server.'
      };
    }

    this.sweepExpired();
    let pendingForDevice = 0;
    for (const entry of this.pendingChallenges.values()) {
      if (entry.deviceId === cleanId) pendingForDevice++;
    }
    if (pendingForDevice >= MAX_PENDING_PER_DEVICE) {
      console.warn(`[NEXA-AUTH] TICKET_AUDIT ip=${clientIp} device=${safeLogId} scope=${cleanScope} jti=- result=TOO_MANY_PENDING`);
      return {
        ok: false,
        code: 'TOO_MANY_PENDING',
        message: 'Terlalu banyak tantangan tertunda untuk perangkat ini.'
      };
    }

    let sid = '';
    let isResume = false;
    let sessionExp = 0;
    const cleanResume = String(resumeSid || '').trim();
    if (cleanScope === 'term') {
      if (cleanResume) {
        const existing = this.activeSessions.get(cleanResume);
        if (!existing || existing.deviceId !== cleanId || this.nowFn() > existing.exp) {
          console.warn(`[NEXA-AUTH] TICKET_AUDIT ip=${clientIp} device=${safeLogId} scope=term jti=- result=INVALID_RESUME_SID`);
          return {
            ok: false,
            code: 'INVALID_RESUME_SID',
            message: 'Sesi terminal tidak ditemukan atau bukan milik perangkat ini.'
          };
        }
        sid = cleanResume;
        isResume = true;
        sessionExp = existing.exp;
      } else {
        // FR-AUTH-11: Enforce per-device & global terminal session cap in Node (evict oldest if device starts fresh)
        let deviceSessions = [];
        for (const [k, s] of this.activeSessions.entries()) {
          if (s.deviceId === cleanId && this.nowFn() <= s.exp) {
            deviceSessions.push([k, s]);
          }
        }
        if (deviceSessions.length >= MAX_ACTIVE_SESSIONS_PER_DEVICE) {
          deviceSessions.sort((a, b) => a[1].exp - b[1].exp);
          this.activeSessions.delete(deviceSessions[0][0]);
        }
        if (this.activeSessions.size >= MAX_GLOBAL_ACTIVE_SESSIONS) {
          const oldestSid = this.activeSessions.keys().next().value;
          if (oldestSid) this.activeSessions.delete(oldestSid);
        }
        sid = crypto.randomBytes(16).toString('base64url');
      }
    }

    const nonce = crypto.randomBytes(32).toString('base64url');
    const exp = this.nowFn() + CHALLENGE_TTL_MS;
    this.pendingChallenges.set(nonce, {
      deviceId: cleanId,
      scope: cleanScope,
      sid,
      exp,
      isResume,
      sessionExp
    });

    console.log(`[NEXA-AUTH] CHALLENGE_ISSUED ip=${clientIp} device=${safeLogId} scope=${cleanScope} ttl=30s`);
    return {
      ok: true,
      nonce,
      scope: cleanScope,
      sid,
      exp
    };
  }

  /**
   * Step 2: Verify ECDSA P-256 signature over canonical message and issue Ed25519 ticket (45s TTL).
   * @param {string} deviceId
   * @param {string} nonce
   * @param {Buffer|string} signatureDer - DER-encoded ECDSA signature (Buffer or Base64 string)
   * @param {{ clientIp?: string }} [meta]
   */
  issueTicket(deviceId, nonce, signatureDer, meta = {}) {
    const cleanId = String(deviceId || '').trim();
    const safeLogId = sanitizeLogToken(cleanId, 64);
    const cleanNonce = String(nonce || '').trim();
    const clientIp = sanitizeLogToken(meta.clientIp || 'unknown', 64);

    // M-3: Rate-limit CHALLENGE_RESP per device / unknown bucket
    const verifyBucketKey = this._bucketKeyFor(cleanId);
    const verifyCap = verifyBucketKey === UNKNOWN_BUCKET_KEY ? 40 : MAX_VERIFY_REQ_PER_MIN;
    if (!this._consumeRateLimit(verifyBucketKey, verifyCap, this.verifyBuckets)) {
      console.warn(`[NEXA-AUTH] TICKET_AUDIT ip=${clientIp} device=${safeLogId} scope=- jti=- result=RATE_LIMITED`);
      return {
        ok: false,
        code: 'RATE_LIMITED',
        message: 'Terlalu banyak percobaan verifikasi tiket.'
      };
    }

    const lock = this._checkLockout(cleanId);
    if (lock.locked) {
      console.warn(`[NEXA-AUTH] TICKET_AUDIT ip=${clientIp} device=${safeLogId} scope=- jti=- result=LOCKED_OUT`);
      return {
        ok: false,
        code: 'LOCKED_OUT',
        retryAfterSec: lock.retryAfterSec,
        message: `Penerbitan tiket terkunci sementara (${lock.retryAfterSec} dtk).`
      };
    }

    const pending = this.pendingChallenges.get(cleanNonce);
    if (!pending) {
      this._recordFailure(cleanId, 'NONCE_UNKNOWN_OR_REPLAYED');
      console.warn(`[NEXA-AUTH] TICKET_AUDIT ip=${clientIp} device=${safeLogId} scope=- jti=- result=INVALID_NONCE`);
      return { ok: false, code: 'INVALID_NONCE', message: 'Nonce tidak valid atau sudah digunakan.' };
    }

    // M-3: Verify deviceId BEFORE consuming victim's nonce
    if (pending.deviceId !== cleanId) {
      this._recordFailure(cleanId, 'DEVICE_MISMATCH');
      console.warn(`[NEXA-AUTH] TICKET_AUDIT ip=${clientIp} device=${safeLogId} scope=${pending.scope} jti=- result=DEVICE_MISMATCH`);
      return { ok: false, code: 'DEVICE_MISMATCH', message: 'Perangkat tidak cocok dengan tantangan.' };
    }

    // Consume nonce immediately once ownership matches (single-use)
    this.pendingChallenges.delete(cleanNonce);

    // M-3: Re-check terminal kill switch right before minting a term ticket
    if (pending.scope === 'term' && !this._isTermEnabled()) {
      console.warn(`[NEXA-AUTH] TICKET_AUDIT ip=${clientIp} device=${safeLogId} scope=term jti=- result=FEATURE_DISABLED`);
      return {
        ok: false,
        code: 'FEATURE_DISABLED',
        message: 'Terminal inspeksi sedang dinonaktifkan oleh kill switch server.'
      };
    }

    if (this.nowFn() > pending.exp) {
      this._recordFailure(cleanId, 'NONCE_EXPIRED');
      console.warn(`[NEXA-AUTH] TICKET_AUDIT ip=${clientIp} device=${safeLogId} scope=${pending.scope} jti=- result=NONCE_EXPIRED`);
      return { ok: false, code: 'NONCE_EXPIRED', message: 'Tantangan biometrik sudah kedaluwarsa.' };
    }

    const device = this.deviceStore.getDevice(cleanId);
    if (!device || device.status !== 'ACTIVE') {
      this._recordFailure(cleanId, 'DEVICE_INACTIVE');
      console.warn(`[NEXA-AUTH] TICKET_AUDIT ip=${clientIp} device=${safeLogId} scope=${pending.scope} jti=- result=DEVICE_NOT_ENROLLED`);
      return { ok: false, code: 'DEVICE_NOT_ENROLLED', message: 'Perangkat tidak aktif.' };
    }

    const sigBuf = Buffer.isBuffer(signatureDer)
      ? signatureDer
      : Buffer.from(String(signatureDer || '').trim(), 'base64');

    if (sigBuf.length < 32 || sigBuf.length > 128) {
      this._recordFailure(cleanId, 'BAD_SIGNATURE_LENGTH');
      console.warn(`[NEXA-AUTH] TICKET_AUDIT ip=${clientIp} device=${safeLogId} scope=${pending.scope} jti=- result=INVALID_SIGNATURE`);
      return { ok: false, code: 'INVALID_SIGNATURE', message: 'Format tanda tangan tidak valid.' };
    }

    const canonical = buildCanonicalTicketMessage(cleanNonce, pending.scope, pending.sid);
    let isValid = false;
    try {
      isValid = crypto.verify(
        'sha256',
        canonical,
        { key: device.publicKey, dsaEncoding: 'der' },
        sigBuf
      );
    } catch (_) {
      isValid = false;
    }

    if (!isValid) {
      this._recordFailure(cleanId, 'SIGNATURE_VERIFICATION_FAILED');
      console.warn(`[NEXA-AUTH] TICKET_AUDIT ip=${clientIp} device=${safeLogId} scope=${pending.scope} jti=- result=INVALID_SIGNATURE`);
      return { ok: false, code: 'INVALID_SIGNATURE', message: 'Verifikasi tanda tangan ECDSA gagal.' };
    }

    this._clearFailures(cleanId);

    // N-M2: Prevent 4h session limit bypass on resume boundary
    if (pending.scope === 'term' && pending.isResume) {
      const existing = this.activeSessions.get(pending.sid);
      if (!existing || existing.deviceId !== cleanId || this.nowFn() > existing.exp || this.nowFn() > pending.sessionExp) {
        console.warn(`[NEXA-AUTH] TICKET_AUDIT ip=${clientIp} device=${safeLogId} scope=term jti=- result=SESSION_EXPIRED`);
        return {
          ok: false,
          code: 'SESSION_EXPIRED',
          message: 'Batas durasi sesi terminal 4 jam telah berakhir. Mulai sesi baru.'
        };
      }
    }

    // N-H5: Load signing key BEFORE mutating activeSessions so failures remain clean & atomic
    let serverPriv;
    try {
      serverPriv = this._getServerPrivateKey();
    } catch (keyErr) {
      console.error(`[NEXA-AUTH] TICKET_AUDIT ip=${clientIp} device=${safeLogId} scope=${pending.scope} jti=- result=SERVER_KEY_UNAVAILABLE err=${keyErr.message}`);
      return {
        ok: false,
        code: 'SERVER_KEY_UNAVAILABLE',
        message: 'Kunci penandatanganan tiket server belum tersedia.'
      };
    }

    if (pending.scope === 'term' && pending.sid && !pending.isResume && !this.activeSessions.has(pending.sid)) {
      this.activeSessions.set(pending.sid, {
        deviceId: cleanId,
        scope: 'term',
        exp: this.nowFn() + SESSION_TTL_MS
      });
    }

    const expSec = Math.floor(this.nowFn() / 1000) + TICKET_TTL_SEC;
    const jti = crypto.randomBytes(12).toString('base64url');
    const payloadObj = {
      scope: pending.scope,
      sid: pending.sid,
      exp: expSec,
      jti,
      dev: cleanId
    };
    const payloadBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8');
    let ticketSig;
    try {
      ticketSig = crypto.sign(null, payloadBuf, serverPriv);
    } catch (signErr) {
      console.error(`[NEXA-AUTH] TICKET_AUDIT ip=${clientIp} device=${safeLogId} scope=${pending.scope} jti=${jti} result=SIGN_ERROR err=${signErr.message}`);
      return {
        ok: false,
        code: 'TICKET_SIGN_ERROR',
        message: 'Gagal menandatangani tiket autentikasi.'
      };
    }
    const ticket = `${payloadBuf.toString('base64url')}.${ticketSig.toString('base64url')}`;

    console.log(`[NEXA-AUTH] TICKET_AUDIT ip=${clientIp} device=${safeLogId} scope=${pending.scope} jti=${jti} result=ISSUED ttl=${TICKET_TTL_SEC}s`);
    return {
      ok: true,
      ticket,
      scope: pending.scope,
      sid: pending.sid,
      exp: expSec
    };
  }

  destroy() {
    if (this._sweepTimer) {
      clearInterval(this._sweepTimer);
      this._sweepTimer = null;
    }
  }
}

let singletonInstance = null;

function getTicketService() {
  if (!singletonInstance) {
    singletonInstance = new TicketService();
  }
  return singletonInstance;
}

module.exports = {
  TicketService,
  getTicketService,
  buildCanonicalTicketMessage,
  ALLOWED_SCOPES,
  MAX_PENDING_PER_DEVICE,
  CHALLENGE_TTL_MS,
  TICKET_TTL_SEC,
  MAX_TICKET_REQ_PER_MIN,
  MAX_CONSECUTIVE_FAILS,
  LOCKOUT_DURATION_MS
};
