'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const createdTmpDirs = [];
function makeTmpDir(prefix = 'nexa-deep-audit-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  createdTmpDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of createdTmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
  }
});

const { EnrolledDevicesStore, resolveStoreFileMode } = require('../src/core/auth/enrolled_devices_store');
const { TicketService } = require('../src/core/auth/ticket_service');
const {
  FinanceStepUpService,
  buildCanonicalActionSignMessage
} = require('../src/core/auth/finance_stepup_service');
const { resolveTrustedClientIp } = require('../src/interfaces/bridge/gateway');
const mobileClient = require('../src/interfaces/bridge/mobile_bridge/client');
const { stripHtmlForMobile } = require('../src/interfaces/bridge/mobile_bridge/chat_handler');
const { handleFinanceIntent } = require('../src/interfaces/common/handlers/finance_handler');
const { handleEmailIntent } = require('../src/interfaces/common/handlers/email_handler');
const financeEngine = require('../src/domain/Finance_Engine');
const financeConfirmations = require('../src/domain/finance/Finance_Confirmations');
const supabaseFinance = require('../src/infrastructure/Supabase_Finance');
const supabaseMemories = require('../src/infrastructure/Supabase_Memories');
const { executeLiveTool } = require('../src/core/Live_Tool_Registry');
const presenceModel = require('../src/domain/Presence_Model');
const { createNotifier, createMemoryStore } = require('../src/core/Notifier');
const logger = require('../src/utils/logger');

function makeEnrolledStore(deviceId = 'samsung-a33-tuan') {
  const tmpDir = makeTmpDir('nexa-deep-store-');
  const filePath = path.join(tmpDir, 'enrolled_devices.json');
  const store = new EnrolledDevicesStore({ filePath });
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spkiDerB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const pending = store.createPendingEnrollment({ deviceId });
  store.consumePendingEnrollment({ deviceId, enrollCode: pending.code, publicKeySpkiDerB64: spkiDerB64 });
  return { tmpDir, filePath, store, publicKey, privateKey, deviceId };
}

describe('Server Deep Audit Waves 1-3 Regression Suite', () => {
  it('[C-1] FinanceStepUpService fails closed on NaN/invalid dailyLimitRp, persists daily usage, and hot-reloads whitelist', async () => {
    const { tmpDir, store, privateKey, deviceId } = makeEnrolledStore();

    // Invalid dailyLimitRp must fail closed (0 Rp limit, never NaN bypass)
    const badLimitSvc = new FinanceStepUpService({
      deviceStore: store,
      dailyLimitRp: 'not-a-number',
      enforceWhitelist: true
    });
    assert.equal(badLimitSvc.dailyLimitRp, 0);
    const blocked = badLimitSvc.createPendingAction({
      amount: 10_000,
      recipient: 'PT Telkom Indonesia (IndiHome)'
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, 'DAILY_LIMIT_EXCEEDED');
    badLimitSvc.destroy();

    // Atomic daily usage persistence + whitelist JSON hot-reload
    const usagePath = path.join(tmpDir, 'daily_usage.json');
    const wlPath = path.join(tmpDir, 'whitelist.json');
    fs.writeFileSync(wlPath, JSON.stringify([
      {
        id: 'wl-custom-1',
        recipientFull: 'PT Custom Fiber Nusantara',
        bank: 'Bank BCA',
        acctLast4: '7788',
        aliases: ['custom fiber']
      }
    ]));

    const svc1 = new FinanceStepUpService({
      deviceStore: store,
      dailyLimitRp: 500_000,
      dailyUsageFilePath: usagePath,
      whitelistFilePath: wlPath,
      enforceWhitelist: true
    });

    const created = svc1.createPendingAction({
      clientMsgId: 'msg-persist-1',
      amount: 300_000,
      recipient: 'custom fiber',
      executeFn: async () => 'OK'
    });
    assert.equal(created.ok, true);
    assert.equal(created.pendingFrame.bank, 'Bank BCA');
    assert.equal(created.pendingFrame.acct_last4, '7788');

    const sig = crypto.sign(
      'sha256',
      buildCanonicalActionSignMessage(
        created.pendingFrame.nonce,
        created.pendingFrame.action_id,
        created.pendingFrame.canonical_hash
      ),
      { key: privateKey, dsaEncoding: 'der' }
    ).toString('base64');

    const verified = await svc1.verifyAndExecuteAction({
      actionId: created.actionId,
      deviceId,
      nonce: created.pendingFrame.nonce,
      signatureDerB64: sig
    });
    assert.equal(verified.ok, true);
    svc1.destroy();

    // New service instance loads persisted usage (300k already used -> 250k exceeds 500k cap)
    const svc2 = new FinanceStepUpService({
      deviceStore: store,
      dailyLimitRp: 500_000,
      dailyUsageFilePath: usagePath,
      whitelistFilePath: wlPath,
      enforceWhitelist: true
    });
    assert.equal(svc2.getDailyUsed(), 300_000);
    const overAfterRestart = svc2.createPendingAction({
      amount: 250_000,
      recipient: 'custom fiber'
    });
    assert.equal(overAfterRestart.ok, false);
    assert.equal(overAfterRestart.code, 'DAILY_LIMIT_EXCEEDED');

    // Corrupt whitelist JSON fails closed (empty whitelist, no silent fallback)
    fs.writeFileSync(wlPath, '{ broken-json');
    const corruptBlocked = svc2.createPendingAction({
      amount: 50_000,
      recipient: 'PT Telkom Indonesia (IndiHome)'
    });
    assert.equal(corruptBlocked.ok, false);
    assert.equal(corruptBlocked.code, 'RECIPIENT_NOT_WHITELISTED');
    svc2.destroy();
  });

  it('[C-2/H-2] resolveTrustedClientIp trusts rightmost X-Forwarded-For only from loopback proxy', () => {
    const reqLoopback = {
      socket: { remoteAddress: '::ffff:127.0.0.1' },
      headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.9' }
    };
    assert.equal(resolveTrustedClientIp(reqLoopback), '203.0.113.9');

    const reqDirect = {
      socket: { remoteAddress: '198.51.100.42' },
      headers: { 'x-forwarded-for': '1.2.3.4' }
    };
    assert.equal(resolveTrustedClientIp(reqDirect), '198.51.100.42');
  });

  it('[C-3] Live_Tool_Registry blocks transfer/bill payments on Bearer-only Live Voice channel', async () => {
    const resTransfer = await executeLiveTool('recordExpense', {
      amount: 350000,
      category: 'Tagihan',
      description: 'Transfer ke rekening indihome'
    });
    assert.equal(resTransfer.status, 'STEP_UP_REQUIRED');

    const resOverLimit = await executeLiveTool('recordExpense', {
      amount: 50_000_000,
      category: 'Belanja',
      description: 'Beli laptop'
    });
    assert.equal(resOverLimit.status, 'STEP_UP_REQUIRED');
  });

  it('[C-4] mobileClient.signExecuteCommand produces deterministic HMAC-SHA256 v2 hex signature', () => {
    const prevSecret = process.env.NEXA_HMAC_SECRET;
    try {
      process.env.NEXA_HMAC_SECRET = 'test-hmac-secret-key-123';
      const ts = 1763620000000;
      const sig1 = mobileClient.signExecuteCommand('cmd-1', 'TOGGLE_FLASHLIGHT', ts, { level: 2 });
      const expected = crypto
        .createHmac('sha256', 'test-hmac-secret-key-123')
        .update(`cmd-1:TOGGLE_FLASHLIGHT:${ts}:2`, 'utf8')
        .digest('hex');
      assert.equal(sig1, expected);
      assert.equal(sig1.length, 64);
    } finally {
      if (prevSecret === undefined) delete process.env.NEXA_HMAC_SECRET;
      else process.env.NEXA_HMAC_SECRET = prevSecret;
    }
  });

  it('[F-01/F-02/F-03/F-05] finance_handler closes mobile transfer bypasses, fixes adminFee double-count, and allows non-transfer confirm', async (t) => {
    const origReqConfirm = financeEngine.requestTransactionConfirmation;
    const origConfirm = financeEngine.confirmPendingTransactions;
    const origHasTransfer = financeConfirmations.hasPendingTransferConfirmation;
    const origUpdatePending = financeEngine.updatePendingTransaction;
    const origGetAcc = supabaseFinance.getAccountsList;
    const origMarkSent = supabaseMemories.markPendingTransactionSent;

    financeEngine.requestTransactionConfirmation = async () => 'MOCK_CONFIRM_OK';
    financeEngine.confirmPendingTransactions = async () => 'NON_TRANSFER_CONFIRMED';
    financeConfirmations.hasPendingTransferConfirmation = () => false;
    financeEngine.updatePendingTransaction = async (_d, _c, _n, _a, _pm, _t, _date, _time, opts) => {
      assert.equal(opts.allowTransferEscalation, false);
      return 'UPDATED_BENIGN_WITH_GUARD';
    };
    supabaseFinance.getAccountsList = async () => [{ name: 'Bank Mandiri' }];
    supabaseMemories.markPendingTransactionSent = async () => {};

    t.after(() => {
      financeEngine.requestTransactionConfirmation = origReqConfirm;
      financeEngine.confirmPendingTransactions = origConfirm;
      financeConfirmations.hasPendingTransferConfirmation = origHasTransfer;
      financeEngine.updatePendingTransaction = origUpdatePending;
      supabaseFinance.getAccountsList = origGetAcc;
      supabaseMemories.markPendingTransactionSent = origMarkSent;
    });

    const { store } = makeEnrolledStore();
    const service = new FinanceStepUpService({
      deviceStore: store,
      dailyLimitRp: 2_000_000,
      enforceWhitelist: true
    });

    // F-01: Bill payment phrased as EXPENSE / PAY must trigger Step-Up on mobile
    const payFrames = [];
    await handleFinanceIntent({
      intent: 'FINANCE',
      extracted_data: {
        action: 'PAY',
        type: 'EXPENSE',
        nominal: 350000,
        destination: 'PT Telkom Indonesia (IndiHome)',
        description: 'bayar tagihan indihome'
      }
    }, {
      source: 'mobile',
      clientMsgId: 'msg-pay-1',
      textInput: 'bayar tagihan indihome 350rb',
      financeStepUpService: service,
      onStepUpRequired: (f) => payFrames.push(f)
    });
    assert.equal(payFrames.length, 1);
    assert.equal(payFrames[0].amount, 350000);

    // F-05: RECORD_MULTIPLE with admin_fee must NOT double-count adminFee
    const multiFrames = [];
    await handleFinanceIntent({
      intent: 'FINANCE',
      extracted_data: {
        action: 'RECORD_MULTIPLE',
        transactions: [
          {
            nominal: 350000,
            admin_fee: 2500,
            type: 'TRANSFER',
            destination: 'PT Telkom Indonesia (IndiHome)'
          }
        ]
      }
    }, {
      source: 'mobile',
      clientMsgId: 'msg-multi-fee',
      textInput: 'transfer 350rb ke indihome admin 2500',
      financeStepUpService: service,
      onStepUpRequired: (f) => multiFrames.push(f)
    });
    assert.equal(multiFrames.length, 1);
    assert.equal(multiFrames[0].amount, 352500);

    // F-03: Non-transfer CONFIRM_TRANSACTION works on mobile
    const confirmedMsg = await handleFinanceIntent({
      intent: 'FINANCE',
      extracted_data: { action: 'CONFIRM_TRANSACTION' }
    }, { source: 'mobile' });
    assert.equal(confirmedMsg, 'NON_TRANSFER_CONFIRMED');

    // Transfer CONFIRM_TRANSACTION stays blocked on mobile
    financeConfirmations.hasPendingTransferConfirmation = () => true;
    const blockedConfirm = await handleFinanceIntent({
      intent: 'FINANCE',
      extracted_data: { action: 'CONFIRM_TRANSACTION' }
    }, { source: 'mobile' });
    assert.match(blockedConfirm, /Step-Up|biometrik/i);

    // F-02: UPDATE_PENDING transfer escalation blocked directly at handler
    const blockedEscalation = await handleFinanceIntent({
      intent: 'FINANCE',
      extracted_data: { action: 'UPDATE_PENDING', type: 'TRANSFER' }
    }, { source: 'mobile' });
    assert.match(blockedEscalation, /Step-Up|biometrik/i);

    // F-02: Benign UPDATE_PENDING passes allowTransferEscalation=false into Finance_Confirmations
    const benignUpdate = await handleFinanceIntent({
      intent: 'FINANCE',
      extracted_data: { action: 'UPDATE_PENDING', description: 'kopi susu' }
    }, { source: 'mobile', textInput: 'ubah catatan jadi kopi susu' });
    assert.equal(benignUpdate, 'UPDATED_BENIGN_WITH_GUARD');

    service.destroy();
  });

  it('[F-04/F-06/F-07] email_handler validates required params and stripHtmlForMobile preserves links & apostrophes', async () => {
    const badDel = await handleEmailIntent({
      extracted_data: { action: 'DELETE', search_keyword: '   ' }
    }, { platform: 'mobile' });
    assert.match(badDel, /kata kunci/i);

    const badSend = await handleEmailIntent({
      extracted_data: { action: 'SEND', to: 'user@example.com' }
    }, { platform: 'mobile' });
    assert.match(badSend, /subjek|isi email/i);

    const plain = stripHtmlForMobile(
      'Cek <a href="https://example.com/bill">Tagihan IndiHome</a> &amp; don&#39;t miss <s>old</s> &apos;ok&apos;'
    );
    assert.ok(plain.includes('Tagihan IndiHome (https://example.com/bill)'), `Link lost: ${plain}`);
    assert.ok(plain.includes("don't"), `Apostrophe lost: ${plain}`);
    assert.ok(plain.includes("'ok'"), `apos entity lost: ${plain}`);
    assert.ok(!plain.includes('<s>'), `s tag leaked: ${plain}`);
  });

  it('[H-7/H-8/H-9/H-10] octal store mode, log sanitization/redaction, and TicketService nonce isolation', () => {
    const { store, deviceId } = makeEnrolledStore();

    // H-7: Octal parsing of NEXA_STORE_FILE_MODE
    const prevMode = process.env.NEXA_STORE_FILE_MODE;
    try {
      process.env.NEXA_STORE_FILE_MODE = '0600';
      assert.equal(resolveStoreFileMode(), 0o600);

      process.env.NEXA_STORE_FILE_MODE = '0640';
      assert.equal(resolveStoreFileMode(), 0o640);

      process.env.NEXA_STORE_FILE_MODE = '0666'; // world-writable -> rejected to safe default 0600
      assert.equal(resolveStoreFileMode(), 0o600);
    } finally {
      if (prevMode === undefined) delete process.env.NEXA_STORE_FILE_MODE;
      else process.env.NEXA_STORE_FILE_MODE = prevMode;
    }

    // H-8 / H-9: sanitizeLogToken & extended redactSecrets
    const sanitizedTok = logger.sanitizeLogToken('dev-1\r\n[FAKE] log=injected');
    assert.ok(!/[\r\n\[\]=]/.test(sanitizedTok), sanitizedTok);
    assert.equal(sanitizedTok, 'dev-1_FAKE_loginjected');
    const redJs = logger.redactSecrets("{ token: 'superSecretTokenValue99', api_key: 'abc123456789' }");
    assert.ok(!redJs.includes('superSecretTokenValue99') && !redJs.includes('abc123456789'), redJs);
    const redQuoted = logger.redactSecrets('NEXA_HMAC_SECRET="myTopSecretValue123"');
    assert.ok(!redQuoted.includes('myTopSecretValue123'), redQuoted);
    const redTgRaw = logger.redactSecrets('bot error 123456789:AAHxyzSecretToken1234567890123456');
    assert.ok(!redTgRaw.includes('AAHxyzSecretToken'), redTgRaw);
    const redVa = logger.redactSecrets('Bayar VA 88081234567890 berhasil');
    assert.ok(redVa.includes('[ACC-****7890]') && !redVa.includes('88081234567890'), redVa);

    // H-10: Wrong deviceId must NOT delete victim's pending nonce
    const { privateKey: serverPriv } = crypto.generateKeyPairSync('ed25519');
    const ticketSvc = new TicketService({ deviceStore: store, serverPrivKey: serverPriv });
    const chal = ticketSvc.makeChallenge(deviceId, 'logs');
    assert.equal(chal.ok, true);

    const spoofAttempt = ticketSvc.issueTicket('wrong-device', chal.nonce, 'AAAA');
    assert.equal(spoofAttempt.ok, false);
    assert.ok(ticketSvc.pendingChallenges.has(chal.nonce), 'Victim nonce was wrongly deleted by spoofed device');
    ticketSvc.destroy();
  });

  it('[N-02/R-01/S-C3] Notifier multi-line + bypassQuietHours, Presence_Model telemetry, and webhook require check', async () => {
    const delivered = [];
    const store = createMemoryStore();
    // 00:05 WIB (17:05 UTC) is inside default quiet hours (23:00 - 05:00 WIB)
    const midnightWib = new Date('2026-11-21T17:05:00.000Z');
    const notifier = createNotifier({
      store,
      send: async (text) => { delivered.push(text); },
      now: () => midnightWib
    });

    await notifier.notify({
      kind: 'SCHEDULED_MIDNIGHT_CHECKIN',
      priority: 'P1',
      isScheduled: true,
      bypassQuietHours: true,
      text: 'Baris 1: Ringkasan hari ini\nBaris 2: Sisa budget aman'
    });
    assert.equal(delivered.length, 1);
    assert.ok(delivered[0].includes('Baris 1') && delivered[0].includes('Baris 2'), delivered[0]);

    // N-02: P2 digest preserves multi-line body instead of chopping after first newline
    await notifier.notify({
      kind: 'WEEKLY_RECAP',
      priority: 'P2',
      text: 'Judul Mingguan\nTotal Pengeluaran: Rp 500.000\nSisa Budget: Rp 1.500.000'
    });
    await notifier.flushDigest();
    assert.equal(delivered.length, 2);
    assert.ok(delivered[1].includes('Total Pengeluaran') && delivered[1].includes('Sisa Budget'), delivered[1]);

    // R-01: Presence_Model updates from mobile telemetry
    presenceModel.updateFromMobileTelemetry({
      battery: 42,
      is_charging: true,
      screen_on: true,
      network_type: 'WIFI',
      motion_state: 'STILL'
    });
    const snap = presenceModel.snapshot();
    assert.equal(snap.batteryLevel, 42);
    assert.equal(snap.isScreenOn, true);

    // S-C3: webhook module resolves mobile adapter without MODULE_NOT_FOUND
    const webhookPath = require.resolve('../src/interfaces/webhook');
    assert.ok(webhookPath);
    const webhookSrc = fs.readFileSync(webhookPath, 'utf8');
    assert.ok(!webhookSrc.includes("require('./mobile_bridge/adapter')"));
  });

  it('[LIVE-VOICE] ignores ambient room noise in watchdog and suppresses duplicate greeting on mid-call reconnect', async () => {
    const { LiveVoiceSession } = require('../src/core/Live_Voice_Engine');
    const sentToGoogle = [];
    const sentToClient = [];

    const fakeClientWs = { readyState: 1, send: (m) => sentToClient.push(JSON.parse(m)) };
    const fakeGoogleWs = {
      readyState: 1,
      send: (m) => sentToGoogle.push(JSON.parse(m)),
      ping: () => {},
      removeAllListeners: () => {},
      terminate: () => {}
    };

    const sess = new LiveVoiceSession('test-live-watchdog', fakeClientWs);
    sess.isActive = true;
    sess.googleWs = fakeGoogleWs;

    // 1. Initial setupComplete dispatches Proactive Vocal Greeting exactly once
    await sess._handleGoogleMessage(Buffer.from(JSON.stringify({ setupComplete: {} })));
    assert.equal(sess.hasSentInitialGreeting, true);
    const initialGreetings = sentToGoogle.filter(m => m.clientContent?.turns?.[0]?.parts?.[0]?.text);
    assert.equal(initialGreetings.length, 1);

    // Simulate Google responding with output transcription -> clears _pendingResponseSince
    await sess._handleGoogleMessage(Buffer.from(JSON.stringify({
      serverContent: { outputTranscription: { text: 'Selamat malam Tuan.' } }
    })));
    assert.equal(sess._pendingResponseSince, 0);

    // 2. Ambient noise chunks (RMS ~350) MUST NOT set _pendingResponseSince
    const makePcmB64 = (amp) => {
      const buf = Buffer.alloc(3200);
      for (let i = 0; i < 1600; i++) buf.writeInt16LE(amp, i * 2);
      return buf.toString('base64');
    };
    const ambientB64 = makePcmB64(350);
    for (let i = 0; i < 10; i++) {
      sess.handleIncomingClientAudio(ambientB64);
    }
    assert.equal(sess._pendingResponseSince, 0, 'Ambient noise RMS=350 must not trigger watchdog pending timer');

    // 3. Sustained loud speech (5 chunks of RMS=2000) sets _pendingResponseSince
    const loudB64 = makePcmB64(2000);
    for (let i = 0; i < 5; i++) {
      sess.handleIncomingClientAudio(loudB64);
    }
    assert.ok(sess._pendingResponseSince > 0, 'Sustained loud speech should arm watchdog pending timer');

    // 4. Mid-call reconnect setupComplete MUST NOT send a second Proactive Vocal Greeting
    await sess._handleGoogleMessage(Buffer.from(JSON.stringify({ setupComplete: {} })));
    const totalGreetings = sentToGoogle.filter(m => m.clientContent?.turns?.[0]?.parts?.[0]?.text);
    assert.equal(totalGreetings.length, 1, 'Mid-call reconnect must suppress duplicate initial greeting');

    // Cleanup intervals cleanly
    if (sess.keepaliveInterval) clearInterval(sess.keepaliveInterval);
    if (sess.watchdogInterval) clearInterval(sess.watchdogInterval);
    sess.isClosed = true;
    sess.isActive = false;
  });

  it('[NOTIF] proactive messages queue while phone is offline, dedupe, and flush with caught_up on reconnect', async () => {
    const tmpDir = makeTmpDir('nexa-proactive-queue-');
    const prevPath = process.env.NEXA_PROACTIVE_QUEUE_PATH;
    process.env.NEXA_PROACTIVE_QUEUE_PATH = path.join(tmpDir, 'pending.json');

    const WebSocket = require('ws');
    const frames = [];
    const fakeWs = { readyState: WebSocket.OPEN, send: (m) => frames.push(JSON.parse(m)), terminate: () => {} };

    try {
      assert.equal(mobileClient.getClient(), null);
      const before = mobileClient.getPendingProactiveCount();

      // Offline -> QUEUED, never lost
      const r1 = mobileClient.sendProactiveMessage({ text: 'Briefing pagi\nJadwal 3', kind: 'SCHEDULED_MORNING', priority: 'P1', clientMsgId: 'proactive_t1' });
      assert.equal(r1.status, 'QUEUED');
      assert.equal(mobileClient.isProactivePending('proactive_t1'), true);

      // Duplicate id must not double-queue
      mobileClient.sendProactiveMessage({ text: 'Briefing pagi\nJadwal 3', kind: 'SCHEDULED_MORNING', priority: 'P1', clientMsgId: 'proactive_t1' });
      assert.equal(mobileClient.getPendingProactiveCount(), before + 1);

      // Queue is persisted atomically
      const persisted = JSON.parse(fs.readFileSync(process.env.NEXA_PROACTIVE_QUEUE_PATH, 'utf8'));
      assert.ok(persisted.some(m => m.client_msg_id === 'proactive_t1'));

      // Telegram-fallback hook can drop an undelivered message
      mobileClient.sendProactiveMessage({ text: 'Akan dialihkan ke Telegram', priority: 'P1', clientMsgId: 'proactive_t2' });
      assert.equal(mobileClient.dropPendingProactive('proactive_t2'), true);
      assert.equal(mobileClient.isProactivePending('proactive_t2'), false);

      // Reconnect -> flushed (after short delay) with caught_up flag, queue emptied
      mobileClient.setClient(fakeWs);
      await new Promise(r => setTimeout(r, 1200));
      const caught = frames.filter(f => f.type === 'CHAT_PROACTIVE' && f.client_msg_id === 'proactive_t1');
      assert.equal(caught.length, 1);
      assert.equal(caught[0].caught_up, true);
      assert.equal(caught[0].priority, 'P1');
      assert.equal(mobileClient.isProactivePending('proactive_t1'), false);

      // Connected -> immediate SENT (no queueing)
      const r3 = mobileClient.sendProactiveMessage({ text: 'Langsung', priority: 'P0', clientMsgId: 'proactive_t3' });
      assert.equal(r3.status, 'SENT');
      assert.equal(frames.filter(f => f.client_msg_id === 'proactive_t3').length, 1);

      // CHAT_READ must be accepted without throwing
      assert.doesNotThrow(() => mobileClient.handleMessage({ type: 'CHAT_READ' }, fakeWs));
    } finally {
      mobileClient.handleDisconnect(fakeWs);
      if (prevPath === undefined) delete process.env.NEXA_PROACTIVE_QUEUE_PATH;
      else process.env.NEXA_PROACTIVE_QUEUE_PATH = prevPath;
    }
  });
});
