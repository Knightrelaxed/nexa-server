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

test('Vector Cache & Gating (Phase 2): Tier 1 On-Demand Capability Retrieval', async () => {
  const geminiVectorCache = require('../src/utils/gemini_vector_cache');
  geminiVectorCache.loadVectorSnapshot();

  const cachedCapabilities = geminiVectorCache.getCachedCapabilityVectors();
  assert(Array.isArray(cachedCapabilities) && cachedCapabilities.length >= 16, 'Must have at least 16 capabilities loaded in RAM');

  // 1. Strict Gating Test: Routine operational chats MUST NOT trigger any capability card
  const casualQueries = [
    'catat pengeluaran kopi 15rb',
    'beli nasi goreng 25rb pakai qris',
    'jadwal kuliah besok jam 8 pagi',
    'tandai tugas 1 selesai',
    'nyalakan senter hp',
    'halo nexa selamat pagi',
    'makasih ya nex'
  ];

  for (const q of casualQueries) {
    const res = geminiVectorCache.getRelevantCapability(q);
    assert.equal(res, null, `Casual query "${q}" must return null to save prompt tokens`);
  }

  // 2. Curiosity & Architecture Gating Test: Architecture questions MUST trigger matching capability card
  const resSync = geminiVectorCache.getRelevantCapability('gimana cara kerja auto sync email bank mandiri?');
  assert(resSync !== null, 'Curiosity query about bank sync must return capability card');
  assert.equal(resSync.card.id, 'finance_bank_sync', 'Must match finance_bank_sync');
  assert.equal(resSync.card.domain, 'FINANCE');
  assert(resSync.card.details.includes('Gmail API'), 'Details must contain real architecture details');

  const resAndroid = geminiVectorCache.getRelevantCapability('kamu bisa apa aja di hp android?');
  assert(resAndroid !== null, 'Query about android capability must return card');
  assert.equal(resAndroid.card.id, 'device_android_control');
  assert.equal(resAndroid.card.domain, 'DEVICE_CONTROL');

  const resWin = geminiVectorCache.getRelevantCapability('gimana cara kerja otomasi desktop windows bridge di laptop?');
  assert(resWin !== null, 'Query about windows bridge must return card');
  assert.equal(resWin.card.id, 'device_windows_control');
  assert.equal(resWin.card.domain, 'DEVICE_CONTROL');

  const resDiscipline = geminiVectorCache.getRelevantCapability('apa itu godmode dan bagaimana cara kerjanya?');
  assert(resDiscipline !== null, 'Query about godmode must return discipline card');
  assert.equal(resDiscipline.card.id, 'device_discipline');
  assert.equal(resDiscipline.card.domain, 'DISCIPLINE');

  // 3. Token budget guard on Tier 1 Card
  assert(resSync.card.details.length <= 1000, 'Capability card details must not exceed 1000 characters (~250 tokens)');
});

test('Phase 3 Anti-Drift: All active router domains must have representation in CAPABILITIES_REGISTRY', () => {
  const { DOMAIN_SCHEMAS } = require('../src/core/router/Router_Prompts');
  const routerDomains = Object.keys(DOMAIN_SCHEMAS);
  const registryDomains = new Set(CAPABILITIES_REGISTRY.map(c => c.domain));

  const domainMapping = {
    DEVICE_CONTROL: 'DEVICE_CONTROL',
    FINANCE: 'FINANCE',
    CALENDAR: 'CALENDAR',
    TASK: 'TASK',
    DISCIPLINE: 'DISCIPLINE',
    USER_PROFILE: 'IDENTITY',
    CORE_IDENTITY: 'IDENTITY',
    WEB_SEARCH: 'WEB_SEARCH',
    LOCATION: 'LOCATION',
    DATABASE: 'MEMORY',
    '2ND_BRAIN': 'MEMORY',
    EMAIL: 'FINANCE',
    DIAGNOSE_SYSTEM: 'SYSTEM'
  };

  for (const d of routerDomains) {
    const targetDomain = domainMapping[d] || d;
    assert(
      registryDomains.has(targetDomain) || registryDomains.has(d),
      `Domain schema "${d}" has no representation in CAPABILITIES_REGISTRY! (Anti-drift guard failed)`
    );
  }
});

test('Phase 3 Anti-Drift: Direct Slash Command /capabilities must return formatted directory', async () => {
  const { handleDirectCommand } = require('../src/interfaces/telegram/command_handler');
  let replyText = '';
  const handled = await handleDirectCommand('/capabilities', {
    respondToTelegram: async (txt) => { replyText = txt; },
    deliverWebhookReply: () => {}
  });

  assert.equal(handled, true, '/capabilities must be handled');
  assert(replyText.includes('KAPABILITAS RESMI N.E.X.A'), 'Must have official header');
  assert(replyText.includes('FINANCE') && replyText.includes('TASK'), 'Must list domains');
  assert(replyText.includes('cara kerja'), 'Must offer proactive technical curiosity guidance');
});
