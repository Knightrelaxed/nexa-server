/**
 * N.E.X.A Vercel Relay — Voice transcription
 * Downloads audio from Telegram + calls Groq Whisper on Vercel edge (not HF).
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

  const { file_path, bot_token, groq_key } = req.body || {};
  if (!file_path || !bot_token || !groq_key) {
    return res.status(400).json({ ok: false, error: 'Missing file_path, bot_token, or groq_key' });
  }

  try {
    const audioUrl = `https://api.telegram.org/file/bot${bot_token}/${file_path}`;
    const audioResp = await fetch(audioUrl);
    if (!audioResp.ok) {
      return res.status(502).json({ ok: false, error: `Telegram download failed: ${audioResp.status}` });
    }

    const audioBlob = await audioResp.blob();
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.ogg');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('language', 'id');
    formData.append('response_format', 'json');

    const groqResp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groq_key}` },
      body: formData,
    });

    if (!groqResp.ok) {
      const err = await groqResp.text();
      return res.status(502).json({ ok: false, error: `Groq failed: ${err.substring(0, 200)}` });
    }

    const data = await groqResp.json();
    const text = (data.text || '').trim();
    if (!text) return res.status(502).json({ ok: false, error: 'Empty transcription' });

    return res.status(200).json({ ok: true, text });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
