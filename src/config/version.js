'use strict';

/**
 * ============================================================
 * [N.E.X.A] CENTRALIZED VERSIONING ARCHITECTURE
 * ============================================================
 * Single Source of Truth (SSOT) untuk versi sistem N.E.X.A.
 * Versi resmi didefinisikan HANYA di `package.json`.
 * Seluruh modul backend, health check, logger, dan network header
 * mengimpor konstanta dari file ini.
 * ============================================================
 */

const path = require('path');
const pkg = require(path.resolve(__dirname, '../../package.json'));

const VERSION = String(pkg.version || '3.3.3').trim();
const SEMVER_PARTS = VERSION.split('.');
const MAJOR = SEMVER_PARTS[0] || '3';
const MINOR = SEMVER_PARTS[1] || '3';
const PATCH = SEMVER_PARTS[2] || '0';
const MAJOR_MINOR = `${MAJOR}.${MINOR}`;

module.exports = {
  VERSION,                                        // Full Semantic Version: e.g. "3.3.3"
  MAJOR,                                          // "3"
  MINOR,                                          // "3"
  PATCH,                                          // "3"
  MAJOR_MINOR,                                    // "3.3" (Series / Generasi Fase)
  SYSTEM_TAG: `[N.E.X.A ${MAJOR_MINOR}]`,         // e.g. "[N.E.X.A 3.3]"
  SYSTEM_NAME: `N.E.X.A Cloud Core v${VERSION}`,  // e.g. "N.E.X.A Cloud Core v3.3.3"
  USER_AGENT: `NexaAssistant/${MAJOR_MINOR}`      // e.g. "NexaAssistant/3.3"
};
