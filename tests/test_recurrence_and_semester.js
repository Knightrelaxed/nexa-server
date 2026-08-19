require('dotenv').config();
const assert = require('assert');
const agendaManager = require('../src/domain/Agenda_Manager');
const taskManager = require('../src/domain/Task_Manager');

async function runTests() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('🧪 TEST SUITE: RECURRENCE & SEMESTER SCHEDULING ENGINE');
  console.log('══════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let total = 0;

  function check(desc, condition) {
    total++;
    if (condition) {
      console.log(`✅ [${total}] ${desc}`);
      passed++;
    } else {
      console.error(`❌ [${total}] FAILED: ${desc}`);
      process.exitCode = 1;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 1. UJI PARSER RRULE & RFC 5545 GENERATOR
  // ─────────────────────────────────────────────────────────────
  console.log('--- 1. UJI RRULE RECURRENCE GENERATOR ---');

  // String passthrough
  const r1 = agendaManager.buildRRule('FREQ=DAILY');
  check('String RRULE prepend prefix: "FREQ=DAILY" -> "RRULE:FREQ=DAILY"', r1 === 'RRULE:FREQ=DAILY');

  // Daily
  const rDaily = agendaManager.buildRRule({ frequency: 'DAILY' });
  check('Object Daily: { frequency: "DAILY" }', rDaily === 'RRULE:FREQ=DAILY');

  // Weekly on Thursday
  const rThu = agendaManager.buildRRule({ frequency: 'WEEKLY', by_day: 'TH' });
  check('Object Weekly Thursday: { by_day: "TH" }', rThu === 'RRULE:FREQ=WEEKLY;BYDAY=TH');

  // Multi-day Mon & Thu
  const rMonThu = agendaManager.buildRRule({ frequency: 'WEEKLY', by_day: ['MO', 'TH'] });
  check('Object Multi-day: { by_day: ["MO","TH"] }', rMonThu === 'RRULE:FREQ=WEEKLY;BYDAY=MO,TH');

  // Weekdays (Mon-Fri)
  const rWorkdays = agendaManager.buildRRule({ frequency: 'WEEKLY', by_day: 'MO,TU,WE,TH,FR' });
  check('Object Weekdays: { by_day: "MO,TU,WE,TH,FR" }', rWorkdays === 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');

  // Custom Interval: every 2 weeks on Friday
  const rInterval = agendaManager.buildRRule({ frequency: 'WEEKLY', interval: 2, by_day: 'FR' });
  check('Object Custom Interval 2 weeks: { interval: 2, by_day: "FR" }', rInterval === 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=FR');

  // Semester End Date (UNTIL)
  const rUntil = agendaManager.buildRRule({ frequency: 'WEEKLY', by_day: 'MO', until_date: '2026-12-31' });
  check('Semester UNTIL date: { until_date: "2026-12-31" }', rUntil === 'RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T235959Z');

  // Lecture Count (14 meetings)
  const rCount = agendaManager.buildRRule({ frequency: 'WEEKLY', by_day: 'WE', count: 14 });
  check('Lecture COUNT: { count: 14 }', rCount === 'RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=14');


  // ─────────────────────────────────────────────────────────────
  // 2. UJI KALKULASI FIRST OCCURRENCE DATE (ANCHOR DATE CALCULATOR)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 2. UJI FIRST OCCURRENCE ANCHOR DATE CALCULATOR ---');

  // Tuesday anchor: 2026-08-25
  const anchor = '2026-08-25'; // This is a Tuesday

  // Target Tuesday (same day)
  const fTue = agendaManager.calculateFirstOccurrenceDate(anchor, 'TU', '10:00');
  check('First Tuesday from Tuesday anchor -> 2026-08-25T10:00:00+07:00', fTue === '2026-08-25T10:00:00+07:00');

  // Target Thursday (+2 days)
  const fThu = agendaManager.calculateFirstOccurrenceDate(anchor, 'TH', '13:30');
  check('First Thursday from Tuesday anchor -> 2026-08-27T13:30:00+07:00', fThu === '2026-08-27T13:30:00+07:00');

  // Target Monday (+6 days)
  const fMon = agendaManager.calculateFirstOccurrenceDate(anchor, 'MO', '08:00');
  check('First Monday from Tuesday anchor -> 2026-08-31T08:00:00+07:00', fMon === '2026-08-31T08:00:00+07:00');


  // ─────────────────────────────────────────────────────────────
  // 3. UJI BATCH CREATE JADWAL KULIAH 1 SEMESTER (CREATE_MULTIPLE)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 3. UJI BATCH SEMESTER SCHEDULE INGESTION ---');

  const batchPayload = {
    action: 'CREATE_MULTIPLE',
    semester_start: '2026-08-25',
    semester_end: '2026-12-31',
    events: [
      {
        summary: 'TEST Sastra Arab Kontemporer',
        day_of_week: 'MO',
        start_time: '08:00',
        end_time: '10:00',
        location: 'R. 301',
        color_id: '7'
      },
      {
        summary: 'TEST Diplomasi Timur Tengah',
        day_of_week: 'TU',
        start_time: '10:00',
        end_time: '12:00',
        location: 'R. 204',
        color_id: '7'
      }
    ]
  };

  const batchRes = await agendaManager.handleCalendarIntent(batchPayload, 'jadwalkan kuliah semester');
  check('CREATE_MULTIPLE status SUCCESS', batchRes.status === 'SUCCESS');
  check('CREATE_MULTIPLE created 2 courses', batchRes.count === 2);
  check('CREATE_MULTIPLE message contains formatted list', batchRes.message.includes('Sastra Arab Kontemporer') && batchRes.message.includes('Diplomasi Timur Tengah'));

  // Clean up created test events
  try {
    const ev1 = await agendaManager.handleCalendarIntent({ action: 'DELETE', summary: 'TEST Sastra Arab Kontemporer' });
    const ev2 = await agendaManager.handleCalendarIntent({ action: 'DELETE', summary: 'TEST Diplomasi Timur Tengah' });
    console.log('   • Cleanup test events completed.');
  } catch (_) {}


  // ─────────────────────────────────────────────────────────────
  // 4. UJI TUGAS BERWAKTU VS DEADLINE (TIME-BLOCKING SAFETY)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 4. UJI TUGAS BERWAKTU VS DEADLINE BADGE ---');

  const taskPayload = {
    action: 'CREATE',
    title: 'TEST Tugas Makalah Diplomasi',
    due_date: '2026-08-22', // Deadline
    sync_calendar: true,
    calendar_start_time: '2026-08-21T14:30:00+07:00', // Work block start
    duration_minutes: 60 // 14:30 - 15:30 (NOT full day)
  };

  const taskRes = await taskManager.handleTaskIntent(taskPayload);
  check('Task creation with work block status SUCCESS', taskRes.status === 'SUCCESS');
  check('Task confirmed with deadline and work block', taskRes.message.includes('Tugas Makalah Diplomasi'));

  // Clean up created test task & calendar block
  try {
    await taskManager.handleTaskIntent({ action: 'DELETE', search_keyword: 'TEST Tugas Makalah Diplomasi' });
    console.log('   • Cleanup test task completed.');
  } catch (_) {}

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`📊 HASIL TEST: ${passed}/${total} PENGUJIAN LULUS (${passed === total ? '100% SUKSES' : 'ADA YANG GAGAL'})`);
  console.log('══════════════════════════════════════════════════════════════\n');
}

runTests().catch(console.error);
