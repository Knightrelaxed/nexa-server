'use strict';

// Regression: live-call calendar answers (log 2026-11-09 11:54-11:58 UTC).
// Gemini asked for "besok" with {date:'2026-11-10'} and got TODAY's agenda back,
// and the 7-day list carried no day per event, so it guessed Selasa vs Rabu.

const test = require('node:test');
const assert = require('node:assert/strict');

const googleWorkspace = require('../src/infrastructure/Google_Workspace');
const googleTasks = require('../src/infrastructure/Google_Tasks');
const { executeLiveTool } = require('../src/core/Live_Tool_Registry');

// 2026-11-09 11:55 UTC == Monday 18:55 WIB (the moment of the bad call)
const CALL_TIME = Date.parse('2026-11-09T11:55:00Z');

const ev = (summary, startIso, endIso) => ({
  id: summary, summary, start: { dateTime: startIso }, end: { dateTime: endIso }
});

function stubCalendar(t, now, { range = () => [], upcoming = [] } = {}) {
  t.mock.timers.enable({ apis: ['Date'], now });
  const calls = { today: 0, range: [], upcoming: 0 };
  t.mock.method(googleWorkspace, 'getTodaysEvents', async () => { calls.today++; return []; });
  t.mock.method(googleWorkspace, 'getEventsByDateRange', async (a, b) => { calls.range.push([a, b]); return range(a, b); });
  t.mock.method(googleWorkspace, 'getUpcomingEvents', async () => { calls.upcoming++; return upcoming; });
  for (const fn of ['getTasksDueToday', 'getTasksDueTomorrow', 'getUpcomingTasks', 'getTasksByDateRange']) {
    t.mock.method(googleTasks, fn, async () => []);
  }
  return calls;
}

test('queryCalendarAgenda honors an explicit date instead of returning today', async (t) => {
  const calls = stubCalendar(t, CALL_TIME);

  const res = await executeLiveTool('queryCalendarAgenda', { date: '2026-11-10' }, {});

  assert.equal(calls.today, 0, 'must not fall back to today\'s agenda when a date is given');
  assert.equal(calls.range.length, 1);
  assert.equal(Date.parse(calls.range[0][0]), Date.parse('2026-11-10T00:00:00+07:00'));
  assert.equal(Date.parse(calls.range[0][1]), Date.parse('2026-11-10T23:59:59+07:00'));
  assert.match(res.agenda_details, /Selasa/, 'answer must be labelled with the requested weekday');
});

test('queryCalendarAgenda: unknown timeframe ("day") plus date still uses the date', async (t) => {
  const calls = stubCalendar(t, CALL_TIME);

  await executeLiveTool('queryCalendarAgenda', { timeframe: 'day', date: '2026-11-10' }, {});

  assert.equal(calls.today, 0);
  assert.equal(Date.parse(calls.range[0][0]), Date.parse('2026-11-10T00:00:00+07:00'));
});

test('multi-day agenda tags every event with its own day', async (t) => {
  stubCalendar(t, CALL_TIME, {
    upcoming: [
      ev('Genre Sastra Arab', '2026-11-10T08:00:00+07:00', '2026-11-10T09:40:00+07:00'),
      ev('Bahasa Arab Lisan', '2026-11-11T10:00:00+07:00', '2026-11-11T11:40:00+07:00')
    ]
  });

  const res = await executeLiveTool('queryCalendarAgenda', { timeframe: 'upcoming' }, {});
  const lines = res.agenda_details.split('\n');

  assert.match(lines.find(l => l.includes('Genre Sastra Arab')), /Selasa/);
  assert.match(lines.find(l => l.includes('Bahasa Arab Lisan')), /Rabu/);
});

test('"besok" is the next Jakarta day even when the server clock (UTC) is still on the previous date', async (t) => {
  // 2026-11-09 18:00 UTC == Tuesday 01:00 WIB -> besok is Wednesday 11 Nov (WIB).
  // The production server runs in UTC: run this file with TZ=UTC to match it.
  const calls = stubCalendar(t, Date.parse('2026-11-09T18:00:00Z'));

  await executeLiveTool('queryCalendarAgenda', { timeframe: 'tomorrow' }, {});

  assert.equal(calls.range.length, 1);
  assert.equal(Date.parse(calls.range[0][0]), Date.parse('2026-11-11T00:00:00+07:00'));
  const end = Date.parse(calls.range[0][1]);
  assert.ok(end >= Date.parse('2026-11-11T23:59:59+07:00') && end < Date.parse('2026-11-12T00:00:00+07:00'),
    'range must end inside the same Jakarta day');
});

test('queryCalendarAgenda resolves Indonesian weekday name ("rabu") to the upcoming Wednesday in WIB', async (t) => {
  // Monday 9 Nov 2026 -> upcoming Rabu is 2026-11-11
  const calls = stubCalendar(t, CALL_TIME);

  const res = await executeLiveTool('queryCalendarAgenda', { date: 'rabu' }, {});

  assert.equal(calls.today, 0);
  assert.equal(calls.range.length, 1);
  assert.equal(Date.parse(calls.range[0][0]), Date.parse('2026-11-11T00:00:00+07:00'));
  assert.match(res.agenda_details, /Rabu/);
});

