// ============================================================
// N.E.X.A — LOCATION ENGINE INFRASTRUCTURE
// Klien terpadu untuk Open-Source Spatial Stack (OSM, Photon, Nominatim, OSRM)
// 100% Gratis Tanpa API Key & Tanpa Kartu Kredit
// (Dengan graceful fallback ke Brave & Mapbox jika env key tersedia)
// ============================================================
'use strict';

const axios = require('axios');
const env = require('../config/env');

const USER_AGENT_HEADER = {
  'User-Agent': 'NEXA-Assistant-Personal/1.0 (Personal AI Assistant)'
};

/**
 * Hitung jarak garis lurus (Haversine formula) antara 2 koordinat (dalam Meter)
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Format meter ke string jarak manusiawi (misal "350 m" atau "2.4 km")
 */
function formatDistance(meters) {
  if (meters < 1000) {
    return `${meters} meter`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Search places and local POIs around GPS coordinates using Photon (Komoot / OpenStreetMap)
 * @param {string} query - Keyword pencarian (e.g., "warkop", "kopi", "pom bensin", "atm mandiri", "makan")
 * @param {number} lat - Latitude pengguna
 * @param {number} lon - Longitude pengguna
 * @param {object} [opts] - Opsi tambahan
 * @returns {Promise<Array<{name: string, address: string, distanceMeters: number, distanceText: string, lat: number, lon: number, gmapsUrl: string, category: string}>>}
 */
async function searchNearbyPlaces(query, lat, lon, opts = {}) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return [];

  const limit = opts.limit || 5;
  const maxDist = opts.maxDistanceMeters || 15000; // 15 km limit untuk pencarian lokal terdekat
  const results = [];

  // 1. Nominatim Bounded Viewbox Search (~10 km radius dari titik GPS)
  if (lat && lon) {
    try {
      const d = 0.09; // ~10km bounding box
      const viewbox = `${lon - d},${lat + d},${lon + d},${lat - d}`; // left,top,right,bottom
      const nomRes = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q: cleanQuery,
          format: 'json',
          viewbox: viewbox,
          bounded: 1,
          limit: limit + 3,
          addressdetails: 1
        },
        headers: { 'User-Agent': 'NexaAssistant/3.0 (admin@nexa-assistant.local)' },
        timeout: 5000
      });

      if (Array.isArray(nomRes.data)) {
        for (const item of nomRes.data) {
          const itemLat = parseFloat(item.lat);
          const itemLon = parseFloat(item.lon);
          if (!isNaN(itemLat) && !isNaN(itemLon)) {
            const dist = calculateHaversineDistance(lat, lon, itemLat, itemLon);
            if (dist <= maxDist) {
              const name = item.name || (item.display_name ? item.display_name.split(',')[0].trim() : cleanQuery);
              results.push({
                name,
                address: item.display_name || 'Indonesia',
                category: item.type || item.class || 'Tempat',
                lat: itemLat,
                lon: itemLon,
                distanceMeters: dist,
                distanceText: formatDistance(dist),
                gmapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${itemLat},${itemLon}`
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn('[LOCATION-ENGINE] Nominatim bounded search error:', err.message);
    }
  }

  // 2. Photon Komoot API (Proximity bias dengan strict distance filter)
  try {
    const url = 'https://photon.komoot.io/api/';
    const response = await axios.get(url, {
      params: {
        q: cleanQuery,
        lat: lat,
        lon: lon,
        limit: limit + 3
      },
      headers: USER_AGENT_HEADER,
      timeout: 5000
    });

    const features = response.data?.features || [];
    for (const f of features) {
      const props = f.properties || {};
      const geom = f.geometry?.coordinates || [];
      const itemLon = geom[0];
      const itemLat = geom[1];

      if (itemLat && itemLon) {
        const dist = (lat && lon) ? calculateHaversineDistance(lat, lon, itemLat, itemLon) : 0;
        
        // Filter: Jangan masukkan hasil di atas batas maxDist jika GPS aktif
        if (lat && lon && dist > maxDist) continue;

        const name = props.name || props.street || cleanQuery;
        // Hindari duplikasi
        if (!results.some(r => r.name.toLowerCase() === name.toLowerCase())) {
          const addressParts = [];
          if (props.street) addressParts.push(props.street);
          if (props.locality || props.district) addressParts.push(props.locality || props.district);
          if (props.city) addressParts.push(props.city);
          const address = addressParts.join(', ') || props.state || 'Indonesia';

          results.push({
            name,
            address,
            category: props.osm_value || props.osm_key || 'Tempat',
            lat: itemLat,
            lon: itemLon,
            distanceMeters: dist,
            distanceText: formatDistance(dist),
            gmapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${itemLat},${itemLon}`
          });
        }
      }
    }
  } catch (err) {
    console.warn('[LOCATION-ENGINE] Photon POI search failed:', err.message);
  }

  // 3. Fallback ke Brave Place Search jika API Key tersedia
  if (results.length === 0 && env.BRAVE_API_KEY) {
    const braveRes = await searchBravePlaces(cleanQuery, opts);
    if (braveRes?.locations?.length > 0) {
      for (const loc of braveRes.locations) {
        let distMeters = 0;
        if (lat && lon && loc.coordinates?.lat && loc.coordinates?.lng) {
          distMeters = calculateHaversineDistance(lat, lon, loc.coordinates.lat, loc.coordinates.lng);
        }
        if (distMeters <= maxDist) {
          results.push({
            name: loc.title,
            address: loc.address,
            category: 'Tempat',
            lat: loc.coordinates?.lat || null,
            lon: loc.coordinates?.lng || null,
            distanceMeters: distMeters,
            distanceText: distMeters > 0 ? formatDistance(distMeters) : '-',
            gmapsUrl: loc.coordinates
              ? `https://www.google.com/maps/dir/?api=1&destination=${loc.coordinates.lat},${loc.coordinates.lng}`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.title + ' ' + loc.address)}`
          });
        }
      }
    }
  }

  // Sortir berdasarkan jarak terdekat dari pengguna
  results.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return results.slice(0, limit);
}

/**
 * Reverse Geocode: Mengubah Koordinat GPS (Lat, Lon) menjadi Nama Alamat Manusiawi via Nominatim OSM
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<{displayName: string, road: string, subdistrict: string, city: string, state: string}|null>}
 */
async function reverseGeocodeOsm(lat, lon) {
  if (!lat || !lon) return null;

  try {
    const url = 'https://nominatim.openstreetmap.org/reverse';
    const response = await axios.get(url, {
      params: {
        lat: lat,
        lon: lon,
        format: 'json',
        addressdetails: 1
      },
      headers: USER_AGENT_HEADER,
      timeout: 6000
    });

    const data = response.data;
    if (!data) return null;

    const addr = data.address || {};
    const road = addr.road || addr.pedestrian || addr.footway || '';
    const subdistrict = addr.village || addr.suburb || addr.neighbourhood || addr.quarter || '';
    const district = addr.city_district || addr.district || addr.county || '';
    const city = addr.city || addr.town || addr.municipality || addr.regency || '';
    const state = addr.state || '';

    const parts = [road, subdistrict, district, city].filter(Boolean);
    const shortAddress = parts.length > 0 ? parts.join(', ') : data.display_name;

    return {
      displayName: shortAddress,
      fullAddress: data.display_name,
      road,
      subdistrict,
      district,
      city,
      state
    };
  } catch (err) {
    console.error('[LOCATION-ENGINE] Nominatim Reverse Geocode error:', err.message);
    // Fallback to Mapbox if available
    return await reverseGeocodeMapbox(lat, lon);
  }
}

/**
 * Geocode: Mengubah Nama Tempat / Kota menjadi Koordinat (Lat, Lng) via Nominatim OSM
 * @param {string} locationName
 * @returns {Promise<{name: string, address: string, lat: number, lng: number}|null>}
 */
async function geocodeOsm(locationName) {
  const clean = String(locationName || '').trim();
  if (!clean) return null;

  try {
    const url = 'https://nominatim.openstreetmap.org/search';
    const response = await axios.get(url, {
      params: {
        q: clean,
        format: 'json',
        limit: 1,
        countrycodes: 'id'
      },
      headers: USER_AGENT_HEADER,
      timeout: 6000
    });

    const results = response.data;
    if (results && results.length > 0) {
      const top = results[0];
      return {
        name: clean,
        address: top.display_name,
        lat: parseFloat(top.lat),
        lng: parseFloat(top.lon)
      };
    }
  } catch (err) {
    console.warn('[LOCATION-ENGINE] Nominatim Geocode failed, trying Mapbox fallback:', err.message);
  }

  // Fallback to Mapbox if available
  return await geocodeMapbox(clean);
}

/**
 * Hitung Rute, Jarak, dan ETA Perjalanan via OSRM (Open Source Routing Machine)
 * @param {string|{lat: number, lng: number}} origin - Titik asal
 * @param {string|{lat: number, lng: number}} destination - Titik tujuan
 * @param {'driving'|'cycling'|'walking'} [profile='driving'] - Mode transportasi
 * @returns {Promise<{distanceKm: string, durationMins: number, originName: string, destName: string, profile: string, gmapsUrl: string}|null>}
 */
async function calculateRouteOsm(origin, destination, profile = 'driving') {
  try {
    let origCoords = typeof origin === 'object' && origin.lat ? origin : await geocodeOsm(origin);
    let destCoords = typeof destination === 'object' && destination.lat ? destination : await geocodeOsm(destination);

    if (!origCoords || !destCoords) {
      console.warn('[LOCATION-ENGINE] Could not resolve coordinates for OSRM route calculation.');
      return null;
    }

    const osrmMode = profile === 'walking' ? 'foot' : (profile === 'cycling' ? 'bike' : 'driving');
    const coordsStr = `${origCoords.lng || origCoords.lon},${origCoords.lat};${destCoords.lng || destCoords.lon},${destCoords.lat}`;
    const url = `https://router.project-osrm.org/route/v1/${osrmMode}/${coordsStr}?overview=false`;

    const response = await axios.get(url, { timeout: 7000 });
    const routes = response.data?.routes;

    if (!routes || routes.length === 0) {
      // Fallback to Mapbox if token available
      return await calculateMapboxRoute(origin, destination, profile);
    }

    const route = routes[0];
    const distanceKm = (route.distance / 1000).toFixed(1);
    const durationMins = Math.round(route.duration / 60);

    const gmapsNavUrl = `https://www.google.com/maps/dir/?api=1&origin=${origCoords.lat},${origCoords.lng || origCoords.lon}&destination=${destCoords.lat},${destCoords.lng || destCoords.lon}`;

    return {
      distanceKm: `${distanceKm} km`,
      durationMins: durationMins < 1 ? 1 : durationMins,
      originName: origCoords.name || origCoords.address || 'Lokasi Asal',
      destName: destCoords.name || destCoords.address || 'Lokasi Tujuan',
      profile: profile === 'driving' ? 'Kendaraan (Motor/Mobil)' : (profile === 'walking' ? 'Jalan Kaki' : 'Sepeda'),
      gmapsUrl: gmapsNavUrl
    };
  } catch (err) {
    console.error('[LOCATION-ENGINE] OSRM Route error, trying Mapbox fallback:', err.message);
    return await calculateMapboxRoute(origin, destination, profile);
  }
}

// ─────────────────────────────────────────────────────────────
// Legacy / Fallback Functions (Brave & Mapbox)
// ─────────────────────────────────────────────────────────────

async function searchBravePlaces(query, opts = {}) {
  const apiKey = env.BRAVE_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey
      },
      params: {
        q: query,
        result_filter: 'locations,discussions',
        search_lang: 'id',
        country: opts.country || 'ID',
        count: opts.count || 5
      },
      timeout: 8000
    });

    const data = response.data;
    const locations = data?.locations?.results || [];
    return {
      query,
      locations: locations.map(loc => ({
        id: loc.id,
        title: loc.title || loc.name,
        address: loc.address?.formatted || loc.address || '-',
        coordinates: loc.coordinates ? { lat: loc.coordinates[0], lng: loc.coordinates[1] } : null
      }))
    };
  } catch (err) {
    return null;
  }
}

async function geocodeMapbox(locationName) {
  const token = env.MAPBOX_ACCESS_TOKEN;
  if (!token) return null;

  try {
    const encoded = encodeURIComponent(locationName);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json`;
    const response = await axios.get(url, {
      params: { access_token: token, country: 'id', limit: 1 },
      timeout: 7000
    });

    const features = response.data?.features;
    if (!features || features.length === 0) return null;

    const [lng, lat] = features[0].center;
    return {
      name: features[0].text || locationName,
      address: features[0].place_name || locationName,
      lat,
      lng
    };
  } catch (err) {
    return null;
  }
}

async function reverseGeocodeMapbox(lat, lng) {
  const token = env.MAPBOX_ACCESS_TOKEN;
  if (!token) return null;

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`;
    const response = await axios.get(url, {
      params: { access_token: token, limit: 1 },
      timeout: 7000
    });

    const features = response.data?.features;
    if (!features || features.length === 0) return null;

    return {
      displayName: features[0].place_name,
      fullAddress: features[0].place_name,
      road: '',
      subdistrict: '',
      district: '',
      city: features[0].context?.find(c => c.id.startsWith('place'))?.text || '',
      state: ''
    };
  } catch (err) {
    return null;
  }
}

async function calculateMapboxRoute(origin, destination, profile = 'driving') {
  const token = env.MAPBOX_ACCESS_TOKEN;
  if (!token) return null;

  try {
    let origCoords = typeof origin === 'object' ? origin : await geocodeMapbox(origin);
    let destCoords = typeof destination === 'object' ? destination : await geocodeMapbox(destination);

    if (!origCoords || !destCoords) return null;

    const mode = ['driving', 'cycling', 'walking'].includes(profile) ? profile : 'driving';
    const coordsStr = `${origCoords.lng},${origCoords.lat};${destCoords.lng},${destCoords.lat}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/${mode}/${coordsStr}`;

    const response = await axios.get(url, {
      params: { access_token: token, geometries: 'geojson', overview: 'simplified' },
      timeout: 7000
    });

    const routes = response.data?.routes;
    if (!routes || routes.length === 0) return null;

    const route = routes[0];
    const distanceKm = (route.distance / 1000).toFixed(1);
    const durationMins = Math.round(route.duration / 60);

    return {
      distanceKm: `${distanceKm} km`,
      durationMins,
      originName: origCoords.name || origCoords.address || 'Asal',
      destName: destCoords.name || destCoords.address || 'Tujuan',
      profile: mode === 'driving' ? 'Kendaraan (Motor/Mobil)' : (mode === 'cycling' ? 'Sepeda' : 'Jalan Kaki'),
      gmapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${origCoords.lat},${origCoords.lng}&destination=${destCoords.lat},${destCoords.lng}`
    };
  } catch (err) {
    return null;
  }
}

module.exports = {
  calculateHaversineDistance,
  formatDistance,
  searchNearbyPlaces,
  reverseGeocodeOsm,
  geocodeOsm,
  calculateRouteOsm,
  // Backward compatibility aliases
  searchBravePlaces,
  geocodeMapbox,
  reverseGeocodeMapbox,
  calculateMapboxRoute
};
