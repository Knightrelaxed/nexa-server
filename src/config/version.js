'use strict';

/**
 * ============================================================
 * [N.E.X.A] CENTRALIZED VERSIONING ARCHITECTURE
 * ============================================================
 * Single Source of Truth (SSOT) untuk versi sistem N.E.X.A.
 * Versi resmi didefinisikan HANYA di `package.json`.
 * Seluruh modul backend, health check, logger, dan network header
 * mengimpor konstanta dari file ini secara 100% dinamis.
 * ============================================================
 */

const path = require('path');
const pkg = require(path.resolve(__dirname, '../../package.json'));

if (!pkg || !pkg.version) {
  throw new Error('[VERSION] File package.json tidak memiliki field "version"!');
}

const VERSION = String(pkg.version).trim();
const [MAJOR = '0', MINOR = '0', PATCH = '0'] = VERSION.split('.');
const MAJOR_MINOR = `${MAJOR}.${MINOR}`;

module.exports = {
  VERSION,                                        // Full Semantic Version (e.g. "3.4.3")
  MAJOR,                                          // Angka Major (e.g. "3")
  MINOR,                                          // Angka Minor (e.g. "4")
  PATCH,                                          // Angka Patch (e.g. "0")
  MAJOR_MINOR,                                    // Generasi Fase / Series (e.g. "3.4")
  SYSTEM_TAG: `[N.E.X.A ${MAJOR_MINOR}]`,         // Tag Log Sistem (e.g. "[N.E.X.A 3.4]")
  SYSTEM_NAME: `N.E.X.A Cloud Core v${VERSION}`,  // Nama Lengkap Sistem (e.g. "N.E.X.A Cloud Core v3.4.3")
  USER_AGENT: `NexaAssistant/${MAJOR_MINOR}`      // HTTP User-Agent Header (e.g. "NexaAssistant/3.4")
};
