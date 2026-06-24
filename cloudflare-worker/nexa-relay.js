/**
 * N.E.X.A Cloudflare Relay Worker v3.0
 * ======================================
 * Mode 1: ?url=<telegram_url>          → Proxy JSON biasa (untuk API calls)
 * Mode 2: ?url=<telegram_url>&b64=true → Unduh biner, encode ke Base64 JSON
 *                                         (Bypass HF binary egress firewall!)
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
    const wantBase64 = url.searchParams.get('b64') === 'true';

    // Validasi parameter
    if (!targetUrl) {
      return new Response('N.E.X.A Telegram Relay Active', {
        status: 200,
        headers: { 
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*' 
        },
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

    const isAllowed = ALLOWED_HOSTS.some(
      host => parsedTarget.hostname === host || parsedTarget.hostname.endsWith('.' + host)
    );
    if (!isAllowed) {
      return new Response('Forbidden: only api.telegram.org allowed', {
        status: 403,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    try {
      const telegramResponse = await fetch(targetUrl, {
        method: request.method,
        headers: { 'User-Agent': 'NEXA-Relay/3.0' },
        ...(request.method === 'POST' && { body: request.body }),
      });

      // =============================================
      // MODE B64: Biner → Base64 JSON
      // Digunakan untuk audio/gambar agar lolos firewall HF
      // =============================================
      if (wantBase64) {
        if (!telegramResponse.ok) {
          return new Response(JSON.stringify({
            ok: false,
            error: `Telegram returned ${telegramResponse.status}`
          }), {
            status: telegramResponse.status,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }

        // Baca seluruh body sebagai ArrayBuffer di Worker
        const arrayBuffer = await telegramResponse.arrayBuffer();
        
        // Encode ke Base64 menggunakan btoa dengan chunking aman
        const uint8Array = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.subarray(i, i + chunkSize);
          binary += String.fromCharCode(...chunk);
        }
        const base64 = btoa(binary);

        return new Response(JSON.stringify({
          ok: true,
          size: uint8Array.length,
          contentType: telegramResponse.headers.get('Content-Type') || 'application/octet-stream',
          data: base64
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // =============================================
      // MODE NORMAL: Teruskan respons langsung (untuk JSON API)
      // =============================================
      const responseHeaders = new Headers();
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

      const contentType = telegramResponse.headers.get('Content-Type');
      if (contentType) responseHeaders.set('Content-Type', contentType);

      const contentLength = telegramResponse.headers.get('Content-Length');
      if (contentLength) responseHeaders.set('Content-Length', contentLength);

      return new Response(telegramResponse.body, {
        status: telegramResponse.status,
        headers: responseHeaders,
      });

    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: err.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
