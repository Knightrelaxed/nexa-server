'use strict';
const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const createdTmpDirs = [];
after(() => {
  for (const dir of createdTmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
  }
});

const { EnrolledDevicesStore } = require('../src/core/auth/enrolled_devices_store');
const {
  FinanceStepUpService,
  buildCanonicalActionSignMessage
} = require('../src/core/auth/finance_stepup_service');
const { createMobileChatHandler } = require('../src/interfaces/bridge/mobile_bridge/chat_handler');

function createTempStoreWithDevice(deviceId = 'samsung-a33-tuan') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-stepup-'));
  createdTmpDirs.push(tmpDir);
  const filePath = path.join(tmpDir, 'enrolled_devices.json');
  const store = new EnrolledDevicesStore({ filePath });

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1'
  });
  const spkiDerB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

  const pending = store.createPendingEnrollment({ deviceId, label: 'Galaxy A33' });
  store.consumePendingEnrollment({
    deviceId,
    enrollCode: pending.code,
    publicKeySpkiDerB64: spkiDerB64
  });

  return { store, privateKey, deviceId };
}

describe('FinanceStepUpService (FR-AUTH-07, FR-AUTH-08, PRD 10.6)', () => {
  it('creates canonical pending action, verifies ECDSA P-256 signature, and executes exactly once', async () => {
    const { store, privateKey, deviceId } = createTempStoreWithDevice();
    let now = 1763620000000;
    let execCount = 0;

    const service = new FinanceStepUpService({
      deviceStore: store,
      dailyLimitRp: 2_000_000,
      nowFn: () => now
    });

    const created = service.createPendingAction({
      clientMsgId: 'msg-transfer-01',
      actionLabel: 'Transfer Dana',
      amount: 350_000,
      recipient: 'PT Telkom Indonesia (IndiHome)',
      textInput: 'Cek tagihan internet lalu transfer Rp 350.000 ke rekening tagihan',
      executeFn: async (p) => {
        execCount += 1;
        return `Transfer ${p.amount} ke ${p.recipientFull} sukses.`;
      }
    });

    assert.equal(created.ok, true);
    const frame = created.pendingFrame;
    assert.equal(frame.type, 'ACTION_PENDING');
    assert.equal(frame.amount, 350_000);
    assert.equal(frame.formatted_amount, 'Rp 350.000');
    assert.equal(frame.recipient_full, 'PT Telkom Indonesia (IndiHome)');
    assert.equal(frame.bank, 'Bank Mandiri');
    assert.equal(frame.acct_last4, '4882');
    assert.equal(frame.whitelisted, true);
    assert.equal(frame.daily_remaining, 1_650_000);
    assert.equal(frame.formatted_daily_remaining, 'Rp 1.650.000 / Rp 2.000.000');

    // Sign canonical payload with hardware ECDSA P-256 key
    const msgToSign = buildCanonicalActionSignMessage(frame.nonce, frame.action_id, frame.canonical_hash);
    const sigDerB64 = crypto.sign('sha256', msgToSign, { key: privateKey, dsaEncoding: 'der' }).toString('base64');

    const verified = await service.verifyAndExecuteAction({
      actionId: frame.action_id,
      deviceId,
      nonce: frame.nonce,
      signatureDerB64: sigDerB64
    });

    assert.equal(verified.ok, true);
    assert.equal(verified.status, 'APPROVED');
    assert.equal(execCount, 1);
    assert.equal(service.getDailyRemaining(), 1_650_000);

    // Replay with the exact same signature must be rejected (single-use)
    const replay = await service.verifyAndExecuteAction({
      actionId: frame.action_id,
      deviceId,
      nonce: frame.nonce,
      signatureDerB64: sigDerB64
    });
    assert.equal(replay.ok, false);
    assert.equal(replay.code, 'ACTION_NOT_FOUND_OR_EXPIRED');
    assert.equal(execCount, 1);

    service.destroy();
  });

  it('rejects non-whitelisted recipients and transactions exceeding daily limit (FR-AUTH-08)', () => {
    const { store } = createTempStoreWithDevice();
    const service = new FinanceStepUpService({
      deviceStore: store,
      dailyLimitRp: 2_000_000,
      enforceWhitelist: true
    });

    const nonWhitelisted = service.createPendingAction({
      amount: 150_000,
      recipient: 'PT Akun Asing Tidak Dikenal',
      bank: 'Bank Lain',
      acctLast4: '9999'
    });
    assert.equal(nonWhitelisted.ok, false);
    assert.equal(nonWhitelisted.code, 'RECIPIENT_NOT_WHITELISTED');

    const overLimit = service.createPendingAction({
      amount: 2_500_000,
      recipient: 'PT Telkom Indonesia (IndiHome)'
    });
    assert.equal(overLimit.ok, false);
    assert.equal(overLimit.code, 'DAILY_LIMIT_EXCEEDED');

    service.destroy();
  });

  it('rejects expired pending action after 30s TTL and integrates with mobile_chat handler', async () => {
    const { store, privateKey, deviceId } = createTempStoreWithDevice();
    let now = 1763620000000;
    const service = new FinanceStepUpService({
      deviceStore: store,
      nowFn: () => now
    });

    const created = service.createPendingAction({
      clientMsgId: 'msg-exp-01',
      amount: 100_000,
      recipient: 'PT Telkom Indonesia (IndiHome)'
    });
    assert.equal(created.ok, true);

    // Advance clock past 30s TTL
    now += 31_000;
    const msgToSign = buildCanonicalActionSignMessage(
      created.pendingFrame.nonce,
      created.pendingFrame.action_id,
      created.pendingFrame.canonical_hash
    );
    const sigDerB64 = crypto.sign('sha256', msgToSign, { key: privateKey, dsaEncoding: 'der' }).toString('base64');

    const expiredRes = await service.verifyAndExecuteAction({
      actionId: created.pendingFrame.action_id,
      deviceId,
      nonce: created.pendingFrame.nonce,
      signatureDerB64: sigDerB64
    });
    assert.equal(expiredRes.ok, false);
    assert.equal(expiredRes.status, 'EXPIRED');

    // End-to-end ACTION_CANCEL via mobile_chat handler
    const created2 = service.createPendingAction({
      clientMsgId: 'msg-cancel-02',
      amount: 200_000,
      recipient: 'PT Telkom Indonesia (IndiHome)'
    });
    const sentFrames = [];
    const fakeWs = { send: (raw) => sentFrames.push(JSON.parse(raw)) };
    const chatHandler = createMobileChatHandler({
      financeStepUpService: service,
      saveChatMemory: async () => {}
    });

    chatHandler.handleMessage({
      type: 'ACTION_CANCEL',
      action_id: created2.actionId,
      device_id: deviceId
    }, fakeWs);

    assert.equal(sentFrames.length, 1);
    assert.equal(sentFrames[0].type, 'ACTION_RESULT');
    assert.equal(sentFrames[0].status, 'CANCELLED');

    chatHandler.destroy();
    service.destroy();
  });
});
