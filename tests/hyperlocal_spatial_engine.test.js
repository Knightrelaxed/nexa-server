'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const locationEngine = require('../src/infrastructure/Location_Engine');
const locationOrchestrator = require('../src/domain/Location_Orchestrator');

test('Hyper-Local Spatial Engine: Core Engine & Two-Pass Resolution Suite', async (t) => {

  const testLat = -7.7622257;
  const testLon = 110.3776944; // Sekitar Gang Siti Sonya, Sinduadi, Sleman

  await t.test('1. Haversine distance calculation is accurate', () => {
    // Jarak antara Gang Siti Sonya (-7.7622257, 110.3776944) ke Masjid Nurul Barokah (-7.7622515, 110.3778845)
    const dist = locationEngine.calculateHaversineDistance(testLat, testLon, -7.7622515, 110.3778845);
    assert.ok(dist >= 15 && dist <= 30, `Jarak harus sekitar 21m, aktual: ${dist}m`);
    assert.strictEqual(locationEngine.formatDistance(dist), `${dist} meter`);
  });

  await t.test('2. Serper Google Maps searches hyper-local places with coordinates bias', async () => {
    const results = await locationEngine.searchSerperGoogleMaps('Tomoro Coffee', testLat, testLon, { limit: 3, zoom: 16 });
    assert.ok(Array.isArray(results), 'Hasil harus berupa array');
    assert.ok(results.length > 0, 'Harus menemukan minimal 1 cabang Tomoro');

    const top = results[0];
    assert.ok(top.name.includes('TOMORO') || top.name.includes('Tomoro'), 'Nama harus mengandung Tomoro');
    assert.strictEqual(top.source, 'GOOGLE_MAPS', 'Sumber harus GOOGLE_MAPS');
    assert.ok(typeof top.distanceMeters === 'number', 'distanceMeters harus angka');
    assert.ok(top.distanceMeters < 1000, `Cabang terdekat harus < 1000m dari GPS, aktual: ${top.distanceMeters}m`);
  });

  await t.test('3. In-memory cache returns cached data on second call', async () => {
    const start = Date.now();
    const firstCall = await locationEngine.searchSerperGoogleMaps('Es Kelapa Muda Hamizan', testLat, testLon, { limit: 1 });
    const firstDuration = Date.now() - start;

    const cacheStart = Date.now();
    const secondCall = await locationEngine.searchSerperGoogleMaps('Es Kelapa Muda Hamizan', testLat, testLon, { limit: 1 });
    const cacheDuration = Date.now() - cacheStart;

    assert.ok(firstCall.length > 0, 'First call must find Es Kelapa Muda Hamizan');
    assert.deepStrictEqual(firstCall, secondCall, 'Hasil panggilan kedua harus identik dengan panggilan pertama');
    assert.ok(cacheDuration < firstDuration || cacheDuration < 10, 'Panggilan cache harus jauh lebih cepat (<10ms)');
  });

  await t.test('4. Direct place query produces structured card with rating and navigation', async () => {
    const context = { lat: testLat, lon: testLon };
    const reply = await locationOrchestrator.handleLocationQuery('cari tomoro terdekat', context);

    assert.ok(typeof reply === 'string', 'Reply harus berupa string');
    assert.ok(reply.includes('Rekomendasi Tempat Terdekat'), 'Harus berisi judul rekomendasi');
    assert.ok(reply.includes('TOMORO') || reply.includes('Tomoro'), 'Harus menyebut Tomoro');
    assert.ok(reply.includes('Google Maps'), 'Harus menyertakan tautan navigasi Google Maps');
  });

  await t.test('5. Two-Pass Relational Query resolves anchor and sweeps adjacent clusters', async () => {
    const context = { lat: testLat, lon: testLon };
    // Kueri relasional: "di sebelah masjid di tempat aku sedang berada, ada apa?"
    const reply = await locationOrchestrator.handleLocationQuery('di sebelah masjid di tempat aku sedang berada, ada apa?', context);

    assert.ok(typeof reply === 'string', 'Reply harus berupa string');
    assert.ok(reply.includes('Masjid Nurul Barokah'), 'Pass 1 harus berhasil mendeteksi Masjid Nurul Barokah sebagai jangkar');
    assert.ok(
      reply.includes('Hunian & Asrama Mahasiswa') ||
      reply.includes('Kuliner & Tempat Makan') ||
      reply.includes('Toko, Layanan & Fasilitas'),
      'Pass 2 harus memindai klaster fasilitas di sekitar jangkar'
    );
    assert.ok(reply.includes('Two-Pass Hyper-Local Spatial Engine'), 'Harus teridentifikasi sebagai Two-Pass Spatial Engine');
  });

  await t.test('6. Tier 1: AI Router Upfront Semantic Intent is handled directly with zero overhead', async () => {
    const context = { lat: testLat, lon: testLon };
    const routerPayload = {
      action: 'SEARCH_NEARBY',
      query: 'bensin tiris',
      search_keywords: ['SPBU Pertamina', 'SPBU'],
      category: 'fuel station'
    };

    const reply = await locationOrchestrator.handleLocationIntent(routerPayload, context);
    assert.ok(typeof reply === 'string', 'Reply harus berupa string');
    assert.ok(reply.includes('Rekomendasi Tempat Terdekat'), 'Harus berisi judul rekomendasi tempat');
    assert.ok(reply.includes('SPBU') || reply.includes('Pertamina'), 'Harus menemukan SPBU berdasarkan kata kunci router');
  });

  await t.test('7. Tier 2: Spatial Semantic Cache accelerates identical queries', async () => {
    const context = { lat: testLat, lon: testLon };
    const query = 'cari tempat ngopi terdekat';

    const t0 = Date.now();
    const firstRes = await locationOrchestrator.handleLocationQuery(query, context);
    const firstDur = Date.now() - t0;

    const t1 = Date.now();
    const secondRes = await locationOrchestrator.handleLocationQuery(query, context);
    const secondDur = Date.now() - t1;

    assert.ok(typeof firstRes === 'string' && typeof secondRes === 'string');
    assert.ok(secondDur <= firstDur || secondDur < 2000, `Panggilan cache harus lebih cepat atau stabil, first: ${firstDur}ms, second: ${secondDur}ms`);
  });

});
