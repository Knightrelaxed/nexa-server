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

  const resMis = signalDetector.detectUserSignals('Bukan begitu maksudku bro, salah paham kamu');
  assert.ok(resMis.length > 0);
  assert.equal(resMis[0].signal.dimension, 'workflow');
  assert.equal(resMis[0].signal.issue, 'misunderstanding');
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
