'use strict';

/**
 * ============================================================
 * [N.E.X.A] BUILD CAPABILITIES COMPILER
 * ============================================================
 * Mengompilasi Single Source of Truth dari capabilities_registry.js
 * menjadi tiga artefak runtime berkinerja tinggi:
 *
 * 1. data/capabilities_manifest.txt (Tier 0: ~150-250 Token padat untuk Router Prompt)
 * 2. data/capabilities_cards.json (Tier 1: Kartu detail terstruktur untuk On-Demand Lookup)
 * 3. data/capabilities_vectors.json (Tier 1: Embedding vektor di RAM untuk cosine similarity)
 *
 * Mencegah kelelahan developer (developer fatigue) dan capability drift.
 * ============================================================
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { CAPABILITIES_REGISTRY, compileManifest } = require('../src/config/capabilities_registry');
const { VERSION } = require('../src/config/version');

const DATA_DIR = path.resolve(__dirname, '../data');
const MANIFEST_PATH = path.join(DATA_DIR, 'capabilities_manifest.txt');
const CARDS_PATH = path.join(DATA_DIR, 'capabilities_cards.json');
const VECTORS_PATH = path.join(DATA_DIR, 'capabilities_vectors.json');

/**
 * Kompilasi artefak kapabilitas dari registri kode.
 * @param {object} [options]
 * @param {boolean} [options.silent=false] - Jangan cetak output ke console
 * @returns {{ manifestPath: string, cardsPath: string, cardCount: number, manifestChars: number, manifestTokens: number }}
 */
function buildCapabilities(options = {}) {
  const silent = Boolean(options.silent);

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // 1. Generate Tier 0 Manifest
  const manifestContent = compileManifest(VERSION);
  const manifestChars = manifestContent.length;
  const manifestTokens = Math.round(manifestChars / 4);

  fs.writeFileSync(MANIFEST_PATH, manifestContent, 'utf-8');

  // 2. Generate Tier 1 Structured Cards
  const timestamp = new Date().toISOString();
  const cards = CAPABILITIES_REGISTRY.map(cap => ({
    id: cap.id,
    domain: cap.domain,
    title: cap.title,
    summary: cap.summary,
    details: cap.details,
    keywords: cap.keywords || [],
    status: cap.status || 'ACTIVE',
    source_files: cap.source_files || [],
    version: VERSION,
    updated_at: timestamp
  }));

  fs.writeFileSync(CARDS_PATH, JSON.stringify(cards, null, 2), 'utf-8');

  if (!silent) {
    console.log(`[BUILD_CAPABILITIES] Successfully compiled capabilities for N.E.X.A v${VERSION}`);
    console.log(`  -> Tier 0 Manifest: ${MANIFEST_PATH} (${manifestChars} chars, ~${manifestTokens} tokens)`);
    console.log(`  -> Tier 1 Cards:    ${CARDS_PATH} (${cards.length} cards structured)`);
  }

  return {
    manifestPath: MANIFEST_PATH,
    cardsPath: CARDS_PATH,
    cardCount: cards.length,
    manifestChars,
    manifestTokens
  };
}

/**
 * Generate dan simpan snapshot embedding vektor untuk semua kartu kapabilitas Tier 1.
 * @param {object} [options]
 * @param {boolean} [options.silent=false]
 * @returns {Promise<{ vectorsPath: string, embeddedCount: number }>}
 */
async function embedCapabilities(options = {}) {
  const silent = Boolean(options.silent);
  const { computeQueryVector } = require('../src/utils/gemini_vector_cache');

  buildCapabilities({ silent: true });

  const cards = JSON.parse(fs.readFileSync(CARDS_PATH, 'utf-8'));
  const timestamp = new Date().toISOString();
  const vectorCards = [];

  if (!silent) {
    console.log(`[BUILD_CAPABILITIES] Generating vector embeddings for ${cards.length} capabilities...`);
  }

  for (const card of cards) {
    const textToEmbed = `${card.title}. ${card.summary} ${card.details} Kata kunci: ${card.keywords.join(', ')}`;
    let vector = [];
    try {
      vector = await computeQueryVector(textToEmbed, 3000);
    } catch (e) {
      if (!silent) console.warn(`[BUILD_CAPABILITIES] Warning embedding ${card.id}:`, e.message);
    }

    vectorCards.push({
      id: card.id,
      domain: card.domain,
      title: card.title,
      summary: card.summary,
      details: card.details,
      keywords: card.keywords,
      status: card.status,
      source_files: card.source_files,
      version: card.version,
      updated_at: timestamp,
      vector: vector || []
    });
  }

  fs.writeFileSync(VECTORS_PATH, JSON.stringify(vectorCards, null, 2), 'utf-8');

  if (!silent) {
    const validVectors = vectorCards.filter(c => Array.isArray(c.vector) && c.vector.length > 0).length;
    console.log(`[BUILD_CAPABILITIES] ✅ Vector snapshot written: ${VECTORS_PATH} (${validVectors}/${cards.length} embedded)`);
  }

  return {
    vectorsPath: VECTORS_PATH,
    embeddedCount: vectorCards.filter(c => Array.isArray(c.vector) && c.vector.length > 0).length
  };
}

if (require.main === module) {
  (async () => {
    try {
      buildCapabilities();
      if (process.argv.includes('--embed')) {
        await embedCapabilities();
      }
    } catch (err) {
      console.error('[BUILD_CAPABILITIES] Error compiling capabilities:', err);
      process.exit(1);
    }
  })();
}

module.exports = {
  buildCapabilities,
  embedCapabilities,
  MANIFEST_PATH,
  CARDS_PATH,
  VECTORS_PATH
};
