// ============================================================
// N.E.X.A — LOCATION ORCHESTRATOR DOMAIN
// Pengorkestrasi Lokasi Cerdas (Open-Source Spatial Stack + Auto-GPS Bridge)
// 100% Gratis Tanpa API Key & Tanpa Kartu Kredit
// ============================================================
'use strict';

const locationEngine = require('../infrastructure/Location_Engine');
const bridge = require('../interfaces/mobile_bridge/adapter');

/**
 * Pemetaan kata percakapan Indonesia ke sinonim POI OpenStreetMap
 */
const POI_SYNONYMS = {
  'ngopi': ['kopi', 'warkop', 'cafe'],
  'tempat ngopi': ['kopi', 'warkop', 'cafe'],
  'kopi': ['kopi', 'warkop', 'cafe'],
  'warkop': ['warkop', 'kopi', 'cafe'],
  'makan': ['warung', 'restoran', 'kuliner'],
  'tempat makan': ['restoran', 'warung', 'kuliner'],
  'kuliner': ['kuliner', 'warung', 'restoran'],
  'pom bensin': ['spbu', 'pertamina', 'bensin'],
  'bensin': ['spbu', 'pertamina'],
  'spbu': ['spbu', 'pertamina'],
  'atm': ['atm', 'bank'],
  'tarik tunai': ['atm', 'bank'],
  'bank': ['bank', 'atm'],
  'rumah sakit': ['rumah sakit', 'hospital', 'klinik'],
  'dokter': ['klinik', 'rumah sakit'],
  'apotek': ['apotek', 'pharmacy'],
  'minimarket': ['indomaret', 'alfamart', 'supermarket'],
  'supermarket': ['supermarket', 'indomaret', 'alfamart'],
  'masjid': ['masjid', 'mosque'],
  'mushola': ['mushola', 'masjid'],
  'hotel': ['hotel', 'penginapan', 'homestay'],
  'bengkel': ['bengkel', 'tambal ban']
};

/**
 * Mendapatkan koordinat GPS pengguna secara otomatis dari HP via Mobile Bridge
 * dengan fallback ke context atau geocode default.
 */
async function _resolveUserCoordinates(context = {}) {
  // 1. Jika sudah ada di context
  if (context.lat && (context.lon || context.lng)) {
    return {
      lat: Number(context.lat),
      lon: Number(context.lon || context.lng),
      source: 'CONTEXT'
    };
  }

  // 2. Coba minta GPS langsung dari HP via Mobile Bridge
  if (typeof bridge.isConnected === 'function' && bridge.isConnected()) {
    try {
      console.log('[LOCATION-ORCHESTRATOR] 📡 Mengambil koordinat GPS aktif dari HP via Bridge...');
      const bridgeRes = await bridge.getLocation();
      // sendCommand resolves: { success: boolean, message: string, data: object }
      if (bridgeRes && bridgeRes.success === true && bridgeRes.data) {
        const lat = Number(bridgeRes.data.latitude);
        const lon = Number(bridgeRes.data.longitude);
        if (!isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0)) {
          console.log(`[LOCATION-ORCHESTRATOR] ✅ GPS Live diperoleh: ${lat}, ${lon} (akurasi: ${bridgeRes.data.accuracy || 0}m)`);
          return { lat, lon, source: 'LIVE_GPS', accuracy: bridgeRes.data.accuracy };
        }
      }
      console.warn('[LOCATION-ORCHESTRATOR] GPS bridge response tidak valid:', JSON.stringify(bridgeRes));
    } catch (err) {
      console.warn('[LOCATION-ORCHESTRATOR] Gagal mengambil GPS dari Bridge:', err.message);
    }
  }

  // GPS tidak tersedia — kembalikan null agar pesan error yang informatif dikirim ke user
  console.warn('[LOCATION-ORCHESTRATOR] ⚠️ GPS tidak tersedia dan tidak ada koordinat konteks.');
  return null;
}

/**
 * Membersihkan kalimat query agar menjadi kata kunci pencarian POI yang bersih
 */
function _cleanPlaceQuery(query) {
  let q = String(query || '').trim();
  // Hapus tanda baca
  q = q.replace(/[?!,."']/g, '');
  // Hapus kata tanya & pengantar di awal
  q = q.replace(/^(?:nexa|tolong|coba|tolong carikan|carikan|cari|rekomendasi|rekomendasikan|info|daftar|adakah|apakah|ada|dimana|di mana|sebutkan)\s+/i, '');
  // Hapus frasa lokasi di akhir
  q = q.replace(/\s+(?:terdekat|dekat sini|di dekat sini|di sekitar sini|sekitar sini|di sekitar saya|sekitar saya|dari posisi saya sekarang|dari posisi saya|dari sini|posisi saya|sekarang|terbaik)$/i, '');
  q = q.replace(/\s+(?:terdekat|dekat sini|di dekat sini|di sekitar sini|sekitar sini|di sekitar saya|dari posisi saya)\b/gi, '');
  return q.trim() || query;
}

/**
 * Menghasilkan daftar kandidat kata kunci pencarian dari query pengguna
 */
function _expandSearchKeywords(cleanQuery) {
  const lower = cleanQuery.toLowerCase().trim();
  const candidates = [cleanQuery];

  // Cek sinonim langsung
  for (const [key, syns] of Object.entries(POI_SYNONYMS)) {
    if (lower.includes(key)) {
      candidates.push(...syns);
    }
  }

  // Pisahkan konjungsi "atau", "dan", "/"
  if (lower.includes(' atau ') || lower.includes(' dan ') || lower.includes('/')) {
    const parts = lower.split(/\s+(?:atau|dan|\/)\s+/);
    for (const part of parts) {
      const pClean = part.replace(/^tempat\s+/i, '').trim();
      if (pClean) {
        candidates.push(pClean);
        for (const [key, syns] of Object.entries(POI_SYNONYMS)) {
          if (pClean.includes(key)) candidates.push(...syns);
        }
      }
    }
  }

  // Ambil hanya yang unik
  return [...new Set(candidates)];
}

/**
 * Handle incoming location/navigation intent and route to appropriate API
 * @param {string} query - Full query text
 * @param {object} [context] - Context options (e.g., origin, userLocation, transportProfile)
 * @returns {Promise<string>} - Formatted HTML response for Telegram
 */
async function handleLocationQuery(query, context = {}) {
  const cleanQ = String(query || '').trim();
  if (!cleanQ) return '⚠️ Mohon berikan nama tempat atau rute yang ingin dicari, Tuan.';

  const lower = cleanQ.toLowerCase();

  // Deteksi tipe query: Rute/Navigasi vs Pencarian Tempat (Nearby POI)
  const isRouteQuery =
    /rute|jarak|berapa (menit|jam|km)|estimasi waktu|perjalanan dari|menuju ke|arah ke/i.test(lower) &&
    (lower.includes(' dari ') || lower.includes(' ke ') || lower.includes(' menuju '));

  if (isRouteQuery) {
    return await _handleRouteRequest(cleanQ, context);
  } else {
    return await _handlePlaceSearchRequest(cleanQ, context);
  }
}

/**
 * Handle route calculation via OSRM / Mapbox
 */
async function _handleRouteRequest(query, context) {
  let origin = context.origin || null;
  let destination = context.destination || null;

  if (!origin || !destination) {
    const match = query.match(/(?:dari|dr)\s+(.*?)\s+(?:ke|tujuan|menuju)\s+(.*)/i);
    if (match) {
      origin = match[1].trim();
      destination = match[2].trim();
    } else {
      const matchTo = query.match(/(?:ke|menuju)\s+(.*)/i);
      if (matchTo) {
        destination = matchTo[1].trim();
        origin = 'posisi saya';
      }
    }
  }

  // Jika origin adalah posisi pengguna, ambil GPS
  let origCoords = null;
  if (!origin || /^(?:posisi saya|lokasi saya|sini|current location|tempat saya)$/i.test(String(origin).trim())) {
    const userCoords = await _resolveUserCoordinates(context);
    if (userCoords) {
      origCoords = { lat: userCoords.lat, lng: userCoords.lon, name: 'Posisi Anda Saat Ini' };
      origin = origCoords;
    }
  }

  if (!origin || !destination) {
    return '🗺️ Mohon sebutkan asal dan tujuan rute Tuan (contoh: *"Berapa menit dari Malioboro ke UGM naik motor?"*).';
  }

  const profile = context.profile || (query.toLowerCase().includes('jalan kaki') ? 'walking' : (query.toLowerCase().includes('sepeda') ? 'cycling' : 'driving'));

  const routeData = await locationEngine.calculateRouteOsm(origin, destination, profile);
  if (!routeData) {
    return `⚠️ Maaf Tuan, N.E.X.A gagal menghitung rute ke <b>${typeof destination === 'object' ? destination.name : destination}</b>. Mohon periksa kembali nama tempatnya.`;
  }

  return `🗺️ <b>Informasi Rute & Estimasi Perjalanan</b>\n\n` +
    `📍 <b>Asal:</b> ${routeData.originName}\n` +
    `🏁 <b>Tujuan:</b> ${routeData.destName}\n` +
    `🛵 <b>Moda:</b> ${routeData.profile}\n` +
    `📏 <b>Jarak Tempuh:</b> <b>${routeData.distanceKm}</b>\n` +
    `⏱️ <b>Estimasi Waktu:</b> <b>~${routeData.durationMins} menit</b>\n\n` +
    `🧭 <a href="${routeData.gmapsUrl}"><b>Buka Navigasi Langsung di Google Maps</b></a>\n\n` +
    `<i>Dihitung secara akurat menggunakan Open-Source Routing Engine.</i>`;
}

/**
 * Handle place recommendations via OpenStreetMap Photon + Nominatim + Auto GPS
 */
async function _handlePlaceSearchRequest(query, context) {
  const cleanedKeyword = _cleanPlaceQuery(query);

  // 1. Ambil koordinat pengguna (Live GPS dari HP jika terhubung)
  const userCoords = await _resolveUserCoordinates(context);
  let userAddressStr = '';

  if (userCoords) {
    const rev = await locationEngine.reverseGeocodeOsm(userCoords.lat, userCoords.lon);
    if (rev && rev.displayName) {
      userAddressStr = rev.displayName;
    }
  }

  // Jika GPS tidak tersedia sama sekali, beri tahu user secara sopan
  if (!userCoords) {
    return `📡 <b>GPS Tidak Tersedia</b>\n\n` +
      `Maaf Tuan, N.E.X.A tidak berhasil membaca koordinat lokasi HP saat ini.\n\n` +
      `<b>Cara mengatasinya:</b>\n` +
      `• Pastikan GPS / Lokasi di HP <b>aktif</b>\n` +
      `• Buka aplikasi Nexa Bridge di HP\n` +
      `• Coba lagi setelah beberapa detik\n\n` +
      `Atau sebutkan nama kota/daerah Tuan secara langsung, contoh:\n` +
      `<i>"Nexa, carikan pom bensin terdekat di Jebres Surakarta"</i>`;
  }

  const lat = userCoords.lat;
  const lon = userCoords.lon;

  // 2. Kembangkan kata kunci pencarian (Sinonim & Konjungsi)
  const searchKeywords = _expandSearchKeywords(cleanedKeyword);
  console.log('[LOCATION-ORCHESTRATOR] Keyword pencarian:', searchKeywords);

  let places = [];
  for (const kw of searchKeywords) {
    const results = await locationEngine.searchNearbyPlaces(kw, lat, lon, { limit: 5 });
    if (results && results.length > 0) {
      // Gabungkan hasil dan hindari duplikasi nama
      for (const r of results) {
        if (!places.some(p => p.name.toLowerCase() === r.name.toLowerCase())) {
          places.push(r);
        }
      }
    }
    if (places.length >= 4) break; // Cukup 4-5 tempat terbaik
  }

  // Sortir ulang berdasarkan jarak terdekat
  places.sort((a, b) => a.distanceMeters - b.distanceMeters);

  if (places && places.length > 0) {
    let card = `📍 <b>Rekomendasi Tempat Terdekat</b>\n`;
    if (userAddressStr) {
      card += `📌 <i>Posisi Anda: ${userAddressStr}</i>\n`;
    }
    card += `🔍 <i>Pencarian: "${cleanedKeyword}"</i>\n\n`;

    places.slice(0, 5).forEach((p, idx) => {
      const num = idx + 1;
      card += `${num}. <b>${p.name}</b> (~${p.distanceText})\n`;
      if (p.address && p.address !== p.name) {
        card += `   🏠 <i>${p.address}</i>\n`;
      }
      card += `   🧭 <a href="${p.gmapsUrl}">Buka Navigasi di Google Maps</a>\n\n`;
    });

    card += `<i>Data lokasi real-time berbasis OpenStreetMap Spatial Engine.</i>`;
    return card.trim();
  }

  // 3. Jika pencarian spesifik tidak ada hasil, berikan tautan pencarian Google Maps instan
  const encodedQ = encodeURIComponent(cleanedKeyword || query);
  const fallbackGmapsUrl = (userCoords)
    ? `https://www.google.com/maps/search/${encodedQ}/@${userCoords.lat},${userCoords.lon},15z`
    : `https://www.google.com/maps/search/${encodedQ}`;

  return `📍 <b>Pencarian Tempat: "${cleanedKeyword}"</b>\n\n` +
    (userAddressStr ? `📌 <i>Posisi Anda: ${userAddressStr}</i>\n\n` : '') +
    `N.E.X.A tidak menemukan titik POI persis di database lokal untuk kata kunci tersebut.\n\n` +
    `🗺️ <a href="${fallbackGmapsUrl}"><b>Klik di sini untuk mencari langsung di Google Maps</b></a>`;
}

module.exports = {
  handleLocationQuery
};
