const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();
const { startLiveSession, closeLiveSession } = require('../src/core/Live_Voice_Engine');
const { executeLiveTool } = require('../src/core/Live_Tool_Registry');

// Mock client WebSocket to receive audio packets & events from server
class MockClientWs {
  constructor() {
    this.readyState = 1; // WebSocket.OPEN
    this.receivedPackets = [];
    this.onReadyCallback = null;
  }

  send(data) {
    try {
      const parsed = JSON.parse(data.toString());
      this.receivedPackets.push(parsed);

      if (parsed.type === 'CALL_LIVE_READY') {
        console.log('  📱 [Mock Android Client] Received Event: CALL_LIVE_READY (Session ID: ' + parsed.sessionId + ')');
        if (this.onReadyCallback) this.onReadyCallback();
      } else if (parsed.type === 'CALL_AUDIO_PLAY') {
        process.stdout.write('🎵');
      } else if (parsed.type === 'CALL_AUDIO_INTERRUPTED') {
        console.log('\n  ⚡ [Mock Android Client] Received Event: CALL_AUDIO_INTERRUPTED (Buffer Muted)');
      }
    } catch (_) {}
  }
}

async function runLiveEngineTest() {
  console.log('='.repeat(85));
  console.log('🧪 UNIT & INTEGRATION TEST: N.E.X.A LIVE VOICE ENGINE & TOOL REGISTRY');
  console.log('='.repeat(85));

  // 1. Test Live Tools directly
  console.log('\n--- 1. TESTING LIVE TOOL REGISTRY EXECUTIONS ---');
  
  // Test 1a: recordExpense
  console.log('\n[TEST 1A] Testing recordExpense tool...');
  const expRes = await executeLiveTool('recordExpense', {
    amount: 17500,
    category: 'Makanan & Minuman',
    description: 'Es Teh Manis & Gorengan (Live Voice Test)',
    paymentMethod: 'QRIS'
  });
  console.log('Result 1A:', expRes);
  if (expRes.status !== 'SUCCESS') throw new Error('recordExpense failed!');

  // Test 1b: queryFinancialSummary
  console.log('\n[TEST 1B] Testing queryFinancialSummary tool...');
  const finRes = await executeLiveTool('queryFinancialSummary', { timeframe: 'today' });
  console.log('Result 1B:', finRes);

  // Test 1c: queryPersonalFacts
  console.log('\n[TEST 1C] Testing queryPersonalFacts tool...');
  const memRes = await executeLiveTool('queryPersonalFacts', { query: 'diplomasi' });
  console.log('Result 1C:', memRes);

  // 2. Test Live Voice Engine WebSocket Relay to Google
  console.log('\n--- 2. TESTING LIVE VOICE ENGINE ORCHESTRATOR ---');
  const mockClient = new MockClientWs();
  const testSessionId = `TEST_LIVE_${Date.now()}`;

  await new Promise((resolve, reject) => {
    mockClient.onReadyCallback = () => {
      console.log('\n  ✅ Live Voice Session successfully handshaked with Google Gemini Live API!');
      // Wait 3s to observe audio packets if any
      setTimeout(() => {
        console.log('\n  🛑 Closing test session...');
        closeLiveSession(testSessionId);
        resolve();
      }, 3000);
    };

    const session = startLiveSession(testSessionId, mockClient);
    setTimeout(() => {
      if (!session.isSetupComplete) {
        reject(new Error('Session setup timed out!'));
      }
    }, 10000);
  });

  console.log('\n' + '='.repeat(85));
  console.log('🏆 SEMUA PENGUJIAN LIVE VOICE ENGINE & TOOLS 100% SUKSES!');
  console.log('='.repeat(85));
}

runLiveEngineTest().catch((e) => {
  console.error('❌ Test Failed:', e);
  process.exit(1);
});
