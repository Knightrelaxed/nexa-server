// ============================================================
// End-to-End Test: Device Control Engine with Real Mobile Bridge
// ============================================================
'use strict';

const deviceControlEngine = require('../src/domain/Device_Control_Engine');

async function runTests() {
  console.log('========================================================');
  console.log('📱 TESTING DEVICE_CONTROL_ENGINE VIA AZURE VPS WSS');
  console.log('========================================================');

  // Test 1: SPEAK_TEXT
  console.log('\n1️⃣ Testing SPEAK_TEXT...');
  const ttsRouting = {
    intent: 'DEVICE_CONTROL',
    extracted_data: {
      action: 'SPEAK_TEXT',
      text: 'Pengujian arsitektur penuh berhasil. N.E.X.A Assistant mengendalikan perangkat secara otonom.'
    },
    reply_message: 'Membacakan teks di HP...'
  };
  const ttsRes = await deviceControlEngine.executeDeviceAction(ttsRouting);
  console.log('Result:', ttsRes);

  // Test 2: GET_BATTERY_STATUS
  console.log('\n2️⃣ Testing GET_BATTERY_STATUS...');
  const batRouting = {
    intent: 'DEVICE_CONTROL',
    extracted_data: { action: 'GET_BATTERY_STATUS' },
    reply_message: 'Mengecek baterai...'
  };
  const batRes = await deviceControlEngine.executeDeviceAction(batRouting);
  console.log('Result:', batRes);

  // Test 3: GET_NETWORK_INFO
  console.log('\n3️⃣ Testing GET_NETWORK_INFO...');
  const netRouting = {
    intent: 'DEVICE_CONTROL',
    extracted_data: { action: 'GET_NETWORK_INFO' },
    reply_message: 'Mengecek jaringan...'
  };
  const netRes = await deviceControlEngine.executeDeviceAction(netRouting);
  console.log('Result:', netRes);

  console.log('\n========================================================');
  console.log('🎉 ALL DEVICE CONTROL ENGINE TESTS COMPLETED!');
  console.log('========================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
