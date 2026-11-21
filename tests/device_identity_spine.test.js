'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const {
  EnrolledDevicesStore,
  formatFingerprint4x8
} = require('../src/core/auth/enrolled_devices_store');
const {
  TicketService,
  buildCanonicalTicketMessage
} = require('../src/core/auth/ticket_service');
const { handleWsAuthMessage } = require('../src/core/auth/ws_auth_handler');

function makeTempEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-auth-test-'));
  const enrolledPath = path.join(dir, 'enrolled_devices.json');
  const serverKeyPair = crypto.generateKeyPairSync('ed25519');
  const deviceKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const devicePubSpkiDer = deviceKeyPair.publicKey.export({ type: 'spki', format: 'der' });
  const devicePubB64 = devicePubSpkiDer.toString('base64');

  return {
    dir,
    enrolledPath,
    serverPriv: serverKeyPair.privateKey,
    serverPub: serverKeyPair.publicKey,
    devicePriv: deviceKeyPair.privateKey,
    devicePubB64,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true })
  };
}

function signChallenge(devicePriv, nonce, scope, sid) {
  const msg = buildCanonicalTicketMessage(nonce, scope, sid);
  return crypto.sign('sha256', msg, { key: devicePriv, dsaEncoding: 'der' }).toString('base64');
}

test('CLI single-use enrollment code, SHA-256 4x8 fingerprint, and re-pair flow', () => {
  const ctx = makeTempEnv();
  try {
    const store = new EnrolledDevicesStore({ filePath: ctx.enrolledPath });

    // Reject public key without CLI code
    assert.throws(() => store.consumePendingEnrollment({
      deviceId: 'samsung-a33-tuan',
      enrollCode: 'AAAA-BBBB',
      publicKeySpkiDerB64: ctx.devicePubB64
    }), /NO_PENDING_ENROLLMENT/);

    // Generate single-use code via CLI start
    const pending = store.createPendingEnrollment({ deviceId: 'samsung-a33-tuan', repair: false });
    assert.match(pending.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    // Wrong code rejected
    assert.throws(() => store.consumePendingEnrollment({
      deviceId: 'samsung-a33-tuan',
      enrollCode: 'ZZZZ-9999',
      publicKeySpkiDerB64: ctx.devicePubB64
    }), /ENROLL_CODE_MISMATCH/);

    // Valid code enrolls device and formats 32-octet SHA-256 into 4 lines x 8 octets
    const enrolled = store.consumePendingEnrollment({
      deviceId: 'samsung-a33-tuan',
      enrollCode: pending.code,
      publicKeySpkiDerB64: ctx.devicePubB64
    });
    assert.equal(enrolled.status, 'ACTIVE');
    const lines = formatFingerprint4x8(enrolled.fingerprintSha256).split('\n');
    assert.equal(lines.length, 4);
    assert.equal(lines[0].split(':').length, 8);

    // Code is strictly single-use
    assert.throws(() => store.consumePendingEnrollment({
      deviceId: 'samsung-a33-tuan',
      enrollCode: pending.code,
      publicKeySpkiDerB64: ctx.devicePubB64
    }), /NO_PENDING_ENROLLMENT/);

    // Re-pair replaces invalidated key cleanly (FR-AUTH-03)
    const newKey = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const newPubB64 = newKey.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const repairPending = store.createPendingEnrollment({ deviceId: 'samsung-a33-tuan', repair: true });
    const repaired = store.consumePendingEnrollment({
      deviceId: 'samsung-a33-tuan',
      enrollCode: repairPending.code,
      publicKeySpkiDerB64: newPubB64
    });
    assert.notEqual(repaired.fingerprintSha256, enrolled.fingerprintSha256);
    assert.equal(repaired.status, 'ACTIVE');
  } finally {
    ctx.cleanup();
  }
});

test('Full challenge -> ECDSA P-256 sign -> Ed25519 ticket issuance + resume sid ownership', () => {
  const ctx = makeTempEnv();
  let now = 1_763_600_000_000;
  const store = new EnrolledDevicesStore({ filePath: ctx.enrolledPath });
  store.enrollDevice({ deviceId: 'samsung-a33-tuan', publicKeySpkiDerB64: ctx.devicePubB64 });

  const service = new TicketService({
    deviceStore: store,
    serverPrivKey: ctx.serverPriv,
    nowFn: () => now,
    termEnabled: true
  });

  try {
    // 1. Logs ticket via WS handler
    const sent = [];
    const mockWs = { send: (s) => sent.push(JSON.parse(s)) };

    handleWsAuthMessage({
      type: 'TICKET_REQ',
      req_id: 'r1',
      device_id: 'samsung-a33-tuan',
      scope: 'logs'
    }, mockWs, service);

    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, 'CHALLENGE');
    assert.equal(sent[0].scope, 'logs');
    assert.equal(sent[0].sid, '');

    const sigB64 = signChallenge(ctx.devicePriv, sent[0].nonce, 'logs', '');
    handleWsAuthMessage({
      type: 'CHALLENGE_RESP',
      req_id: 'r1',
      device_id: 'samsung-a33-tuan',
      nonce: sent[0].nonce,
      signature_der_b64: sigB64
    }, mockWs, service);

    assert.equal(sent[1].type, 'TICKET');
    const [payloadB64u, ticketSigB64u] = sent[1].ticket.split('.');
    const payloadBuf = Buffer.from(payloadB64u, 'base64url');
    const ticketSigBuf = Buffer.from(ticketSigB64u, 'base64url');
    assert.equal(crypto.verify(null, payloadBuf, ctx.serverPub, ticketSigBuf), true);
    const claims = JSON.parse(payloadBuf.toString('utf8'));
    assert.equal(claims.scope, 'logs');
    assert.equal(claims.dev, 'samsung-a33-tuan');
    assert.equal(claims.exp, Math.floor(now / 1000) + 45);
    assert.ok(claims.jti.length >= 12);

    // 2. Replay of consumed nonce must fail
    const replay = service.issueTicket('samsung-a33-tuan', sent[0].nonce, sigB64);
    assert.equal(replay.ok, false);
    assert.equal(replay.code, 'INVALID_NONCE');

    // 3. Term ticket assigns authoritative sid, and valid resume reuses same sid
    const chTerm = service.makeChallenge('samsung-a33-tuan', 'term');
    assert.equal(chTerm.ok, true);
    assert.ok(chTerm.sid.length >= 16);
    const sigTerm = signChallenge(ctx.devicePriv, chTerm.nonce, 'term', chTerm.sid);
    const tkTerm = service.issueTicket('samsung-a33-tuan', chTerm.nonce, sigTerm);
    assert.equal(tkTerm.ok, true);
    assert.equal(tkTerm.sid, chTerm.sid);

    const chResume = service.makeChallenge('samsung-a33-tuan', 'term', chTerm.sid);
    assert.equal(chResume.ok, true);
    assert.equal(chResume.sid, chTerm.sid);

    // Resume with foreign/unknown sid rejected (FR-AUTH-06)
    const badResume = service.makeChallenge('samsung-a33-tuan', 'term', 'stolen-sid-123456');
    assert.equal(badResume.ok, false);
    assert.equal(badResume.code, 'INVALID_RESUME_SID');
  } finally {
    service.destroy();
    ctx.cleanup();
  }
});

test('Rate limit (5 req/min), expired nonce rejection, and 15m lockout after 3 failed verifications', () => {
  const ctx = makeTempEnv();
  let now = 1_763_600_000_000;
  const store = new EnrolledDevicesStore({ filePath: ctx.enrolledPath });
  store.enrollDevice({ deviceId: 'samsung-a33-tuan', publicKeySpkiDerB64: ctx.devicePubB64 });

  const service = new TicketService({
    deviceStore: store,
    serverPrivKey: ctx.serverPriv,
    nowFn: () => now,
    termEnabled: true
  });

  try {
    // Rate limit: 5 requests within 60s succeed, 6th rejected (FR-AUTH-10)
    const nonces = [];
    for (let i = 0; i < 5; i++) {
      const ch = service.makeChallenge('samsung-a33-tuan', 'logs');
      assert.equal(ch.ok, true);
      nonces.push(ch.nonce);
    }
    const sixth = service.makeChallenge('samsung-a33-tuan', 'logs');
    assert.equal(sixth.ok, false);
    assert.equal(sixth.code, 'RATE_LIMITED');

    // Advance 31s -> nonces expire
    now += 31_000;
    const badSig = crypto.randomBytes(64).toString('base64');
    const expRes = service.issueTicket('samsung-a33-tuan', nonces[0], badSig);
    assert.equal(expRes.ok, false);
    assert.equal(expRes.code, 'NONCE_EXPIRED');

    // 2 more failures trigger 15-minute lockout (total 3 consecutive failures)
    service.issueTicket('samsung-a33-tuan', nonces[1], badSig);
    service.issueTicket('samsung-a33-tuan', nonces[2], badSig);

    // Advance 61s to clear 1-minute rate bucket; lockout must STILL block ticket issuance
    now += 61_000;
    const locked = service.makeChallenge('samsung-a33-tuan', 'logs');
    assert.equal(locked.ok, false);
    assert.equal(locked.code, 'LOCKED_OUT');
    assert.ok(locked.retryAfterSec > 700);

    // Advance past 15m lockout -> device unlocked cleanly
    now += 15 * 60_000;
    const unlocked = service.makeChallenge('samsung-a33-tuan', 'logs');
    assert.equal(unlocked.ok, true);
  } finally {
    service.destroy();
    ctx.cleanup();
  }
});
