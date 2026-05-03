const axios = require('axios');
const env = require('../config/env');
const googleWorkspace = require('../infrastructure/Google_Workspace');
const { executeWithFallback } = require('../core/Fallback_Engine');
const { NEXA_PERSONALITY } = require('../config/personality');

async function generateMorningBriefing() {
  console.log('[INTELLIGENCE] Generating Morning Briefing...');
  
  // 1. Get Today's Agenda
  let eventsStr = "Agenda hari ini kosong.";
  try {
    const events = await googleWorkspace.getTodaysEvents();
    if (events && events.length > 0) {
      eventsStr = events.map(e => {
        // e.start.dateTime exists for timed events; e.start.date for all-day events
        const startRaw = e.start?.dateTime || e.start?.date;
        const timeLabel = startRaw
          ? (e.start.dateTime
              ? new Date(startRaw).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
              : 'Sepanjang hari')
          : '?';
        return `- ${timeLabel}: ${e.summary || '(Tanpa judul)'}`;
      }).join('\n');
    }
  } catch (err) {
    console.warn('[INTELLIGENCE] Failed to get calendar events', err.message);
  }

  // 2. Get Weather (e.g. Yogyakarta)
  let weatherStr = "Data cuaca tidak tersedia.";
  try {
    if (env.WEATHER_API_KEY) {
      const weatherRes = await axios.get(`https://api.weatherapi.com/v1/current.json?key=${env.WEATHER_API_KEY}&q=Yogyakarta`);
      weatherStr = `${weatherRes.data.current.condition.text}, ${weatherRes.data.current.temp_c}°C`;
    }
  } catch (err) {
    console.warn('[INTELLIGENCE] Failed to get weather', err.message);
  }

  // 3. Get Geopolitics News (Middle East)
  let newsStr = "Berita geopolitik tidak tersedia.";
  try {
    if (env.NEWS_API_KEY) {
      const newsRes = await axios.get(`https://newsdata.io/api/1/news?apikey=${env.NEWS_API_KEY}&q=Timur%20Tengah%20OR%20Middle%20East&language=id`);
      const top3 = newsRes.data.results ? newsRes.data.results.slice(0, 3) : [];
      newsStr = top3.map(n => `- ${n.title}`).join('\n');
    }
  } catch (err) {
    console.warn('[INTELLIGENCE] Failed to get news', err.message);
  }

  // 4. Synthesize with LLM (High Temperature for natural prose)
  const prompt = `
[DATA MENTAH HARI INI]
Agenda:
${eventsStr}

Cuaca (Yogyakarta):
${weatherStr}

Berita Geopolitik (Timur Tengah):
${newsStr}

Buatkan The Diplomat's Morning Briefing yang elegan, proaktif, dan presisi untuk Tuan Faqih. 
Beri salam hormat, sampaikan laporan cuaca, peta jadwal hari ini, lalu ringkas implikasi geopolitiknya.
Gunakan nada seorang Chief of Staff senior yang melayani seorang calon diplomat elit.
Penting: Output langsung berupa teks naratif panjang, jangan berikan JSON.
`;

  let briefing = await executeWithFallback(prompt, `${NEXA_PERSONALITY}\n\nPenting: Output murni string teks naratif, bukan JSON.`, 0.7, false);

  // Clean Markdown JSON block if accidentally generated
  briefing = briefing.replace(/```json/g, '').replace(/```/g, '').trim();
  
  try {
    const parsed = JSON.parse(briefing);
    return parsed.message || parsed.reply_message || briefing;
  } catch(e) {
    // Expected to fail JSON parsing since it's raw text — truncate to Telegram limit (4096 chars)
    if (briefing.length > 4000) {
      briefing = briefing.substring(0, 3990) + '...\n\n[Laporan dipotong otomatis]';
    }
    return briefing;
  }
}

module.exports = { generateMorningBriefing };
