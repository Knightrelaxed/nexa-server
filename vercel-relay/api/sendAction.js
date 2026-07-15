/**
 * N.E.X.A Vercel Relay — POST proxy for Telegram sendChatAction
 *
 * HF Spaces can reach *.vercel.app but NOT api.telegram.org directly.
 * This endpoint receives { bot_token, chat_id, action } from HF Space,
 * then POSTs to api.telegram.org/sendChatAction on behalf of the server.
 *
 * Env on Vercel:
 *   NEXA_RELAY_SECRET = shared secret with HF Space
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'X-Nexa-Relay-Secret, Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  // Auth guard
  const secret = process.env.NEXA_RELAY_SECRET;
  if (secret) {
    const provided = req.headers['x-nexa-relay-secret'] || '';
    if (provided !== secret) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { bot_token, chat_id, action = 'typing' } = req.body || {};
  if (!bot_token || !chat_id) {
    return res.status(400).json({ ok: false, error: 'Missing bot_token or chat_id' });
  }

  try {
    const telegramUrl = `https://api.telegram.org/bot${bot_token}/sendChatAction`;
    const upstream = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NEXA-Vercel-Relay/1.0',
      },
      body: JSON.stringify({ chat_id, action }),
    });

    const data = await upstream.json();
    console.log(`[RELAY-SENDACTION] chat_id=${chat_id} action=${action} ok=${data.ok}`);
    return res.status(upstream.ok ? 200 : upstream.status).json(data);
  } catch (err) {
    console.error('[RELAY-SENDACTION] Error:', err.message);
    return res.status(502).json({ ok: false, error: err.message });
  }
}
