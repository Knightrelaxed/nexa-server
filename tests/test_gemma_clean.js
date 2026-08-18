const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY_4 || process.env.GEMINI_API_KEY_1;

function cleanGemmaOutput(rawText, jsonMode = false) {
  if (!rawText) return '';
  let text = rawText.trim();

  if (jsonMode) {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return jsonMatch[0];
    return text;
  }

  // Jika Gemma mengeluarkan format thought list "* User: ... * Greeting: ...", ambil pesan percakapan terakhir
  // Pola: ambil kutipan teks terakhir ("...") atau kalimat penutup setelah baris kosong
  const quoteMatch = text.match(/"([^"]{10,})"/g);
  if (quoteMatch && quoteMatch.length > 0) {
    const lastQuote = quoteMatch[quoteMatch.length - 1].replace(/^"|"$/g, '');
    if (lastQuote.length > 15) return lastQuote;
  }

  // Bersihkan bullet points monolog internal jika ada
  const lines = text.split('\n');
  const cleanLines = lines.filter(l => !l.trim().startsWith('*   User:') && !l.trim().startsWith('*   Persona:') && !l.trim().startsWith('*   Constraint:') && !l.trim().startsWith('*   Greeting:'));
  return cleanLines.join('\n').trim();
}

async function testGemmaClean() {
  console.log('Testing Google Gemma 4 Clean Output:');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key=${apiKey}`;
  
  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: 'Halo Nexa, berikan salam dan sebutkan tanggal hari ini dalam bahasa Indonesia santai.' }]
    }],
    systemInstruction: {
      parts: [{ text: 'Kamu adalah N.E.X.A, asisten AI pribadi Tuan Faqih. Jawab langsung secara ramah dan sopan.' }]
    },
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1000
    }
  };

  const start = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  console.log(`Latency: ${Date.now() - start} ms`);
  console.log('Raw Output:\n', raw);
  console.log('\nCleaned Output:\n', cleanGemmaOutput(raw, false));
}

testGemmaClean().catch(console.error);
