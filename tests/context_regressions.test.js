/**
 * Regresi pemahaman konteks (DSAE / timeline / jalur reflex / klasifikasi topik).
 * Golden master saja TIDAK cukup: fixture yang dicapture ulang dapat "mengesahkan" bug. Tes ini menyatakan
 * perilaku yang BENAR secara eksplisit (invarian), bukan sekadar "sama seperti sebelumnya".
 */
'use strict';
// Muat modul nyata SEBELUM harness memasang stub.
const synth = require('../src/domain/Situational_Synthesizer');
const { detectTopicContext } = require('../src/core/Topic_Classifier');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRouter } = require('./helpers/router_harness');

const ctx = loadRouter();
test.after(() => ctx.restore());
const JSON_REPLY = JSON.stringify({ intent: 'NORMAL_CHAT', extracted_data: {}, reply_message: 'ok', actions: [] });
const reset = (canned = {}) => Object.assign(ctx.state, { llm: [], calls: [], llmQueue: [JSON_REPLY], canned });

test('jalur reflex menyertakan riwayat obrolan (regresi: formatMemoryTime lokal => ReferenceError ditelan)', async () => {
  reset();
  await ctx.facade.routeUserMessage('halo', {});
  const prompt = ctx.state.llm[0].prompt;
  assert.match(prompt, /pesan 0/, 'riwayat dari getRecentMemories harus muncul di prompt reflex');
  assert.doesNotMatch(prompt, /Tidak ada riwayat obrolan sebelumnya/);
  assert.match(prompt, /HARI INI|KEMARIN|MASA LALU/, 'label temporal ikut terpasang');
});

test('satu panggilan kalender per pesan (bukan dua)', async () => {
  reset();
  await ctx.facade.routeUserMessage('beli kopi 25rb pakai gopay', {});
  assert.equal(ctx.state.calls.filter((c) => c[1] === 'getTodaysEvents').length, 1);
});

test('kalender gagal dimuat => synthesizer menerima null (bukan [] "tidak ada agenda")', async () => {
  reset({ 'Google_Workspace.getTodaysEvents': () => Promise.reject(new Error('quota')) });
  await ctx.facade.routeUserMessage('beli kopi 25rb pakai gopay', {});
  const call = ctx.state.calls.find((c) => c[1] === 'buildSituationalPromptBlock');
  assert.ok(call, 'buildSituationalPromptBlock harus dipanggil');
  assert.equal(call[2][0].calendarEvents, null);
});

test('synthesizer: null = tidak tersedia, [] = memang kosong, undefined = kompatibel mundur', () => {
  const nowMs = Date.parse('2026-10-20T03:00:00Z');
  const unavailable = synth.buildSituationalPromptBlock({ calendarEvents: null, nowMs });
  assert.match(unavailable, /tidak dapat dimuat/);
  assert.doesNotMatch(unavailable, /Tidak ada agenda/);
  assert.match(synth.buildSituationalPromptBlock({ calendarEvents: [], nowMs }), /Tidak ada agenda/);
  assert.match(synth.buildSituationalPromptBlock({ nowMs }), /Tidak ada agenda/);
  assert.equal(synth.evaluateAgendaPosition(null, nowMs).status, 'UNAVAILABLE');
});

test('inersia emosi: blok memuat panduan agar tidak diverbalisasi', () => {
  synth.recordTurnEmotion('STRESSED', 'deadline besok belum kelar');
  const block = synth.buildSituationalPromptBlock({ calendarEvents: [], nowMs: Date.now() });
  assert.match(block, /Suasana Hati/);
  assert.match(block, /jangan menyebut bahwa suasana hati "terdeteksi"/i);
});

const TOPICS = [
  ['capek abis kelas', 'CASUAL'], ['hari ini lelah banget', 'CASUAL'], ['aku mau cerita soal skripsi', 'CASUAL'],
  ['cari cerita rakyat jawa', 'RESEARCH'], ['cari tips mengatasi pusing', 'RESEARCH'], ['baca artikel tentang stres kerja', 'RESEARCH'],
  ['cek jadwal istirahat besok', 'SCHEDULING'], ['jadwal tidur siang besok', 'SCHEDULING'], ['buat alarm tidur jam 10 malam', 'SCHEDULING'],
  ['agenda santai sore ini', 'SCHEDULING'], ['ingatkan aku istirahat jam 3', 'SCHEDULING']
];
for (const [text, expected] of TOPICS) test(`topik: "${text}" => ${expected}`, () => assert.equal(detectTopicContext(text), expected));
