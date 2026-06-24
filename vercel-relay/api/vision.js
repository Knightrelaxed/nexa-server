/**
 * N.E.X.A Vercel Relay — Vision processing
 * Downloads image from Telegram + calls Gemini on Vercel (not HF).
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'X-Nexa-Relay-Secret, Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

  const secret = process.env.NEXA_RELAY_SECRET;
  if (secret && req.headers['x-nexa-relay-secret'] !== secret) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }

  const { file_path, bot_token, gemini_key, prompt, system_prompt } = req.body || {};
  if (!file_path || !bot_token || !gemini_key) {
    return res.status(400).json({ ok: false, error: 'Missing file_path, bot_token, or gemini_key' });
  }

  try {
    const imgUrl = `https://api.telegram.org/file/bot${bot_token}/${file_path}`;
    const imgResp = await fetch(imgUrl);
    if (!imgResp.ok) {
      return res.status(502).json({ ok: false, error: `Telegram download failed: ${imgResp.status}` });
    }

    const imgBytes = Buffer.from(await imgResp.arrayBuffer());
    const base64Image = imgBytes.toString('base64');
    const contentType = imgResp.headers.get('content-type') || 'image/jpeg';

    const geminiPrompt = prompt || 'Deskripsikan gambar ini secara detail dalam Bahasa Indonesia.';
    const sysPrompt = system_prompt || '';

    const payload = {
      contents: [{
        parts: [
          { text: sysPrompt ? `${sysPrompt}\n\n${geminiPrompt}` : geminiPrompt },
          { inlineData: { mimeType: contentType, data: base64Image } },
        ],
      }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    };

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${gemini_key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    if (!geminiResp.ok) {
      const err = await geminiResp.text();
      return res.status(502).json({ ok: false, error: `Gemini failed: ${err.substring(0, 200)}` });
    }

    const geminiData = await geminiResp.json();
    const description = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!description.trim()) {
      return res.status(502).json({ ok: false, error: 'Empty description' });
    }

    return res.status(200).json({ ok: true, description: description.trim() });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
