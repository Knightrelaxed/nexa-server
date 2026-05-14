const { routeUserMessage } = require('./src/core/AI_Router');

async function test(input, label) {
  console.log(`\n--- ${label} ---`);
  const res = await routeUserMessage(input);
  console.log('Intent:', res.intent);
  console.log('extracted_data keys:', Object.keys(res.extracted_data || {}));
  const topKey = Object.keys(res.extracted_data || {})[0];
  if (topKey) {
    console.log(`Top-level key: "${topKey}"`, typeof res.extracted_data[topKey]);
    if (typeof res.extracted_data[topKey] === 'object') {
      console.log('Sub-keys:', Object.keys(res.extracted_data[topKey] || {}));
    }
  }
}

async function main() {
  // Test CALENDAR
  await test('Nexa, tambahkan jadwal Rapat warna merah besok jam 4 siang 1 jam', 'CALENDAR with color');
  // Test TASK
  await test('Nexa, tambahkan tugas beli buku kuliah', 'TASK CREATE');
  // Test FINANCE
  await test('Nexa, catat pengeluaran 20ribu beli kopi', 'FINANCE RECORD');
}

main();
