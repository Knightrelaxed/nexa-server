'use strict';

/**
 * ============================================================
 * [N.E.X.A] BUILD CAPABILITIES COMPILER
 * ============================================================
 * Mengompilasi Single Source of Truth dari capabilities_registry.js
 * menjadi dua artefak runtime berkinerja tinggi:
 *
 * 1. data/capabilities_manifest.txt (Tier 0: ~150-250 Token padat untuk Router Prompt)
 * 2. data/capabilities_cards.json (Tier 1: Kartu detail terstruktur untuk Vector Cache & On-Demand Lookup)
 *
 * Mencegah kelelahan developer (developer fatigue) dan capability drift.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const { CAPABILITIES_REGISTRY, compileManifest } = require('../src/config/capabilities_registry');
const { VERSION } = require('../src/config/version');

const DATA_DIR = path.resolve(__dirname, '../data');
const MANIFEST_PATH = path.join(DATA_DIR, 'capabilities_manifest.txt');
const CARDS_PATH = path.join(DATA_DIR, 'capabilities_cards.json');

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

if (require.main === module) {
  try {
    buildCapabilities();
  } catch (err) {
    console.error('[BUILD_CAPABILITIES] Error compiling capabilities:', err);
    process.exit(1);
  }
}

module.exports = {
  buildCapabilities,
  MANIFEST_PATH,
  CARDS_PATH
};
