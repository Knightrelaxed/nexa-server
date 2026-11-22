'use strict';
/**
 * ============================================================
 * N.E.X.A Pulse Monitor — Fixed-Size 7-Day Binary History Store
 *
 * - File layout: 24-byte header + (capacity * 72-byte records)
 *   Default capacity = 10,080 (7 days @ 1 sample/min) -> 725,784 bytes (~709 KB).
 *   File size NEVER grows beyond this fixed ceiling.
 * - In-memory hot ring: last 60 samples (~4 KB) for instant 1h sparklines.
 * - Batched flush (default every 5 min or on shutdown) to avoid disk thrashing.
 * - Provides bucket-downsampled time-series queries (<=180 points) and
 *   168-hour (7-day) Application Health Heatmap aggregation.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const MAGIC = Buffer.from('NXPM', 'ascii');
const VERSION = 1;
const HEADER_BYTES = 24;
const RECORD_BYTES = 72;
const DEFAULT_CAPACITY = 7 * 24 * 60; // 10,080 minutes = 7 days
const HOT_RING_MAX = 60;              // 1 hour in memory

// Bitmask flags stored at offset 62 (UInt16LE)
const FLAG_MOBILE_ONLINE = 1 << 0;
const FLAG_WINDOWS_ONLINE = 1 << 1;
const FLAG_LIVE_CALL_ACTIVE = 1 << 2;
const FLAG_RESTARTED = 1 << 3;

function finiteNum(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function clampUint16(val) {
  const n = Math.trunc(finiteNum(val, 0));
  if (n <= 0) return 0;
  return n > 0xffff ? 0xffff : n;
}

function clampUint32(val) {
  const n = Math.trunc(finiteNum(val, 0));
  if (n <= 0) return 0;
  return n > 0xffffffff ? 0xffffffff : n;
}

function encodeRecord(sample, buf = Buffer.allocUnsafe(RECORD_BYTES), offset = 0) {
  buf.fill(0, offset, offset + RECORD_BYTES);
  buf.writeDoubleLE(finiteNum(sample.tsSec, Math.floor(Date.now() / 1000)), offset + 0);
  buf.writeFloatLE(Math.max(0, finiteNum(sample.cpuPct, 0)), offset + 8);
  buf.writeFloatLE(Math.max(0, finiteNum(sample.vpsCpuPct, 0)), offset + 12);
  buf.writeFloatLE(Math.max(0, finiteNum(sample.vpsAvailMb, 0)), offset + 16);
  buf.writeFloatLE(Math.max(0, finiteNum(sample.rssMb, 0)), offset + 20);
  buf.writeFloatLE(Math.max(0, finiteNum(sample.heapUsedMb, 0)), offset + 24);
  buf.writeFloatLE(Math.max(0, finiteNum(sample.heapTotalMb, 0)), offset + 28);
  buf.writeFloatLE(Math.max(0, finiteNum(sample.elMeanMs, 0)), offset + 32);
  buf.writeFloatLE(Math.max(0, finiteNum(sample.elP95Ms, 0)), offset + 36);
  buf.writeFloatLE(Math.max(0, finiteNum(sample.httpReqMin, 0)), offset + 40);
  buf.writeFloatLE(Math.max(0, finiteNum(sample.httpMeanMs, 0)), offset + 44);
  buf.writeFloatLE(Math.max(0, finiteNum(sample.httpP95Ms, 0)), offset + 48);
  buf.writeUInt32LE(clampUint32(sample.activeHandles), offset + 52);
  buf.writeUInt32LE(clampUint32(sample.activeReqs), offset + 56);
  buf.writeUInt16LE(clampUint16(sample.issuesDelta), offset + 60);
  buf.writeUInt16LE(clampUint16(sample.flags), offset + 62);
  buf.writeFloatLE(Math.max(0, finiteNum(sample.aiReqMin, 0)), offset + 64);
  buf.writeFloatLE(Math.max(0, finiteNum(sample.aiMeanMs, 0)), offset + 68);
  return buf;
}

function decodeRecord(buf, offset = 0) {
  const tsSec = buf.readDoubleLE(offset + 0);
  if (!Number.isFinite(tsSec) || tsSec <= 0) return null;
  const heapUsedMb = round2(buf.readFloatLE(offset + 24));
  const heapTotalMb = round2(buf.readFloatLE(offset + 28));
  const flags = buf.readUInt16LE(offset + 62);
  return {
    tsSec: Math.round(tsSec),
    cpuPct: round2(buf.readFloatLE(offset + 8)),
    vpsCpuPct: round2(buf.readFloatLE(offset + 12)),
    vpsAvailMb: round2(buf.readFloatLE(offset + 16)),
    rssMb: round2(buf.readFloatLE(offset + 20)),
    heapUsedMb,
    heapTotalMb,
    heapPct: heapTotalMb > 0 ? round2((heapUsedMb / heapTotalMb) * 100) : 0,
    elMeanMs: round2(buf.readFloatLE(offset + 32)),
    elP95Ms: round2(buf.readFloatLE(offset + 36)),
    httpReqMin: round2(buf.readFloatLE(offset + 40)),
    httpMeanMs: round2(buf.readFloatLE(offset + 44)),
    httpP95Ms: round2(buf.readFloatLE(offset + 48)),
    activeHandles: buf.readUInt32LE(offset + 52),
    activeReqs: buf.readUInt32LE(offset + 56),
    issuesDelta: buf.readUInt16LE(offset + 60),
    flags,
    mobileOnline: Boolean(flags & FLAG_MOBILE_ONLINE),
    windowsOnline: Boolean(flags & FLAG_WINDOWS_ONLINE),
    liveCallActive: Boolean(flags & FLAG_LIVE_CALL_ACTIVE),
    restarted: Boolean(flags & FLAG_RESTARTED),
    aiReqMin: round2(buf.readFloatLE(offset + 64)),
    aiMeanMs: round2(buf.readFloatLE(offset + 68))
  };
}

function round2(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function encodeHeader(capacity, writeIndex, count) {
  const hdr = Buffer.alloc(HEADER_BYTES);
  MAGIC.copy(hdr, 0);
  hdr.writeUInt16LE(VERSION, 4);
  hdr.writeUInt16LE(RECORD_BYTES, 6);
  hdr.writeUInt32LE(capacity, 8);
  hdr.writeUInt32LE(writeIndex, 12);
  hdr.writeUInt32LE(count, 16);
  hdr.writeUInt32LE(0, 20);
  return hdr;
}

function decodeHeader(buf) {
  if (!buf || buf.length < HEADER_BYTES) return null;
  if (!buf.subarray(0, 4).equals(MAGIC)) return null;
  const version = buf.readUInt16LE(4);
  const recordSize = buf.readUInt16LE(6);
  const capacity = buf.readUInt32LE(8);
  const writeIndex = buf.readUInt32LE(12);
  const count = buf.readUInt32LE(16);
  if (version !== VERSION || recordSize !== RECORD_BYTES || capacity <= 0) return null;
  if (writeIndex >= capacity || count > capacity) return null;
  return { version, recordSize, capacity, writeIndex, count };
}

class HistoryStore {
  /**
   * @param {object} [options]
   * @param {string} [options.filePath] - Path to fixed-size binary ring file
   * @param {number} [options.capacity=10080] - Ring capacity in records
   * @param {number} [options.hotRingMax=60] - Max recent records kept in RAM
   */
  constructor(options = {}) {
    this.filePath = options.filePath || null;
    this.capacity = Math.max(10, Math.trunc(finiteNum(options.capacity, DEFAULT_CAPACITY)));
    this.hotRingMax = Math.max(10, Math.trunc(finiteNum(options.hotRingMax, HOT_RING_MAX)));
    this.writeIndex = 0;
    this.diskCount = 0;
    this.hotRing = [];
    this.pendingFlush = [];
    this._initialized = false;

    if (this.filePath) {
      this._initOrLoadHeader();
    }
  }

  get expectedFileSize() {
    return HEADER_BYTES + (this.capacity * RECORD_BYTES);
  }

  _initOrLoadHeader() {
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      if (fs.existsSync(this.filePath)) {
        const stat = fs.statSync(this.filePath);
        if (stat.size === this.expectedFileSize) {
          const fd = fs.openSync(this.filePath, 'r');
          try {
            const hdrBuf = Buffer.allocUnsafe(HEADER_BYTES);
            fs.readSync(fd, hdrBuf, 0, HEADER_BYTES, 0);
            const hdr = decodeHeader(hdrBuf);
            if (hdr && hdr.capacity === this.capacity) {
              this.writeIndex = hdr.writeIndex;
              this.diskCount = hdr.count;
              this._initialized = true;
              // Warm hotRing with up to hotRingMax most recent samples from disk
              this._warmHotRingFromFd(fd);
              return;
            }
          } finally {
            fs.closeSync(fd);
          }
        }
      }
      this._createFreshFile();
    } catch (err) {
      console.warn(`[MONITOR-HISTORY] Storage init fallback to memory-only (${err.message})`);
      this._initialized = false;
    }
  }

  _createFreshFile() {
    const tmpPath = `${this.filePath}.tmp.${process.pid}`;
    const fd = fs.openSync(tmpPath, 'w');
    try {
      const hdr = encodeHeader(this.capacity, 0, 0);
      fs.writeSync(fd, hdr, 0, HEADER_BYTES, 0);
      // Pre-allocate exact fixed size (sparse/zero-filled)
      fs.ftruncateSync(fd, this.expectedFileSize);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, this.filePath);
    this.writeIndex = 0;
    this.diskCount = 0;
    this._initialized = true;
  }

  _warmHotRingFromFd(fd) {
    if (this.diskCount <= 0) return;
    const toRead = Math.min(this.diskCount, this.hotRingMax);
    const startIdx = (this.writeIndex - toRead + this.capacity) % this.capacity;
    const records = this._readRangeFromFd(fd, startIdx, toRead);
    this.hotRing = records.slice(-this.hotRingMax);
  }

  _readRangeFromFd(fd, startIdx, count) {
    if (count <= 0) return [];
    const results = [];
    let remaining = count;
    let cursor = startIdx;
    while (remaining > 0) {
      const contiguous = Math.min(remaining, this.capacity - cursor);
      const byteLen = contiguous * RECORD_BYTES;
      const chunk = Buffer.allocUnsafe(byteLen);
      const byteOffset = HEADER_BYTES + (cursor * RECORD_BYTES);
      const bytesRead = fs.readSync(fd, chunk, 0, byteLen, byteOffset);
      const recordsRead = Math.floor(bytesRead / RECORD_BYTES);
      for (let i = 0; i < recordsRead; i++) {
        const rec = decodeRecord(chunk, i * RECORD_BYTES);
        if (rec) results.push(rec);
      }
      remaining -= contiguous;
      cursor = (cursor + contiguous) % this.capacity;
    }
    return results;
  }

  /**
   * Append one normalized sample (1-minute cadence).
   * Keeps hotRing bounded to hotRingMax and queues for batched disk flush.
   */
  append(sample) {
    const normalized = decodeRecord(encodeRecord(sample), 0);
    if (!normalized) return null;

    this.hotRing.push(normalized);
    if (this.hotRing.length > this.hotRingMax) {
      this.hotRing.splice(0, this.hotRing.length - this.hotRingMax);
    }

    if (this.filePath) {
      this.pendingFlush.push(normalized);
      // Safety bound if disk is temporarily unwritable
      if (this.pendingFlush.length > this.capacity) {
        this.pendingFlush.splice(0, this.pendingFlush.length - this.capacity);
      }
    }
    return normalized;
  }

  /**
   * Flush pending records to the fixed-size circular binary file synchronously.
   */
  flush() {
    if (!this.filePath || this.pendingFlush.length === 0) return 0;
    if (!this._initialized) {
      this._initOrLoadHeader();
      if (!this._initialized) return 0;
    }

    const batch = this.pendingFlush;
    let written = 0;
    let fd = null;
    try {
      fd = fs.openSync(this.filePath, 'r+');
      const recBuf = Buffer.allocUnsafe(RECORD_BYTES);
      for (const sample of batch) {
        encodeRecord(sample, recBuf, 0);
        const byteOffset = HEADER_BYTES + (this.writeIndex * RECORD_BYTES);
        fs.writeSync(fd, recBuf, 0, RECORD_BYTES, byteOffset);
        this.writeIndex = (this.writeIndex + 1) % this.capacity;
        if (this.diskCount < this.capacity) this.diskCount += 1;
        written += 1;
      }
      const hdr = encodeHeader(this.capacity, this.writeIndex, this.diskCount);
      fs.writeSync(fd, hdr, 0, HEADER_BYTES, 0);
      this.pendingFlush = [];
      return written;
    } catch (err) {
      console.warn(`[MONITOR-HISTORY] Flush error: ${err.message}`);
      return written;
    } finally {
      if (fd !== null) {
        try { fs.closeSync(fd); } catch (_) {}
      }
    }
  }

  /**
   * Read all samples >= cutoffSec in chronological order (merging disk + unflushed RAM).
   */
  _readSince(cutoffSec) {
    // Fast path: if hotRing already spans back to cutoffSec (or no disk file exists)
    if (!this.filePath || !this._initialized || this.diskCount === 0) {
      return this.hotRing.filter(r => r.tsSec >= cutoffSec);
    }
    if (this.hotRing.length > 0 && this.hotRing[0].tsSec <= cutoffSec) {
      return this.hotRing.filter(r => r.tsSec >= cutoffSec);
    }

    let diskRecords = [];
    let fd = null;
    try {
      fd = fs.openSync(this.filePath, 'r');
      const startIdx = this.diskCount < this.capacity ? 0 : this.writeIndex;
      const allDisk = this._readRangeFromFd(fd, startIdx, this.diskCount);
      diskRecords = allDisk.filter(r => r.tsSec >= cutoffSec);
    } catch (err) {
      console.warn(`[MONITOR-HISTORY] Read error: ${err.message}`);
      diskRecords = [];
    } finally {
      if (fd !== null) {
        try { fs.closeSync(fd); } catch (_) {}
      }
    }

    const pending = this.pendingFlush.filter(r => r.tsSec >= cutoffSec);
    if (pending.length === 0) return diskRecords;
    const lastDiskTs = diskRecords.length > 0 ? diskRecords[diskRecords.length - 1].tsSec : -1;
    for (const p of pending) {
      if (p.tsSec >= lastDiskTs) diskRecords.push(p);
    }
    return diskRecords;
  }

  /**
   * Query historical samples over the last `rangeSec` seconds, downsampled to <= maxPoints.
   */
  queryRange(rangeSec = 3600, maxPoints = 180, nowSec = Math.floor(Date.now() / 1000)) {
    const cleanRange = Math.max(60, Math.min(7 * 86400, finiteNum(rangeSec, 3600)));
    const cleanMax = Math.max(10, Math.min(720, Math.trunc(finiteNum(maxPoints, 180))));
    const cutoffSec = nowSec - cleanRange;
    const raw = this._readSince(cutoffSec);
    if (raw.length <= cleanMax) return raw;
    return downsampleBucket(raw, cleanMax);
  }

  /**
   * Aggregate the last `hours` (default 168 = 7 days) into hourly Application Health cells.
   */
  getHealthHeatmap(hours = 168, nowSec = Math.floor(Date.now() / 1000)) {
    const totalHours = Math.max(24, Math.min(168, Math.trunc(finiteNum(hours, 168))));
    const currentHourStart = Math.floor(nowSec / 3600) * 3600;
    const firstHourStart = currentHourStart - ((totalHours - 1) * 3600);
    const raw = this._readSince(firstHourStart);

    const buckets = new Map();
    for (const rec of raw) {
      const hStart = Math.floor(rec.tsSec / 3600) * 3600;
      if (hStart < firstHourStart || hStart > currentHourStart) continue;
      let b = buckets.get(hStart);
      if (!b) {
        b = {
          samples: 0,
          rssSum: 0,
          heapPctMax: 0,
          heapUsedMax: 0,
          cpuMax: 0,
          elP95Max: 0,
          issues: 0,
          restarted: false
        };
        buckets.set(hStart, b);
      }
      b.samples += 1;
      b.rssSum += rec.rssMb;
      if (rec.heapPct > b.heapPctMax) b.heapPctMax = rec.heapPct;
      if (rec.heapUsedMb > b.heapUsedMax) b.heapUsedMax = rec.heapUsedMb;
      if (rec.cpuPct > b.cpuMax) b.cpuMax = rec.cpuPct;
      if (rec.elP95Ms > b.elP95Max) b.elP95Max = rec.elP95Ms;
      b.issues += rec.issuesDelta;
      if (rec.restarted) b.restarted = true;
    }

    const cells = [];
    let observedHours = 0;
    let healthyHours = 0;

    for (let i = 0; i < totalHours; i++) {
      const hStart = firstHourStart + (i * 3600);
      const b = buckets.get(hStart);
      if (!b || b.samples === 0) {
        cells.push({
          hourStartSec: hStart,
          status: 'nodata',
          samples: 0,
          avgRssMb: 0,
          maxCpuPct: 0,
          maxElP95Ms: 0,
          issues: 0
        });
        continue;
      }

      observedHours += 1;
      let status = 'healthy';
      if (b.restarted || b.issues >= 5) {
        status = 'incident';
      } else if (b.issues >= 1 || b.elP95Max > 50 || (b.heapPctMax > 92 && b.heapUsedMax > 220) || (b.rssSum / b.samples) > 300) {
        status = 'degraded';
      } else {
        healthyHours += 1;
      }

      cells.push({
        hourStartSec: hStart,
        status,
        samples: b.samples,
        avgRssMb: round2(b.rssSum / b.samples),
        maxCpuPct: round2(b.cpuMax),
        maxElP95Ms: round2(b.elP95Max),
        issues: b.issues
      });
    }

    const healthyPct = observedHours > 0 ? round2((healthyHours / observedHours) * 100) : 100;
    return {
      hours: totalHours,
      observedHours,
      healthyPct,
      cells
    };
  }

  getStats() {
    let fileSizeBytes = 0;
    if (this.filePath) {
      try {
        fileSizeBytes = fs.statSync(this.filePath).size;
      } catch (_) {}
    }
    return {
      capacity: this.capacity,
      recordBytes: RECORD_BYTES,
      headerBytes: HEADER_BYTES,
      expectedFileSizeBytes: this.expectedFileSize,
      actualFileSizeBytes: fileSizeBytes,
      diskCount: this.diskCount,
      hotRingCount: this.hotRing.length,
      pendingFlushCount: this.pendingFlush.length
    };
  }
}

function downsampleBucket(records, maxPoints) {
  const bucketSize = records.length / maxPoints;
  const out = [];
  for (let i = 0; i < maxPoints; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.min(records.length, Math.floor((i + 1) * bucketSize));
    if (start >= end) continue;

    const count = end - start;
    let tsSum = 0;
    let cpuMax = 0;
    let vpsCpuSum = 0;
    let vpsAvailMin = Infinity;
    let rssSum = 0;
    let heapUsedSum = 0;
    let heapTotalSum = 0;
    let elMeanSum = 0;
    let elP95Max = 0;
    let httpReqSum = 0;
    let httpMeanSum = 0;
    let httpP95Max = 0;
    let handlesMax = 0;
    let reqsMax = 0;
    let issuesSum = 0;
    let flagsOr = 0;
    let aiReqSum = 0;
    let aiMeanSum = 0;

    for (let j = start; j < end; j++) {
      const r = records[j];
      tsSum += r.tsSec;
      if (r.cpuPct > cpuMax) cpuMax = r.cpuPct;
      vpsCpuSum += r.vpsCpuPct;
      if (r.vpsAvailMb < vpsAvailMin) vpsAvailMin = r.vpsAvailMb;
      rssSum += r.rssMb;
      heapUsedSum += r.heapUsedMb;
      heapTotalSum += r.heapTotalMb;
      elMeanSum += r.elMeanMs;
      if (r.elP95Ms > elP95Max) elP95Max = r.elP95Ms;
      httpReqSum += r.httpReqMin;
      httpMeanSum += r.httpMeanMs;
      if (r.httpP95Ms > httpP95Max) httpP95Max = r.httpP95Ms;
      if (r.activeHandles > handlesMax) handlesMax = r.activeHandles;
      if (r.activeReqs > reqsMax) reqsMax = r.activeReqs;
      issuesSum += r.issuesDelta;
      flagsOr |= r.flags;
      aiReqSum += r.aiReqMin;
      aiMeanSum += r.aiMeanMs;
    }

    const heapUsedAvg = round2(heapUsedSum / count);
    const heapTotalAvg = round2(heapTotalSum / count);
    out.push({
      tsSec: Math.round(tsSum / count),
      cpuPct: round2(cpuMax),
      vpsCpuPct: round2(vpsCpuSum / count),
      vpsAvailMb: round2(vpsAvailMin === Infinity ? 0 : vpsAvailMin),
      rssMb: round2(rssSum / count),
      heapUsedMb: heapUsedAvg,
      heapTotalMb: heapTotalAvg,
      heapPct: heapTotalAvg > 0 ? round2((heapUsedAvg / heapTotalAvg) * 100) : 0,
      elMeanMs: round2(elMeanSum / count),
      elP95Ms: round2(elP95Max),
      httpReqMin: round2(httpReqSum / count),
      httpMeanMs: round2(httpMeanSum / count),
      httpP95Ms: round2(httpP95Max),
      activeHandles: handlesMax,
      activeReqs: reqsMax,
      issuesDelta: issuesSum,
      flags: flagsOr,
      mobileOnline: Boolean(flagsOr & FLAG_MOBILE_ONLINE),
      windowsOnline: Boolean(flagsOr & FLAG_WINDOWS_ONLINE),
      liveCallActive: Boolean(flagsOr & FLAG_LIVE_CALL_ACTIVE),
      restarted: Boolean(flagsOr & FLAG_RESTARTED),
      aiReqMin: round2(aiReqSum / count),
      aiMeanMs: round2(aiMeanSum / count)
    });
  }
  return out;
}

module.exports = {
  HistoryStore,
  HEADER_BYTES,
  RECORD_BYTES,
  DEFAULT_CAPACITY,
  FLAG_MOBILE_ONLINE,
  FLAG_WINDOWS_ONLINE,
  FLAG_LIVE_CALL_ACTIVE,
  FLAG_RESTARTED,
  encodeRecord,
  decodeRecord
};
