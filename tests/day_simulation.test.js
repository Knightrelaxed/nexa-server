'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createNotifier, createMemoryStore } = require('../src/core/Notifier');
const fi = require('../src/domain/Finance_Intel');

test('24-Hour Day Simulation: full lifecycle of crons, quiet hours, digests, caps, and safety guards', async () => {
  const sentMessages = [];
  const blockedCorruptions = [];
  let simulatedClock = new Date('2026-10-12T00:00:00+07:00'); // Start at 00:00 WIB

  const store = createMemoryStore();
  const notifier = createNotifier({
    store,
    send: async (text, meta) => {
      sentMessages.push({
        text,
        meta,
        timestamp: new Date(simulatedClock).toISOString(),
        hourWib: (simulatedClock.getUTCHours() + 7) % 24
      });
    },
    now: () => simulatedClock
  });

  const advanceTimeTo = (isoTime) => {
    simulatedClock = new Date(isoTime);
  };

  // -------------------------------------------------------------
  // 01:00 WIB - Midnight Check-in cron (Quiet hours active: 23:00 - 05:00)
  // -------------------------------------------------------------
  advanceTimeTo('2026-10-12T01:00:00+07:00');
  const midnightRun = await notifier.notify({
    kind: 'SCHEDULED_MIDNIGHT_CHECKIN',
    priority: 'P1',
    isScheduled: true,
    text: '🌙 Midnight System Check-In: Seluruh layanan operasional normal.'
  });
  // Since it is 01:00 WIB (quiet hours), P1 must be deferred
  assert.equal(midnightRun.status, 'QUEUED_DEFERRED', 'Midnight check-in should be deferred during quiet hours');
  assert.equal(sentMessages.length, 0, 'No messages should be sent during quiet hours');

  // -------------------------------------------------------------
  // 03:40 WIB - Recurring Rule Detection Cron
  // -------------------------------------------------------------
  advanceTimeTo('2026-10-12T03:40:00+07:00');
  const sampleTransactions = [
    { merchant: 'Spotify AB', nominal: 54990, date: '2026-07-10T03:00:00Z', type: 'EXPENSE' },
    { merchant: 'Spotify AB', nominal: 54990, date: '2026-08-10T03:00:00Z', type: 'EXPENSE' },
    { merchant: 'Spotify AB', nominal: 54990, date: '2026-09-10T03:00:00Z', type: 'EXPENSE' },
    { merchant: 'Spotify AB', nominal: 54990, date: '2026-10-10T03:00:00Z', type: 'EXPENSE' }
  ];
  const detectedRules = fi.detectRecurring(sampleTransactions, { now: simulatedClock.getTime() });
  assert.equal(detectedRules.length, 1);
  assert.equal(detectedRules[0].displayName, 'Spotify AB');
  assert.equal(detectedRules[0].cadence, 'MONTHLY');

  // -------------------------------------------------------------
  // 05:30 WIB - Morning Flush Deferred Cron
  // -------------------------------------------------------------
  advanceTimeTo('2026-10-12T05:30:00+07:00'); // Quiet hours over (ends at 05:00)
  const deferredFlush = await notifier.flushDeferred();
  assert.equal(deferredFlush.status, 'SENT', 'Deferred messages should be successfully sent after quiet hours');
  assert.equal(sentMessages.length, 1, 'Deferred message should have been delivered');
  assert.match(sentMessages[0].text, /Ditunda semalam/);
  assert.match(sentMessages[0].text, /Midnight System Check-In/);

  // -------------------------------------------------------------
  // 06:00 WIB - Morning Executive Briefing Cron (isScheduled: true)
  // -------------------------------------------------------------
  advanceTimeTo('2026-10-12T06:00:00+07:00');
  const safeSpendCalc = fi.safeToSpendToday({
    balance: 5_000_000,
    daysLeftInMonth: 20,
    billsDueBeforeMonthEnd: 1_000_000,
    safetyBufferRatio: 0.1
  });
  const morningBriefText = `🌅 <b>Executive Morning Briefing</b>\n\nAlokasi Belanja Aman Hari Ini: Rp ${safeSpendCalc.remainingToday.toLocaleString('id-ID')}`;
  
  // Guard verification: Text MUST NOT contain any corruption
  assert.ok(!morningBriefText.includes('[object Object]'));
  assert.ok(!morningBriefText.includes('NaN'));

  const morningBrief = await notifier.notify({
    kind: 'SCHEDULED_MORNING_BRIEFING',
    priority: 'P1',
    isScheduled: true,
    text: morningBriefText
  });
  assert.equal(morningBrief.status, 'SENT');
  assert.equal(sentMessages.length, 2);
  assert.match(sentMessages[1].text, /Rp 175\.000/);

  // -------------------------------------------------------------
  // 08:30 WIB - Time-Sensitive Event Proximity Alert (P0)
  // -------------------------------------------------------------
  advanceTimeTo('2026-10-12T08:30:00+07:00');
  const eventAlert = await notifier.notify({
    kind: 'EVENT_PROXIMITY',
    priority: 'P1',
    timeSensitive: true, // Elevates to P0 immediate
    expiresAt: '2026-10-12T09:00:00+07:00',
    text: '⏰ <b>Pengingat Acara</b>: Meeting dengan Investor dalam 30 menit.'
  });
  assert.equal(eventAlert.status, 'SENT');
  assert.equal(sentMessages.length, 3);
  assert.match(sentMessages[2].text, /Meeting dengan Investor/);

  // -------------------------------------------------------------
  // 10:00 WIB - Smart Nudge 1 (P1, Discretionary)
  // -------------------------------------------------------------
  advanceTimeTo('2026-10-12T10:00:00+07:00');
  const nudge1 = await notifier.notify({
    kind: 'TASK_NUDGE',
    priority: 'P1',
    isScheduled: false,
    text: '📌 Tugas prioritas: Review dokumen Q3.'
  });
  assert.equal(nudge1.status, 'SENT'); // 1 of 3 discretionary cap
  assert.equal(sentMessages.length, 4);

  // -------------------------------------------------------------
  // 12:00 WIB - Midday Pulse Cron (isScheduled: true)
  // -------------------------------------------------------------
  advanceTimeTo('2026-10-12T12:00:00+07:00');
  const middayPulse = await notifier.notify({
    kind: 'SCHEDULED_MIDDAY_PULSE',
    priority: 'P1',
    isScheduled: true,
    text: '⚡ <b>Midday Pulse</b>: 4 tugas selesai, ritme fokus sangat baik.'
  });
  assert.equal(middayPulse.status, 'SENT', 'Scheduled report must not be blocked by discretionary cap');
  assert.equal(sentMessages.length, 5);

  // -------------------------------------------------------------
  // 12:30 WIB - Midday Flush Digest Cron
  // -------------------------------------------------------------
  advanceTimeTo('2026-10-12T12:30:00+07:00');
  const middayDigest = await notifier.flushDigest();
  assert.equal(middayDigest.status, 'EMPTY', 'No P2 messages were queued so digest is empty');

  // -------------------------------------------------------------
  // 14:00 WIB - Smart Nudge 2 (P1, Discretionary)
  // -------------------------------------------------------------
  advanceTimeTo('2026-10-12T14:00:00+07:00');
  const nudge2 = await notifier.notify({
    kind: 'TASK_NUDGE',
    priority: 'P1',
    isScheduled: false,
    text: '📌 Follow up PR di GitHub.'
  });
  assert.equal(nudge2.status, 'SENT'); // 2 of 3 discretionary cap
  assert.equal(sentMessages.length, 6);

  // -------------------------------------------------------------
  // 16:00 WIB - Smart Nudge 3 (P1, Discretionary - Last slot!)
  // -------------------------------------------------------------
  advanceTimeTo('2026-10-12T16:00:00+07:00');
  const nudge3 = await notifier.notify({
    kind: 'HEALTH_NUDGE',
    priority: 'P1',
    isScheduled: false,
    text: '💧 Waktunya minum air dan istirahatkan mata sejenak.'
  });
  assert.equal(nudge3.status, 'SENT'); // 3 of 3 discretionary cap consumed!
  assert.equal(sentMessages.length, 7);

  // -------------------------------------------------------------
  // 16:30 WIB - Smart Nudge 4 (P1, Discretionary - Hits Cap!)
  // -------------------------------------------------------------
  advanceTimeTo('2026-10-12T16:30:00+07:00');
  const nudge4 = await notifier.notify({
    kind: 'READING_NUDGE',
    priority: 'P1',
    isScheduled: false,
    text: '📚 Artikel arsitektur microservices siap dibaca.'
  });
  assert.equal(nudge4.status, 'QUEUED_DIGEST', 'Exceeding 3 discretionary nudges must demote to digest');
  assert.equal(sentMessages.length, 7, 'Message 4 must not be delivered immediately');

  // -------------------------------------------------------------
  // 17:00 WIB - Evening Debrief Cron (isScheduled: true)
  // -------------------------------------------------------------
  advanceTimeTo('2026-10-12T17:00:00+07:00');
  const eveningDebrief = await notifier.notify({
    kind: 'SCHEDULED_EVENING_DEBRIEF',
    priority: 'P1',
    isScheduled: true,
    text: '🌆 <b>Evening Debrief</b>: Hari produktif, seluruh target harian tercapai.'
  });
  assert.equal(eveningDebrief.status, 'SENT', 'Scheduled evening debrief must deliver despite discretionary cap');
  assert.equal(sentMessages.length, 8);

  // -------------------------------------------------------------
  // 19:30 WIB - Evening Flush Digest Cron (Flushes Nudge 4!)
  // -------------------------------------------------------------
  advanceTimeTo('2026-10-12T19:30:00+07:00');
  const eveningDigest = await notifier.flushDigest();
  assert.equal(eveningDigest.status, 'SENT');
  assert.equal(sentMessages.length, 9);
  assert.match(sentMessages[8].text, /Ringkasan/);
  assert.match(sentMessages[8].text, /Artikel arsitektur microservices/);

  // -------------------------------------------------------------
  // 21:00 WIB - Tomorrow Prep Cron (isScheduled: true)
  // -------------------------------------------------------------
  advanceTimeTo('2026-10-12T21:00:00+07:00');
  const tomorrowPrep = await notifier.notify({
    kind: 'SCHEDULED_TOMORROW_PREP',
    priority: 'P1',
    isScheduled: true,
    text: '📋 <b>Tomorrow Preparation</b>: Besok ada 2 agenda pagi.'
  });
  assert.equal(tomorrowPrep.status, 'SENT');
  assert.equal(sentMessages.length, 10);

  // -------------------------------------------------------------
  // 23:15 WIB - Late Night Nudge (Quiet hours active: 23:00 - 05:00)
  // -------------------------------------------------------------
  advanceTimeTo('2026-10-12T23:15:00+07:00');
  const lateNudge = await notifier.notify({
    kind: 'RANDOM_THOUGHT',
    priority: 'P1',
    text: '💡 Ide proyek sampingan.'
  });
  assert.equal(lateNudge.status, 'QUEUED_DEFERRED', 'Night messages must be deferred to avoid waking user');
  assert.equal(sentMessages.length, 10);

  // -------------------------------------------------------------
  // 23:45 WIB - Critical Security Alert (P0 Time-Sensitive)
  // -------------------------------------------------------------
  advanceTimeTo('2026-10-12T23:45:00+07:00');
  const criticalAlert = await notifier.notify({
    kind: 'SECURITY_ALERT',
    priority: 'P0',
    timeSensitive: true,
    text: '🚨 <b>Peringatan Keamanan Kritis</b>: Percobaan login unauthorized dicegah.'
  });
  assert.equal(criticalAlert.status, 'SENT', 'P0 critical alert must bypass quiet hours immediately');
  assert.equal(sentMessages.length, 11);
  assert.match(sentMessages[10].text, /Peringatan Keamanan Kritis/);

  // -------------------------------------------------------------
  // Corruption Guard Check across the board
  // -------------------------------------------------------------
  const corruptedAttempts = [
    'Saldo: Rp [object Object]',
    'Tagihan: Rp NaN',
    'Status: undefined'
  ];
  for (const badText of corruptedAttempts) {
    const res = await notifier.notify({ kind: 'TEST', priority: 'P0', text: badText });
    assert.equal(res.status, 'DROPPED');
    assert.equal(res.reason, 'corrupted_content');
  }
  assert.equal(sentMessages.length, 11, 'Corrupted messages must never reach sent outbound log');

  console.log(`[DAY-SIMULATION] ✅ Complete 24h simulation finished successfully. Total delivered messages: ${sentMessages.length}.`);
});
