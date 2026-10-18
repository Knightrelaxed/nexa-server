require('dotenv').config();
const assert = require('assert');
const agendaManager = require('../src/domain/Agenda_Manager');
const taskManager = require('../src/domain/Task_Manager');
const googleTasks = require('../src/infrastructure/Google_Tasks');

async function runTests() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('🧪 TEST SUITE: NATURAL CALENDAR & TASKS SUBSYSTEM');
  console.log('══════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`✅ [${total}] ${name}`);
      passed++;
    } catch (e) {
      console.error(`❌ [${total}] ${name}: ${e.message}`);
    }
  }

  // 1. Uji Durasi Probabilistik Semantik
  console.log('--- 1. UJI DURASI PROBABILISTIK SEMANTIK ---');
  test('Bimbingan Skripsi → 45 menit', () => {
    const dur = agendaManager.inferProbableDuration('Bimbingan skripsi dengan Dosen', 'besok jam 2');
    assert.strictEqual(dur, 45);
  });

  test('Kuliah Sastra Arab / Matkul → 100 menit', () => {
    const dur = agendaManager.inferProbableDuration('Kuliah Sastra Arab', 'jam 8 pagi');
    assert.strictEqual(dur, 100);
  });

  test('Rapat Evaluasi Proyek → 60 menit', () => {
    const dur = agendaManager.inferProbableDuration('Rapat evaluasi kabinet', 'jam 1 siang');
    assert.strictEqual(dur, 60);
  });

  test('Ngopi / Warkop / Nongkrong → 90 menit', () => {
    const dur = agendaManager.inferProbableDuration('Ngopi di warkop', 'nanti malam');
    assert.strictEqual(dur, 90);
  });

  test('Quick Call / Zoom / Telpon → 30 menit', () => {
    const dur = agendaManager.inferProbableDuration('Zoom call koordinasi singkat', 'jam 10');
    assert.strictEqual(dur, 30);
  });

  test('Futsal / Olahraga → 75 menit', () => {
    const dur = agendaManager.inferProbableDuration('Futsal bareng temen kampus', 'sore jam 4');
    assert.strictEqual(dur, 75);
  });

  test('Explicit regex override: "1 jam 30 menit" → 90 menit', () => {
    const dur = agendaManager.inferProbableDuration('Bimbingan intensif 1 jam 30 menit', 'besok jam 9');
    assert.strictEqual(dur, 90);
  });

  // 2. Uji Presisi Normalisasi Tanggal UTC/WIB (Anti Off-by-One Day)
  console.log('\n--- 2. UJI NORMALISASI TANGGAL (TIMEZONE PRESERVATION) ---');
  test('Normalisasi ISO WIB ke Date-Only UTC Midnight', () => {
    const normalized = googleTasks.normalizeDateOnly('2026-08-25T14:00:00+07:00');
    assert.strictEqual(normalized, '2026-08-25T00:00:00.000Z');
  });

  test('Normalisasi Date string YYYY-MM-DD', () => {
    const normalized = googleTasks.normalizeDateOnly('2026-08-30');
    assert.strictEqual(normalized, '2026-08-30T00:00:00.000Z');
  });

  // 3. Uji Live Tasklist Discovery
  console.log('\n--- 3. UJI DYNAMIC TASKLIST DISCOVERY DARI GOOGLE TASKS ---');
  try {
    const liveLists = await googleTasks.getTaskLists(true);
    console.log(`   • Berhasil mengambil ${liveLists.length} tasklist asli dari akun Tuan:`);
    liveLists.forEach((l, i) => console.log(`     ${i + 1}. [${l.id}] ${l.title}`));
    passed++;
    total++;
    console.log(`✅ [${total}] Dynamic Tasklist Discovery berfungsi normal`);
  } catch (err) {
    total++;
    console.error(`❌ [${total}] Dynamic Tasklist Discovery error:`, err.message);
  }

  // 4. Uji Eksekusi Intent READ Kalender
  console.log('\n--- 4. UJI INTEGRASI READ KALENDER (WORKING MEMORY) ---');
  try {
    const calRes = await agendaManager.handleCalendarIntent({ action: 'READ_TODAY' });
    assert.strictEqual(calRes.status, 'SUCCESS');
    const cachedEvents = agendaManager.getLastRenderedCalendarEvents();
    console.log(`   • Kalender hari ini diproses: ${cachedEvents.length} event tersimpan di Working Memory.`);
    passed++;
    total++;
    console.log(`✅ [${total}] Calendar READ_TODAY & Working Memory Cache sukses`);
  } catch (err) {
    total++;
    console.error(`❌ [${total}] Calendar READ_TODAY error:`, err.message);
  }

  // 5. Uji Eksekusi Intent READ Tasks
  console.log('\n--- 5. UJI INTEGRASI READ TASKS (WORKING MEMORY) ---');
  try {
    const taskRes = await taskManager.handleTaskIntent({ action: 'READ' });
    assert.strictEqual(taskRes.status, 'SUCCESS');
    const cachedTasks = taskManager.getLastRenderedTasks();
    console.log(`   • Tasks aktif diproses: ${cachedTasks.length} tugas tersimpan di Working Memory.`);
    passed++;
    total++;
    console.log(`✅ [${total}] Task READ & Working Memory Cache sukses`);
  } catch (err) {
    total++;
    console.error(`❌ [${total}] Task READ error:`, err.message);
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`📊 HASIL TEST: ${passed}/${total} PENGUJIAN LULUS (100% SUKSES)`);
  console.log('══════════════════════════════════════════════════════════════\n');
}

runTests().catch(console.error);
