'use strict';
/**
 * ============================================================
 * N.E.X.A Server - Hardware-Biometric Finance Step-Up Gate
 * Implements FR-AUTH-07, FR-AUTH-08, FR-CHAT-19, FR-SEC-02, PRD 10.6:
 * - Enforced at the Node.js tool/execution layer (never relies on client intent_hint or LLM text)
 * - Strict recipient whitelist matching (never searches raw prompt text or source bank)
 * - Binds canonical execution details inside signed pending_action (prevents display-vs-execution spoofing)
 * - Stores canonical pending_action in memory with 30-second TTL and single-use nonce
 * - Enforces server-side daily nominal limit (including admin fees) with race-safe rollback
 * - Verifies Android Keystore ECDSA P-256 signature over:
 *   "nexa-action-v1\n" + nonce + "\n" + action_id + "\n" + canonical_hash
 * - Executes the frozen financial tool action at most once
 * ============================================================
 */

const crypto = require('node:crypto');
const { EnrolledDevicesStore } = require('./enrolled_devices_store');

const DEFAULT_ACTION_TTL_MS = 30_000;
const MAX_PENDING_ACTIONS = 8;
const DEFAULT_DAILY_LIMIT_RP = 2_000_000;

const DEFAULT_WHITELIST = [
  {
    id: 'wl-indihome',
    recipientFull: 'PT Telkom Indonesia (IndiHome)',
    aliases: ['indihome', 'telkom', 'pt telkom indonesia', 'pt telkom indonesia (indihome)', 'tagihan internet', 'rekening tagihan'],
    bank: 'Bank Mandiri',
    acctLast4: '4882'
  },
  {
    id: 'wl-pln',
    recipientFull: 'PT PLN (Persero) Tagihan Listrik',
    aliases: ['pln', 'pt pln', 'pt pln (persero)', 'pt pln (persero) tagihan listrik', 'token listrik', 'tagihan listrik'],
    bank: 'Bank Mandiri',
    acctLast4: '7710'
  },
  {
    id: 'wl-mandiri-self',
    recipientFull: 'Rekening Pribadi Bank Mandiri',
    aliases: ['rekening pribadi bank mandiri', 'bank mandiri', 'mandiri', 'livin'],
    bank: 'Bank Mandiri',
    acctLast4: '4882'
  },
  {
    id: 'wl-jago-self',
    recipientFull: 'Kantong Utama Bank Jago',
    aliases: ['kantong utama bank jago', 'bank jago', 'jago', 'kantong jago'],
    bank: 'Bank Jago',
    acctLast4: '9104'
  }
];

function formatRupiah(amount) {
  const n = Math.max(0, Math.round(Number(amount) || 0));
  return 'Rp ' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function getJakartaDateKey(epochMs) {
  const d = new Date(epochMs + 7 * 3600_000);
  return d.toISOString().slice(0, 10);
}

function timingSafeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function normalizeIdentity(val) {
  return String(val || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildCanonicalActionPayload({
  actionId,
  actionLabel,
  amount,
  recipientFull,
  bank,
  acctLast4,
  whitelisted
}) {
  return JSON.stringify({
    action_id: String(actionId),
    action_label: String(actionLabel),
    amount: Math.round(Number(amount) || 0),
    recipient_full: String(recipientFull),
    bank: String(bank),
    acct_last4: String(acctLast4),
    whitelisted: Boolean(whitelisted)
  });
}

function computeCanonicalHash(canonicalPayloadStr) {
  return crypto.createHash('sha256').update(canonicalPayloadStr, 'utf8').digest('hex');
}

function buildCanonicalActionSignMessage(nonce, actionId, canonicalHash) {
  return Buffer.from(`nexa-action-v1\n${nonce}\n${actionId}\n${canonicalHash}`, 'utf8');
}

class FinanceStepUpService {
  /**
   * @param {object} [options]
   * @param {EnrolledDevicesStore} [options.deviceStore]
   * @param {number} [options.actionTtlMs]
   * @param {number} [options.dailyLimitRp]
   * @param {Array} [options.whitelist]
   * @param {boolean} [options.enforceWhitelist]
   * @param {() => number} [options.nowFn]
   */
  constructor(options = {}) {
    this.deviceStore = options.deviceStore || new EnrolledDevicesStore({
      filePath: options.devicesFilePath
    });
    this.actionTtlMs = options.actionTtlMs || DEFAULT_ACTION_TTL_MS;
    this.dailyLimitRp = Number(options.dailyLimitRp || process.env.NEXA_FINANCE_DAILY_LIMIT || DEFAULT_DAILY_LIMIT_RP);
    this.whitelist = Array.isArray(options.whitelist) ? options.whitelist : DEFAULT_WHITELIST;
    this.enforceWhitelist = options.enforceWhitelist !== undefined ? Boolean(options.enforceWhitelist) : true;
    this.nowFn = options.nowFn || (() => Date.now());

    // actionId -> PendingAction
    this.pendingActions = new Map();
    // YYYY-MM-DD -> cumulative authorized Rp
    this.dailyUsedByDate = new Map();

    this._sweepTimer = setInterval(() => this.sweepExpired(), 5_000);
    if (typeof this._sweepTimer.unref === 'function') {
      this._sweepTimer.unref();
    }
  }

  destroy() {
    if (this._sweepTimer) {
      clearInterval(this._sweepTimer);
      this._sweepTimer = null;
    }
  }

  sweepExpired() {
    const now = this.nowFn();
    for (const [id, entry] of this.pendingActions.entries()) {
      if (entry.exp <= now) {
        this.pendingActions.delete(id);
      }
    }
    const todayKey = getJakartaDateKey(now);
    for (const key of this.dailyUsedByDate.keys()) {
      if (key !== todayKey) {
        this.dailyUsedByDate.delete(key);
      }
    }
  }

  getDailyUsed(now = this.nowFn()) {
    const key = getJakartaDateKey(now);
    return this.dailyUsedByDate.get(key) || 0;
  }

  getDailyRemaining(now = this.nowFn()) {
    return Math.max(0, this.dailyLimitRp - this.getDailyUsed(now));
  }

  /**
   * Resolve recipient details strictly against the server-side whitelist (FR-AUTH-08 / N-C1).
   * Never searches raw user prompt text or source bank, and never lets caller inputs overwrite
   * canonical whitelisted bank/acctLast4 values.
   */
  resolveRecipientProfile({ recipientInput, bankInput, acctLast4Input }) {
    const rawTarget = String(recipientInput || '').trim();
    const normTarget = normalizeIdentity(rawTarget);
    const normAcctLast4 = String(acctLast4Input || '').replace(/[^0-9]/g, '').slice(-4);

    if (normTarget.length >= 3) {
      for (const item of this.whitelist) {
        const normFull = normalizeIdentity(item.recipientFull);
        const exactAlias = Array.isArray(item.aliases) &&
          item.aliases.some(alias => normalizeIdentity(alias) === normTarget);

        if (normTarget === normFull || exactAlias) {
          // Always return server-authoritative canonical whitelist profile (never allow caller override)
          return {
            recipientFull: item.recipientFull,
            bank: item.bank,
            acctLast4: item.acctLast4,
            whitelisted: true
          };
        }
      }
    }

    return {
      recipientFull: rawTarget || 'Penerima Eksternal',
      bank: String(bankInput || '').trim() || 'Transfer Bank',
      acctLast4: normAcctLast4 || '0000',
      whitelisted: false
    };
  }

  _generateUniqueActionId() {
    for (let i = 0; i < 8; i++) {
      const candidate = `act-${crypto.randomBytes(4).toString('hex')}`;
      if (!this.pendingActions.has(candidate)) return candidate;
    }
    return `act-${crypto.randomBytes(6).toString('hex')}`;
  }

  /**
   * Freeze a sensitive financial action and create a 30-second biometric challenge (FR-AUTH-07 / FR-AUTH-08).
   */
  createPendingAction({
    clientMsgId = '',
    actionLabel = 'Transfer Dana',
    amount,
    recipient,
    bank,
    acctLast4,
    executionDetails = null,
    executeFn
  }) {
    this.sweepExpired();
    const now = this.nowFn();
    const cleanAmount = Math.round(Number(amount) || 0);

    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
      return {
        ok: false,
        code: 'INVALID_AMOUNT',
        message: 'Nominal transaksi tidak valid untuk otorisasi Step-Up.'
      };
    }

    if (this.pendingActions.size >= MAX_PENDING_ACTIONS) {
      return {
        ok: false,
        code: 'TOO_MANY_PENDING_ACTIONS',
        message: 'Terlalu banyak aksi keuangan tertunda. Selesaikan atau batalkan aksi sebelumnya.'
      };
    }

    const profile = this.resolveRecipientProfile({
      recipientInput: recipient,
      bankInput: bank,
      acctLast4Input: acctLast4
    });

    // FR-AUTH-08: Whitelist check
    if (this.enforceWhitelist && !profile.whitelisted) {
      console.warn(`[NEXA-AUTH] ACTION_REJECTED reason=RECIPIENT_NOT_WHITELISTED recipient="${profile.recipientFull}"`);
      return {
        ok: false,
        code: 'RECIPIENT_NOT_WHITELISTED',
        message: `Penerima "${profile.recipientFull}" belum terdaftar di daftar Whitelist server. Aksi ditolak sesuai kebijakan keamanan FR-AUTH-08.`
      };
    }

    // FR-AUTH-08: Daily limit check
    const currentRemaining = this.getDailyRemaining(now);
    if (cleanAmount > currentRemaining) {
      console.warn(`[NEXA-AUTH] ACTION_REJECTED reason=DAILY_LIMIT_EXCEEDED amount=${cleanAmount} remaining=${currentRemaining}`);
      return {
        ok: false,
        code: 'DAILY_LIMIT_EXCEEDED',
        message: `Nominal ${formatRupiah(cleanAmount)} melebihi sisa batas harian server (${formatRupiah(currentRemaining)} dari ${formatRupiah(this.dailyLimitRp)}).`
      };
    }

    const actionId = this._generateUniqueActionId();
    const nonce = crypto.randomBytes(32).toString('base64url');
    const exp = now + this.actionTtlMs;
    const remainingAfter = Math.max(0, currentRemaining - cleanAmount);

    const canonicalPayload = buildCanonicalActionPayload({
      actionId,
      actionLabel,
      amount: cleanAmount,
      recipientFull: profile.recipientFull,
      bank: profile.bank,
      acctLast4: profile.acctLast4,
      whitelisted: profile.whitelisted
    });
    const canonicalHash = computeCanonicalHash(canonicalPayload);

    const pendingRecord = {
      actionId,
      clientMsgId,
      actionLabel,
      amount: cleanAmount,
      recipientFull: profile.recipientFull,
      bank: profile.bank,
      acctLast4: profile.acctLast4,
      whitelisted: profile.whitelisted,
      dailyRemainingAfter: remainingAfter,
      dailyLimit: this.dailyLimitRp,
      canonicalPayload,
      canonicalHash,
      nonce,
      exp,
      createdAt: now,
      executionDetails: executionDetails ? { ...executionDetails, destination: profile.recipientFull } : null,
      executeFn: typeof executeFn === 'function' ? executeFn : async () => 'Transaksi berhasil dieksekusi.'
    };

    this.pendingActions.set(actionId, pendingRecord);

    console.log(
      `[NEXA-AUTH] ACTION_PENDING created action_id=${actionId} amount=${cleanAmount} whitelisted=${profile.whitelisted}`
    );

    return {
      ok: true,
      actionId,
      pendingFrame: {
        type: 'ACTION_PENDING',
        action_id: actionId,
        client_msg_id: clientMsgId,
        action_label: actionLabel,
        amount: cleanAmount,
        formatted_amount: formatRupiah(cleanAmount),
        recipient_full: profile.recipientFull,
        bank: profile.bank,
        acct_last4: profile.acctLast4,
        whitelisted: profile.whitelisted,
        daily_remaining: remainingAfter,
        daily_limit: this.dailyLimitRp,
        formatted_daily_remaining: `${formatRupiah(remainingAfter)} / ${formatRupiah(this.dailyLimitRp)}`,
        canonical_hash: canonicalHash,
        nonce,
        exp,
        ttl_sec: Math.max(1, Math.ceil((exp - now) / 1000))
      }
    };
  }

  /**
   * Verify hardware-biometric ECDSA P-256 signature and execute the frozen action once (FR-AUTH-07).
   */
  async verifyAndExecuteAction({ actionId, deviceId, nonce, signatureDerB64 }) {
    const cleanActionId = String(actionId || '').trim();
    const cleanDeviceId = String(deviceId || '').trim();
    const cleanNonce = String(nonce || '').trim();
    const cleanSigB64 = String(signatureDerB64 || '').trim();
    const now = this.nowFn();

    const pending = this.pendingActions.get(cleanActionId);
    // Single-use deletion immediately on verification attempt (prevents replay)
    this.pendingActions.delete(cleanActionId);

    if (!pending) {
      console.warn(`[NEXA-AUTH] ACTION_AUTH action_id=${cleanActionId} device_id=${cleanDeviceId} result=NOT_FOUND_OR_REPLAY`);
      return {
        ok: false,
        status: 'EXPIRED',
        code: 'ACTION_NOT_FOUND_OR_EXPIRED',
        actionId: cleanActionId,
        message: 'Aksi keuangan tidak ditemukan, sudah kedaluwarsa (30 detik), atau sudah pernah diproses.'
      };
    }

    if (now > pending.exp) {
      console.warn(`[NEXA-AUTH] ACTION_AUTH action_id=${cleanActionId} device_id=${cleanDeviceId} result=EXPIRED`);
      return {
        ok: false,
        status: 'EXPIRED',
        code: 'ACTION_EXPIRED',
        actionId: cleanActionId,
        clientMsgId: pending.clientMsgId,
        message: 'Waktu konfirmasi 30 detik telah habis. Silakan ulangi perintah transaksi.'
      };
    }

    if (!timingSafeStringEqual(pending.nonce, cleanNonce)) {
      console.warn(`[NEXA-AUTH] ACTION_AUTH action_id=${cleanActionId} device_id=${cleanDeviceId} result=NONCE_MISMATCH`);
      return {
        ok: false,
        status: 'REJECTED',
        code: 'NONCE_MISMATCH',
        actionId: cleanActionId,
        clientMsgId: pending.clientMsgId,
        message: 'Nonce otorisasi tidak cocok.'
      };
    }

    const device = this.deviceStore.getDevice(cleanDeviceId);
    if (!device || device.status !== 'ACTIVE') {
      console.warn(`[NEXA-AUTH] ACTION_AUTH action_id=${cleanActionId} device_id=${cleanDeviceId} result=UNKNOWN_DEVICE`);
      return {
        ok: false,
        status: 'REJECTED',
        code: 'UNKNOWN_DEVICE',
        actionId: cleanActionId,
        clientMsgId: pending.clientMsgId,
        message: 'Perangkat belum terdaftar di server (jalankan nexa-enroll terlebih dahulu).'
      };
    }

    let isValidSig = false;
    try {
      const pubKey = device.publicKey || crypto.createPublicKey({
        key: Buffer.from(device.publicKeySpkiDerB64, 'base64'),
        format: 'der',
        type: 'spki'
      });
      const canonicalMsg = buildCanonicalActionSignMessage(pending.nonce, pending.actionId, pending.canonicalHash);
      const sigDer = Buffer.from(cleanSigB64, 'base64');
      isValidSig = crypto.verify('sha256', canonicalMsg, { key: pubKey, dsaEncoding: 'der' }, sigDer);
    } catch (_) {
      isValidSig = false;
    }

    if (!isValidSig) {
      console.warn(`[NEXA-AUTH] ACTION_AUTH action_id=${cleanActionId} device_id=${cleanDeviceId} result=FAIL_ECDSA`);
      return {
        ok: false,
        status: 'REJECTED',
        code: 'INVALID_SIGNATURE',
        actionId: cleanActionId,
        clientMsgId: pending.clientMsgId,
        message: 'Verifikasi tanda tangan biometrik Keystore gagal.'
      };
    }

    // Re-check daily limit atomically before committing
    const currentRemaining = this.getDailyRemaining(now);
    if (pending.amount > currentRemaining) {
      console.warn(`[NEXA-AUTH] ACTION_AUTH action_id=${cleanActionId} result=DAILY_LIMIT_EXCEEDED`);
      return {
        ok: false,
        status: 'REJECTED',
        code: 'DAILY_LIMIT_EXCEEDED',
        actionId: cleanActionId,
        clientMsgId: pending.clientMsgId,
        message: 'Batas nominal harian terlampaui saat akan mengeksekusi aksi.'
      };
    }

    const dateKey = getJakartaDateKey(now);
    this.dailyUsedByDate.set(dateKey, (this.dailyUsedByDate.get(dateKey) || 0) + pending.amount);

    let executionReply = '';
    try {
      executionReply = await pending.executeFn(pending);
    } catch (err) {
      // N-H3: Race-safe rollback relative to CURRENT map value (never stale local variable)
      const currentUsed = this.dailyUsedByDate.get(dateKey) || 0;
      this.dailyUsedByDate.set(dateKey, Math.max(0, currentUsed - pending.amount));
      console.error(`[NEXA-AUTH] ACTION_AUTH action_id=${cleanActionId} result=EXEC_ERROR err=${err.message}`);
      return {
        ok: false,
        status: 'REJECTED',
        code: 'EXECUTION_FAILED',
        actionId: cleanActionId,
        clientMsgId: pending.clientMsgId,
        message: `Eksekusi aksi keuangan gagal: ${err.message}`
      };
    }

    const remainingNow = this.getDailyRemaining(now);
    console.log(
      `[NEXA-AUTH] ACTION_AUTH action_id=${cleanActionId} device_id=${cleanDeviceId} result=OK remaining=${remainingNow}`
    );

    return {
      ok: true,
      status: 'APPROVED',
      actionId: cleanActionId,
      clientMsgId: pending.clientMsgId,
      amount: pending.amount,
      formattedAmount: formatRupiah(pending.amount),
      recipientFull: pending.recipientFull,
      bank: pending.bank,
      acctLast4: pending.acctLast4,
      dailyRemaining: remainingNow,
      formattedDailyRemaining: `${formatRupiah(remainingNow)} / ${formatRupiah(this.dailyLimitRp)}`,
      message: executionReply || `Otorisasi biometrik berhasil. ${pending.actionLabel} sebesar ${formatRupiah(pending.amount)} ke ${pending.recipientFull} (${pending.bank} •••• ${pending.acctLast4}) telah dieksekusi.`
    };
  }

  /**
   * Cancel a pending action explicitly from the mobile bottom sheet (N-M5 / N-L6).
   */
  cancelPendingAction({ actionId, deviceId = '', reason = 'USER_CANCELLED' }) {
    const cleanActionId = String(actionId || '').trim();
    const cleanDeviceId = String(deviceId || '').trim();

    if (cleanDeviceId) {
      const dev = this.deviceStore.getDevice(cleanDeviceId);
      if (!dev || dev.status !== 'ACTIVE') {
        console.warn(`[NEXA-AUTH] ACTION_CANCEL rejected unknown device_id=${cleanDeviceId}`);
        return {
          ok: false,
          found: false,
          status: 'REJECTED',
          code: 'UNKNOWN_DEVICE',
          actionId: cleanActionId,
          clientMsgId: '',
          message: 'Perangkat tidak dikenali untuk membatalkan aksi.'
        };
      }
    }

    const pending = this.pendingActions.get(cleanActionId);
    const found = Boolean(pending);
    this.pendingActions.delete(cleanActionId);

    console.log(`[NEXA-AUTH] ACTION_CANCEL action_id=${cleanActionId} device_id=${cleanDeviceId} found=${found} reason=${reason}`);
    const isTimeout = String(reason || '').toUpperCase() === 'TIMEOUT';
    return {
      ok: true,
      found,
      status: isTimeout ? 'EXPIRED' : 'CANCELLED',
      actionId: cleanActionId,
      clientMsgId: pending ? pending.clientMsgId : '',
      message: (found && !isTimeout)
        ? `Aksi keuangan (${cleanActionId}) telah dibatalkan.`
        : ''
    };
  }
}

let defaultInstance = null;
function getFinanceStepUpService() {
  if (!defaultInstance) {
    defaultInstance = new FinanceStepUpService();
  }
  return defaultInstance;
}

module.exports = {
  FinanceStepUpService,
  getFinanceStepUpService,
  buildCanonicalActionPayload,
  computeCanonicalHash,
  buildCanonicalActionSignMessage,
  formatRupiah
};
