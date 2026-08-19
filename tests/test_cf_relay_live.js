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
  console.log(JSON.stringify(msg));

  if (msg.setupComplete) {
    console.log('Sending initial text prompt to trigger immediate voice reply...');
    ws.send(JSON.stringify({
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [
              {
                text: "Halo Nexa! Sapa saya sekarang."
              }
            ]
          }
        ],
        turnComplete: true
      }
    }));
  }

  if (msg.serverContent?.modelTurn?.parts) {
    console.log('🎵 AUDIO PARTS RECEIVED FROM GOOGLE!');
    for (const p of msg.serverContent.modelTurn.parts) {
      if (p.inlineData?.data) {
        console.log(`🎵 Audio chunk received (${p.inlineData.data.length} chars Base64 PCM)`);
      }
    }
  }
});

ws.on('error', (err) => {
  console.error('❌ WebSocket Error via Relay:', err.message);
});

ws.on('close', (code, reason) => {
  console.log(`🔒 WebSocket Closed: ${code} - "${reason ? reason.toString() : ''}"`);
});
