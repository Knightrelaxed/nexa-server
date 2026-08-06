// ============================================================
// N.E.X.A — LOCATION ENGINE INFRASTRUCTURE
// Klien terpadu untuk Brave Place Search API & Mapbox API
// ============================================================
'use strict';

const axios = require('axios');
const env = require('../config/env');

/**
 * Search places and local POIs using Brave Place Search API
 * @param {string} query - Natural language query (e.g., "mi ayam enak jam 10 malam di Jogja")
 * @param {object} [opts] - Optional parameters (e.g., count, country)
 * @returns {Promise<object|null>}
 */
async function searchBravePlaces(query, opts = {}) {
  const apiKey = env.BRAVE_API_KEY;
  if (!apiKey) {
    console.warn('[LOCATION-ENGINE] BRAVE_API_KEY belum dikonfigurasi.');
    return null;
  }

  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return null;

  try {
    const url = 'https://api.search.brave.com/res/v1/web/search';
    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey
      },
      params: {
        q: cleanQuery,
        result_filter: 'locations,discussions',
        search_lang: 'id',
        country: opts.country || 'ID',
        count: opts.count || 5
      },
      timeout: 10000
    });

    const data = response.data;
    if (!data) return null;

    const locations = data.locations?.results || [];
    const webResults = data.web?.results || [];

    return {
      query: cleanQuery,
      locations: locations.map(loc => ({
        id: loc.id,
        title: loc.title || loc.name,
        address: loc.address?.formatted || loc.address || '-',
        phone: loc.phone || null,
        rating: loc.rating?.value || loc.rating || null,
        reviewCount: loc.rating?.votes || null,
        coordinates: loc.coordinates ? { lat: loc.coordinates[0], lng: loc.coordinates[1] } : null,
        priceRange: loc.price_range || null,
        openingHours: loc.opening_hours || null
      })),
      snippets: webResults.slice(0, 3).map(w => ({
        title: w.title,
        snippet: w.description,
        url: w.url
      }))
    };
  } catch (err) {
    if (err.response?.status === 429) {
      console.warn('[LOCATION-ENGINE] ⚠️ Brave Place Search limit reached (HTTP 429).');
    } else {
      console.error('[LOCATION-ENGINE] Brave Place Search error:', err.message);
    }
    return null;
  }
}

/**
 * Geocode address/location name to coordinates via Mapbox
 * @param {string} locationName 
 * @returns {Promise<{name: string, lat: number, lng: number, address: string}|null>}
 */
async function geocodeMapbox(locationName) {
  const token = env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    console.warn('[LOCATION-ENGINE] MAPBOX_ACCESS_TOKEN belum dikonfigurasi.');
    return null;
  }

  const cleanQuery = String(locationName || '').trim();
  if (!cleanQuery) return null;

  try {
    const encoded = encodeURIComponent(cleanQuery);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json`;
    const response = await axios.get(url, {
      params: {
        access_token: token,
        country: 'id',
        limit: 1
      },
      timeout: 8000
    });

    const features = response.data?.features;
    if (!features || features.length === 0) return null;

    const topMatch = features[0];
    const [lng, lat] = topMatch.center;

    return {
      name: topMatch.text || cleanQuery,
      address: topMatch.place_name || cleanQuery,
      lat,
      lng
    };
  } catch (err) {
    console.error('[LOCATION-ENGINE] Mapbox Geocoding error:', err.message);
    return null;
  }
}

/**
 * Reverse geocode coordinates (Lat, Lng) to address via Mapbox
 * @param {number} lat 
 * @param {number} lng 
 * @returns {Promise<{address: string, city: string}|null>}
 */
async function reverseGeocodeMapbox(lat, lng) {
  const token = env.MAPBOX_ACCESS_TOKEN;
  if (!token) return null;

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`;
    const response = await axios.get(url, {
      params: {
        access_token: token,
        limit: 1
      },
      timeout: 8000
    });

    const features = response.data?.features;
    if (!features || features.length === 0) return null;

    return {
      address: features[0].place_name,
      city: features[0].context?.find(c => c.id.startsWith('place'))?.text || ''
    };
  } catch (err) {
    console.error('[LOCATION-ENGINE] Mapbox Reverse Geocoding error:', err.message);
    return null;
  }
}

/**
 * Calculate route, distance, and duration between origin and destination via Mapbox Directions API
 * @param {string|{lat: number, lng: number}} origin - Address string or coordinate object
 * @param {string|{lat: number, lng: number}} destination - Address string or coordinate object
 * @param {'driving'|'cycling'|'walking'} [profile='driving'] - Mode of transport (driving = motor/mobil)
 * @returns {Promise<{distanceKm: string, durationMins: number, originName: string, destName: string, profile: string}|null>}
 */
async function calculateMapboxRoute(origin, destination, profile = 'driving') {
  const token = env.MAPBOX_ACCESS_TOKEN;
  if (!token) return null;

  try {
    let origCoords = typeof origin === 'object' ? origin : await geocodeMapbox(origin);
    let destCoords = typeof destination === 'object' ? destination : await geocodeMapbox(destination);

    if (!origCoords || !destCoords) {
      console.warn('[LOCATION-ENGINE] Could not resolve coordinates for route calculation.');
      return null;
    }

    const mode = ['driving', 'cycling', 'walking'].includes(profile) ? profile : 'driving';
    const coordsStr = `${origCoords.lng},${origCoords.lat};${destCoords.lng},${destCoords.lat}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/${mode}/${coordsStr}`;

    const response = await axios.get(url, {
      params: {
        access_token: token,
        geometries: 'geojson',
        overview: 'simplified'
      },
      timeout: 8000
    });

    const routes = response.data?.routes;
    if (!routes || routes.length === 0) return null;

    const route = routes[0];
    const distanceMeters = route.distance || 0;
    const durationSeconds = route.duration || 0;

    const distanceKm = (distanceMeters / 1000).toFixed(1);
    const durationMins = Math.round(durationSeconds / 60);

    return {
      distanceKm: `${distanceKm} km`,
      durationMins,
      originName: origCoords.name || origCoords.address || 'Asal',
      destName: destCoords.name || destCoords.address || 'Tujuan',
      profile: mode === 'driving' ? 'Kendaraan (Motor/Mobil)' : (mode === 'cycling' ? 'Sepeda' : 'Jalan Kaki')
    };
  } catch (err) {
    console.error('[LOCATION-ENGINE] Mapbox Routing error:', err.message);
    return null;
  }
}

module.exports = {
  searchBravePlaces,
  geocodeMapbox,
  reverseGeocodeMapbox,
  calculateMapboxRoute
};
