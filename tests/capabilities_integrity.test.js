'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { CAPABILITIES_REGISTRY, compileManifest } = require('../src/config/capabilities_registry');
const { VERSION } = require('../src/config/version');
const { buildCapabilities, MANIFEST_PATH, CARDS_PATH } = require('../scripts/build_capabilities');
const {
  ROUTER_COMMON_PREFIX,
  buildRouterSystemPrompt,
  getCapabilitiesManifest
} = require('../src/core/router/Router_Prompts');

test('CAPABILITIES_REGISTRY: schema validation and required properties', () => {
  assert(Array.isArray(CAPABILITIES_REGISTRY), 'CAPABILITIES_REGISTRY must be an array');
  assert(CAPABILITIES_REGISTRY.length >= 15, 'CAPABILITIES_REGISTRY must contain at least 15 capabilities');

  const ids = new Set();
  const validDomains = [
    'FINANCE', 'TASK', 'CALENDAR', 'DEVICE_CONTROL',
    'DISCIPLINE', 'IDENTITY', 'MEMORY', 'WEB_SEARCH',
    'LOCATION', 'INTERFACE', 'SYSTEM'
  ];

  for (const cap of CAPABILITIES_REGISTRY) {
    assert(typeof cap.id === 'string' && cap.id.length > 0, `Capability id missing or invalid: ${JSON.stringify(cap)}`);
    assert(!ids.has(cap.id), `Duplicate capability id: ${cap.id}`);
    ids.add(cap.id);

    assert(validDomains.includes(cap.domain), `Invalid domain ${cap.domain} in capability ${cap.id}`);
    assert(typeof cap.title === 'string' && cap.title.length > 5, `Invalid title in capability ${cap.id}`);
    assert(typeof cap.summary === 'string' && cap.summary.length > 10, `Invalid summary in capability ${cap.id}`);
    assert(typeof cap.details === 'string' && cap.details.length > 20, `Invalid details in capability ${cap.id}`);

    assert(Array.isArray(cap.keywords) && cap.keywords.length >= 3, `Capability ${cap.id} must have >= 3 keywords`);
    assert(cap.status === 'ACTIVE' || cap.status === 'PLANNED', `Invalid status in capability ${cap.id}`);

    assert(Array.isArray(cap.source_files) && cap.source_files.length > 0, `Capability ${cap.id} must have source_files`);
    for (const srcFile of cap.source_files) {
      const fullPath = path.resolve(__dirname, '..', srcFile);
      assert(fs.existsSync(fullPath), `Source file does not exist: ${srcFile} (in capability ${cap.id})`);
    }
  }
});

test('compileManifest: Tier 0 manifest constraints & token budget guard', () => {
  const manifest = compileManifest(VERSION);

  assert(typeof manifest === 'string', 'compileManifest must return a string');
  assert(manifest.includes(`v${VERSION}`), 'Manifest must declare current semantic version');
  assert(manifest.includes('[KAPABILITAS RESMI N.E.X.A'), 'Manifest must have official header');

  // Token budget guard: ≤ 1,200 characters (~300 tokens max)
  assert(manifest.length <= 1200, `Manifest too long (${manifest.length} chars), must be <= 1200 chars for budget guard`);

  // Domain indicators
  const expectedDomains = ['FINANCE', 'TASK', 'CALENDAR', 'DEVICE_CONTROL', 'DISCIPLINE', 'IDENTITY', 'SEARCH', 'INTERFACE', 'SYSTEM'];
  for (const domain of expectedDomains) {
    assert(manifest.includes(domain), `Manifest missing domain bullet for: ${domain}`);
  }

  // Anti-false-denial policy
  assert(manifest.includes('DILARANG menyatakan tidak bisa'), 'Manifest must include anti-false-denial directive');
});

test('buildCapabilities: compiler generates manifest and cards correctly', () => {
  const result = buildCapabilities({ silent: true });

  assert(fs.existsSync(MANIFEST_PATH), 'capabilities_manifest.txt must exist after build');
  assert(fs.existsSync(CARDS_PATH), 'capabilities_cards.json must exist after build');

  const manifestFileContent = fs.readFileSync(MANIFEST_PATH, 'utf-8');
  assert.equal(manifestFileContent, compileManifest(VERSION), 'Manifest file must match compileManifest() output');

  const cardsFileContent = JSON.parse(fs.readFileSync(CARDS_PATH, 'utf-8'));
  assert.equal(cardsFileContent.length, CAPABILITIES_REGISTRY.length, 'Cards count must match registry count');

  for (const card of cardsFileContent) {
    assert.equal(card.version, VERSION, `Card ${card.id} version must match system VERSION`);
    assert(card.updated_at, `Card ${card.id} must have updated_at timestamp`);
  }

  assert.equal(result.cardCount, CAPABILITIES_REGISTRY.length);
});

test('Router_Prompts: Tier 0 Manifest and Anti-False-Denial Rule are injected into router prompts', () => {
  const manifest = getCapabilitiesManifest();
  assert(typeof manifest === 'string' && manifest.length > 0, 'getCapabilitiesManifest() must return non-empty string');

  // Verify prefix includes manifest
  assert(ROUTER_COMMON_PREFIX.includes('[KAPABILITAS RESMI N.E.X.A'), 'ROUTER_COMMON_PREFIX must include capabilities manifest');

  // Verify Rule 18 in prefix
  assert(ROUTER_COMMON_PREFIX.includes('18. GROUNDED CAPABILITIES & ANTI-FALSE-DENIAL:'), 'ROUTER_COMMON_PREFIX must include Rule 18');
  assert(ROUTER_COMMON_PREFIX.includes('DILARANG menyatakan tidak bisa untuk kapabilitas yang jelas-jelas terdaftar'), 'Rule 18 must forbid false denial');

  // Verify buildRouterSystemPrompt() has manifest even with selective domain filtering
  const allPrompt = buildRouterSystemPrompt('ALL');
  assert(allPrompt.includes('[KAPABILITAS RESMI N.E.X.A'), 'buildRouterSystemPrompt("ALL") must include manifest');

  const selectivePrompt = buildRouterSystemPrompt(['FINANCE']);
  assert(selectivePrompt.includes('[KAPABILITAS RESMI N.E.X.A'), 'buildRouterSystemPrompt(["FINANCE"]) must include manifest');
  assert(selectivePrompt.includes('18. GROUNDED CAPABILITIES & ANTI-FALSE-DENIAL:'), 'Selective prompt must retain Rule 18');
});
