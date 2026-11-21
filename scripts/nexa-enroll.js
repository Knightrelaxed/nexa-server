#!/usr/bin/env node
'use strict';
/**
 * ============================================================
 * N.E.X.A Server - Administrative Device Enrollment CLI
 * Implements FR-AUTH-01 & FR-AUTH-03:
 *   node scripts/nexa-enroll.js start --device samsung-a33-tuan
 *   node scripts/nexa-enroll.js re-pair --device samsung-a33-tuan
 *   node scripts/nexa-enroll.js add --device samsung-a33-tuan --pubkey-b64 <SPKI_B64> [--force]
 *   node scripts/nexa-enroll.js list
 *   node scripts/nexa-enroll.js revoke --device samsung-a33-tuan
 * ============================================================
 */

require('dotenv').config();

const {
  EnrolledDevicesStore,
  formatFingerprint4x8
} = require('../src/core/auth/enrolled_devices_store');

const VALUE_FLAGS = new Set(['device', 'pubkey-b64', 'store']);

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0] || 'help';
  const flags = {};
  for (let i = 1; i < args.length; i++) {
    const token = args[i];
    if (token.startsWith('--')) {
      const rawKey = token.slice(2);
      const eqIdx = rawKey.indexOf('=');
      if (eqIdx !== -1) {
        const key = rawKey.slice(0, eqIdx);
        const val = rawKey.slice(eqIdx + 1);
        flags[key] = VALUE_FLAGS.has(key) ? val : (val === '' ? true : val);
      } else {
        const key = rawKey;
        const next = args[i + 1];
        if (!next || next.startsWith('--')) {
          flags[key] = VALUE_FLAGS.has(key) ? '' : true;
        } else {
          flags[key] = next;
          i++;
        }
      }
    }
  }
  return { command, flags };
}

function printUsage() {
  console.log([
    'N.E.X.A Device Enrollment CLI (FR-AUTH-01 / FR-AUTH-03)',
    '',
    'Commands:',
    '  start   --device <id>                         Generate 5-minute single-use enrollment code',
    '  re-pair --device <id>                         Generate 5-minute single-use re-pair code (KeyPermanentlyInvalidated)',
    '  add     --device <id> --pubkey-b64 <b64>      Directly register SPKI DER P-256 public key (--force to overwrite)',
    '  list                                          List enrolled devices and SHA-256 fingerprints',
    '  revoke  --device <id>                         Revoke an enrolled device immediately'
  ].join('\n'));
}

function main() {
  const { command, flags } = parseArgs(process.argv);
  if (typeof process.getuid === 'function' && process.getuid() === 0 && !process.env.NEXA_ENROLL_ALLOW_ROOT && !flags['allow-root']) {
    console.error('[nexa-enroll] ERROR: Refusing to run as root because 0600 files owned by root:root cannot be read by user nexa.');
    console.error('[nexa-enroll] Run as: sudo -u nexa node scripts/nexa-enroll.js ' + process.argv.slice(2).join(' '));
    console.error('[nexa-enroll] (Pass --allow-root or NEXA_ENROLL_ALLOW_ROOT=1 to override explicitly.)');
    process.exit(1);
  }
  const store = new EnrolledDevicesStore({
    filePath: flags.store || process.env.NEXA_ENROLLED_DEVICES_PATH
  });

  if (command === 'start' || command === 're-pair') {
    if (Object.prototype.hasOwnProperty.call(flags, 'device') && !String(flags.device || '').trim()) {
      console.error('Error: --device requires a non-empty device ID.');
      process.exit(1);
    }
    const deviceId = flags.device || 'samsung-a33-tuan';
    const isRepair = command === 're-pair';
    const pending = store.createPendingEnrollment({ deviceId, repair: isRepair });
    const expStr = new Date(pending.expiresAt).toISOString();
    console.log('============================================================');
    console.log(`N.E.X.A ${isRepair ? 'RE-PAIR' : 'ENROLLMENT'} CODE (SINGLE-USE, TTL 5 MIN)`);
    console.log('============================================================');
    console.log(`Device ID  : ${pending.deviceId}`);
    console.log(`Enroll Code: ${pending.code}`);
    console.log(`Expires At : ${expStr}`);
    console.log('');
    console.log('Buka aplikasi N.E.X.A Mobile Bridge -> Pengaturan & Keamanan ->');
    console.log('masukkan kode di atas, lalu cocokkan fingerprint SHA-256 32 oktet.');
    console.log('============================================================');
    return;
  }

  if (command === 'add') {
    const deviceId = flags.device;
    const pubkeyB64 = flags['pubkey-b64'];
    if (!deviceId || !pubkeyB64) {
      console.error('Error: --device and --pubkey-b64 are required.');
      process.exit(1);
    }
    const rec = store.enrollDevice({
      deviceId,
      publicKeySpkiDerB64: pubkeyB64,
      force: Boolean(flags.force)
    });
    console.log(`Enrolled ${rec.deviceId} (status=${rec.status})`);
    console.log('SHA-256 Fingerprint (verify against phone):');
    console.log(formatFingerprint4x8(rec.fingerprintSha256));
    return;
  }

  if (command === 'list') {
    const list = store.listDevices();
    if (list.length === 0) {
      console.log('No enrolled devices.');
      return;
    }
    for (const dev of list) {
      const enrolledDate = dev.enrolledAt ? new Date(dev.enrolledAt * 1000).toISOString() : 'unknown';
      console.log(`- ${dev.deviceId} [${dev.status}] enrolled=${enrolledDate}`);
      console.log(formatFingerprint4x8(dev.fingerprintSha256).replace(/^/gm, '  '));
    }
    return;
  }

  if (command === 'revoke') {
    const deviceId = flags.device;
    if (!deviceId) {
      console.error('Error: --device is required.');
      process.exit(1);
    }
    const rec = store.revokeDevice(deviceId);
    console.log(`Revoked ${rec.deviceId} (status=${rec.status})`);
    return;
  }

  printUsage();
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`[nexa-enroll] Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { parseArgs };
