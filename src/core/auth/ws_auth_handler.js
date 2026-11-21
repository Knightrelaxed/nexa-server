'use strict';
/**
 * ============================================================
 * N.E.X.A Server - WebSocket Auth & Enrollment Message Handler
 * Handles JSON text frames on Connection A (/ws) without ever
 * colliding with Live_Voice_Engine binary PCM frames:
 * - ENROLL_SUBMIT -> ENROLL_OK / ENROLL_ERR (requires CLI code)
 * - TICKET_REQ    -> CHALLENGE / AUTH_ERR
 * - CHALLENGE_RESP -> TICKET / AUTH_ERR
 * ============================================================
 */

const { getTicketService } = require('./ticket_service');

const ENROLL_RATE_WINDOW_MS = 60_000;
const MAX_ENROLL_SUBMIT_PER_MIN = 10;
const enrollBuckets = new Map();

function checkEnrollRateLimit(key) {
  const now = Date.now();
  const prev = enrollBuckets.get(key) || [];
  const active = prev.filter(ts => now - ts < ENROLL_RATE_WINDOW_MS);
  if (active.length >= MAX_ENROLL_SUBMIT_PER_MIN) {
    enrollBuckets.set(key, active);
    return false;
  }
  active.push(now);
  if (enrollBuckets.size > 64) {
    for (const [k, list] of enrollBuckets.entries()) {
      if (list.every(ts => now - ts >= ENROLL_RATE_WINDOW_MS)) enrollBuckets.delete(k);
    }
  }
  enrollBuckets.set(key, active);
  return true;
}

function safeSend(ws, obj) {
  if (!ws || typeof ws.send !== 'function') return false;
  if (ws.readyState !== undefined && ws.readyState !== 1) return false;
  try {
    ws.send(JSON.stringify(obj));
    return true;
  } catch (err) {
    console.error('[NEXA-AUTH] Failed sending WS auth response:', err.message);
    return false;
  }
}

/**
 * Route an incoming /ws JSON auth message.
 * @param {object} payload
 * @param {import('ws')} ws
 * @param {import('./ticket_service').TicketService} [service]
 * @returns {boolean} true if message was handled
 */
function handleWsAuthMessage(payload, ws, service = getTicketService()) {
  const pType = String(payload && payload.type ? payload.type : '').toUpperCase();
  const reqId = payload && payload.req_id ? String(payload.req_id) : '';
  const clientIp = (ws && ws.clientIp) ? String(ws.clientIp) : 'unknown';

  if (pType === 'ENROLL_SUBMIT') {
    if (!checkEnrollRateLimit(clientIp)) {
      safeSend(ws, {
        type: 'ENROLL_ERR',
        req_id: reqId,
        code: 'RATE_LIMITED',
        message: 'Terlalu banyak percobaan pendaftaran perangkat. Coba lagi dalam 1 menit.'
      });
      return true;
    }
    try {
      const record = service.deviceStore.consumePendingEnrollment({
        deviceId: payload.device_id,
        enrollCode: payload.enroll_code,
        publicKeySpkiDerB64: payload.public_key_spki_der_b64
      });
      safeSend(ws, {
        type: 'ENROLL_OK',
        req_id: reqId,
        device_id: record.deviceId,
        fingerprint_sha256: record.fingerprintSha256,
        enrolled_at: record.enrolledAt,
        status: record.status
      });
    } catch (err) {
      console.warn(`[NEXA-AUTH] ENROLL_SUBMIT rejected ip=${clientIp}: ${err.message}`);
      safeSend(ws, {
        type: 'ENROLL_ERR',
        req_id: reqId,
        code: err.message,
        message: 'Pendaftaran perangkat ditolak. Pastikan kode nexa-enroll masih berlaku dan cocok.'
      });
    }
    return true;
  }

  if (pType === 'TICKET_REQ') {
    try {
      const res = service.makeChallenge(
        payload.device_id,
        payload.scope,
        payload.resume_sid || '',
        { clientIp }
      );
      if (!res.ok) {
        safeSend(ws, {
          type: 'AUTH_ERR',
          req_id: reqId,
          code: res.code,
          retry_after_sec: res.retryAfterSec || 0,
          message: res.message
        });
      } else {
        safeSend(ws, {
          type: 'CHALLENGE',
          req_id: reqId,
          nonce: res.nonce,
          scope: res.scope,
          sid: res.sid,
          exp: res.exp
        });
      }
    } catch (err) {
      console.error(`[NEXA-AUTH] TICKET_REQ unexpected error ip=${clientIp}:`, err.message);
      safeSend(ws, {
        type: 'AUTH_ERR',
        req_id: reqId,
        code: 'INTERNAL_AUTH_ERROR',
        retry_after_sec: 0,
        message: 'Terjadi kesalahan internal saat membuat tantangan autentikasi.'
      });
    }
    return true;
  }

  if (pType === 'CHALLENGE_RESP') {
    try {
      // N-M8: Accept canonical PRD 10.6 `sig` as well as `signature_der_b64` / `signature_b64`
      const sigField = payload.signature_der_b64 || payload.sig || payload.signature_b64;
      const res = service.issueTicket(
        payload.device_id,
        payload.nonce,
        sigField,
        { clientIp }
      );
      if (!res.ok) {
        safeSend(ws, {
          type: 'AUTH_ERR',
          req_id: reqId,
          code: res.code,
          retry_after_sec: res.retryAfterSec || 0,
          message: res.message
        });
      } else {
        safeSend(ws, {
          type: 'TICKET',
          req_id: reqId,
          ticket: res.ticket,
          scope: res.scope,
          sid: res.sid,
          exp: res.exp
        });
      }
    } catch (err) {
      console.error(`[NEXA-AUTH] CHALLENGE_RESP unexpected error ip=${clientIp}:`, err.message);
      safeSend(ws, {
        type: 'AUTH_ERR',
        req_id: reqId,
        code: 'INTERNAL_AUTH_ERROR',
        retry_after_sec: 0,
        message: 'Terjadi kesalahan internal saat menerbitkan tiket autentikasi.'
      });
    }
    return true;
  }

  return false;
}

module.exports = {
  handleWsAuthMessage
};
