/**
 * N.E.X.A Cloudflare Relay Worker v2.0
 * ======================================
 * Mendukung:
 * - JSON API calls (getFile, getMe, sendMessage, dll)
 * - Binary streaming (audio .ogg, gambar .jpg/.png) - BARU!
 * 
 * Cara kerja:
 * - HF hanya perlu connect ke worker ini (1 koneksi)
 * - Worker yang mengunduh dari Telegram dan meneruskan ke HF
 * - Tidak ada batasan ukuran file (stream langsung tanpa buffer)
 */

const ALLOWED_HOSTS = ['api.telegram.org'];

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    // Validasi parameter
    if (!targetUrl) {
      return new Response('Missing ?url= parameter', {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Validasi domain - hanya izinkan api.telegram.org
    let parsedTarget;
    try {
      parsedTarget = new URL(targetUrl);
    } catch (e) {
      return new Response('Invalid URL', {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    const isAllowed = ALLOWED_HOSTS.some(host => parsedTarget.hostname === host || parsedTarget.hostname.endsWith('.' + host));
    if (!isAllowed) {
      return new Response('Forbidden: only api.telegram.org allowed', {
        status: 403,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    // =============================================
    // Fetch dari Telegram dan stream langsung balik
    // =============================================
    try {
      const telegramResponse = await fetch(targetUrl, {
        method: request.method,
        headers: {
          'User-Agent': 'NEXA-Relay/2.0',
        },
        // Untuk POST (sendMessage, dll)
        ...(request.method === 'POST' && { body: request.body }),
      });

      // Ambil semua header dari Telegram, teruskan ke client
      const responseHeaders = new Headers();
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      
      // Teruskan Content-Type dan Content-Length dari Telegram
      const contentType = telegramResponse.headers.get('Content-Type');
      if (contentType) responseHeaders.set('Content-Type', contentType);
      
      const contentLength = telegramResponse.headers.get('Content-Length');
      if (contentLength) responseHeaders.set('Content-Length', contentLength);

      // Stream body langsung tanpa buffering (efisien untuk file besar)
      return new Response(telegramResponse.body, {
        status: telegramResponse.status,
        headers: responseHeaders,
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
