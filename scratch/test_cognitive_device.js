// ============================================================
// Cognitive End-to-End Test: Natural Language -> AI Router -> Device Control Engine -> Real Phone
// ============================================================
'use strict';

const http = require('http');

const testCases = [
  "Nexa, tolong ucapkan di HP 'Pengujian kognitif N.E.X.A 3.0 berhasil sempurna, Tuan Faqih.'",
  "Nexa, berapa persentase baterai HP-ku sekarang?",
  "Nexa, tolong cek status jaringan dan wifi HP"
];

async function runTest(message) {
  return new Promise((resolve, reject) => {
    console.log(`\n========================================================`);
    console.log(`🗣️ PROMPT INPUT: "${message}"`);
    console.log(`========================================================`);

    const data = JSON.stringify({ message });
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/webhook/device-test',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          console.log('🤖 AI Intent Extracted:', JSON.stringify(parsed.routingData, null, 2));
          console.log('📱 Phone Execution Result:', JSON.stringify(parsed.result, null, 2));
          resolve(parsed);
        } catch (e) {
          console.log('Raw Response:', body);
          resolve(body);
        }
      });
    });

    req.on('error', err => {
      console.error('Request Error:', err.message);
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

async function main() {
  for (const tc of testCases) {
    await runTest(tc);
    await new Promise(r => setTimeout(r, 2000));
  }
}

main().catch(console.error);
