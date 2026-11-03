// ============================================================
// N.E.X.A — LOCATION ORCHESTRATOR DOMAIN
// Pengorkestrasi Lokasi Cerdas (Open-Source Spatial Stack + Auto-GPS Bridge)
// 100% Gratis Tanpa API Key & Tanpa Kartu Kredit
// ============================================================
'use strict';

const locationEngine = require('../infrastructure/Location_Engine');
const bridge = require('../interfaces/bridge').mobile.adapter;

/**
 * Pemetaan kata percakapan Indonesia ke sinonim POI OpenStreetMap yang optimal
 */
const POI_SYNONYMS = {
  'ngopi': ['warkop', 'cafe', 'kopi'],
  'tempat ngopi': ['warkop', 'cafe', 'kopi'],
  'kopi': ['warkop', 'cafe', 'kopi'],
  'warkop': ['warkop', 'cafe', 'kopi'],
  'makan': ['warung', 'restoran', 'kuliner'],
  'tempat makan': ['restoran', 'warung', 'kuliner'],
  'kuliner': ['kuliner', 'warung', 'restoran'],
  'pom bensin': ['SPBU Pertamina', 'SPBU', 'Pertamina'],
  'bensin': ['SPBU Pertamina', 'SPBU', 'Pertamina'],
  'spbu': ['SPBU Pertamina', 'SPBU', 'Pertamina'],
  'atm': ['ATM', 'Bank'],
  'tarik tunai': ['ATM', 'Bank'],
  'bank': ['Bank', 'ATM'],
  'rumah sakit': ['Rumah Sakit', 'Hospital', 'Klinik'],
  'dokter': ['Klinik', 'Rumah Sakit'],
  'apotek': ['Apotek', 'Pharmacy'],
  'minimarket': ['Indomaret', 'Alfamart', 'Superindo'],
  'supermarket': ['Superindo', 'Supermarket', 'Indomaret'],
  'masjid': ['Masjid', 'Mosque'],
  'mushola': ['Mushola', 'Masjid'],
  'hotel': ['Hotel', 'Penginapan', 'Homestay'],
  'bengkel': ['Bengkel', 'Tambal Ban'],
  'asrama': ['asrama mahasiswa', 'wisma', 'asrama pelajar'],
  'asrama mahasiswa': ['asrama mahasiswa', 'wisma', 'asrama pelajar'],
  'kost': ['kost', 'rumah kost', 'kost putri', 'kost putra'],
  'es kelapa': ['es kelapa muda', 'es degan', 'kelapa muda'],
  'kelapa muda': ['es kelapa muda', 'es degan']
};

/**
 * Menghitung arah mata angin relatif dari titik asal ke titik tujuan
 */
function getCardinalDirection(fromLat, fromLon, toLat, toLon) {
  if (!fromLat || !fromLon || !toLat || !toLon) return '';
  const dLat = toLat - fromLat;
  const dLon = toLon - fromLon;
  const angle = Math.atan2(dLon, dLat) * (180 / Math.PI); // -180 to 180 (0 = Utara)
  
  if (angle >= -22.5 && angle < 22.5) return 'sisi utara';
  if (angle >= 22.5 && angle < 67.5) return 'sisi timur laut';
  if (angle >= 67.5 && angle < 112.5) return 'sisi timur';
  if (angle >= 112.5 && angle < 157.5) return 'sisi tenggara';
  if (angle >= 157.5 || angle < -157.5) return 'sisi selatan';
  if (angle >= -157.5 && angle < -112.5) return 'sisi barat daya';
  if (angle >= -112.5 && angle < -67.5) return 'sisi barat';
  if (angle >= -67.5 && angle < -22.5) return 'sisi barat laut';
  return '';
}

/**
 * Mendeteksi kueri spasial relasional (misal: "di sebelah masjid tempat aku berada ada apa")
 */
function _extractRelationalQuery(query) {
  const clean = String(query || '')
    .replace(/[?!.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  // Pola relasional: di sebelah X, di samping X, di sekitar X, ada apa di sebelah X, dll.
  const relRegex = /(?:(?:ada\s+apa\s+(?:saja\s+)?)|(?:apa\s+saja\s+))?(?:di\s+)?(sebelah|samping|dekat|sekitar|depan|belakang)\s+([a-z0-9\s]+?)(?:\s+(?:di\s+)?(?:tempat|posisi|lokasi)\s+(?:aku|saya|kita|kami)\s*(?:sedang\s+)?(?:berada|sekarang)?)?(?:\s+(?:ada\s+apa|apa\s+saja|tempat\s+apa))?$/i;

  const match = clean.match(relRegex);
  if (match) {
    const relation = match[1].trim();
    let landmark = match[2].trim()
      .replace(/^(?:sebuah|suatu|titik)\s+/i, '')
      .replace(/\s+(?:terdekat|dekat sini)$/i, '')
      .trim();

    if (landmark && landmark.length > 2 && !/^(?:sini|sana|situ|tempat|lokasi)$/i.test(landmark)) {
      return { relation, landmark };
    }
  }
  return null;
}

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
  q = q.replace(/[?!,."':;()]/g, ' ');
  
  // Hapus kata tanya & pengantar di awal secara berulang hingga bersih
  const fillerRegex = /^(?:nexa|hey nexa|halo nexa|tolong|coba|tolong carikan|carikan|cari|rekomendasi|rekomendasikan|info|informasi|daftar|adakah|apakah|ada|dimana|di mana|sebutkan|mau|pengen|butuh)\s+/i;
  let prev;
  do {
    prev = q;
    q = q.replace(fillerRegex, '').trim();
  } while (q !== prev);

  // Hapus frasa lokasi & proximity di akhir
  q = q.replace(/\s+(?:terdekat|paling dekat|dekat sini|di dekat sini|di sekitar sini|sekitar sini|di sekitar saya|sekitar saya|dari posisi saya sekarang|dari posisi saya|dari sini|posisi saya|sekarang|terbaik)$/i, '');
  q = q.replace(/\s+(?:terdekat|dekat sini|di dekat sini|di sekitar sini|sekitar sini|di sekitar saya|dari posisi saya)\b/gi, '');
  return q.trim() || query;
}

/**
 * Menghasilkan daftar kandidat kata kunci pencarian dari query pengguna
 */
function _expandSearchKeywords(cleanQuery) {
  const lower = cleanQuery.toLowerCase().trim();
  const candidates = [];

  // 1. Cek sinonim langsung (prioritaskan nama resmi OSM seperti 'SPBU Pertamina')
  for (const [key, syns] of Object.entries(POI_SYNONYMS)) {
    if (lower.includes(key)) {
      candidates.push(...syns);
    }
  }

  // 2. Tambahkan kata kunci asli
  candidates.push(cleanQuery);

  // 3. Pisahkan konjungsi "atau", "dan", "/"
  if (lower.includes(' atau ') || lower.includes(' dan ') || lower.includes('/')) {
    const parts = lower.split(/\s+(?:atau|dan|\/)\s+/);
    for (const part of parts) {
      const pClean = part.replace(/^tempat\s+/i, '').trim();
      if (pClean) {
        for (const [key, syns] of Object.entries(POI_SYNONYMS)) {
          if (pClean.includes(key)) candidates.push(...syns);
        }
        candidates.push(pClean);
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

  // 1. Deteksi kueri Rute/Navigasi
  const isRouteQuery =
    /rute|jarak|berapa (menit|jam|km)|estimasi waktu|perjalanan dari|menuju ke|arah ke/i.test(lower) &&
    (lower.includes(' dari ') || lower.includes(' ke ') || lower.includes(' menuju '));

  if (isRouteQuery) {
    return await _handleRouteRequest(cleanQ, context);
  }

  // 2. Deteksi kueri Spasial Relasional (misal: "di sebelah masjid tempat aku berada ada apa")
  const relationalMeta = _extractRelationalQuery(cleanQ);
  if (relationalMeta) {
    const userCoords = await _resolveUserCoordinates(context);
    if (userCoords) {
      return await _handleRelationalPlaceRequest(cleanQ, relationalMeta, context, userCoords);
    }
  }

  // 3. Pencarian Tempat Standar (Nearby POI)
  return await _handlePlaceSearchRequest(cleanQ, context);
}

/**
 * Menangani pencarian tempat relasional dua-langkah (Two-Pass Spatial Resolution)
 * Pass 1: Resolusi Landmark Jangkar dari GPS Pengguna
 * Pass 2: Radial Multi-Category Sweeping di sekitar Titik Jangkar
 */
async function _handleRelationalPlaceRequest(query, relationalMeta, context, userCoords) {
  const { relation, landmark } = relationalMeta;
  const lat = userCoords.lat;
  const lon = userCoords.lon;

  console.log(`[LOCATION-ORCHESTRATOR] 🎯 Two-Pass Relational: Jangkar="${landmark}", Relasi="${relation}"`);

  // ── PASS 1: RESOLUSI TITIK JANGKAR ──────────────────────────
  const anchorPlaces = await locationEngine.searchNearbyPlaces(landmark, lat, lon, { limit: 1, zoom: 17 });
  if (!anchorPlaces || anchorPlaces.length === 0) {
    return await _handlePlaceSearchRequest(query, context, userCoords);
  }

  const anchor = anchorPlaces[0];
  const anchorLat = anchor.lat || lat;
  const anchorLon = anchor.lon || lon;

  console.log(`[LOCATION-ORCHESTRATOR] ✅ Titik Jangkar: "${anchor.name}" di ${anchorLat}, ${anchorLon} (~${anchor.distanceText})`);

  // ── PASS 2: RADIAL MULTI-CLUSTER SWEEPING (Radius < 200m) ────
  const clusters = [
    { key: 'hunian', label: 'Hunian & Asrama Mahasiswa', icon: '🏢', queries: ['asrama mahasiswa', 'wisma kost', 'pondokan'] },
    { key: 'kuliner', label: 'Kuliner & Tempat Makan', icon: '🍲', queries: ['warung makan', 'kedai kopi', 'kuliner'] },
    { key: 'layanan', label: 'Toko, Layanan & Fasilitas', icon: '🏪', queries: ['toko', 'laundry', 'minimarket'] }
  ];

  const foundByCluster = {
    hunian: [],
    kuliner: [],
    layanan: []
  };

  const seenTitles = new Set();
  seenTitles.add(anchor.name.toLowerCase().trim());

  await Promise.allSettled(clusters.map(async (c) => {
    for (const q of c.queries) {
      try {
        const places = await locationEngine.searchNearbyPlaces(q, anchorLat, anchorLon, { limit: 4, zoom: 18, maxDistanceMeters: 250 });
        for (const p of places) {
          const normTitle = p.name.toLowerCase().trim();
          if (!seenTitles.has(normTitle)) {
            const distFromAnchor = (anchorLat && anchorLon && p.lat && p.lon)
              ? locationEngine.calculateHaversineDistance(anchorLat, anchorLon, p.lat, p.lon)
              : p.distanceMeters;

            if (distFromAnchor <= 200) {
              seenTitles.add(normTitle);
              const dir = getCardinalDirection(anchorLat, anchorLon, p.lat, p.lon);
              foundByCluster[c.key].push({
                ...p,
                distFromAnchor,
                distFromAnchorText: `${distFromAnchor}m`,
                direction: dir
              });
            }
          }
        }
      } catch (_) {}
      if (foundByCluster[c.key].length >= 3) break;
    }
  }));

  for (const k of Object.keys(foundByCluster)) {
    foundByCluster[k].sort((a, b) => a.distFromAnchor - b.distFromAnchor);
  }

  // ── FORMAT KARTU RESPON ────────────────────────────────────
  let card = `📍 <b>Fasilitas & Tempat di Sekitar: ${anchor.name}</b>\n`;
  card += `📌 <i>Titik Acuan: ${anchor.name} (~${anchor.distanceText} dari HP Tuan)</i>\n`;
  if (anchor.address && anchor.address !== anchor.name) {
    card += `🏠 <i>${anchor.address}</i>\n`;
  }
  card += `\n`;

  let totalFound = 0;
  for (const c of clusters) {
    const items = foundByCluster[c.key];
    if (items && items.length > 0) {
      totalFound += items.length;
      card += `${c.icon} <b>${c.label}:</b>\n`;
      items.slice(0, 3).forEach(item => {
        const dirStr = item.direction ? ` (${item.direction})` : '';
        const ratingStr = item.rating ? ` • ⭐ ${item.rating}` : '';
        card += `• <b>${item.name}</b> (~${item.distFromAnchorText}${dirStr}${ratingStr})\n`;
        if (item.address && item.address !== item.name) {
          card += `  <i>${item.address.split(',')[0]}</i>\n`;
        }
      });
      card += `\n`;
    }
  }

  if (totalFound === 0) {
    card += `<i>Tidak ada fasilitas tambahan yang terdata di samping persis titik ini.</i>\n\n`;
  }

  const gmapsAreaUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(anchor.name + ' ' + anchor.address)}`;
  card += `🧭 <a href="${gmapsAreaUrl}"><b>Buka Area Sekitar di Google Maps</b></a>\n\n`;
  card += `<i>Dianalisis secara presisi menggunakan Two-Pass Hyper-Local Spatial Engine.</i>`;

  return card.trim();
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
      const ratingStr = p.rating ? ` (⭐ ${p.rating}${p.ratingCount ? `, ${p.ratingCount} ulasan` : ''})` : '';
      card += `${num}. <b>${p.name}</b> (~${p.distanceText})${ratingStr}\n`;
      if (p.address && p.address !== p.name) {
        card += `   🏠 <i>${p.address}</i>\n`;
      }
      if (p.openingHours) {
        const todayName = new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' }).format(new Date());
        const todayHours = p.openingHours[todayName] || (typeof p.openingHours === 'string' ? p.openingHours : null);
        if (todayHours) {
          card += `   🕒 <i>Jam Buka (${todayName}): ${todayHours}</i>\n`;
        }
      }
      card += `   🧭 <a href="${p.gmapsUrl}">Buka Navigasi di Google Maps</a>\n\n`;
    });

    const isGoogle = places.some(p => p.source === 'GOOGLE_MAPS');
    card += isGoogle
      ? `<i>Data lokasi real-time Google Maps via Serper Engine.</i>`
      : `<i>Data lokasi real-time berbasis OpenStreetMap Spatial Engine.</i>`;
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

/**
 * Resolves current live GPS address or informs user that GPS is offline
 */
async function getCurrentLocation(context = {}) {
  const userCoords = await _resolveUserCoordinates(context);
  if (!userCoords) {
    return `📡 <b>GPS Tidak Tersedia</b>\n\n` +
      `Maaf Tuan, N.E.X.A tidak berhasil membaca koordinat lokasi HP saat ini.\n\n` +
      `<b>Cara mengatasinya:</b>\n` +
      `• Pastikan GPS / Lokasi di HP <b>aktif</b>\n` +
      `• Buka aplikasi Nexa Bridge di HP\n` +
      `• Coba lagi setelah beberapa detik`;
  }

  const rev = await locationEngine.reverseGeocodeOsm(userCoords.lat, userCoords.lon);
  const addr = rev?.displayName || `${userCoords.lat}, ${userCoords.lon}`;
  const gmapsUrl = `https://www.google.com/maps?q=${userCoords.lat},${userCoords.lon}`;
  return `📍 <b>Lokasi Tuan Saat Ini:</b>\n\n${addr}\n\n🧭 <a href="${gmapsUrl}"><b>Buka di Google Maps</b></a>`;
}

/**
 * Searches location by place name or address query
 */
async function searchLocation(query, context = {}) {
  return await handleLocationQuery(query, context);
}

/**
 * Handles extracted location intent payload
 */
async function handleLocationIntent(extractedData = {}, context = {}) {
  const query = extractedData.query || [extractedData.origin, extractedData.destination].filter(Boolean).join(' ke ') || '';
  if (extractedData.action === 'GET' && !query) {
    return await getCurrentLocation(context);
  }
  return await handleLocationQuery(query, {
    origin: extractedData.origin,
    destination: extractedData.destination,
    profile: extractedData.profile,
    ...context
  });
}

module.exports = {
  handleLocationQuery,
  handleLocationIntent,
  searchLocation,
  getCurrentLocation,
  _resolveUserCoordinates
};
