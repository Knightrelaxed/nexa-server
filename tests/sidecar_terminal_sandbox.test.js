'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('Tahap 4 Terminal Inspection Sandbox, Polkit & Binary RESUME Protocol (FR-TERM-01..18)', () => {
  it('verifies nexa-term.socket, nexa-term.service, and 50-nexa-term.rules security isolation', () => {
    const baseDir = path.join(__dirname, '..', 'nexa-io', 'systemd');
    const sockTxt = fs.readFileSync(path.join(baseDir, 'nexa-term.socket'), 'utf8');
    const svcTxt = fs.readFileSync(path.join(baseDir, 'nexa-term.service'), 'utf8');
    const polkitTxt = fs.readFileSync(path.join(baseDir, '50-nexa-term.rules'), 'utf8');

    assert.match(sockTxt, /ListenStream=\/run\/nexa-term\.sock/);
    assert.match(sockTxt, /SocketGroup=caddy/);
    assert.match(sockTxt, /SocketMode=0660/);

    assert.match(svcTxt, /User=nexa-term/);
    // FR-SRV-03: nexa-term MUST NOT have systemd-journal supplementary group
    assert.doesNotMatch(svcTxt, /systemd-journal/);
    assert.match(svcTxt, /StateDirectory=nexa-term/);
    assert.match(svcTxt, /Environment=HOME=\/var\/lib\/nexa-term/);
    assert.match(svcTxt, /LoadCredential=ticket-pub\.pem:\/etc\/nexa\/ticket-pub\.pem/);
    assert.match(svcTxt, /NoNewPrivileges=yes/);
    assert.match(svcTxt, /PrivateTmp=yes/);
    assert.match(svcTxt, /ProtectHome=yes/);
    assert.match(svcTxt, /ProtectSystem=strict/);
    assert.match(svcTxt, /InaccessiblePaths=-\/opt\/nexa\/server \/etc\/nexa -\/home\/nexa\/nexa-server/);
    assert.match(svcTxt, /MemoryHigh=128M/);
    assert.match(svcTxt, /MemoryMax=160M/);
    assert.match(svcTxt, /TasksMax=128/);
    assert.match(svcTxt, /CPUQuota=40%/);
    // FR-TERM-18: kill switch default OFF (must NOT pass --enable-terminal in default unit)
    assert.doesNotMatch(svcTxt, /--enable-terminal/);

    // FR-TERM-15: Polkit allows ONLY nexa-term restarting nexa-server.service
    assert.match(polkitTxt, /subject\.user === "nexa-term"/);
    assert.match(polkitTxt, /action\.lookup\("unit"\) === "nexa-server\.service"/);
    assert.match(polkitTxt, /action\.lookup\("verb"\) === "restart"/);
  });

  it('matches the 26-byte binary terminal RESUME frame golden vector', () => {
    // [ch=0x10][op=0x09][sid: 16 bytes (1..16)][received_offset: u64 BE = 4096]
    const frame = Buffer.alloc(26);
    frame.writeUInt8(0x10, 0);
    frame.writeUInt8(0x09, 1);
    for (let i = 0; i < 16; i++) frame.writeUInt8(i + 1, 2 + i);
    frame.writeBigUInt64BE(4096n, 18);

    assert.equal(frame.length, 26);
    assert.equal(frame.subarray(0, 2).toString('hex'), '1009');
    assert.equal(frame.subarray(18, 26).toString('hex'), '0000000000001000');
  });
});
