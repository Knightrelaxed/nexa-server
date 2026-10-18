/**
 * ============================================================
 * [TEST SUITE] N.E.X.A v3.3 Signal Detector & Anti-Stalker Gate
 * ============================================================
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const signalDetector = require('../src/domain/Signal_Detector');
const aiRouter = require('../src/core/AI_Router');

test('Signal_Detector: detect length corrections (shorter & longer)', () => {
  // Shorter
  const res1 = signalDetector.detectUserSignals('Nexa terlalu panjang penjelasannya, to the point aja');
  assert.ok(res1.length > 0);
  assert.equal(res1[0].event_type, 'CORRECTION');
  assert.equal(res1[0].signal.dimension, 'length');
  assert.equal(res1[0].signal.direction, 'shorter');

  const res2 = signalDetector.detectUserSignals('Singkat saja ya, jangan bertele-tele');
  assert.ok(res2.length > 0);
  assert.equal(res2[0].signal.direction, 'shorter');

  // Longer
  const res3 = signalDetector.detectUserSignals('Ini terlalu singkat, jelaskan lebih detail dong');
  assert.ok(res3.length > 0);
  assert.equal(res3[0].event_type, 'CORRECTION');
  assert.equal(res3[0].signal.dimension, 'length');
  assert.equal(res3[0].signal.direction, 'longer');
});

test('Signal_Detector: detect format corrections (bullets & no bullets)', () => {
  const resNoBullet = signalDetector.detectUserSignals('Tolong jangan pakai bullet list, prosa aja');
  assert.ok(resNoBullet.length > 0);
  assert.equal(resNoBullet[0].event_type, 'CORRECTION');
  assert.equal(resNoBullet[0].signal.dimension, 'format');
  assert.equal(resNoBullet[0].signal.rule, 'no_bullets');

  const resBullets = signalDetector.detectUserSignals('Bikin dalam bentuk poin-poin aja');
  assert.ok(resBullets.length > 0);
  assert.equal(resBullets[0].event_type, 'CORRECTION');
  assert.equal(resBullets[0].signal.dimension, 'format');
  assert.equal(resBullets[0].signal.rule, 'bullets');
});

test('Signal_Detector: detect tone and misunderstandings', () => {
  const resTone = signalDetector.detectUserSignals('Bahasanya santai aja jangan kaku');
  assert.ok(resTone.length > 0);
  assert.equal(resTone[0].signal.dimension, 'tone');
  assert.equal(resTone[0].signal.preference, 'casual');

  const resAntiFlattery = signalDetector.detectUserSignals('jangan terlalu menjilat dong, jangan anggap aku udah terlalu hebat');
  assert.ok(resAntiFlattery.length > 0);
  assert.equal(resAntiFlattery[0].signal.dimension, 'tone');
  assert.equal(resAntiFlattery[0].signal.preference, 'anti_flattery');

  const resMis = signalDetector.detectUserSignals('Bukan begitu maksudku bro, salah paham kamu');
  assert.ok(resMis.length > 0);
  assert.equal(resMis[0].signal.dimension, 'workflow');
  assert.equal(resMis[0].signal.issue, 'misunderstanding');

  const resEditMis = signalDetector.detectUserSignals('Perbaiki! Bukan st2 tapi es teh dua cup');
  assert.ok(resEditMis.length > 0);
  assert.equal(resEditMis[0].signal.dimension, 'workflow');
  assert.equal(resEditMis[0].signal.issue, 'misunderstanding');
});

test('Signal_Detector: detect explicit remember, accept, and override', () => {
  const resRemember = signalDetector.detectUserSignals('Ingat ini ya: mulai sekarang panggil aku Kapten');
  assert.ok(resRemember.length > 0);
  assert.equal(resRemember[0].event_type, 'EXPLICIT_REMEMBER');

  const resAccept = signalDetector.detectUserSignals('Oke mantap siap laksanakan!');
  assert.ok(resAccept.length > 0);
  assert.equal(resAccept[0].event_type, 'ACCEPT');

  const resOverride = signalDetector.detectUserSignals('Batalkan rencana tadi');
  assert.ok(resOverride.length > 0);
  assert.equal(resOverride[0].event_type, 'OVERRIDE');

  const resClean = signalDetector.detectUserSignals('Bagaimana cuaca di Jakarta hari ini?');
  assert.equal(resClean.length, 0);
});

test('Signal_Detector: detectOverCitation flags creepy stalker verbalization', () => {
  const injectedTraits = [
    {
      layer: 'WEAKNESSES',
      trait_key: 'admin_procrastination',
      trait_value: 'sering menunda tugas administratif'
    }
  ];

  // AI replies quoting weakness verbatim without user asking
  const badReply = 'Mengingat Tuan sering menunda tugas administratif, sebaiknya kita kerjakan sekarang.';
  const violations = signalDetector.detectOverCitation(badReply, injectedTraits, 'Besok ada acara apa?');
  assert.ok(violations.length > 0);
  assert.equal(violations[0].event_type, 'OVER_CITATION');
  assert.equal(violations[0].signal.trait_key, 'admin_procrastination');

  // AI replies when user explicitly asks about weakness -> NO violation
  const legitimateViolations = signalDetector.detectOverCitation(
    badReply,
    injectedTraits,
    'Apa saja kelemahan yang tercatat tentang diriku?'
  );
  assert.equal(legitimateViolations.length, 0);

  // User mentions the topic himself -> NO violation (no false positive)
  const userInitiatedViolations = signalDetector.detectOverCitation(
    'Iya Tuan, mari kita selesaikan tugas administratif itu bersama.',
    injectedTraits,
    'Aku sedang kewalahan dengan banyak tugas administratif hari ini.'
  );
  assert.equal(userInitiatedViolations.length, 0);

  // Normal preference trait -> NO violation
  const normalTraits = [
    {
      layer: 'PREFERENCES',
      trait_key: 'drink',
      trait_value: 'kopi tubruk manis'
    }
  ];
  const normalViolations = signalDetector.detectOverCitation(
    'Siap Tuan, silakan seruput kopi tubruk manis Anda.',
    normalTraits,
    'Halo Nexa'
  );
  assert.equal(normalViolations.length, 0);
});

test('AI_Router: _buildIdentityContextBlock enforces Anti-Stalker Re-framing', () => {
  const mockIdentityModel = {
    WEAKNESSES: [
      {
        trait_key: 'procrastination_raw',
        trait_value: 'suka menunda pekerjaan sulit',
        layer: 'WEAKNESSES'
        // No directive
      },
      {
        trait_key: 'late_sleep',
        trait_value: 'tidur larut malam',
        directive: 'Ingatkan batas waktu tidur pukul 23:00 tanpa menggurui',
        layer: 'WEAKNESSES'
      }
    ],
    PREFERENCES: [
      {
        trait_key: 'response_style',
        trait_value: 'terse and direct',
        layer: 'PREFERENCES'
      }
    ]
  };

  const injectedList = [];
  const block = aiRouter.buildIdentityContextBlock(mockIdentityModel, 'SCHEDULING', injectedList);

  // Verify new header
  assert.ok(block.includes('[LATENT OPERATIONAL DIRECTIVES — PANDUAN PERILAKU SISTEM]'));
  assert.ok(block.includes('DILARANG KERAS mengutip'));

  // Raw weakness without directive must be OMITTED
  assert.ok(!block.includes('suka menunda pekerjaan sulit'));
  assert.ok(!block.includes('procrastination_raw'));

  // Weakness with directive must be included as operational guidance
  assert.ok(block.includes('[PANDUAN BANTUAN] late_sleep: Ingatkan batas waktu tidur pukul 23:00 tanpa menggurui'));

  // Preference is included
  assert.ok(block.includes('response_style: terse and direct'));

  // Injected list tracks the included traits
  assert.equal(injectedList.length, 2);
  assert.equal(injectedList[0].trait_key, 'late_sleep');
  assert.equal(injectedList[1].trait_key, 'response_style');
});

test('Signal_Detector: false-positive resistance for natural everyday sentences', () => {
  // Financial statement with 'terlalu banyak' should NOT be a length correction
  const resFinance = signalDetector.detectUserSignals('Pengeluaranku terlalu banyak bulan ini, harus hemat');
  assert.equal(resFinance.length, 0);

  // Financial logging with 'catat' should NOT be EXPLICIT_REMEMBER
  const resCatat = signalDetector.detectUserSignals('Catat ini ya beli bensin 50rb di pertamina');
  assert.equal(resCatat.length, 0);

  // Calendar cancellation with 'batalkan' should NOT be general OVERRIDE
  const resBatal = signalDetector.detectUserSignals('Batalkan rapat besok jam 10 pagi');
  assert.equal(resBatal.length, 0);

  // Natural reminders starting with 'mulai sekarang' or 'jangan lupa' should NOT be EXPLICIT_REMEMBER
  const resReminder1 = signalDetector.detectUserSignals('mulai sekarang ingatkan aku minum obat jam 8');
  assert.equal(resReminder1.length, 0);

  const resReminder2 = signalDetector.detectUserSignals('jangan lupa kalau aku besok ada kuis');
  assert.equal(resReminder2.length, 0);
});

test('AI_Router: detectTopicContext accurate classification without collisions', () => {
  assert.equal(aiRouter.detectTopicContext('jadwalkan makan siang dengan dosen besok'), 'SCHEDULING');
  assert.equal(aiRouter.detectTopicContext('ingatkan aku beli galon besok'), 'SCHEDULING');
  assert.equal(aiRouter.detectTopicContext('selamat pagi nexa'), 'CASUAL');
  assert.equal(aiRouter.detectTopicContext('cek inbox ada apa hari ini'), 'RESEARCH');
  assert.equal(aiRouter.detectTopicContext('tolong ringkas email dari dosen'), 'RESEARCH');
  assert.equal(aiRouter.detectTopicContext('tulis draf email konfirmasi'), 'EMAIL_DRAFT');
  assert.equal(aiRouter.detectTopicContext('fokus ke skripsi hari ini'), 'STRATEGIC');
  assert.equal(aiRouter.detectTopicContext('aku prokrastinasi terus seharian, tolong aktifkan god mode'), 'DISCIPLINE_NUDGE');
  assert.equal(aiRouter.detectTopicContext('catat pengeluaran 25rb makan siang'), 'FINANCE');
  assert.equal(aiRouter.detectTopicContext('beli kopi 20k tadi pagi'), 'FINANCE');
});

test('Signal_Detector: Turn Attribution routes feedback to previous turn context', async () => {
  // [v3.3.1] Hermetic: a fake store captures events; nothing is written to the production database.
  const captured = [];
  signalDetector.setStore({
    recordLearningEvent: async (payload) => { captured.push(payload); return { success: true, data: payload }; }
  });
  try {
    const previousContext = {
      intent: 'FINANCE',
      topic: 'FINANCE',
      injectedPlaybook: { intent: 'FINANCE', version: 2 },
      injectedTraits: [{ layer: 'WEAKNESSES', trait_key: 'impulsive_spend' }],
      lastAssistantReply: 'Berikut rincian saldo dan pengeluaran Tuan:\n• Bensin: 50rb\n• Makan: 25rb'
    };

    // User sends correction in current turn (which router classifies as NORMAL_CHAT)
    const events = await signalDetector.evaluateTurn({
      userText: 'Jangan pakai bullet points lagi ya',
      assistantReply: 'Baik Tuan, saya akan gunakan format prosa tanpa bullet points.',
      intent: 'NORMAL_CHAT',
      topic: 'DEFAULT',
      injectedTraits: [],
      injectedPlaybook: { intent: 'NORMAL_CHAT', version: 1 },
      previousContext,
      sessionKey: 'test:attribution'
    });

    assert.ok(events.length > 0);
    const correctionEvent = events.find(e => e.event_type === 'CORRECTION');
    assert.ok(correctionEvent, 'Must detect a CORRECTION event');
    // CRITICAL: Must be attributed to previous turn (FINANCE), NOT current turn (NORMAL_CHAT)!
    assert.strictEqual(correctionEvent.intent, 'FINANCE');
    assert.strictEqual(correctionEvent.topic, 'FINANCE');
    assert.strictEqual(correctionEvent.injected_refs.playbook, 'FINANCE@2');
    assert.strictEqual(captured.length, events.length, 'Only the fake store may receive events');
  } finally {
    signalDetector.setStore(null);
  }
});

test('Signal_Detector: one utterance is one unit of evidence (no double counting)', () => {
  const ev = signalDetector.detectUserSignals('mulai sekarang jangan pernah pakai bullet', 'balasan sebelumnya');
  assert.equal(ev.length, 1, 'CORRECTION + EXPLICIT_REMEMBER must collapse into a single event');
  assert.equal(ev[0].event_type, 'CORRECTION');
  assert.equal(ev[0].signal.rule, 'no_bullets');
  assert.equal(ev[0].signal.explicit, true);
  // A pure explicit command (no correction pattern) stays an EXPLICIT_REMEMBER event.
  const only = signalDetector.detectUserSignals('mulai sekarang kamu harus jawab singkat', '');
  assert.deepEqual(only.map(e => e.event_type), ['EXPLICIT_REMEMBER']);
});

test('Signal_Detector: "ingat ini" is explicit, daily reminders are not', () => {
  const types = t => signalDetector.detectUserSignals(t, '').map(e => e.event_type);
  assert.deepEqual(types('ingat ini: aku alergi udang'), ['EXPLICIT_REMEMBER']);
  assert.deepEqual(types('tolong ingat bahwa aku tidak suka kopi pahit'), ['EXPLICIT_REMEMBER']);
  assert.deepEqual(types('mulai sekarang minum obat jam 8'), []);
  assert.deepEqual(types('mulai sekarang aku kuliah jam 7'), []);
  assert.deepEqual(types('besok ada kuis, ingat ya'), []);
  assert.deepEqual(types('ingat ini: besok ada kuis jam 7'), []);
});

test('Signal_Detector: test sessions are never written to the production store', async () => {
  const res = await signalDetector.evaluateTurn({
    userText: 'Jangan pakai bullet points lagi ya',
    assistantReply: 'Baik.',
    sessionKey: 'test:must-not-persist'
  });
  assert.deepEqual(res, []);
});

test('Signal_Detector: negated bullet requests are never inverted into "wants bullets"', () => {
  const rule = t => {
    const ev = signalDetector.detectUserSignals(t, '').find(e => e.signal && e.signal.dimension === 'format');
    return ev ? ev.signal.rule : null;
  };
  for (const t of ['jangan pernah pakai bullet', 'jangan lagi pakai poin-poin', 'nggak usah pakai list',
                   'gak perlu pakai daftar', 'tidak usah pakai nomor', 'stop pakai bullet', 'tanpa bullet ya']) {
    assert.equal(rule(t), 'no_bullets', t);
  }
  for (const t of ['pakai bullet ya', 'bikin list aja', 'buatkan daftar belanja']) {
    assert.equal(rule(t), 'bullets', t);
  }
  assert.equal(rule('jangan terlalu banyak pakai bullet'), null, 'ambiguous negation must not produce a wrong event');
});

test('Signal_Detector [v3.3.3]: aturan permanen yang menyebut kata domain tidak lagi tertolak', () => {
  const types = (t) => signalDetector.detectUserSignals(t).map(e => e.event_type);
  assert.deepEqual(types('mulai sekarang format laporan tugas pakai tabel'), ['EXPLICIT_REMEMBER']);
  assert.deepEqual(types('mulai sekarang jawab singkat kalau aku lagi rapat'), ['EXPLICIT_REMEMBER']);
  assert.deepEqual(types('catat gaya ini untuk email rapat'), ['EXPLICIT_REMEMBER']);
  assert.deepEqual(types('jangan lupa kalau aku suka kopi tanpa gula jam 3'), ['EXPLICIT_REMEMBER']);
  // tetap bukan aturan gaya:
  assert.deepEqual(types('mulai sekarang pakai dompet baru'), []);
  assert.deepEqual(types('mulai sekarang atur alarm jam 5'), []);
  assert.deepEqual(types('mulai sekarang ingatkan aku minum obat jam 8'), []);
  // pola longgar "ingat ini" + aturan spesifik di kalimat yang sama: aturan spesifik tetap menang
  assert.deepEqual(types('ingat ini ya: mulai sekarang format laporan tugas pakai tabel'), ['EXPLICIT_REMEMBER']);
});
