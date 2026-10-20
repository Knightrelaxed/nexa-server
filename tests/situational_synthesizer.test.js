'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const synthesizer = require('../src/domain/Situational_Synthesizer');

test('Situational_Synthesizer - evaluateAgendaPosition detects ONGOING event and exact remaining minutes', () => {
  // Skenario: Selasa 20 Okt 2026, 12:36:00 WIB
  // Event 1: 09:10 - 10:50
  // Event 2: 11:00 - 12:40 (ongoing! sisa 4 menit)
  // Event 3: 13:00 - 14:40 (upcoming! sisa 24 menit)
  const nowMs = new Date('2026-10-20T12:36:00+07:00').getTime();

  const mockEvents = [
    {
      summary: 'Genre Sastra Arab (Arb1)',
      location: 'Soegondo 403',
      start: { dateTime: '2026-10-20T09:10:00+07:00' },
      end: { dateTime: '2026-10-20T10:50:00+07:00' }
    },
    {
      summary: 'Sosiolinguistik Arab (Arb)',
      location: 'Poerbatjaraka 201',
      start: { dateTime: '2026-10-20T11:00:00+07:00' },
      end: { dateTime: '2026-10-20T12:40:00+07:00' }
    },
    {
      summary: 'Bahasa Arab Tulis III (Arb1)',
      location: 'Soegondo 403',
      start: { dateTime: '2026-10-20T13:00:00+07:00' },
      end: { dateTime: '2026-10-20T14:40:00+07:00' }
    }
  ];

  const result = synthesizer.evaluateAgendaPosition(mockEvents, nowMs);

  assert.equal(result.status, 'ONGOING');
  assert.ok(result.ongoingEvent);
  assert.equal(result.ongoingEvent.summary, 'Sosiolinguistik Arab (Arb)');
  assert.equal(result.ongoingEvent.remainingMins, 4);
  assert.ok(result.nextUpcomingEvent);
  assert.equal(result.nextUpcomingEvent.summary, 'Bahasa Arab Tulis III (Arb1)');
  assert.equal(result.nextUpcomingEvent.startsInMins, 24);

  assert.match(result.summaryText, /SEDANG BERLANGSUNG 'Sosiolinguistik Arab \(Arb\)'/);
  assert.match(result.summaryText, /TERSISA ~4 MENIT LAGI/i);
});

test('Situational_Synthesizer - evaluateAgendaPosition detects GAP between events', () => {
  // Skenario: Selasa 20 Okt 2026, 12:45:00 WIB (kelas selesai 5m lalu, kelas berikutnya 15m lagi)
  const nowMs = new Date('2026-10-20T12:45:00+07:00').getTime();

  const mockEvents = [
    {
      summary: 'Sosiolinguistik Arab (Arb)',
      start: { dateTime: '2026-10-20T11:00:00+07:00' },
      end: { dateTime: '2026-10-20T12:40:00+07:00' }
    },
    {
      summary: 'Bahasa Arab Tulis III (Arb1)',
      start: { dateTime: '2026-10-20T13:00:00+07:00' },
      end: { dateTime: '2026-10-20T14:40:00+07:00' }
    }
  ];

  const result = synthesizer.evaluateAgendaPosition(mockEvents, nowMs);

  assert.equal(result.status, 'GAP');
  assert.equal(result.ongoingEvent, null);
  assert.equal(result.lastCompletedEvent.summary, 'Sosiolinguistik Arab (Arb)');
  assert.equal(result.lastCompletedEvent.endedAgoMins, 5);
  assert.equal(result.nextUpcomingEvent.summary, 'Bahasa Arab Tulis III (Arb1)');
  assert.equal(result.nextUpcomingEvent.startsInMins, 15);
  assert.match(result.summaryText, /WAKTU JEDA \/ TRANSISI/);
});

test('Situational_Synthesizer - evaluateAgendaPosition handles ALL_COMPLETED and NO_EVENTS', () => {
  const nowMs = new Date('2026-10-20T19:00:00+07:00').getTime();

  const mockEvents = [
    {
      summary: 'Kelas Pagi',
      start: { dateTime: '2026-10-20T08:00:00+07:00' },
      end: { dateTime: '2026-10-20T10:00:00+07:00' }
    }
  ];

  const resCompleted = synthesizer.evaluateAgendaPosition(mockEvents, nowMs);
  assert.equal(resCompleted.status, 'ALL_COMPLETED');
  assert.match(resCompleted.summaryText, /SELURUH AGENDA HARI INI TELAH SELESAI/);

  const resEmpty = synthesizer.evaluateAgendaPosition([], nowMs);
  assert.equal(resEmpty.status, 'NO_EVENTS');
});

test('Situational_Synthesizer - Emotional Inertia tracks and decays over 15 minutes', () => {
  const baseTime = 1000000;

  synthesizer.recordTurnEmotion('STRESSED', 'Tugas numpuk pusing banget');
  
  // Dalam 5 menit
  const activeInertia = synthesizer.getActiveEmotionalInertia(Date.now() + 5 * 60 * 1000);
  assert.ok(activeInertia);
  assert.equal(activeInertia.mood, 'STRESSED');
  assert.match(activeInertia.userText, /Tugas numpuk/);

  // Setelah 20 menit (melewati 15 menit)
  const expiredInertia = synthesizer.getActiveEmotionalInertia(Date.now() + 20 * 60 * 1000);
  assert.equal(expiredInertia, null);
});

test('Situational_Synthesizer - buildSituationalPromptBlock generates comprehensive warning', () => {
  const nowMs = new Date('2026-10-20T12:36:00+07:00').getTime();
  const mockEvents = [
    {
      summary: 'Sosiolinguistik Arab (Arb)',
      start: { dateTime: '2026-10-20T11:00:00+07:00' },
      end: { dateTime: '2026-10-20T12:40:00+07:00' }
    }
  ];

  const promptBlock = synthesizer.buildSituationalPromptBlock({
    calendarEvents: mockEvents,
    nowMs
  });

  assert.match(promptBlock, /SITUASI & KONDISI NYATA TUAN FAQIH/);
  assert.match(promptBlock, /SEDANG BERLANGSUNG 'Sosiolinguistik Arab \(Arb\)'/);
  assert.match(promptBlock, /JANGAN PERNAH menyatakan sesi ini sudah selesai/);
  assert.match(promptBlock, /Status Fisik & Sensor/);
});
