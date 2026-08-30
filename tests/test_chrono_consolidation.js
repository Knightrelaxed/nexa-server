/**
 * ============================================================
 * [TEST] CHRONO-EPISODIC CONSOLIDATION & RECALL TEST SUITE
 * ============================================================
 * Menjalankan uji menyeluruh untuk:
 *   1. Date conversion & Indonesian day name resolution
 *   2. JSON parsing & sanitization
 *   3. Episodic Recall formatting
 *   4. Dry-run Chrono-Consolidation against database
 * ============================================================
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const chrono = require('../src/domain/Chrono_Consolidator');
const recall = require('../src/domain/Episodic_Recall');
const supabaseMemories = require('../src/infrastructure/Supabase_Memories');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 TEST: CHRONO-EPISODIC CONSOLIDATION ENGINE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`);
      failed++;
    }
  }

  // ── TEST 1: Date & Day Name Helpers ─────────────────────────
  console.log('--- TEST 1: Date & Day Name Helpers ---');
  const dayKamis = chrono.getIndonesianDayName('2026-05-14');
  assert(dayKamis === 'Kamis', `2026-05-14 resolved to ${dayKamis} (expected: Kamis)`);

  const daySenin = chrono.getIndonesianDayName('2026-08-10');
  assert(daySenin === 'Senin', `2026-08-10 resolved to ${daySenin} (expected: Senin)`);

  const wibDate = supabaseMemories.toWibDateString('2026-05-14T01:30:00.000Z');
  assert(wibDate === '2026-05-14', `UTC 01:30 resolved to WIB date ${wibDate} (expected: 2026-05-14)`);

  // ── TEST 2: JSON Sanitization & Parsing ─────────────────────
  console.log('\n--- TEST 2: JSON Sanitizer ---');
  const mockAiOutput = '```json\n{\n  "narrative": "Hari ini saya membantu Tuan...",\n  "key_events": [{"category": "ACADEMIC", "detail": "Bimbingan"}]\n}\n```';
  const parsedJson = chrono.parseJsonOutput(mockAiOutput);
  assert(parsedJson !== null, 'Cleanly stripped markdown and parsed JSON');
  assert(parsedJson?.narrative === 'Hari ini saya membantu Tuan...', 'Narrative text extracted correctly');
  assert(parsedJson?.key_events?.length === 1, 'Key events array extracted');

  // ── TEST 3: Episodic Recall Formatter ───────────────────────
  console.log('\n--- TEST 3: Recall Formatter ---');
  const mockRecord = {
    narrative_date: '2026-05-14',
    day_name: 'Kamis',
    narrative: 'Pagi hari pukul 08:15 WIB, Tuan menanyakan jadwal bimbingan kepada saya...',
    key_events: [
      { category: 'ACADEMIC', detail: 'Bimbingan dengan Pak Dosen Budi' },
      { category: 'FINANCE', detail: 'Servis laptop Rp450.000 di Gejayan' }
    ],
    unresolved_loops: ['Follow-up email lab'],
    mood_state: 'FOCUSED',
    total_chat_count: 42
  };

  const formattedSingle = recall.formatSingleDayNarrative(mockRecord);
  assert(formattedSingle.includes('Catatan Memori N.E.X.A'), 'Formatted title includes N.E.X.A header');
  assert(formattedSingle.includes('Pagi hari pukul 08:15 WIB'), 'Formatted text contains full narrative');
  assert(formattedSingle.includes('ACADEMIC'), 'Formatted text includes event category tags');

  const formattedSearch = recall.formatSearchResults('laptop', [mockRecord]);
  assert(formattedSearch.includes('Ditemukan 1 Catatan Memori'), 'Search header indicates match count');
  assert(formattedSearch.includes('Kamis'), 'Search result includes day name');

  // ── TEST 4: Live Database Round-Trip (Insert, Recall, Search, Clean) ──
  console.log('\n--- TEST 4: Live Database Round-Trip ---');
  const testDate = '2099-01-01'; // Future date for safe testing
  const testPayload = {
    narrative_date: testDate,
    day_name: 'Kamis',
    narrative: 'Hari ini saya mendampingi Tuan Faqih menguji coba Chrono-Episodic Consolidation Engine. Seluruh sistem berjalan sempurna.',
    key_events: [
      { category: 'TECH_TEST', detail: 'Uji coba integrasi Chrono-Episodic Daily Consolidation' }
    ],
    named_entities: {
      technologies: ['N.E.X.A Chrono-Consolidator', 'Supabase Postgres']
    },
    unresolved_loops: ['Selesaikan audit menyeluruh sistem N.E.X.A'],
    mood_state: 'TRIUMPHANT',
    approx_sleep_time: '23:59 WIB',
    total_chat_count: 99,
    created_at: new Date().toISOString()
  };

  try {
    // 1. Insert test narrative
    const saved = await supabaseMemories.saveDailyNarrative(testPayload);
    assert(saved !== null, 'Successfully saved test narrative to nexa_daily_narratives');

    // 2. Recall by exact date
    const recalled = await recall.recallDate(testDate);
    assert(recalled?.narrative_date === testDate, `Successfully recalled by date ${testDate}`);
    assert(recalled?.mood_state === 'TRIUMPHANT', 'Mood state matched accurately');

    // 3. Search by keyword
    const searchResults = await recall.searchMemories('Chrono-Episodic', 5);
    assert(searchResults.length > 0, `Search found ${searchResults.length} match(es) for keyword 'Chrono-Episodic'`);

    // 4. Clean up test row
    const { createClient } = require('@supabase/supabase-js');
    const env = require('../src/config/env');
    const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    const { error: delErr } = await sb.from('nexa_daily_narratives').delete().eq('narrative_date', testDate);
    assert(!delErr, 'Successfully cleaned up test record from database');

  } catch (dbErr) {
    console.error('Database round-trip error:', dbErr.message);
    assert(false, `Database round-trip threw error: ${dbErr.message}`);
  }

  // ── TEST 5: Candidate Dates Retrieval ─────────────────────
  console.log('\n--- TEST 5: Candidate Dates Retrieval ---');
  try {
    const candidates = await supabaseMemories.getCandidateDatesToConsolidate(90);
    assert(Array.isArray(candidates), `Candidate dates query returned array with ${candidates.length} candidate(s)`);
    if (candidates.length > 0) {
      console.log(`ℹ️ Found ${candidates.length} date(s) with raw chats older than 90 days:`, candidates.slice(0, 5));
    }
  } catch (candErr) {
    console.error('Candidate query error:', candErr.message);
    assert(false, `Candidate query threw error: ${candErr.message}`);
  }

  // ── SUMMARY ────────────────────────────────────────────────
  console.log('\n====================================================');
  console.log(`🏁 TEST COMPLETE: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
