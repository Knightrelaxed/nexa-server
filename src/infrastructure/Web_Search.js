const axios = require('axios');
const env = require('../config/env');

/**
 * Search the web using Serper.dev API
 * @param {string} query - Search query
 * @param {'search'|'news'|'scholar'} type - Search type
 * @returns {Promise<string>} - Formatted search results
 */
async function searchWeb(query, type = 'search') {
  if (!env.SERPER_API_KEY) {
    return '❌ SERPER_API_KEY belum dikonfigurasi.';
  }

  const endpoint = `https://google.serper.dev/${type}`;

  const res = await axios.post(endpoint, { q: query, gl: 'id', hl: 'id', num: 5 }, {
    headers: {
      'X-API-KEY': env.SERPER_API_KEY,
      'Content-Type': 'application/json'
    },
    timeout: 10000
  });

  const data = res.data;

  // Format answer box if available
  let result = '';

  if (data.answerBox) {
    const ab = data.answerBox;
    result += `📌 <b>Jawaban Langsung:</b>\n`;
    if (ab.answer) result += `${ab.answer}\n\n`;
    else if (ab.snippet) result += `${ab.snippet}\n\n`;
  }

  if (data.knowledgeGraph) {
    const kg = data.knowledgeGraph;
    result += `🧠 <b>${kg.title || ''}</b>${kg.type ? ` — ${kg.type}` : ''}\n`;
    if (kg.description) result += `${kg.description}\n\n`;
  }

  // Organic results
  const organic = data.organic || [];
  if (organic.length > 0) {
    result += `🔍 <b>Hasil Pencarian:</b>\n`;
    organic.slice(0, 4).forEach((r, i) => {
      result += `\n${i + 1}. <b>${r.title}</b>\n`;
      if (r.snippet) result += `   ${r.snippet}\n`;
      result += `   🔗 ${r.link}\n`;
    });
  }

  // News results
  const news = data.news || [];
  if (news.length > 0 && type === 'news') {
    result += `📰 <b>Berita Terbaru:</b>\n`;
    news.slice(0, 4).forEach((n, i) => {
      result += `\n${i + 1}. <b>${n.title}</b>\n`;
      if (n.snippet) result += `   ${n.snippet}\n`;
      result += `   📅 ${n.date || ''} — 🔗 ${n.link}\n`;
    });
  }

  return result.trim() || '⚠️ Tidak ada hasil ditemukan.';
}

module.exports = { searchWeb };
