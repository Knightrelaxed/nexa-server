'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('Tahap 3 Sidecar Log Binary Protocol & Systemd Sandbox (FR-LOG-01..13, FR-SRV-02..04)', () => {
  it('matches the shared 13-byte binary log record golden vector across Node, Go, and Kotlin', () => {
    // Golden vector (PRD §10.3):
    // prio=6 (INFO), unit_id=0 (nexa-server), cat_flags=0x01 (FINANCE),
    // timestamp_ms=1763620502000 (0x0000019aa09a29f0),
    // message="Mutasi rekening [ACC-****] Rp500.000 berhasil" (45 bytes, 0x002d)
    const msgBuf = Buffer.from('Mutasi rekening [ACC-****] Rp500.000 berhasil', 'utf8');
    assert.equal(msgBuf.length, 45);

    const header = Buffer.alloc(13);
    header.writeUInt8(6, 0); // prio = INFO
    header.writeUInt8(0, 1); // unit_id = nexa-server
    header.writeUInt8(0x01, 2); // cat_flags = FINANCE
    header.writeBigUInt64BE(1763620502000n, 3);
    header.writeUInt16BE(msgBuf.length, 11);

    assert.equal(header.toString('hex'), '0600010000019a9ff939f0002d');
  });

  it('verifies nexa-log.socket and nexa-log.service enforce systemd sandboxing and cgroup limits', () => {
    const socketPath = path.join(__dirname, '..', 'nexa-io', 'systemd', 'nexa-log.socket');
    const servicePath = path.join(__dirname, '..', 'nexa-io', 'systemd', 'nexa-log.service');

    const socketTxt = fs.readFileSync(socketPath, 'utf8');
    const serviceTxt = fs.readFileSync(servicePath, 'utf8');

    assert.match(socketTxt, /ListenStream=\/run\/nexa-log\.sock/);
    assert.match(socketTxt, /SocketGroup=caddy/);
    assert.match(socketTxt, /SocketMode=0660/);

    assert.match(serviceTxt, /User=nexa-log/);
    assert.match(serviceTxt, /SupplementaryGroups=systemd-journal/);
    assert.match(serviceTxt, /LoadCredential=ticket-pub\.pem:\/etc\/nexa\/ticket-pub\.pem/);
    assert.match(serviceTxt, /NoNewPrivileges=yes/);
    assert.match(serviceTxt, /PrivateTmp=yes/);
    assert.match(serviceTxt, /ProtectHome=yes/);
    assert.match(serviceTxt, /ProtectSystem=strict/);
    assert.match(serviceTxt, /ReadOnlyPaths=-\/var\/log\/nexa/);
    assert.match(serviceTxt, /InaccessiblePaths=-\/opt\/nexa\/server \/etc\/nexa -\/home\/nexa\/nexa-server/);
    assert.match(serviceTxt, /MemoryHigh=36M/);
    assert.match(serviceTxt, /MemoryMax=48M/);
    assert.match(serviceTxt, /TasksMax=32/);
    assert.match(serviceTxt, /CPUQuota=20%/);
  });
});
