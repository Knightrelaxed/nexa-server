/**
 * N.E.X.A Cloudflare Relay Worker v4.0
 * ======================================
 * Mode 1 (GET):  ?url=<telegram_url>               → Proxy JSON API calls
 * Mode 2 (POST): /transcribe                        → Download audio + Groq Whisper → return text
 * Mode 3 (POST): /vision                            → Download image + Gemini Vision → return description
 *
 * Solusi Final: Worker melakukan semua pekerjaan di Cloudflare network.
 * HF hanya menerima respons JSON kecil (teks transkripsi/deskripsi) — tidak ada binary besar!
 */

const ALLOWED_HOSTS = ['api.telegram.org'];

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);

    // ================================================================
    // MODE 2: POST /transcribe
    // Download audio dari Telegram → kirim ke Groq Whisper → return teks
    // N.E.X.A tidak perlu menerima file biner sama sekali!
    // ================================================================
    if (request.method === 'POST' && url.pathname === '/transcribe') {
      try {
        const body = await request.json();
        const { file_path, bot_token, groq_key } = body;

        if (!file_path || !bot_token || !groq_key) {
          return jsonResponse({ ok: false, error: 'Missing required fields: file_path, bot_token, groq_key' }, 400);
        }

        const telegramFileUrl = `https://api.telegram.org/file/bot${bot_token}/${file_path}`;

        // Download audio dari Telegram di sisi Cloudflare
        console.log('[RELAY] Downloading audio from Telegram...');
        const audioResp = await fetch(telegramFileUrl);
        if (!audioResp.ok) {
          return jsonResponse({ ok: false, error: `Telegram file download failed: HTTP ${audioResp.status}` }, 502);
        }

        const audioBlob = await audioResp.blob();
        console.log('[RELAY] Audio downloaded. Size:', audioBlob.size, 'bytes');

        // Kirim ke Groq Whisper via multipart/form-data
        // Tidak ada base64 encoding — stream biner langsung ke Groq!
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.ogg');
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('language', 'id');
        formData.append('response_format', 'json');

        console.log('[RELAY] Sending to Groq Whisper...');
        const groqResp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groq_key}` },
          body: formData,
        });

        if (!groqResp.ok) {
          const groqErr = await groqResp.text();
          return jsonResponse({ ok: false, error: `Groq Whisper failed: HTTP ${groqResp.status}: ${groqErr.substring(0, 200)}` }, 502);
        }

        const groqData = await groqResp.json();
        const text = groqData.text || '';

        if (!text || text.trim().length === 0) {
          return jsonResponse({ ok: false, error: 'Groq returned empty transcription' }, 502);
        }

        console.log('[RELAY] Transcription successful. Length:', text.length);
        return jsonResponse({ ok: true, text: text.trim() });

      } catch (err) {
        console.error('[RELAY] /transcribe error:', err.message);
        return jsonResponse({ ok: false, error: err.message }, 500);
      }
    }

    // ================================================================
    // MODE 3: POST /vision
    // Download image dari Telegram → kirim ke Gemini Vision → return deskripsi
    // ================================================================
    if (request.method === 'POST' && url.pathname === '/vision') {
      try {
        const body = await request.json();
        const { file_path, bot_token, gemini_key, prompt, system_prompt } = body;

        if (!file_path || !bot_token || !gemini_key) {
          return jsonResponse({ ok: false, error: 'Missing required fields: file_path, bot_token, gemini_key' }, 400);
        }

        const telegramFileUrl = `https://api.telegram.org/file/bot${bot_token}/${file_path}`;

        // Download gambar dari Telegram di sisi Cloudflare
        console.log('[RELAY] Downloading image from Telegram...');
        const imgResp = await fetch(telegramFileUrl);
        if (!imgResp.ok) {
          return jsonResponse({ ok: false, error: `Telegram image download failed: HTTP ${imgResp.status}` }, 502);
        }

        const imgArrayBuffer = await imgResp.arrayBuffer();
        const imgUint8 = new Uint8Array(imgArrayBuffer);
        console.log('[RELAY] Image downloaded. Size:', imgUint8.length, 'bytes');

        // Encode ke base64 di sisi Cloudflare (CPU-efficient chunking)
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < imgUint8.length; i += chunkSize) {
          binary += String.fromCharCode(...imgUint8.subarray(i, i + chunkSize));
        }
        const base64Image = btoa(binary);

        const contentType = imgResp.headers.get('Content-Type') || 'image/jpeg';

        // Kirim ke Gemini Vision
        const geminiPrompt = prompt || 'Deskripsikan gambar ini secara detail dalam Bahasa Indonesia.';
        const sysPrompt = system_prompt || '';

        const geminiPayload = {
          contents: [{
            parts: [
              { text: sysPrompt ? `${sysPrompt}\n\n${geminiPrompt}` : geminiPrompt },
              { inlineData: { mimeType: contentType, data: base64Image } }
            ]
          }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048 }
        };

        console.log('[RELAY] Sending to Gemini Vision...');
        const geminiResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${gemini_key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload),
          }
        );

        if (!geminiResp.ok) {
          const gemErr = await geminiResp.text();
          return jsonResponse({ ok: false, error: `Gemini Vision failed: HTTP ${geminiResp.status}: ${gemErr.substring(0, 200)}` }, 502);
        }

        const geminiData = await geminiResp.json();
        const description = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (!description || description.trim().length === 0) {
          return jsonResponse({ ok: false, error: 'Gemini returned empty description' }, 502);
        }

        console.log('[RELAY] Vision successful. Length:', description.length);
        return jsonResponse({ ok: true, description: description.trim() });

      } catch (err) {
        console.error('[RELAY] /vision error:', err.message);
        return jsonResponse({ ok: false, error: err.message }, 500);
      }
    }

    // ================================================================
    // MODE 1 (GET): ?url=<telegram_url> → Proxy JSON API
    // Digunakan untuk getFile, sendMessage, dll.
    // ================================================================
    if (request.method === 'GET') {
      const targetUrl = url.searchParams.get('url');

      if (!targetUrl) {
        return new Response('N.E.X.A Relay v4.0 Active - /transcribe & /vision available', {
          status: 200,
          headers: { 'Content-Type': 'text/plain', ...corsHeaders() },
        });
      }

      // Validasi domain
      let parsedTarget;
      try {
        parsedTarget = new URL(targetUrl);
      } catch (e) {
        return jsonResponse({ ok: false, error: 'Invalid URL' }, 400);
      }

      const isAllowed = ALLOWED_HOSTS.some(
        host => parsedTarget.hostname === host || parsedTarget.hostname.endsWith('.' + host)
      );
      if (!isAllowed) {
        return jsonResponse({ ok: false, error: 'Forbidden: only api.telegram.org allowed' }, 403);
      }

      try {
        const telegramResponse = await fetch(targetUrl, {
          method: request.method,
          headers: { 'User-Agent': 'NEXA-Relay/4.0' },
        });

        const responseHeaders = new Headers(corsHeaders());
        const contentType = telegramResponse.headers.get('Content-Type');
        if (contentType) responseHeaders.set('Content-Type', contentType);

        return new Response(telegramResponse.body, {
          status: telegramResponse.status,
          headers: responseHeaders,
        });

      } catch (err) {
        return jsonResponse({ ok: false, error: err.message }, 500);
      }
    }

    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  },
};
