'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createMobileChatHandler,
  splitIntoStreamChunks,
  stripHtmlForMobile
} = require('../src/interfaces/bridge/mobile_bridge/chat_handler');

test('splitIntoStreamChunks and stripHtmlForMobile preserve full message cleanly', () => {
  const html = '<b>Halo Tuan!</b><br>Baterai HP saat ini <code>84%</code> &amp; aman.';
  const clean = stripHtmlForMobile(html);
  assert.equal(clean, 'Halo Tuan!\nBaterai HP saat ini 84% & aman.');

  const chunks = splitIntoStreamChunks(clean, 16);
  assert.ok(chunks.length >= 2);
  assert.equal(chunks.join(''), clean);
});

test('CHAT_SEND streams sequential chunks, saves mobile memory, and deduplicates client_msg_id', async () => {
  let routerCalls = 0;
  const savedMemories = [];

  const handler = createMobileChatHandler({
    aiRouter: {
      routeUserMessage: async (text, hints) => {
        routerCalls += 1;
        assert.equal(hints.source, 'mobile');
        assert.equal(hints.deviceContext.battery_level, 84);
        return {
          intent: 'NORMAL_CHAT',
          reply_message: 'Baterai Samsung A33 Tuan saat ini 84 persen dalam kondisi normal dan sangat sehat.'
        };
      }
    },
    executeDomainIntent: async () => null,
    saveChatMemory: async (role, text, platform) => {
      savedMemories.push({ role, text, platform });
    },
    chunkSize: 25,
    chunkDelayMs: 0
  });

  try {
    const frames = [];
    const mockWs = { send: (raw) => frames.push(JSON.parse(raw)) };

    await handler.handleChatSend({
      type: 'CHAT_SEND',
      client_msg_id: 'msg-uuid-001',
      content: 'Berapa baterai HP saya?',
      device_context: { battery_level: 84, screen_on: true }
    }, mockWs);

    assert.equal(routerCalls, 1);
    assert.equal(frames[0].type, 'CHAT_ACK');
    assert.equal(frames[0].status, 'THINKING');

    const chunkFrames = frames.filter(f => f.type === 'CHAT_CHUNK' && f.status === 'STREAMING_CHUNK');
    const finalFrame = frames.find(f => f.type === 'CHAT_CHUNK' && f.status === 'STREAM_FINAL');
    assert.ok(chunkFrames.length >= 2);
    assert.ok(finalFrame);

    // Verify monotonic seq = 1..N
    chunkFrames.forEach((f, idx) => assert.equal(f.seq, idx + 1));
    assert.equal(finalFrame.seq, chunkFrames.length + 1);
    assert.equal(
      chunkFrames.map(f => f.chunk).join(''),
      'Baterai Samsung A33 Tuan saat ini 84 persen dalam kondisi normal dan sangat sehat.'
    );

    // Saved with platform='mobile'
    assert.equal(savedMemories.length, 2);
    assert.equal(savedMemories[0].platform, 'mobile');
    assert.equal(savedMemories[1].platform, 'mobile');

    // FR-CHAT-08: Duplicate CHAT_SEND with same client_msg_id must NOT re-call AI router
    const replayFrames = [];
    await handler.handleChatSend({
      type: 'CHAT_SEND',
      client_msg_id: 'msg-uuid-001',
      content: 'Berapa baterai HP saya?'
    }, { send: (raw) => replayFrames.push(JSON.parse(raw)) });

    assert.equal(routerCalls, 1);
    assert.ok(replayFrames.some(f => f.status === 'STREAM_FINAL'));

    // FR-CHAT-10: CHAT_RESUME from last_seq=2 replays only seq > 2 + STREAM_FINAL
    const resumeFrames = [];
    handler.handleChatResume({
      type: 'CHAT_RESUME',
      client_msg_id: 'msg-uuid-001',
      last_seq: 2
    }, { send: (raw) => resumeFrames.push(JSON.parse(raw)) });

    const resumedChunks = resumeFrames.filter(f => f.status === 'STREAMING_CHUNK');
    assert.ok(resumedChunks.every(f => f.seq > 2));
    assert.equal(resumeFrames[resumeFrames.length - 1].status, 'STREAM_FINAL');

    // Unknown client_msg_id returns CHAT_RESUME_MISS
    const missFrames = [];
    handler.handleChatResume({
      type: 'CHAT_RESUME',
      client_msg_id: 'non-existent-id',
      last_seq: 0
    }, { send: (raw) => missFrames.push(JSON.parse(raw)) });
    assert.equal(missFrames[0].type, 'CHAT_RESUME_MISS');
  } finally {
    handler.destroy();
  }
});

test('CHAT_STOP cancels an active stream and emits ERROR_ABORT cleanly', async () => {
  const handler = createMobileChatHandler({
    aiRouter: {
      routeUserMessage: async () => ({
        intent: 'NORMAL_CHAT',
        reply_message: 'Chunk satu dua tiga empat lima enam tujuh delapan sembilan sepuluh sebelas dua belas.'
      })
    },
    executeDomainIntent: async () => null,
    saveChatMemory: async () => {},
    chunkSize: 15,
    chunkDelayMs: 20
  });

  try {
    const frames = [];
    const mockWs = {
      send: (raw) => {
        const parsed = JSON.parse(raw);
        frames.push(parsed);
        if (parsed.type === 'CHAT_CHUNK' && parsed.seq === 1) {
          handler.handleChatStop({ type: 'CHAT_STOP', client_msg_id: 'msg-stop-1' });
        }
      }
    };

    await handler.handleChatSend({
      type: 'CHAT_SEND',
      client_msg_id: 'msg-stop-1',
      content: 'Ceritakan panjang'
    }, mockWs);

    const last = frames[frames.length - 1];
    assert.equal(last.type, 'CHAT_CHUNK');
    assert.equal(last.status, 'ERROR_ABORT');
  } finally {
    handler.destroy();
  }
});

test('CHAT_VOICE_SEND transcribes valid OGG voice note, streams reply, and deduplicates client_msg_id', async () => {
  let sttCalls = 0;
  let routerCalls = 0;
  let routedPrompt = '';

  const handler = createMobileChatHandler({
    voiceEngine: {
      transcribeAudioBuffer: async (buf, opts) => {
        sttCalls += 1;
        assert.equal(opts.ext, 'ogg');
        assert.equal(opts.mimeType, 'audio/ogg');
        assert.ok(buf.length >= 128);
        return 'Cek pengeluaran saya hari ini';
      }
    },
    aiRouter: {
      routeUserMessage: async (text, hints) => {
        routerCalls += 1;
        routedPrompt = text;
        assert.equal(hints.source, 'mobile');
        return {
          intent: 'NORMAL_CHAT',
          reply_message: 'Total pengeluaran Tuan hari ini Rp 45.000.'
        };
      }
    },
    executeDomainIntent: async () => null,
    saveChatMemory: async () => {},
    chunkSize: 20,
    chunkDelayMs: 0
  });

  try {
    const fakeOgg = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(256, 0x42)]);
    const frames = [];
    const mockWs = { send: (raw) => frames.push(JSON.parse(raw)) };

    await handler.handleChatVoiceSend({
      type: 'CHAT_VOICE_SEND',
      client_msg_id: 'voice-msg-001',
      audio_mime: 'audio/ogg',
      duration_ms: 4200,
      audio_b64: fakeOgg.toString('base64')
    }, mockWs);

    assert.equal(sttCalls, 1);
    assert.equal(routerCalls, 1);
    assert.equal(routedPrompt, 'Cek pengeluaran saya hari ini');
    assert.equal(frames[0].type, 'CHAT_ACK');
    assert.equal(frames[0].status, 'THINKING');
    assert.equal(frames[0].stage, 'TRANSCRIBING');

    const chunks = frames.filter(f => f.type === 'CHAT_CHUNK' && f.status === 'STREAMING_CHUNK');
    const finalFrame = frames.find(f => f.type === 'CHAT_CHUNK' && f.status === 'STREAM_FINAL');
    assert.ok(finalFrame);
    assert.equal(chunks.map(c => c.chunk).join(''), 'Total pengeluaran Tuan hari ini Rp 45.000.');

    // Duplicate retry with same client_msg_id must replay without re-running STT or AI router
    const replayFrames = [];
    await handler.handleChatVoiceSend({
      type: 'CHAT_VOICE_SEND',
      client_msg_id: 'voice-msg-001',
      audio_mime: 'audio/ogg',
      duration_ms: 4200,
      audio_b64: fakeOgg.toString('base64')
    }, { send: (raw) => replayFrames.push(JSON.parse(raw)) });

    assert.equal(sttCalls, 1);
    assert.equal(routerCalls, 1);
    assert.ok(replayFrames.some(f => f.status === 'STREAM_FINAL'));
  } finally {
    handler.destroy();
  }
});

test('CHAT_VOICE_SEND rejects invalid OGG magic header, >3 min duration, and empty STT cleanly', async () => {
  const handler = createMobileChatHandler({
    voiceEngine: {
      transcribeAudioBuffer: async () => ''
    },
    aiRouter: {
      routeUserMessage: async () => {
        throw new Error('Router should not run');
      }
    },
    executeDomainIntent: async () => null,
    saveChatMemory: async () => {},
    chunkDelayMs: 0
  });

  try {
    // 1. Invalid OGG magic bytes
    const invalidFrames = [];
    await handler.handleChatVoiceSend({
      type: 'CHAT_VOICE_SEND',
      client_msg_id: 'voice-bad-ogg',
      audio_mime: 'audio/ogg',
      duration_ms: 3000,
      audio_b64: Buffer.alloc(200, 0x00).toString('base64')
    }, { send: (raw) => invalidFrames.push(JSON.parse(raw)) });
    assert.equal(invalidFrames[0].status, 'ERROR_ABORT');
    assert.match(invalidFrames[0].error, /OGG/i);

    // 2. Duration exceeds 3 minutes
    const longFrames = [];
    const validOgg = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(200, 0x11)]);
    await handler.handleChatVoiceSend({
      type: 'CHAT_VOICE_SEND',
      client_msg_id: 'voice-too-long',
      audio_mime: 'audio/ogg',
      duration_ms: 200_000,
      audio_b64: validOgg.toString('base64')
    }, { send: (raw) => longFrames.push(JSON.parse(raw)) });
    assert.equal(longFrames[0].status, 'ERROR_ABORT');
    assert.match(longFrames[0].error, /3 menit/i);

    // 3. Empty transcription aborts cleanly after ACK
    const emptyFrames = [];
    await handler.handleChatVoiceSend({
      type: 'CHAT_VOICE_SEND',
      client_msg_id: 'voice-silent',
      audio_mime: 'audio/ogg',
      duration_ms: 2500,
      audio_b64: validOgg.toString('base64')
    }, { send: (raw) => emptyFrames.push(JSON.parse(raw)) });
    assert.equal(emptyFrames[0].type, 'CHAT_ACK');
    assert.equal(emptyFrames[emptyFrames.length - 1].status, 'ERROR_ABORT');
  } finally {
    handler.destroy();
  }
});

test('CHAT_SEND with reply_to prepends sanitized quoted prompt, saves raw user memory, and propagates reply context to domain dispatcher', async () => {
  const routedInputs = [];
  const savedMemories = [];
  const domainContexts = [];
  const handler = createMobileChatHandler({
    aiRouter: {
      routeUserMessage: async (text) => {
        routedInputs.push(text);
        return {
          intent: 'FINANCE',
          extracted_data: { action: 'EDIT' }
        };
      }
    },
    executeDomainIntent: async (_intent, _routing, context) => {
      domainContexts.push(context);
      return 'Transaksi berhasil diubah menjadi Rp 50.000.';
    },
    saveChatMemory: async (role, text, platform) => {
      savedMemories.push({ role, text, platform });
    },
    chunkDelayMs: 0
  });

  try {
    const frames = [];
    await handler.handleChatSend({
      type: 'CHAT_SEND',
      client_msg_id: 'reply-msg-001',
      content: 'Ubah jadi 50rb',
      reply_to: {
        message_id: 'orig-123',
        role: 'assistant',
        preview: 'ID: #42 [Nominal: "Rp 45.000"]\nDeskripsi: Kopi'
      }
    }, { send: (raw) => frames.push(JSON.parse(raw)) });

    assert.equal(routedInputs.length, 1);
    assert.equal(
      routedInputs[0],
      '[Membalas pesan N.E.X.A: "ID: #42 Nominal: Rp 45.000 Deskripsi: Kopi"]\nUbah jadi 50rb'
    );
    // Raw content saved to memory without quoted prefix
    assert.equal(savedMemories[0].role, 'user');
    assert.equal(savedMemories[0].text, 'Ubah jadi 50rb');
    // Domain dispatcher receives Telegram-compatible reply_to_message context
    assert.equal(domainContexts.length, 1);
    assert.equal(domainContexts[0].textInput, 'Ubah jadi 50rb');
    assert.equal(domainContexts[0].message.reply_to_message.text, 'ID: #42 Nominal: Rp 45.000 Deskripsi: Kopi');
    assert.ok(frames.some(f => f.status === 'STREAM_FINAL'));
  } finally {
    handler.destroy();
  }
});

test('CHAT_SEND and CHAT_VOICE_SEND allow clean retry with same client_msg_id after ABORTED', async () => {
  let attempt = 0;
  let sttAttempt = 0;
  const handler = createMobileChatHandler({
    voiceEngine: {
      transcribeAudioBuffer: async () => {
        sttAttempt += 1;
        if (sttAttempt === 1) throw new Error('Transient STT timeout');
        return 'Cek saldo Mandiri';
      }
    },
    aiRouter: {
      routeUserMessage: async (text) => {
        attempt += 1;
        if (attempt === 1) throw new Error('Transient LLM 503');
        return { intent: 'NORMAL_CHAT', reply_message: `Berhasil untuk: ${text}` };
      }
    },
    executeDomainIntent: async () => null,
    saveChatMemory: async () => {},
    chunkDelayMs: 0
  });

  try {
    const firstFrames = [];
    await handler.handleChatSend({
      type: 'CHAT_SEND',
      client_msg_id: 'retry-text-1',
      content: 'Halo'
    }, { send: (raw) => firstFrames.push(JSON.parse(raw)) });
    assert.equal(firstFrames[firstFrames.length - 1].status, 'ERROR_ABORT');

    // Retry same client_msg_id after ABORTED must re-run and succeed
    const secondFrames = [];
    await handler.handleChatSend({
      type: 'CHAT_SEND',
      client_msg_id: 'retry-text-1',
      content: 'Halo'
    }, { send: (raw) => secondFrames.push(JSON.parse(raw)) });
    assert.equal(attempt, 2);
    assert.equal(secondFrames[secondFrames.length - 1].status, 'STREAM_FINAL');

    // Voice note retry after transient STT abort
    const fakeOgg = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(200, 0x33)]);
    const voiceFailFrames = [];
    await handler.handleChatVoiceSend({
      type: 'CHAT_VOICE_SEND',
      client_msg_id: 'retry-voice-1',
      audio_mime: 'audio/ogg',
      duration_ms: 2000,
      audio_b64: fakeOgg.toString('base64')
    }, { send: (raw) => voiceFailFrames.push(JSON.parse(raw)) });
    assert.equal(voiceFailFrames[voiceFailFrames.length - 1].status, 'ERROR_ABORT');

    const voiceRetryFrames = [];
    await handler.handleChatVoiceSend({
      type: 'CHAT_VOICE_SEND',
      client_msg_id: 'retry-voice-1',
      audio_mime: 'audio/ogg',
      duration_ms: 2000,
      audio_b64: fakeOgg.toString('base64')
    }, { send: (raw) => voiceRetryFrames.push(JSON.parse(raw)) });
    assert.equal(sttAttempt, 2);
    assert.equal(voiceRetryFrames[voiceRetryFrames.length - 1].status, 'STREAM_FINAL');
  } finally {
    handler.destroy();
  }
});

test('CHAT_RESUME recalculates remaining ttl_sec for pending ACTION_PENDING step-up frame', async () => {
  let fakeNow = 1_700_000_000_000;
  const handler = createMobileChatHandler({
    nowFn: () => fakeNow,
    aiRouter: {
      routeUserMessage: async () => ({
        intent: 'FINANCE',
        extracted_data: { action: 'TRANSFER', nominal: 50000 }
      })
    },
    executeDomainIntent: async (_intent, _routing, context) => {
      context.onStepUpRequired({
        type: 'ACTION_PENDING',
        action_id: 'act-ttl-1',
        ttl_sec: 30,
        exp: fakeNow + 30_000
      });
      return 'Menunggu konfirmasi biometrik.';
    },
    saveChatMemory: async () => {},
    chunkDelayMs: 0
  });

  try {
    const initialFrames = [];
    await handler.handleChatSend({
      type: 'CHAT_SEND',
      client_msg_id: 'stepup-ttl-1',
      content: 'Bayar tagihan'
    }, { send: (raw) => initialFrames.push(JSON.parse(raw)) });

    // Advance clock by 17.2 seconds
    fakeNow += 17_200;
    const resumedFrames = [];
    handler.handleChatResume({
      type: 'CHAT_RESUME',
      client_msg_id: 'stepup-ttl-1',
      last_seq: 999
    }, { send: (raw) => resumedFrames.push(JSON.parse(raw)) });

    const replayedPending = resumedFrames.find(f => f.type === 'ACTION_PENDING');
    assert.ok(replayedPending);
    assert.equal(replayedPending.ttl_sec, 13);
  } finally {
    handler.destroy();
  }
});

test('CHAT_VOICE_SEND rejects invalid base64 and invalid MP4/WebM/WAV magic headers', async () => {
  const handler = createMobileChatHandler({
    voiceEngine: { transcribeAudioBuffer: async () => 'should not run' },
    aiRouter: { routeUserMessage: async () => ({ intent: 'NORMAL_CHAT', reply_message: '' }) },
    executeDomainIntent: async () => null,
    saveChatMemory: async () => {},
    chunkDelayMs: 0
  });

  try {
    const badB64Frames = [];
    await handler.handleChatVoiceSend({
      type: 'CHAT_VOICE_SEND',
      client_msg_id: 'voice-bad-b64',
      audio_mime: 'audio/ogg',
      duration_ms: 2000,
      audio_b64: '!!!not-valid-base64!!!'
    }, { send: (raw) => badB64Frames.push(JSON.parse(raw)) });
    assert.equal(badB64Frames[0].status, 'ERROR_ABORT');
    assert.match(badB64Frames[0].error, /base64/i);

    const bogusPayload = Buffer.alloc(200, 0x55).toString('base64');
    for (const mime of ['audio/mp4', 'audio/webm', 'audio/wav']) {
      const frames = [];
      await handler.handleChatVoiceSend({
        type: 'CHAT_VOICE_SEND',
        client_msg_id: `voice-bad-${mime}`,
        audio_mime: mime,
        duration_ms: 2000,
        audio_b64: bogusPayload
      }, { send: (raw) => frames.push(JSON.parse(raw)) });
      assert.equal(frames[0].status, 'ERROR_ABORT');
    }
  } finally {
    handler.destroy();
  }
});
