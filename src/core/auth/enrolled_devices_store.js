'use strict';
/**
 * ============================================================
 * N.E.X.A Server - Enrolled Devices Store (FR-AUTH-01, 03)
 * Manages hardware-backed ECDSA P-256 device public keys stored
 * exclusively on server-side filesystem (/etc/nexa/enrolled_devices.json)
 * and short-lived single-use enrollment codes issued by CLI nexa-enroll.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_ENROLLED_PATH = '/etc/nexa/enrolled_devices.json';
const DEFAULT_PENDING_ENROLL_PATH = '/etc/nexa/pending_enroll.json';
const ENROLL_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENROLL_FAILED_ATTEMPTS = 5;
const DEVICE_ID_RE = /^[a-zA-Z0-9._-]{3,64}$/;
const FORBIDDEN_DEVICE_IDS = new Set(['__proto__', 'constructor', 'prototype', 'toString', 'valueOf']);

/**
 * Format SHA-256 digest of SPKI DER bytes into canonical 32-octet colon hex
 * (matches Android SettingsScreen 4 rows x 8 octets).
 * @param {Buffer} spkiDerBuf
 * @returns {string}
 */
function computeSha256Fingerprint(spkiDerBuf) {
  const digestHex = crypto.createHash('sha256').update(spkiDerBuf).digest('hex');
  return digestHex.match(/.{2}/g).join(':');
}

/**
 * Format 32-octet colon hex into 4 lines x 8 octets for human verification.
 * @param {string} colonHex
 * @returns {string}
 */
function formatFingerprint4x8(colonHex) {
  const octets = String(colonHex || '').split(':').filter(Boolean);
  const lines = [];
  for (let i = 0; i < octets.length; i += 8) {
    lines.push(octets.slice(i, i + 8).join(':'));
  }
  return lines.join('\n');
}

/**
 * Validate SPKI DER Base64 public key is strictly ECDSA P-256 (secp256r1 / prime256v1).
 * @param {string} spkiDerB64
 * @returns {{ keyObject: crypto.KeyObject, spkiDerBuf: Buffer, fingerprintSha256: string }}
 */
function validateP256SpkiPublicKey(spkiDerB64) {
  if (typeof spkiDerB64 !== 'string' || spkiDerB64.trim().length < 32) {
    throw new Error('INVALID_PUBLIC_KEY_FORMAT');
  }
  const normalizedB64 = spkiDerB64.trim();
  const spkiDerBuf = Buffer.from(normalizedB64, 'base64');
  if (spkiDerBuf.length < 48 || spkiDerBuf.length > 512) {
    throw new Error('INVALID_PUBLIC_KEY_LENGTH');
  }

  let keyObject;
  try {
    keyObject = crypto.createPublicKey({
      key: spkiDerBuf,
      format: 'der',
      type: 'spki'
    });
  } catch (_) {
    throw new Error('INVALID_SPKI_DER');
  }

  if (keyObject.asymmetricKeyType !== 'ec') {
    throw new Error('UNSUPPORTED_KEY_TYPE');
  }
  const curve = keyObject.asymmetricKeyDetails && keyObject.asymmetricKeyDetails.namedCurve;
  if (curve !== 'prime256v1' && curve !== 'secp256r1' && curve !== 'P-256') {
    throw new Error(`UNSUPPORTED_CURVE:${curve || 'unknown'}`);
  }

  return {
    keyObject,
    spkiDerBuf,
    fingerprintSha256: computeSha256Fingerprint(spkiDerBuf)
  };
}

function isValidDeviceId(cleanId) {
  return DEVICE_ID_RE.test(cleanId) && !FORBIDDEN_DEVICE_IDS.has(cleanId);
}

function atomicWriteJson0600(filePath, dataObj) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  const content = JSON.stringify(dataObj, null, 2) + '\n';
  const fileMode = Number(process.env.NEXA_STORE_FILE_MODE) || 0o600;
  fs.writeFileSync(tmpPath, content, { mode: fileMode, encoding: 'utf8' });
  try {
    fs.chmodSync(tmpPath, fileMode);
  } catch (_) {
    // Windows chmod is best-effort
  }
  fs.renameSync(tmpPath, filePath);
}

class EnrolledDevicesStore {
  constructor(options = {}) {
    this.filePath = options.filePath || process.env.NEXA_ENROLLED_DEVICES_PATH || DEFAULT_ENROLLED_PATH;
    this.pendingEnrollPath = options.pendingEnrollPath ||
      path.join(path.dirname(this.filePath), path.basename(DEFAULT_PENDING_ENROLL_PATH));
    this._cache = new Map();
    this._lastStatKey = '';
  }

  _readRawJson(targetPath) {
    if (!fs.existsSync(targetPath)) return Object.create(null);
    const raw = fs.readFileSync(targetPath, 'utf8').trim();
    if (!raw) return Object.create(null);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return Object.create(null);
    }
    const safeObj = Object.create(null);
    for (const [k, v] of Object.entries(parsed)) {
      if (!FORBIDDEN_DEVICE_IDS.has(k)) {
        safeObj[k] = v;
      }
    }
    return safeObj;
  }

  reloadIfChanged() {
    try {
      if (!fs.existsSync(this.filePath)) {
        this._cache.clear();
        this._lastStatKey = '';
        return;
      }
      const stat = fs.statSync(this.filePath);
      const statKey = `${stat.mtimeMs}:${stat.ino}:${stat.size}`;
      if (statKey === this._lastStatKey) return;

      const parsed = this._readRawJson(this.filePath);
      const next = new Map();
      for (const [deviceId, record] of Object.entries(parsed)) {
        if (!record || !record.publicKeySpkiDerB64) continue;
        try {
          const { keyObject, fingerprintSha256 } = validateP256SpkiPublicKey(record.publicKeySpkiDerB64);
          next.set(deviceId, {
            deviceId,
            publicKeySpkiDerB64: record.publicKeySpkiDerB64,
            publicKey: keyObject,
            fingerprintSha256: record.fingerprintSha256 || fingerprintSha256,
            enrolledAt: record.enrolledAt || 0,
            status: record.status || 'ACTIVE'
          });
        } catch (err) {
          console.warn(`[NEXA-AUTH] Skipping invalid enrolled key for ${deviceId}: ${err.message}`);
        }
      }
      this._cache = next;
      this._lastStatKey = statKey;
    } catch (err) {
      // N-H6: Fail closed on read/parse error so revoked devices cannot stay cached
      this._cache.clear();
      this._lastStatKey = '';
      console.error(`[NEXA-AUTH] Failed loading enrolled devices store (fail-closed): ${err.message}`);
    }
  }

  getDevice(deviceId) {
    if (!deviceId || typeof deviceId !== 'string') return null;
    this.reloadIfChanged();
    return this._cache.get(deviceId.trim()) || null;
  }

  listDevices() {
    this.reloadIfChanged();
    return Array.from(this._cache.values()).map(({ publicKey, ...rest }) => rest);
  }

  enrollDevice({ deviceId, publicKeySpkiDerB64, force = false }) {
    const cleanId = String(deviceId || '').trim();
    if (!isValidDeviceId(cleanId)) {
      throw new Error('INVALID_DEVICE_ID');
    }

    const { fingerprintSha256 } = validateP256SpkiPublicKey(publicKeySpkiDerB64);
    const current = this._readRawJson(this.filePath);
    if (Object.prototype.hasOwnProperty.call(current, cleanId) && current[cleanId] && current[cleanId].status === 'ACTIVE' && !force) {
      throw new Error('DEVICE_ALREADY_ENROLLED');
    }

    const enrolledAt = Math.floor(Date.now() / 1000);
    current[cleanId] = {
      deviceId: cleanId,
      publicKeySpkiDerB64: publicKeySpkiDerB64.trim(),
      fingerprintSha256,
      enrolledAt,
      status: 'ACTIVE'
    };

    atomicWriteJson0600(this.filePath, current);
    this._lastStatKey = '';
    this.reloadIfChanged();
    console.log(`[NEXA-AUTH] Device ${force ? 're-paired' : 'enrolled'}: ${cleanId} fp=${fingerprintSha256.slice(0, 23)}...`);
    return current[cleanId];
  }

  revokeDevice(deviceId) {
    const cleanId = String(deviceId || '').trim();
    if (!isValidDeviceId(cleanId)) {
      throw new Error('INVALID_DEVICE_ID');
    }
    const current = this._readRawJson(this.filePath);
    if (!Object.prototype.hasOwnProperty.call(current, cleanId) || !current[cleanId]) {
      throw new Error('DEVICE_NOT_FOUND');
    }
    current[cleanId].status = 'REVOKED';
    current[cleanId].revokedAt = Math.floor(Date.now() / 1000);
    atomicWriteJson0600(this.filePath, current);
    this._lastStatKey = '';
    this.reloadIfChanged();
    console.log(`[NEXA-AUTH] Device revoked: ${cleanId}`);
    return current[cleanId];
  }

  /**
   * Create a short-lived single-use enrollment token via server CLI (nexa-enroll start/re-pair).
   */
  createPendingEnrollment({ deviceId, repair = false, ttlMs = ENROLL_CODE_TTL_MS }) {
    const cleanId = String(deviceId || '').trim();
    if (!isValidDeviceId(cleanId)) {
      throw new Error('INVALID_DEVICE_ID');
    }
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Ambiguity-free Base32-like charset
    const bytes = crypto.randomBytes(8);
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += alphabet[bytes[i] % alphabet.length];
    }
    const formattedCode = `${code.slice(0, 4)}-${code.slice(4, 8)}`;
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    const record = {
      deviceId: cleanId,
      codeHash,
      repair: Boolean(repair),
      failedAttempts: 0,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs
    };

    const pending = this._readRawJson(this.pendingEnrollPath);
    // Clean expired entries
    const now = Date.now();
    for (const [k, v] of Object.entries(pending)) {
      if (!v || now > v.expiresAt) delete pending[k];
    }
    pending[cleanId] = record;
    atomicWriteJson0600(this.pendingEnrollPath, pending);
    return {
      deviceId: cleanId,
      code: formattedCode,
      repair: record.repair,
      expiresAt: record.expiresAt
    };
  }

  /**
   * Consume a CLI-generated single-use enrollment code and register the device's P-256 public key.
   */
  consumePendingEnrollment({ deviceId, enrollCode, publicKeySpkiDerB64 }) {
    const cleanId = String(deviceId || '').trim();
    if (!isValidDeviceId(cleanId)) {
      throw new Error('INVALID_DEVICE_ID');
    }
    const normCode = String(enrollCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (normCode.length !== 8) {
      throw new Error('INVALID_ENROLL_CODE');
    }

    const pending = this._readRawJson(this.pendingEnrollPath);
    const entry = Object.prototype.hasOwnProperty.call(pending, cleanId) ? pending[cleanId] : null;
    if (!entry) {
      throw new Error('NO_PENDING_ENROLLMENT');
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      delete pending[cleanId];
      atomicWriteJson0600(this.pendingEnrollPath, pending);
      throw new Error('ENROLL_CODE_EXPIRED');
    }

    const providedHash = Buffer.from(crypto.createHash('sha256').update(normCode).digest('hex'), 'hex');
    const expectedHash = Buffer.from(entry.codeHash, 'hex');
    if (providedHash.length !== expectedHash.length || !crypto.timingSafeEqual(providedHash, expectedHash)) {
      entry.failedAttempts = (entry.failedAttempts || 0) + 1;
      if (entry.failedAttempts >= MAX_ENROLL_FAILED_ATTEMPTS) {
        delete pending[cleanId];
        atomicWriteJson0600(this.pendingEnrollPath, pending);
        throw new Error('ENROLL_CODE_LOCKED');
      }
      pending[cleanId] = entry;
      atomicWriteJson0600(this.pendingEnrollPath, pending);
      throw new Error('ENROLL_CODE_MISMATCH');
    }

    // N-H6: Validate SPKI public key and duplicate enrollment state BEFORE consuming the single-use code
    validateP256SpkiPublicKey(publicKeySpkiDerB64);
    const current = this._readRawJson(this.filePath);
    if (Object.prototype.hasOwnProperty.call(current, cleanId) && current[cleanId] && current[cleanId].status === 'ACTIVE' && !entry.repair) {
      throw new Error('DEVICE_ALREADY_ENROLLED');
    }

    // Consume single-use code immediately before storing key
    delete pending[cleanId];
    atomicWriteJson0600(this.pendingEnrollPath, pending);

    return this.enrollDevice({
      deviceId: cleanId,
      publicKeySpkiDerB64,
      force: Boolean(entry.repair)
    });
  }
}

module.exports = {
  EnrolledDevicesStore,
  computeSha256Fingerprint,
  formatFingerprint4x8,
  validateP256SpkiPublicKey,
  DEFAULT_ENROLLED_PATH,
  ENROLL_CODE_TTL_MS
};
