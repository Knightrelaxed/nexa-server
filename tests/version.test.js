'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const versionInfo = require('../src/config/version');
const env = require('../src/config/env');
const pkg = require('../package.json');

test('Centralized Versioning: exports match package.json exactly', () => {
  assert.equal(versionInfo.VERSION, pkg.version, 'version.VERSION must match package.json version');
  assert.equal(env.VERSION, pkg.version, 'env.VERSION must re-export package.json version');
  assert.match(versionInfo.VERSION, /^\d+\.\d+\.\d+$/, 'VERSION must follow semantic versioning');
});

test('Centralized Versioning: SemVer breakdown and helper strings are accurate', () => {
  const parts = pkg.version.split('.');
  assert.equal(versionInfo.MAJOR, parts[0]);
  assert.equal(versionInfo.MINOR, parts[1]);
  assert.equal(versionInfo.PATCH, parts[2]);
  assert.equal(versionInfo.MAJOR_MINOR, `${parts[0]}.${parts[1]}`);
  assert.equal(versionInfo.SYSTEM_TAG, `[N.E.X.A ${parts[0]}.${parts[1]}]`);
  assert.equal(versionInfo.SYSTEM_NAME, `N.E.X.A Cloud Core v${pkg.version}`);
  assert.equal(versionInfo.USER_AGENT, `NexaAssistant/${parts[0]}.${parts[1]}`);
});

test('Centralized Versioning: env exports match versionInfo exports', () => {
  assert.equal(env.VERSION, versionInfo.VERSION);
  assert.equal(env.MAJOR_MINOR, versionInfo.MAJOR_MINOR);
  assert.equal(env.SYSTEM_TAG, versionInfo.SYSTEM_TAG);
});
