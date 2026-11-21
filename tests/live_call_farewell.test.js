'use strict';

// Regression tests for graceful vocal farewell before hanging up a Live Voice call.
// Reproduces the exact pre-tool turnComplete race observed in VPS call_1795294839027.

const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');

const { LiveVoiceSession } = require('../src/core/Live_Voice_Engine');
const { noteUserTurn, cancelEndCallSafetyTimer } = require('../src/core/Live_Tool_Registry');
const supabaseMemories = require('../src/infrastructure/Supabase_Memories');

function makeSession(t) {
  t.mock.method(supabaseMemories, 'saveChatMemory', async () => {});

  const sentToClient = [];
  const sentToGoogle = [];

  const mockClientWs = {
    readyState: WebSocket.OPEN,
    deviceType: 'mobile',
    send: (raw) => sentToClient.push(JSON.parse(raw))
  };

  const mockGoogleWs = {
    readyState: WebSocket.OPEN,
    send: (raw) => sentToGoogle.push(JSON.parse(raw)),
    close: () => {}
  };

  const session = new LiveVoiceSession('test_farewell_session', mockClientWs);
  session.isActive = true;
  session.isSetupComplete = true;
  session.googleWs = mockGoogleWs;
  // Stub close so timer cleanup does not trigger full end-of-call passive learning during unit test
  session.close = async () => {
    session.isActive = false;
    session.isClosed = true;
  };

  return { session, sentToClient, sentToGoogle };
}

test('pre-tool turnComplete after endCall does NOT hang up before farewell audio finishes', async (t) => {
  const { session, sentToClient, sentToGoogle } = makeSession(t);

  // 1. User explicitly requests to end the call
  noteUserTurn('Sudah akhiri saja.');

  // 2. Gemini invokes endCall tool
  await session._handleGoogleMessage(JSON.stringify({
    toolCall: {
      functionCalls: [{ id: 'call_end_1', name: 'endCall', args: {} }]
    }
  }));

  // Simulate markEndingCall() effect (endCall marks activeSessions; unit session is standalone)
  session.isEndingCall = true;
  session.hasFarewellOutput = false;
  session._farewellSignaled = false;

  assert.equal(sentToGoogle.length, 1, 'toolResponse must be sent back to Google');
  assert.equal(session.isExecutingTool, true);
  assert.equal(session.isWaitingToolReply, true);

  // 3. Google sends the pre-tool turnComplete BEFORE speaking a single farewell syllable
  await session._handleGoogleMessage(JSON.stringify({
    serverContent: { turnComplete: true }
  }));

  const earlyDisconnecting = sentToClient.filter(m => m.type === 'CALL_STATUS_UPDATE' && m.status === 'DISCONNECTING');
  const earlyReplyComplete = sentToClient.filter(m => m.type === 'CALL_REPLY_COMPLETE');
  assert.equal(earlyDisconnecting.length, 0, 'pre-tool turnComplete must NOT emit DISCONNECTING');
  assert.equal(earlyReplyComplete.length, 0, 'pre-tool turnComplete must NOT emit CALL_REPLY_COMPLETE');

  // 4. Uplink mic audio while isEndingCall=true must be dropped so noise cannot barge-in
  const beforeMicSent = sentToGoogle.length;
  session.handleIncomingClientAudio(Buffer.alloc(3200, 0x10).toString('base64'));
  assert.equal(sentToGoogle.length, beforeMicSent, 'mic audio must not be forwarded while delivering farewell');

  // 5. Spurious barge-in signal during farewell must be ignored
  session._lastVocalActivityTime = Date.now();
  session._lastUserAudioRms = 900;
  await session._handleGoogleMessage(JSON.stringify({
    serverContent: { interrupted: true }
  }));
  const interrupts = sentToClient.filter(m => m.type === 'CALL_AUDIO_INTERRUPTED');
  assert.equal(interrupts.length, 0, 'barge-in interrupt must be ignored during farewell');

  // 6. Gemini now streams farewell audio + transcript
  await session._handleGoogleMessage(JSON.stringify({
    serverContent: {
      outputTranscription: { text: 'Baik Tuan Faqih, panggilan saya akhiri. Sampai jumpa!' },
      modelTurn: {
        parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AAAA' } }]
      }
    }
  }));

  assert.equal(session.hasFarewellOutput, true, 'farewell audio must mark hasFarewellOutput=true');
  assert.equal(session.isExecutingTool, false);
  assert.equal(session.isWaitingToolReply, false);
  const audioFrames = sentToClient.filter(m => m.type === 'CALL_AUDIO_PLAY');
  assert.equal(audioFrames.length, 1, 'farewell PCM chunk must be delivered to client');

  // 7. Post-farewell turnComplete arrives -> NOW signal DISCONNECTING + CALL_REPLY_COMPLETE once
  await session._handleGoogleMessage(JSON.stringify({
    serverContent: { turnComplete: true }
  }));

  const finalDisconnecting = sentToClient.filter(m => m.type === 'CALL_STATUS_UPDATE' && m.status === 'DISCONNECTING');
  const finalReplyComplete = sentToClient.filter(m => m.type === 'CALL_REPLY_COMPLETE');
  assert.equal(finalDisconnecting.length, 1, 'must signal DISCONNECTING exactly once after farewell turnComplete');
  assert.equal(finalReplyComplete.length, 1, 'must signal CALL_REPLY_COMPLETE exactly once after farewell turnComplete');

  // 8. Any duplicate turnComplete after signaling must be idempotent
  await session._handleGoogleMessage(JSON.stringify({
    serverContent: { turnComplete: true }
  }));
  assert.equal(
    sentToClient.filter(m => m.type === 'CALL_REPLY_COMPLETE').length,
    1,
    'duplicate turnComplete must not emit second CALL_REPLY_COMPLETE'
  );

  cancelEndCallSafetyTimer();
});
