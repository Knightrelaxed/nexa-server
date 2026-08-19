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
  const msg = JSON.parse(data.toString());
  console.log(msg);

  if (msg.setupComplete) {
    console.log('Sending test 16kHz audio chunk in new format (realtimeInput.audio)...');
    const dummyPcm = Buffer.alloc(1024).toString('base64');
    ws.send(JSON.stringify({
      realtimeInput: {
        audio: {
          mimeType: "audio/pcm;rate=16000",
          data: dummyPcm
        }
      }
    }));
  }
});

ws.on('error', (err) => {
  console.error('❌ WebSocket Error via Relay:', err.message);
});

ws.on('close', (code, reason) => {
  console.log(`🔒 WebSocket Closed: ${code} - "${reason ? reason.toString() : ''}"`);
});
