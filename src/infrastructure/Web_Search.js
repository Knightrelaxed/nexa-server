const axios = require('axios');
const env = require('../config/env');

/**
 * Expand common abbreviations and slang in search queries for better search engine indexing.
 * @param {string} query 
 * @returns {string}
 */
function expandQuery(query) {
  if (!query || typeof query !== 'string') return '';
  let q = query;
  q = q.replace(/\bhf\b/gi, 'Hugging Face');
  q = q.replace(/\bopen ai\b/gi, 'OpenAI');
  q = q.replace(/\bmsft\b/gi, 'Microsoft');
  q = q.replace(/\bgcp\b/gi, 'Google Cloud');
  q = q.replace(/\baws\b/gi, 'Amazon Web Services');
  q = q.replace(/\byt\b/gi, 'YouTube');
  q = q.replace(/\big\b/gi, 'Instagram');
  q = q.replace(/\bwa\b/gi, 'WhatsApp');
  return q.trim();
}

/**
 * Convert Indonesian query terms to English keywords for global tech/international fallback searches.
 * @param {string} query 
 * @returns {string}
 */
function toEnglishTechQuery(query) {
  let q = expandQuery(query);
  q = q.replace(/\bserangan\b/gi, 'attack security incident breach');
  q = q.replace(/\bberita\b/gi, 'news');
  q = q.replace(/\btentang\b/gi, 'about');
  q = q.replace(/\bke\b/gi, 'vs');
  q = q.replace(/\bdari\b/gi, 'from');
  q = q.replace(/\bapakah\b/gi, '');
  q = q.replace(/\btau\b/gi, '');
  q = q.replace(/\bcoba cari tau\b/gi, '');
  q = q.replace(/\bngga\b/gi, '');
  return q.replace(/\s+/g, ' ').trim();
}

/**
 * Perform single Serper.dev API call
 */
async function fetchSerper(endpoint, bodyParams) {
  try {
    const res = await axios.post(endpoint, bodyParams, {
      headers: {
        'X-API-KEY': env.SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 8000
    });
    return res.data || null;
  } catch (err) {
    console.warn(`[WEB_SEARCH] Serper fetch failed for ${endpoint}: ${err.message}`);
    return null;
  }
}

/**
 * Search the web using Serper.dev API with Smart Multi-Tier & Dual-Language Fallback
 * @param {string} query - Search query
 * @param {'search'|'news'|'scholar'} type - Search type
 * @returns {Promise<string>} - Formatted search results
 */
async function searchWeb(query, type = 'search') {
  if (!env.SERPER_API_KEY) {
    return '❌ SERPER_API_KEY belum dikonfigurasi.';
  }

  const cleanInput = String(query || '').trim();
  const expandedQ = expandQuery(cleanInput);
  const englishQ = toEnglishTechQuery(cleanInput);

  console.log(`[WEB_SEARCH] Query: "${cleanInput}" | Expanded: "${expandedQ}" | English: "${englishQ}" [type: ${type}]`);

  const primaryEndpoint = `https://google.serper.dev/${type}`;
  const searchEndpoint = `https://google.serper.dev/search`;

  // Run local Indonesian search AND global US search in parallel for maximum coverage
  const [localData, globalData] = await Promise.all([
    fetchSerper(primaryEndpoint, { q: expandedQ, gl: 'id', hl: 'id', num: 5 }),
    fetchSerper(searchEndpoint, { q: englishQ, gl: 'us', hl: 'en', num: 5 })
  ]);

  // If local search with type='news' yielded no news, retry local with type='search'
  let fallbackLocalData = null;
  const localNewsCount = localData?.news?.length || 0;
  const localOrgCount = localData?.organic?.length || 0;
  if (type === 'news' && localNewsCount === 0 && localOrgCount === 0) {
    fallbackLocalData = await fetchSerper(searchEndpoint, { q: expandedQ, gl: 'id', hl: 'id', num: 5 });
  }

  const primaryData = localData || fallbackLocalData;
  let result = '';

  // 1. Direct Answer Box (if available)
  const answerBox = primaryData?.answerBox || globalData?.answerBox;
  if (answerBox) {
    result += `📌 <b>Jawaban Langsung:</b>\n`;
    if (answerBox.answer) result += `${answerBox.answer}\n\n`;
    else if (answerBox.snippet) result += `${answerBox.snippet}\n\n`;
  }

  // 2. Knowledge Graph (if available)
  const kg = primaryData?.knowledgeGraph || globalData?.knowledgeGraph;
  if (kg && kg.title) {
    result += `🧠 <b>${kg.title}</b>${kg.type ? ` — ${kg.type}` : ''}\n`;
    if (kg.description) result += `${kg.description}\n\n`;
  }

  // Collect and deduplicate all organic and news results
  const seenLinks = new Set();
  const items = [];

  const addResultItem = (item, sourceLabel) => {
    if (!item || !item.link || seenLinks.has(item.link)) return;
    seenLinks.add(item.link);
    items.push({
      title: item.title,
      snippet: item.snippet,
      link: item.link,
      date: item.date || null,
      source: sourceLabel
    });
  };

  // Add Local Organic / News
  (primaryData?.news || []).forEach(n => addResultItem(n, 'Berita Lokal'));
  (primaryData?.organic || []).forEach(o => addResultItem(o, 'Hasil Pencarian'));

  // Add Global US Organic / News (essential for tech news like OpenAI vs HuggingFace)
  (globalData?.organic || []).forEach(o => addResultItem(o, 'Global/International'));
  (globalData?.news || []).forEach(n => addResultItem(n, 'Global News'));

  if (items.length > 0) {
    result += `🔍 <b>Hasil Penelusuran (Lokal & Global):</b>\n`;
    items.slice(0, 6).forEach((item, i) => {
      result += `\n${i + 1}. <b>${item.title}</b> [${item.source}]\n`;
      if (item.snippet) result += `   ${item.snippet}\n`;
      if (item.date) result += `   📅 ${item.date}\n`;
      result += `   🔗 ${item.link}\n`;
    });
  }

  return result.trim() || '⚠️ Tidak ada hasil penelusuran yang relevan ditemukan.';
}

module.exports = { searchWeb, expandQuery, toEnglishTechQuery };
