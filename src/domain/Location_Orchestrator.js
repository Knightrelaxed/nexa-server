// ============================================================
// N.E.X.A — LOCATION ORCHESTRATOR DOMAIN
// Pengorkestrasi cerdas yang menggabungkan Brave Place Search & Mapbox
// ============================================================
'use strict';

const locationEngine = require('../infrastructure/Location_Engine');

/**
 * Handle incoming location/navigation intent and route to appropriate API
 * @param {string} query - Full query text
 * @param {object} [context] - Context options (e.g., origin, userLocation, transportProfile)
 * @returns {Promise<string>} - Formatted markdown response for Telegram / CLI
 */
async function handleLocationQuery(query, context = {}) {
  const cleanQ = String(query || '').trim();
  if (!cleanQ) return '⚠️ Mohon berikan nama tempat atau rute yang ingin dicari, Tuan.';

  const lower = cleanQ.toLowerCase();

  // Detect intent type
  const isRouteQuery = /rute|jarak|berapa (menit|jam|km)|estimasi waktu|perjalanan dari|ke/i.test(lower) && (lower.includes(' dari ') || lower.includes(' ke '));

  if (isRouteQuery) {
    return await _handleRouteRequest(cleanQ, context);
  } else {
    return await _handlePlaceSearchRequest(cleanQ, context);
  }
}

/**
 * Handle route calculation via Mapbox
 */
async function _handleRouteRequest(query, context) {
  // Extract origin and destination from string if not provided in context
  let origin = context.origin || null;
  let destination = context.destination || null;

  if (!origin || !destination) {
    const match = query.match(/(?:dari|dr)\s+(.*?)\s+(?:ke|tujuan)\s+(.*)/i);
    if (match) {
      origin = match[1].trim();
      destination = match[2].trim();
    } else {
      const matchTo = query.match(/(?:ke|menuju)\s+(.*)/i);
      if (matchTo) {
        destination = matchTo[1].trim();
        origin = context.userLocation || 'Yogyakarta'; // Default fallback
      }
    }
  }

  if (!origin || !destination) {
    return '🗺️ Mohon sebutkan asal dan tujuan rute Tuan (contoh: *"Berapa menit dari Malioboro ke UGM naik motor?"*).';
  }

  const profile = context.profile || (query.toLowerCase().includes('jalan kaki') ? 'walking' : (query.toLowerCase().includes('sepeda') ? 'cycling' : 'driving'));

  const routeData = await locationEngine.calculateMapboxRoute(origin, destination, profile);
  if (!routeData) {
    return `⚠️ Maaf Tuan, N.E.X.A gagal menghitung rute dari <b>${origin}</b> ke <b>${destination}</b> via Mapbox. Mohon periksa kembali nama tempatnya.`;
  }

  return `🗺️ <b>Informasi Rute & Perjalanan (Mapbox Navigator)</b>\n\n` +
    `📍 <b>Asal:</b> ${routeData.originName}\n` +
    `🏁 <b>Tujuan:</b> ${routeData.destName}\n` +
    `🛵 <b>Mode:</b> ${routeData.profile}\n` +
    `📏 <b>Jarak Tempuh:</b> <b>${routeData.distanceKm}</b>\n` +
    `⏱️ <b>Estimasi Waktu (ETA):</b> <b>~${routeData.durationMins} menit</b>\n\n` +
    `<i>Dihitung secara presisi menggunakan Mapbox GIS Engine.</i>`;
}

/**
 * Handle place recommendations via Brave Place Search API with Mapbox Geocoding fallback
 */
async function _handlePlaceSearchRequest(query, context) {
  // 1. Try Brave Place Search for rich qualitative data
  const braveResult = await locationEngine.searchBravePlaces(query);

  if (braveResult && ((braveResult.locations && braveResult.locations.length > 0) || (braveResult.snippets && braveResult.snippets.length > 0))) {
    let card = `📍 <b>Rekomendasi Tempat & Tempat Lokal (Brave Place Search)</b>\n`;
    card += `🔍 <i>Query: "${braveResult.query}"</i>\n\n`;

    if (braveResult.locations && braveResult.locations.length > 0) {
      braveResult.locations.forEach((loc, idx) => {
        card += `${idx + 1}. <b>${loc.title}</b>\n`;
        if (loc.address) card += `   🏠 Alamat: ${loc.address}\n`;
        if (loc.rating) card += `   ⭐ Rating: ${loc.rating}/5 (${loc.reviewCount || 0} ulasan)\n`;
        if (loc.openingHours) card += `   🕒 Jam Buka: ${loc.openingHours}\n`;
        if (loc.phone) card += `   📞 Telp: ${loc.phone}\n`;
        if (loc.coordinates) {
          const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${loc.coordinates.lat},${loc.coordinates.lng}`;
          card += `   🗺️ <a href="${gmapsUrl}">Buka di Maps</a>\n`;
        }
        card += `\n`;
      });
    }

    if (braveResult.snippets && braveResult.snippets.length > 0) {
      card += `💡 <b>Ringkasan Ulasan Web Manusia:</b>\n`;
      braveResult.snippets.forEach(s => {
        card += `• <b>${s.title}</b>\n  ${s.snippet}\n`;
      });
    }

    return card.trim();
  }

  // 2. Fallback to Mapbox Geocoding if Brave has no location data or limit reached
  const mapboxGeocode = await locationEngine.geocodeMapbox(query);
  if (mapboxGeocode) {
    const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapboxGeocode.lat},${mapboxGeocode.lng}`;
    return `📍 <b>Hasil Pencarian Lokasi (Mapbox GIS)</b>\n\n` +
      `📌 <b>Nama Tempat:</b> ${mapboxGeocode.name}\n` +
      `🏠 <b>Alamat Lengkap:</b> ${mapboxGeocode.address}\n` +
      `🌐 <b>Koordinat:</b> ${mapboxGeocode.lat}, ${mapboxGeocode.lng}\n` +
      `🗺️ <b>Peta:</b> <a href="${gmapsUrl}">Lihat di Google Maps</a>`;
  }

  return `📭 Maaf Tuan, N.E.X.A tidak menemukan informasi lokasi atau tempat untuk <b>"${query}"</b>.`;
}

module.exports = {
  handleLocationQuery
};
