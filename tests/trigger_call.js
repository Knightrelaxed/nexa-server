const adapter = require('../src/interfaces/mobile_bridge/adapter');

async function main() {
  console.log('📞 Memicu panggilan masuk simulasi ke HP Samsung Galaxy A33 5G...');
  try {
    const res = await adapter.simulateIncomingCall(
      'N.E.X.A Assistant',
      'Selamat pagi Tuan Faqih. Ini adalah uji coba transmisi suara live Google Gemini. Silakan angkat panggilan.',
      true
    );
    console.log('✅ Response dari HP:', res);
  } catch (e) {
    console.error('❌ Gagal memicu panggilan:', e.message);
  }
}

main().then(() => process.exit(0));
