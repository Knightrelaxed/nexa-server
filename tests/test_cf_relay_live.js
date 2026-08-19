const WebSocket = require('ws');
require('dotenv').config();

const key = process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY;
const rawBaseUrl = process.env.GEMINI_BASE_URL || 'https://nexa-relay.dazatulloh2.workers.dev';
const cleanHost = rawBaseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

const path = `/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${key}`;
const wsUrl = `wss://${cleanHost}${path}`;

console.log('='.repeat(70));
console.log('🧪 TESTING CLOUDFLARE RELAY WEBSOCKET FOR GEMINI LIVE API');
console.log('='.repeat(70));
console.log('Connecting to:', wsUrl);

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('✅ [1/2] WEBSOCKET TERHUBUNG KE CLOUDFLARE WORKER RELAY!');
  console.log('Sending Gemini Live setup payload...');
  ws.send(JSON.stringify({
    setup: {
      model: 'models/gemini-3.1-flash-live-preview',
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Fenrir'
            }
          }
        }
      }
    }
  }));
});

ws.on('message', (data) => {
  console.log('📩 [2/2] RESPONSE DITERIMA DARI GOOGLE VIA CLOUDFLARE RELAY:');
  console.log(data.toString());
  setTimeout(() => {
    ws.close(1000);
    process.exit(0);
  }, 2000);
});

ws.on('error', (err) => {
  console.error('❌ WebSocket Error via Relay:', err.message);
});

ws.on('close', (code, reason) => {
  console.log(`🔒 WebSocket Closed: ${code} - "${reason ? reason.toString() : ''}"`);
});
