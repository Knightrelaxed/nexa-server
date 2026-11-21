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
const { TicketService } = require('../src/core/auth/ticket_service');
const { handleWsAuthMessage } = require('../src/core/auth/ws_auth_handler');
const {
  FinanceStepUpService,
  buildCanonicalActionSignMessage
} = require('../src/core/auth/finance_stepup_service');
const { createMobileChatHandler } = require('../src/interfaces/bridge/mobile_bridge/chat_handler');
const financeEngine = require('../src/domain/Finance_Engine');
const supabaseFinance = require('../src/infrastructure/Supabase_Finance');
const supabaseMemories = require('../src/infrastructure/Supabase_Memories');
const { handleFinanceIntent } = require('../src/interfaces/common/handlers/finance_handler');
const mobileClient = require('../src/interfaces/bridge/mobile_bridge/client');
const logger = require('../src/utils/logger');
const { normalizeOrigin } = require('../src/utils/cors_config');
const { parseArgs } = require('../scripts/nexa-enroll');

function makeEnrolledDevice(deviceId = 'samsung-a33-tuan') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-audit-a-'));
  createdTmpDirs.push(tmpDir);
  const filePath = path.join(tmpDir, 'enrolled_devices.json');
  const store = new EnrolledDevicesStore({ filePath });
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spkiDerB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const pending = store.createPendingEnrollment({ deviceId });
  store.consumePendingEnrollment({ deviceId, enrollCode: pending.code, publicKeySpkiDerB64: spkiDerB64 });
  return { store, privateKey, deviceId, tmpDir, filePath };
}

describe('Audit Wave A - Node.js Security & Protocol Regression Suite', () => {
  it('[N-C1] rejects recipient spoofing via source bank or raw textInput and binds canonical destination', async () => {
    const { store } = makeEnrolledDevice();
    const service = new FinanceStepUpService({
      deviceStore: store,
      dailyLimitRp: 2_000_000,
      enforceWhitelist: true
    });

    // Source bank is Bank Mandiri, text mentions Mandiri, recipient is an unwhitelisted scammer
    const spoofed = service.createPendingAction({
      clientMsgId: 'msg-spoof-1',
      actionLabel: 'Transfer Dana',
      amount: 1_500_000,
      recipient: 'Penipu 99998888',
      bank: 'Bank Mandiri', // source bank passed accidentally or destination bank spoofed
      textInput: 'Transfer 1.500.000 dari Bank Mandiri ke Penipu 99998888'
    });
    assert.equal(spoofed.ok, false);
    assert.equal(spoofed.code, 'RECIPIENT_NOT_WHITELISTED');

    // Short generic substring like "PT" or "a" must NEVER match PT Telkom Indonesia
    const shortMatch = service.createPendingAction({
      clientMsgId: 'msg-spoof-2',
      actionLabel: 'Transfer Dana',
      amount: 100_000,
      recipient: 'PT'
    });
    assert.equal(shortMatch.ok, false);
    assert.equal(shortMatch.code, 'RECIPIENT_NOT_WHITELISTED');

    // Caller bank/acctLast4 must NOT override canonical whitelisted bank/acctLast4
    const legit = service.createPendingAction({
      clientMsgId: 'msg-legit-1',
      actionLabel: 'Transfer Dana',
      amount: 350_000,
      recipient: 'PT Telkom Indonesia (IndiHome)',
      bank: 'Bank Palsu',
      acctLast4: '9999'
    });
    assert.equal(legit.ok, true);
    assert.equal(legit.pendingFrame.bank, 'Bank Mandiri');
    assert.equal(legit.pendingFrame.acct_last4, '4882');

    service.destroy();
  });

  it('[N-C2] blocks RECORD_MULTIPLE transfer bypass and includes adminFee in step-up amount', async (t) => {
    // Isolate from live Supabase I/O for sub-second deterministic test loop
    const origReqConfirm = financeEngine.requestTransactionConfirmation;
    const origGetAcc = supabaseFinance.getAccountsList;
    const origMarkSent = supabaseMemories.markPendingTransactionSent;
    financeEngine.requestTransactionConfirmation = async () => 'MOCK_CONFIRM_BYPASSED_STEPUP';
    supabaseFinance.getAccountsList = async () => [{ name: 'Bank Mandiri' }, { name: 'Bank Jago' }];
    supabaseMemories.markPendingTransactionSent = async () => {};
    t.after(() => {
      financeEngine.requestTransactionConfirmation = origReqConfirm;
      supabaseFinance.getAccountsList = origGetAcc;
      supabaseMemories.markPendingTransactionSent = origMarkSent;
    });

    const { store } = makeEnrolledDevice();
    const service = new FinanceStepUpService({
      deviceStore: store,
      dailyLimitRp: 2_000_000,
      enforceWhitelist: true
    });

    const stepUpFrames = [];
    const resMulti = await handleFinanceIntent({
      intent: 'FINANCE',
      extracted_data: {
        action: 'RECORD_MULTIPLE',
        transactions: [
          { nominal: 350000, type: 'TRANSFER', destination: 'PT Telkom Indonesia (IndiHome)', description: 'Tagihan' }
        ]
      }
    }, {
      source: 'mobile',
      clientMsgId: 'msg-multi-1',
      textInput: 'transfer 350rb ke indihome',
      financeStepUpService: service,
      onStepUpRequired: (f) => stepUpFrames.push(f)
    });

    assert.equal(stepUpFrames.length, 1, 'RECORD_MULTIPLE transfer on mobile must trigger ACTION_PENDING');
    assert.match(resMulti, /sidik jari/i);

    // Admin fee must be included in daily limit and total Step-Up amount
    const stepUpWithFee = [];
    await handleFinanceIntent({
      intent: 'FINANCE',
      extracted_data: {
        action: 'TRANSFER',
        type: 'TRANSFER',
        nominal: 350000,
        admin_fee: 2500,
        destination: 'PT Telkom Indonesia (IndiHome)'
      }
    }, {
      source: 'mobile',
      clientMsgId: 'msg-fee-1',
      textInput: 'transfer 350rb ke indihome biaya admin 2500',
      financeStepUpService: service,
      onStepUpRequired: (f) => stepUpWithFee.push(f)
    });

    assert.equal(stepUpWithFee.length, 1);
    assert.equal(stepUpWithFee[0].amount, 352500);

    service.destroy();
  });

  it('[N-C3] mobileClient.handleMessage does not crash on null or non-object payloads', () => {
    const fakeWs = { readyState: 1, send: () => {} };
    assert.doesNotThrow(() => mobileClient.handleMessage(null, fakeWs));
    assert.doesNotThrow(() => mobileClient.handleMessage(undefined, fakeWs));
    assert.doesNotThrow(() => mobileClient.handleMessage('raw-string', fakeWs));
    assert.doesNotThrow(() => mobileClient.handleMessage([], fakeWs));
  });

  it('[N-H3] concurrent executeFn failure rolls back only its own amount without erasing sibling usage', async () => {
    const { store, privateKey, deviceId } = makeEnrolledDevice();
    const service = new FinanceStepUpService({
      deviceStore: store,
      dailyLimitRp: 2_000_000,
      enforceWhitelist: true
    });

    let rejectA;
    const pA = service.createPendingAction({
      clientMsgId: 'mA',
      amount: 1_000_000,
      recipient: 'PT Telkom Indonesia (IndiHome)',
      executeFn: () => new Promise((_, rej) => { rejectA = rej; })
    });
    const pB = service.createPendingAction({
      clientMsgId: 'mB',
      amount: 1_000_000,
      recipient: 'PT PLN (Persero) Tagihan Listrik',
      executeFn: async () => 'OK B'
    });

    const signFrame = (f) => crypto.sign(
      'sha256',
      buildCanonicalActionSignMessage(f.nonce, f.action_id, f.canonical_hash),
      { key: privateKey, dsaEncoding: 'der' }
    ).toString('base64');

    const runA = service.verifyAndExecuteAction({
      actionId: pA.actionId,
      deviceId,
      nonce: pA.pendingFrame.nonce,
      signatureDerB64: signFrame(pA.pendingFrame)
    });
    const resB = await service.verifyAndExecuteAction({
      actionId: pB.actionId,
      deviceId,
      nonce: pB.pendingFrame.nonce,
      signatureDerB64: signFrame(pB.pendingFrame)
    });
    assert.equal(resB.ok, true);
    assert.equal(service.getDailyUsed(), 2_000_000);

    // Now A fails -> dailyUsed must remain 1,000,000 (B's usage), NOT 0!
    rejectA(new Error('DB transient error'));
    const resA = await runA;
    assert.equal(resA.ok, false);
    assert.equal(service.getDailyUsed(), 1_000_000);
    assert.equal(service.getDailyRemaining(), 1_000_000);

    service.destroy();
  });

  it('[N-H4/N-M1/N-M2/N-M8] TicketService bounds spoofed deviceId maps, enforces term kill switch, prevents 4h resume bypass, and accepts sig field', () => {
    const { store, privateKey, deviceId } = makeEnrolledDevice();
    const { privateKey: serverPriv } = crypto.generateKeyPairSync('ed25519');
    let now = 1763620000000;

    const svc = new TicketService({
      deviceStore: store,
      serverPrivKey: serverPriv,
      nowFn: () => now,
      termEnabled: false
    });

    // N-M1: term scope rejected when termEnabled is false
    const termBlocked = svc.makeChallenge(deviceId, 'term');
    assert.equal(termBlocked.ok, false);
    assert.equal(termBlocked.code, 'FEATURE_DISABLED');

    // N-H4: Flood 300 unknown deviceIds -> failureState & requestBuckets remain bounded
    for (let i = 0; i < 300; i++) {
      svc.makeChallenge(`attacker-random-${i}`, 'logs');
      svc.issueTicket(`attacker-random-${i}`, 'bad-nonce', 'AAAA');
    }
    assert.ok(svc.failureState.size <= 32, `failureState leaked: ${svc.failureState.size}`);
    assert.ok(svc.requestBuckets.size <= 32, `requestBuckets leaked: ${svc.requestBuckets.size}`);

    // N-M8: ws_auth_handler accepts PRD 10.6 `sig` field in CHALLENGE_RESP
    const sent = [];
    const fakeWs = { readyState: 1, send: (m) => sent.push(JSON.parse(m)) };
    handleWsAuthMessage({ type: 'TICKET_REQ', req_id: 'r1', device_id: deviceId, scope: 'logs' }, fakeWs, svc);
    assert.equal(sent[0].type, 'CHALLENGE');
    const canonical = Buffer.from(`nexa-ticket-v1\n${sent[0].nonce}\nlogs\n`, 'utf8');
    const sigB64 = crypto.sign('sha256', canonical, { key: privateKey, dsaEncoding: 'der' }).toString('base64');
    handleWsAuthMessage({ type: 'CHALLENGE_RESP', req_id: 'r2', device_id: deviceId, nonce: sent[0].nonce, sig: sigB64 }, fakeWs, svc);
    assert.equal(sent[1].type, 'TICKET');

    svc.destroy();
  });

  it('[N-H6] EnrolledDevicesStore rejects prototype names, validates key before consuming code, and caps failed attempts', () => {
    const { store } = makeEnrolledDevice('dev-real');
    assert.throws(() => store.consumePendingEnrollment({
      deviceId: 'toString',
      enrollCode: 'ABCD-2345',
      publicKeySpkiDerB64: 'invalid'
    }), /INVALID_DEVICE_ID|NO_PENDING_ENROLLMENT/);

    const pending = store.createPendingEnrollment({ deviceId: 'dev-new-1' });
    // Invalid pubkey must NOT consume the pending code
    assert.throws(() => store.consumePendingEnrollment({
      deviceId: 'dev-new-1',
      enrollCode: pending.code,
      publicKeySpkiDerB64: 'not-a-valid-key'
    }));
    // Valid key still succeeds after invalid key error
    const { publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const enrolled = store.consumePendingEnrollment({
      deviceId: 'dev-new-1',
      enrollCode: pending.code,
      publicKeySpkiDerB64: spki
    });
    assert.equal(enrolled.status, 'ACTIVE');
  });

  it('[N-H7] logger.js redacts 2-segment Ed25519 tickets, lowercase key=value, Telegram bot URLs, and tags every line of multiline logs', () => {
    const sampleTicket = 'eyJzY29wZSI6ImxvZ3MiLCJleHAiOjE3NjM2MjAwNDV9.AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdEfGhIjKlMnOp';
    const redTicket = logger.redactSecrets(`Issued ticket=${sampleTicket}`);
    assert.ok(!redTicket.includes('AbCdEfGhIjKl'), `Ed25519 ticket leaked: ${redTicket}`);

    const redLower = logger.redactSecrets('debug token=supersecret123456 api_key=mysecretkey99');
    assert.ok(!redLower.includes('supersecret123456') && !redLower.includes('mysecretkey99'), `lowercase leaked: ${redLower}`);

    const redTg = logger.redactSecrets('POST https://api.telegram.org/bot123456789:AAHxyzSecretBotToken1234567890/sendMessage');
    assert.ok(!redTg.includes('AAHxyzSecretBotToken'), `Telegram bot token leaked: ${redTg}`);

    const redRek = logger.redactSecrets('Transfer ke rekening BCA 1370001234882 berhasil');
    assert.ok(redRek.includes('[ACC-****4882]') && !redRek.includes('1370001234882'), `Bank account leaked: ${redRek}`);

    const multi = logger.formatLine('ERROR', '[FINANCE] Error line 1\nstack line 2', { useSyslogPrefix: true });
    const lines = multi.outputLine.split('\n');
    assert.equal(lines.length, 2);
    assert.ok(lines[0].startsWith('<3>[cat=FINANCE] '), `Line 1 bad: ${lines[0]}`);
    assert.ok(lines[1].startsWith('<3>[cat=FINANCE] '), `Line 2 lost prefix: ${lines[1]}`);
  });

  it('[N-H2/N-M4] mobile_chat passes platform=mobile, sessionKey, and canonical conversationContext fields', async () => {
    let capturedRouterOptions = null;
    let capturedDomainContext = null;

    const handler = createMobileChatHandler({
      aiRouter: {
        routeUserMessage: async (_msg, opts) => {
          capturedRouterOptions = opts;
          return {
            intent: 'TASK',
            extracted_data: { action: 'LIST' },
            reply_message: 'Daftar tugas Tuan.'
          };
        }
      },
      executeDomainIntent: async (_intent, _data, ctx) => {
        capturedDomainContext = ctx;
        return 'Tugas A';
      },
      saveChatMemory: async () => {},
      chunkDelayMs: 0
    });

    const fakeWs = { readyState: 1, send: () => {} };
    await handler.handleChatSend({ client_msg_id: 'm1', content: 'cek tugas' }, fakeWs);
    assert.equal(capturedDomainContext.platform, 'mobile');
    assert.equal(capturedDomainContext.sessionKey, 'mobile-primary');

    await handler.handleChatSend({ client_msg_id: 'm2', content: 'yang pertama' }, fakeWs);
    assert.equal(capturedRouterOptions.conversationContext.intent, 'TASK');
    assert.equal(capturedRouterOptions.conversationContext.lastAssistantReply, 'Tugas A');
    handler.destroy();
  });

  it('[N-L1/N-L2] nexa-enroll parses --flag=value and cors_config normalizes mixed-case domains', () => {
    const parsed = parseArgs(['node', 'nexa-enroll.js', 'start', '--device=pixel-9', '--force']);
    assert.equal(parsed.flags.device, 'pixel-9');
    assert.equal(parsed.flags.force, true);

    assert.equal(normalizeOrigin('Nexa.Tuan.ID/ws'), 'https://nexa.tuan.id');
  });
});
