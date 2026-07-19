/**
 * N.E.X.A Vercel Relay — GET proxy for Telegram API
 * Deploy to Vercel (free). HF Spaces CAN reach *.vercel.app (unlike workers.dev).
 *
 * Env on Vercel:
 *   NEXA_RELAY_SECRET = shared secret with HF Space
 */

const ALLOWED_PREFIX = 'https://api.telegram.org/';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'X-Nexa-Relay-Secret, Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const secret = process.env.NEXA_RELAY_SECRET;
  if (secret) {
    const provided = req.headers['x-nexa-relay-secret'] || '';
    if (provided !== secret) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const target = req.query.url;
  if (!target || !target.startsWith(ALLOWED_PREFIX)) {
    return res.status(403).json({ ok: false, error: 'Only api.telegram.org allowed' });
  }

  try {
    const fetchOptions = {
      method: req.method,
      headers: { 'User-Agent': 'NEXA-Vercel-Relay/1.0' },
    };

    if (req.method === 'POST') {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    }

    const upstream = await fetch(target, fetchOptions);

    const buffer = await upstream.arrayBuffer();
    const bytes = Buffer.from(buffer);

    if (req.query.b64 === 'true') {
      return res.status(200).json({
        ok: true,
        data: bytes.toString('base64'),
        size: bytes.length,
      });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    return res.status(upstream.status).send(bytes);
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message });
  }
}
