require('dotenv').config();

async function testGemma() {
  const apiKey = process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key=${apiKey}`;
  
  const start = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{ text: '[SPEAK DIRECTLY IN INDONESIAN. NO THINKING]\n\nHalo Nexa, kamu siapa?' }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 300
      }
    })
  });

  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Latency:', Date.now() - start, 'ms');
  console.log('Response:', JSON.stringify(data, null, 2));
}

testGemma().catch(console.error);
