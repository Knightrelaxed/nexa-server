const express = require('express');
const router = express.Router();
const https = require('https');
const fs = require('fs');
const { downloadProxyToFile, downloadRelayB64ToFile, fetchProxyJSON } = require("../../utils/telegram_proxy.js");
const { buildProxyChain, sendTelegramMessage } = require("../../utils/telegram_network");
const path = require('path');
const os = require('os');
const env = require("../../config/env");
const security = require("../../utils/security");
const aiRouter = require("../../core/AI_Router");
const { invalidatePersonalFactsCache } = aiRouter;
const financeEngine = require("../../domain/Finance_Engine");
const godMode = require("../../domain/Discipline_GodMode");
const voiceEngine = require("../../core/Voice_Engine");
const visionEngine = require("../../core/Vision_Engine");
const supabaseMemories = require("../../infrastructure/Supabase_Memories");
const taskManager = require("../../domain/Task_Manager");
const webSearch = require("../../infrastructure/Web_Search");
const googleWorkspace = require("../../infrastructure/Google_Workspace");

// Pending Calendar Context: holds an incomplete calendar CREATE until user provides missing info
// Structure: { summary, start, askedAt }
const { sendTelegramOutbound, stripSurroundingQuotes } = require("./actions");
const { handleDisciplineCallback } = require("./callback_handler");

let pendingCalendarContext = null;
// Pending Conflict Event: holds a conflicting calendar event waiting for user confirmation
// Structure: { pendingEvent: { summary, start, end, description, location, reminder_minutes, recurrence }, askedAt }
let pendingConflictEvent = null;
// Pending Proactive Tasks: holds suggested prep tasks from calendar creation until user approves
// Structure: { summary, tasks: ["Task 1", ...], askedAt }
let pendingProactiveTasks = null;
// Pending Email Context: keeps last email search context for follow-up commands
// Structure: { searchKeyword, lastLimit, cursorIndex, lastBatch, askedAt }
let pendingEmailContext = null;
// Pending Database Context: keeps last database table/action for follow-up commands
// Structure: { tableName, lastAction, askedAt }
let pendingDatabaseContext = null;
// Global conversation context for cross-feature follow-up continuity
// Structure: { intent, extractedData, lastUserText, lastAssistantReply, askedAt }
let conversationContext = null;

// [BUG FIX #3] Session Advice Counter — melacak berapa kali intent ADVICE muncul
// dalam satu sesi percakapan beruntun (window: 1 jam).
// Digunakan oleh Anticipatory_Engine untuk mendeteksi pola overthinking_spiral.
// Struktur: Map<chatId, { count: number, lastAt: number }>
const _adviceSessionMap = new Map();
const ADVICE_SESSION_TTL_MS = 60 * 60 * 1000; // 1 jam

/**
 * Increment session ADVICE counter dan kembalikan jumlah terkini.
 * Counter di-reset otomatis jika sudah lebih dari 1 jam sejak interaksi terakhir.
 * @param {string|number} chatId - Telegram chat ID sebagai key
 * @returns {number} Jumlah ADVICE dalam session ini
 */
function _trackAdviceSession(chatId) {
  const key = String(chatId || 'default');
  const now = Date.now();
  const session = _adviceSessionMap.get(key);

  if (!session || (now - session.lastAt) > ADVICE_SESSION_TTL_MS) {
    // Session baru atau sudah kedaluarsa — reset ke 1
    _adviceSessionMap.set(key, { count: 1, lastAt: now });
    return 1;
  }

  // Update session yang sudah ada
  const newCount = session.count + 1;
  _adviceSessionMap.set(key, { count: newCount, lastAt: now });
  return newCount;
}

/**
 * Baca jumlah ADVICE session tanpa increment (untuk non-ADVICE intent).
 * @param {string|number} chatId
 * @returns {number}
 */
function _getAdviceSessionCount(chatId) {
  const key = String(chatId || 'default');
  const now = Date.now();
  const session = _adviceSessionMap.get(key);
  if (!session || (now - session.lastAt) > ADVICE_SESSION_TTL_MS) return 0;
  return session.count;
}

// Pending Vault Context: confirmation loop for metadata
// Structure: { vaultRowId, driveFileId, driveLink, fileName, mimeType, telegramFileId, category, metadata, askedAt }
let pendingVaultContext = null;

function parseVaultEditCommand(text) {
  const raw = String(text || '').trim();
  if (!/^edit\b/i.test(raw)) return null;
  const body = raw.replace(/^edit\b/i, '').trim();
  if (!body) return {};

  const pairs = body.split(';').map(s => s.trim()).filter(Boolean);
  const out = {};
  for (const p of pairs) {
    const idxEq = p.indexOf('=');
    const idxColon = p.indexOf(':');
    let idx = -1;
    if (idxEq >= 0 && idxColon >= 0) idx = Math.min(idxEq, idxColon);
    else idx = idxEq >= 0 ? idxEq : idxColon;
    if (idx === -1) continue;
    const key = p.slice(0, idx).trim().toLowerCase();
    const value = p.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

function formatVaultMetadata(meta = {}) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const prettyLabel = (key) => {
    const normalized = String(key || '').trim();
    if (!normalized) return '-';
    return normalized
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const dynamicKeys = Object.keys(m)
    .filter((key) => m[key] !== undefined && m[key] !== null && String(m[key]).trim() !== '')
    .sort((a, b) => a.localeCompare(b));

  const lines = [];
  for (const key of dynamicKeys) {
    const v = m[key];
    lines.push(`- ${prettyLabel(key)}: ${String(v).trim()}`);
  }

  if (!lines.length) {
    return '- Belum ada metadata detail.';
  }
  return lines.join('\n');
}

/**
 * Determines whether a learned fact is about N.E.X.A itself (the AI),
 * rather than about Tuan Faqih (the user).
 *
 * Uses a multi-signal scoring approach — no single regex can cover natural
 * language variation, so we collect evidence and decide by majority.
 *
 * @param {string} fact  - The fact string to classify.
 * @returns {boolean}    - true  → store in CORE_IDENTITY (about N.E.X.A)
 *                         false → store in USER_PROFILE  (about Tuan Faqih)
 */
function isFactAboutNexa(fact) {
  const f = fact.toLowerCase().trim();
  let score = 0; // positive = leaning CORE_IDENTITY / SELF_MODEL

  // ── STRONG USER signals (subtract) ──────────────────────────────────────────────
  // Fact uses first-person pronouns that refer to the human
  if (/\b(aku|saya|gue|gw)\b/.test(f)) score -= 2;
  // Explicitly about Tuan / Faqih / user by name — but NOT when they appear
  // only as the *beneficiary* (e.g. "dibuat untuk Tuan Faqih")
  const hasTuanName = /\b(tuan|faqih|hidayatulloh)\b/.test(f);
  const tuanIsSubject = /^(tuan|faqih)/.test(f) || /\b(tuan faqih|faqih)\s+(punya|memiliki|suka|biasa|kuliah|adalah)\b/.test(f);
  if (hasTuanName && tuanIsSubject) score -= 2;
  else if (hasTuanName) score -= 1; // beneficiary only → softer penalty
  // Possessive: "ku" suffix strongly implies user's own attribute
  if (/\w+ku\b/.test(f) && !/\b(namaku|diriku sebagai)\b/.test(f)) score -= 1;

  // ── STRONG N.E.X.A signals (add) ──────────────────────────────────────────────
  // Explicitly names the AI
  if (/\b(nexa|n\.e\.x\.a)\b/.test(f)) score += 3;
  // 2nd person pronoun as the SUBJECT of the sentence (typically refers to AI)
  if (/^(kamu|anda|kau)\b/.test(f)) score += 2;
  if (/\b(kamu|anda|kau)\s+(adalah|itu|merupakan|diciptakan|dibuat|diluncurkan|punya|memiliki|bernama|disebut|bisa|dapat|mampu|tidak bisa|tidak mampu|sering|selalu|harus|jangan)\b/.test(f)) score += 2;
  // Creation / origin / identity
  if (/\b(diciptakan|dibuat|diluncurkan|lahir|dirancang|diprogram|dibangun)\b/.test(f)) score += 1;
  // Name / version / capability
  if (/\b(namamu|nama kamu|nama asisten|versimu|versi kamu|kemampuanmu|kemampuan kamu|identitasmu)\b/.test(f)) score += 2;
  // "kamu bisa/dapat/mampu/tidak bisa" → capability/limitation statement about N.E.X.A
  if (/\b(kamu|anda|kau)\s+(bisa|dapat|mampu|tidak bisa|tidak mampu|belum bisa)\b/.test(f)) score += 1;
  // AI-domain subject terms — bot/asisten/ai at start or followed by verb
  if (/^(bot|asisten|ai)\b/.test(f)) score += 2;
  if (/\b(bot|asisten ai|model ai|sistem ai|ai asisten|kecerdasan buatan)\b/.test(f)) score += 1;
  // "dirimu" or "diri kamu" unambiguously refers to N.E.X.A
  if (/\b(dirimu|diri kamu|diri anda)\b/.test(f)) score += 2;

  // [PHASE 8] Implicit correction/instruction patterns toward N.E.X.A (relaxed detection)
  // e.g.: "ingat ya, jangan pakai poin", "tolong jangan terlalu panjang", "sebaiknya kamu..."
  if (/\b(ingat ya|catat ini|harap|tolong jangan|jangan terlalu|sebaiknya kamu|kamu seharusnya|kamu perlu|kamu harus|kamu sebaiknya)\b/.test(f)) score += 1;
  // Correction signals: "ternyata kamu", "kamu ternyata", "sebenarnya kamu"
  if (/\b(ternyata kamu|kamu ternyata|sebenarnya kamu|rupanya kamu)\b/.test(f)) score += 2;
  // Format/style instructions implied to the AI
  if (/\b(format (jawaban|balasan|respons)|gaya (bahasa|bicara|komunikasi)|responsmu|balasanmu|jawabanmu)\b/.test(f)) score += 1;

  return score > 0;
}

/**
 * [PHASE 8] Klasifikasikan sebuah fakta tentang N.E.X.A ke layer nexa_self_model yang tepat.
 * Menggunakan heuristic berbasis kata kunci.
 * @param {string} fact
 * @returns {'CAPABILITIES'|'LIMITATIONS'|'CORRECTIONS'|'OPERATIONAL_RULES'|'COMMUNICATION_STYLE'}
 */
function _classifySelfModelLayer(fact) {
  const f = fact.toLowerCase();
  // 1. LIMITATIONS — dicek paling awal karena "belum mampu/tidak mampu" harus menang atas "mampu"
  if (/\b(tidak bisa|tidak mampu|belum bisa|belum mampu|gagal|lupa|terbatas|kendala|kesulitan|error|bug|lambat|keterbatasan|kelemahan)\b/.test(f)) return 'LIMITATIONS';
  // 2. CORRECTIONS — dicek sebelum COMMUNICATION_STYLE
  //    Sinyal kuat: "ingat ya", "jangan", "tolong jangan", "seharusnya", dll.
  //    "ternyata kamu" hanya CORRECTIONS jika konteks negatif (salah/tidak) — bukan saat "bisa"
  if (/\b(ingat ya|catat ini|jangan|tolong jangan|seharusnya|harap|perbaiki|salah|keliru|koreksi|ralat)\b/.test(f)) return 'CORRECTIONS';
  if (/\b(ternyata kamu|kamu ternyata)\b/.test(f) && !/\b(bisa|mampu|dapat|berhasil)\b/.test(f)) return 'CORRECTIONS';
  // 3. COMMUNICATION_STYLE — preferensi format murni tanpa nada koreksi
  //    Hanya kata-kata yang tidak ambigu sebagai instruksi gaya
  if (/\b(format (jawaban|balasan|respons)|gaya bahasa|gaya bicara|gaya komunikasi|nada (bicara|respons)|responsmu|balasanmu|jawabanmu)\b/.test(f)) return 'COMMUNICATION_STYLE';
  // 4. CAPABILITIES — kemampuan positif
  if (/\b(bisa|dapat|mampu|berhasil|fitur|fungsi|kemampuan|kapabilitas|dukungan|mendukung|otomatis|sinkronisasi)\b/.test(f)) return 'CAPABILITIES';
  // 5. Default: aturan operasional
  return 'OPERATIONAL_RULES';
}

function _triggerConversationalSynthesis(textInput, resultMessage, action) {
  setTimeout(async () => {
    try {
      const { executeWithFallback } = require("../../core/Fallback_Engine");
      const { NEXA_PERSONALITY } = require("../../config/personality");
      
      const prompt = `System Time (Asia/Jakarta): ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\nUser Asked: "${textInput}"\n\nDashboard / Result:\n${resultMessage}\n\nTask: Write a 1-2 sentence friendly, caring response IN INDONESIAN analyzing the operation or schedule above. Act as a dedicated, elegant personal assistant. Provide a brief relevant suggestion, encouragement, prep tip, priority guidance, or warm appreciation. DO NOT repeat the items, events, or confirmation text. Keep it concise, warm, and natural. DO NOT wrap your response in quotation marks or speech marks. Answer directly without quotes.`;
      
      const advice = await executeWithFallback(prompt, NEXA_PERSONALITY, 0.7, false);
      if (advice && !advice.includes('DUMB_MODE')) {
        const cleanAdvice = stripSurroundingQuotes(advice);
        await sendTelegramOutbound(cleanAdvice);
      }
    } catch (err) {
      console.error('[CONVERSATIONAL SYNTHESIS] Failed:', err.message);
    }
  }, 1500);
}

function parseJsonObjectFromText(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) { }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      const parsed = JSON.parse(fenced[1].trim());
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (_) { }
  }

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      const parsed = JSON.parse(text.slice(first, last + 1));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (_) { }
  }
  return null;
}

function toCleanSingleLine(value, maxLen = 160) {
  let valStr = value;
  if (value && typeof value === 'object') {
    valStr = JSON.stringify(value);
  }
  const s = String(valStr || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.substring(0, maxLen);
}

// =============================================================
// VAULT EXTRACTION — 5-LAYER PIPELINE
// =============================================================

// --- Schema Registry Removed (Digantikan oleh Direct Multimodal JSON Extraction) ---

// Field yang secara alami bisa panjang — TIDAK dibuang ke catatan
const LONG_VALUE_WHITELIST = new Set([
  'alamat', 'address', 'keterangan', 'catatan', 'deskripsi',
  'lokasi', 'uraian', 'penjelasan', 'tujuan', 'nama_jalan',
  'tempat_tinggal', 'domisili', 'perihal', 'isi_surat',
  'nama_pemegang', 'nama_peserta', 'atas_nama',
]);

// Sinyal bahwa string adalah DATA terstruktur, bukan narasi
const STRUCTURED_DATA_SIGNALS = [
  /\d{5,}/,
  /\d{2}[-\/]\d{2}/,
  /Rp\.?\s*[\d.,]+/,
  /mÂ²|m2|ha|kg/,
  /www\.|http/,
  /\d+[\/\\]\d+/,
];

// --- Layer 5 helper: context-aware looksNarrative ---
function looksNarrative(key, value) {
  if (!value || typeof value !== 'string') return false;
  const k = String(key || '').toLowerCase().replace(/[\s-]/g, '_');
  if (LONG_VALUE_WHITELIST.has(k)) return false;
  if (STRUCTURED_DATA_SIGNALS.some(rx => rx.test(value))) return false;
  const words = value.trim().split(/\s+/);
  const avgWordLen = value.replace(/\s/g, '').length / (words.length || 1);
  if (words.length > 8 && avgWordLen < 5.5) return true;
  return value.length > 200;
}

// --- Key normalizer ---
function _normalizeKey(raw) {
  return String(raw || '')
    .trim().toLowerCase()
    .replace(/[^a-z0-9\u00C0-\u024F\s]/g, ' ')
    .trim().replace(/\s+/g, '_')
    .replace(/_+/g, '_').replace(/^_|_$/g, '');
}

// Rename key generik (field_1, nilai, teks) berdasarkan konten value
function _renameGenericKey(key, value) {
  if (!/^(field_\d+|nilai|teks|data|item|kolom_\d+)$/i.test(key)) return key;
  const v = String(value || '').trim();
  if (/^\d{16}$/.test(v)) return 'nik';
  if (/^[A-Z]{1,2}\s?\d{1,4}\s?[A-Z]{1,3}$/.test(v)) return 'nomor_polisi';
  if (/^\d{2}[-\/]\d{2}[-\/]\d{4}$/.test(v)) return 'tanggal';
  if (/^(www\.|https?)/.test(v)) return 'website';
  if (/@/.test(v)) return 'email';
  if (/^(08|\+62|1\d{5,6})/.test(v)) return 'nomor_telepon';
  return key;
}

// --- Layer 3: Smart heuristic fallback (Format parsers + Universal Regex) ---
function _smartKVSweep(text) {
  const results = {};
  if (!text) return results;

  // Pola deterministik universal (apapun tipe dokumennya)
  const UNIVERSAL_PATTERNS = {
    nik: /\b(\d{16})\b/,
    nomor_polisi: /\b([A-Z]{1,2}\s?\d{1,4}\s?[A-Z]{1,3})\b/,
    nomor_telepon: /(?:Tel|Telp|HP|Phone)?\.?\s*(\+?62[\d\s-]{9,14}|0[\d\s-]{9,12})/i,
    website: /(www\.[a-z0-9.-]+\.[a-z]{2,}|https?:\/\/[^\s]+)/i,
    email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,})/i,
    tanggal: /(\d{1,2}\s+(?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+\d{4})/i,
    nomor_npwp: /(\d{2}\.\d{3}\.\d{3}\.\d{1}-\d{3}\.\d{3})/,
  };

  // Format 1: "Label: Value"
  const colonRx = /^([A-Za-z\s\/]{2,40})\s*:\s*(.+)$/gm;
  // Format 2: "Label\nValue" (dua baris berurutan)
  const nlRx = /^([A-Z][A-Za-z\s]{2,30})\n([^\n]{1,80})$/gm;
  // Format 3: "Label   Value" (tab/banyak spasi)
  const tabRx = /^([A-Za-z\s\/]{3,30})\s{2,}(.{1,80})$/gm;

  for (const rx of [colonRx, nlRx, tabRx]) {
    let m;
    while ((m = rx.exec(text)) !== null) {
      const k = _normalizeKey(m[1]);
      if (k && m[2] && !results[k]) results[k] = m[2].trim();
    }
  }

  // Sweep pakai regex universal
  for (const [field, regex] of Object.entries(UNIVERSAL_PATTERNS)) {
    const match = text.match(regex);
    if (match?.[1] && !results[field]) results[field] = match[1].trim();
  }

  return results;
}

// --- Layer 4: Orphan Text Pass ---
function extractOrphanText(visionText, existingMetadata) {
  const orphans = {};
  if (!visionText) return orphans;
  const existingValues = new Set(
    Object.values(existingMetadata).map(v => String(v).toLowerCase().trim())
  );
  const ORPHAN_PATTERNS = [
    { key: 'kontak_hotline', regex: /\b(1\d{5,6}|1500\d{3})\b/g },
    { key: 'website', regex: /(www\.[a-z0-9.-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)/gi },
    { key: 'email', regex: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,})/gi },
    { key: 'nomor_telepon', regex: /(?<!\d)(\+?62[\d\s-]{9,13}|0[\d\s-]{9,12})(?!\d)/g },
    { key: 'nama_lembaga', regex: /([A-Z][a-z]+ (?:[A-Z][a-z]+ ){1,4}(?:Indonesia|Nasional|Kota|Kabupaten|Republik))/g },
    { key: 'nomor_referensi', regex: /(?:No\.|Nomor)\s*:?\s*([A-Z0-9\/.-]{5,20})/gi },
  ];
  for (const { key, regex } of ORPHAN_PATTERNS) {
    const matches = [...visionText.matchAll(regex)];
    for (const m of matches) {
      const val = m[1]?.trim();
      if (!val || existingValues.has(val.toLowerCase())) continue;
      if (!orphans[key]) orphans[key] = val;
    }
  }
  return orphans;
}

// --- Layer 5: Normalisasi context-aware ---
function normalizeVaultMetadata(metadata = {}, visionText = '', fileName = '') {
  const input = metadata && typeof metadata === 'object' ? metadata : {};
  const output = {};
  const catatanParts = [];

  for (const [rawKey, rawVal] of Object.entries(input)) {
    if (rawVal === undefined || rawVal === null) continue;
    const key = _normalizeKey(_renameGenericKey(rawKey, rawVal));
    if (!key) continue;
    const val = toCleanSingleLine(rawVal, 600);
    if (!val) continue;
    if (looksNarrative(key, val)) {
      catatanParts.push(`${key}: ${val}`);
    } else {
      output[key] = val;
    }
  }

  if (fileName) output.judul = output.judul || fileName;
  if (catatanParts.length > 0) output.catatan = catatanParts.join(' | ').substring(0, 500);
  if (output.catatan) output.catatan = toCleanSingleLine(output.catatan, 500);
  if (output.ringkasan_dokumen) output.ringkasan_dokumen = toCleanSingleLine(output.ringkasan_dokumen, 320);

  return output;
}

// Legacy text-to-JSON and docType classification helpers have been removed
// in favor of Direct Multimodal JSON Extraction logic.

// =============================================================
// extractVaultMetadataFromVision — DIRECT MULTIMODAL EXTRACTION
// =============================================================
async function extractVaultMetadataFromVision({ fileId, fileName, promptHint = '' }) {
  if (!fileId) {
    return { judul: fileName || '', source: 'VISION_UNAVAILABLE' };
  }

  // Prompt canggih: Meminta Vision Model untuk LANGSUNG mengembalikan JSON
  const directJsonPrompt =
    `Kamu adalah sistem ekstraksi metadata tingkat lanjut yang sangat presisi.\n` +
    `Tugas Utama: Ekstrak SEMUA informasi penting dari gambar ini menjadi satu JSON object.\n\n` +
    `ATURAN KETAT:\n` +
    `1. Output WAJIB 100% JSON valid. DILARANG KERAS menyertakan markdown (seperti \`\`\`json), pembukaan, narasi, atau penjelasan.\n` +
    `2. Buat "key" secara DINAMIS berdasarkan konteks apa yang kamu lihat. Pahami apa objek di gambar (dokumen resmi, struk, surat kerja, pamflet, dll) dan buat struktur data yang sesuai.\n` +
    `3. Semua key WAJIB format snake_case.\n` +
    `4. Value WAJIB faktual dan singkat. Jangan buat kalimat narasi panjang sebagai value.\n` +
    `5. Sertakan key "kategori_gambar" untuk mengkategorikan isi (contoh: KTP, Struk Belanja, Surat Keterangan Kematian, Plang Jalan, dll).\n` +
    `6. JANGAN lewatkan angka penting, nomor identitas, tanggal, nama, lokasi, total bayar, atau informasi krusial lainnya.\n` +
    `7. Jika melihat nomor kontak, email, atau website, buat key yang sesuai.\n` +
    `8. WAJIB keluarkan key "judul" yang berisi deskripsi singkat/nama dokumen yang sangat spesifik dan representatif.`;

  const rawVisionOutput = await visionEngine.processTelegramImage(
    fileId,
    promptHint, // Caption dari user sebagai hint tambahan
    directJsonPrompt // Override system prompt!
  );

  let directParsed = {};
  try {
    directParsed = parseJsonObjectFromText(rawVisionOutput) || {};
  } catch (e) {
    console.warn('[VAULT] Failed to parse direct JSON from vision. Fallback to regex. Output:', rawVisionOutput.substring(0, 50));
  }

  // Jika entah bagaimana hasil JSON sangat sedikit (gagal), jalankan heuristic sweep universal
  let heuristic = {};
  if (Object.keys(directParsed).length < 3) {
    heuristic = _smartKVSweep(rawVisionOutput);
  }

  // Lakukan Orphan Pass
  const merged = { ...heuristic, ...directParsed };
  const orphans = extractOrphanText(rawVisionOutput, merged);
  const combined = { ...merged, ...orphans };

  // Normalisasi akhir
  const normalized = normalizeVaultMetadata(combined, rawVisionOutput, fileName);

  const docCategory = normalized.kategori_gambar || 'UMUM';
  console.log(`[VAULT-DIRECT] Processed image as: ${docCategory}. Extracted ${Object.keys(normalized).length} fields.`);

  return {
    judul: fileName || '',
    ...normalized,
    source: 'VISION_DIRECT',
  };
}

// ============================================================
// PROXY HELPER
// ============================================================
function getProxyList(targetUrl) {
  return buildProxyChain(targetUrl);
}

function getBinaryProxyList(targetUrl) {
  const proxies = [];
  const relayBase = env.NEXA_VERCEL_RELAY_URL || env.TELEGRAM_PROXY_URL;
  if (relayBase) {
    proxies.push({
      name: 'Vercel Relay B64',
      url: relayBase.replace(/\?url=$/, '').replace(/\/+$/, ''),
      targetUrl,
      useB64: true,
    });
  }
  proxies.push({
    name: 'AllOrigins',
    url: `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    useB64: false,
  });
  return proxies;
}

async function fetchJsonWithFailover(targetUrl, opts = {}) {
  const timeoutMs = (opts.timeout || 30) * 1000;
  const proxies = getProxyList(targetUrl);

  for (const proxy of proxies) {
    try {
      console.log(`[VAULT] Getting JSON via: ${proxy.name}...`);
      const parsed = await fetchProxyJSON(proxy.url, timeoutMs, 3, proxy.headers);
      if (parsed.ok !== undefined) {
        console.log(`[VAULT] ${proxy.name} JSON fetch succeeded.`);
        return parsed;
      }
    } catch (err) {
      console.warn(`[VAULT] ${proxy.name} JSON fetch failed: ${(err.message).substring(0, 150)}`);
    }
  }
  throw new Error('All download paths failed to retrieve valid JSON from Telegram.');
}

async function downloadTelegramFileToTemp(fileId, preferredExt = '') {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is missing');

  const getFileUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
  console.log('[VAULT] Step 1: Getting file info...');

  const fileData = await fetchJsonWithFailover(getFileUrl);
  if (!fileData.ok || !fileData.result?.file_path) {
    throw new Error(`Telegram getFile error: ${JSON.stringify(fileData).substring(0, 200)}`);
  }

  const filePath = fileData.result.file_path;
  const ext = preferredExt || (filePath.includes('.') ? filePath.split('.').pop() : 'bin');

  const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const proxies = getBinaryProxyList(fileUrl);

  console.log('[VAULT] Step 2: Downloading document binary...');

  for (const proxy of proxies) {
    try {
      console.log(`[VAULT] Downloading binary via: ${proxy.name}...`);
      let result;
      if (proxy.useB64) {
        // Mode B64: Cloudflare Worker/Vercel encode biner jadi JSON (bypass HF egress & Vercel streaming limits)
        result = await downloadRelayB64ToFile(proxy.url, proxy.targetUrl, ext, 20 * 1024 * 1024);
      } else {
        result = await downloadProxyToFile(proxy.url, ext, 20 * 1024 * 1024);
      }
      if (result.sizeBytes > 50) {
        console.log(`[VAULT] File downloaded via ${proxy.name}. Size: ${result.sizeBytes} bytes`);
        return { tmpFilePath: result.filePath, originalFilePath: filePath };
      }
} catch (err) {
      console.warn(`[VAULT] ${proxy.name} binary download failed: ${(err.message).substring(0, 150)}`);
    }
  }

  throw new Error('Document download failed across all proxies. The proxy may be timing out or blocked.');
}

// ============================================================
// TELEGRAM ROUTE HANDLER
// ============================================================
async function handleTelegramWebhook(req, res) {
  const callbackQuery = req.body?.callback_query;

  // ── Handle klik tombol Inline Keyboard ──────────────────────
  if (callbackQuery) {
    // Acknowledge Telegram agar tidak timeout (HTTP 200 dulu)
    res.status(200).send('OK');

    const cbData = callbackQuery.data || '';
    const cbChatId = callbackQuery.message?.chat?.id || env.TELEGRAM_CHAT_ID;
    const cbMessageId = callbackQuery.message?.message_id;
    const botToken = env.TELEGRAM_BOT_TOKEN?.trim();

    // Helper lokal untuk edit pesan Telegram yang ada tombolnya
    const editTelegramMessage = async (newText) => {
      try {
        await sendTelegramMessage(newText, cbChatId, botToken, {
          method: 'editMessageText',
          message_id: cbMessageId,
          parse_mode: 'HTML',
        });
      } catch (_) {
        // Jika edit gagal (pesan sudah dihapus, dll), kirim pesan baru
        await sendTelegramOutbound(newText, true);
      }
    };

    // ── IDENTITY PROPOSAL: APPROVE ───────────────────────────
    if (cbData.startsWith('IDENTITY_APPROVE:')) {
      const proposalId = parseInt(cbData.split(':')[1], 10);
      console.log(`[IDENTITY] User clicked APPROVE for proposal #${proposalId}`);

      const result = await supabaseMemories.approveIdentityProposal(proposalId).catch(e => ({
        success: false, error: e.message
      }));

      if (result.success) {
        const row = result.identityRow;
        const traitDisplay = row ? `<b>${row.layer}</b> → ${row.trait_value}` : `Proposal #${proposalId}`;
        await editTelegramMessage(
          `✅ <b>Committed to Identity Model.</b>\n\nTerima kasih, Tuan. Saya telah menyimpan:\n${traitDisplay}\n\nPemahaman saya tentang Anda telah diperbarui dan akan langsung berlaku pada percakapan berikutnya.`
        );
        // [PHASE 6] Invalidate KEDUA cache agar AI_Router langsung pakai data terbaru:
        // - personalFactsCache: data profil lama (legacy)
        // - identityModelCache: 7-Layer Identity Model baru (Phase 6)
        if (typeof aiRouter.invalidatePersonalFactsCache === 'function') {
          aiRouter.invalidatePersonalFactsCache();
        }
        if (typeof aiRouter.invalidateIdentityModelCache === 'function') {
          aiRouter.invalidateIdentityModelCache();
        }
      } else {
        await editTelegramMessage(
          `❌ <b>Gagal menyimpan perubahan.</b>\n\nMaaf Tuan, terjadi kesalahan teknis: <code>${result.error}</code>`
        );
      }
      return;
    }

    // ── IDENTITY PROPOSAL: REJECT ────────────────────────────
    if (cbData.startsWith('IDENTITY_REJECT:')) {
      const proposalId = parseInt(cbData.split(':')[1], 10);
      console.log(`[IDENTITY] User clicked REJECT for proposal #${proposalId}`);

      // Tandai sebagai REJECTED di database (tanpa reason dulu, user akan diberi kesempatan balas)
      await supabaseMemories.rejectIdentityProposal(proposalId, null).catch(() => {});

      await editTelegramMessage(
        `❌ <b>Proposal Dibatalkan.</b>\n\nBaik Tuan, saya tidak akan menambahkan profil tersebut ke Identity Model.\n\n🤔 Boleh saya tahu di bagian mana kesimpulan saya kurang tepat?\n(Misalnya: "karena minggu lalu hanya kebetulan ada tugas mendadak")\n\nAtau balas <b>"Tidak apa-apa"</b> jika tidak ingin menjelaskan — saya akan lebih berhati-hati di observasi berikutnya.`
      );
      // Simpan konteks bahwa kita sedang menunggu alasan penolakan untuk proposal ini
      // (akan ditangkap oleh conversationContext di handler pesan teks di bawah)
      conversationContext = {
        intent: 'AWAITING_IDENTITY_REJECTION_REASON',
        extractedData: { proposalId },
        askedAt: Date.now()
      };
      return;
    }

    // ── DISCIPLINE FEEDBACK LOOP (Level 2: d:ok, d:no, d:ext) ──
    if (await handleDisciplineCallback(callbackQuery)) {
      return;
    }

    // Callback query lain yang tidak dikenal — abaikan saja
    console.log(`[WEBHOOK] Unknown callback_query data: ${cbData}`);
    return;
  }

  // ── Handler pesan teks / media biasa ────────────────────────
  const message = req.body?.message || req.body?.edited_message;

  if (!message) {
    return res.status(200).send('OK');
  }

  // DO NOT block — we will now ack the webhook IMMEDIATELY with sendChatAction
  // This achieves 3 massive benefits:
  // 1. The typing indicator is 100% guaranteed to show instantly natively.
  // 2. Telegram's webhook lock is freed, preventing 30-second timeout retries if AI is slow.
  // 3. We use Vercel Relay for the final message delivery, which is fast and reliable.
  
  const { startTypingLoop, sendTelegramMessage } = require("../../utils/telegram_network");
  
  // Ack immediately with typing
  res.status(200).json({
    method: 'sendChatAction',
    chat_id: message.chat.id,
    action: 'typing'
  });

  // Start auto-refresh loop via Relay (in case AI takes > 5 seconds)
  const stopTyping = startTypingLoop(message.chat?.id, env.TELEGRAM_BOT_TOKEN?.trim());

  let webhookReply = null;

  setImmediate(async () => {

    // Helper: escape untrusted strings for HTML parse_mode
    const escapeHtml = (str) => String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    // ============================================================
    // respondToTelegram — Capture reply
    // ============================================================
    const respondToTelegram = async (text, skipMemory = false) => {
      const cleanText = stripSurroundingQuotes(String(text));
      if (!skipMemory) {
        await supabaseMemories.saveChatMemory('nexa', cleanText.substring(0, 4000)).catch(() => { });
      }
      webhookReply = cleanText.substring(0, 4000);
    };

    const deliverWebhookReply = async () => {
      stopTyping();
      if (webhookReply) {
        const replyToSend = webhookReply;
        webhookReply = null; // Clear immediately to prevent double-delivery from finally blocks
        console.log('[TELEGRAM] Delivering via outbound API (webhook already acked)');
        await sendTelegramMessage(replyToSend, message.chat.id, env.TELEGRAM_BOT_TOKEN?.trim());
      }
    };

    let textInput = message.text;
    
    // [FEATURE] Reply-Awareness
    // Inject replied message context with a semantic label so AI Router
    // can distinguish reference context from an action command without
    // needing verbose examples in the system prompt.
    if (textInput && message.reply_to_message && message.reply_to_message.text) {
      const originalMsg = message.reply_to_message.text;
      const snippet = originalMsg.length > 600 ? originalMsg.substring(0, 600) + '...' : originalMsg;
      // Pre-classify: does the user's OWN message contain an explicit action verb?
      const ACTION_VERBS = /\b(hapus|ubah|edit|perbaiki|catat|konfirmasi|batalkan|ganti|update|delete|simpan|sesuaikan|koreksi|tambah|undo)\b/i;
      const isAction = ACTION_VERBS.test(textInput);
      const label = isAction ? 'KONTEKS_AKSI' : 'KONTEKS_REFERENSI';
      textInput = `[${label} — Menanggapi pesan N.E.X.A: "${snippet}"]\n${textInput}`;
    }

    const captionText = message.caption || '';
    const vaultTriggerText = `${textInput || ''} ${captionText || ''}`.toLowerCase();

    // [AUDIT FIX] Centralized INCOMING memory save (Anti-Amnesia)
    // Lock the user's message into Supabase IMMEDIATELY.
    // This guarantees N.E.X.A never loses context even if an error crashes the router below.
    const rawInputStr = (textInput || captionText || '[Attachment/Media]').substring(0, 4000);
    await supabaseMemories.saveChatMemory('user', rawInputStr).catch(() => {});

    try {
    // ============================================================
    // [PHASE 4] WHATSAPP LOGIN & LOGOUT COMMAND INTERCEPTOR
    // Menangani perintah /wa_login dan /wa_logout langsung dari Telegram
    // ============================================================
    if (textInput && /^(\/wa_login|\/walogin|\/login_wa)\b/i.test(textInput.trim())) {
      console.log('[TELEGRAM-CMD] Menerima perintah /wa_login dari Telegram');
      await respondToTelegram(
        '🚀 <b>Memulai Sesi Baru WhatsApp (Pintu 2)...</b>\n\nSedang memutuskan sesi lama dan merender QR Code baru. Mohon tunggu beberapa detik, foto QR akan segera dikirim ke obrolan ini...'
      );
      deliverWebhookReply();
      const waAdapter = require('../whatsapp/adapter');
      // Jalankan secara asinkron agar tidak memblokir response Telegram
      waAdapter.startWhatsAppSocket({ forceNewSession: true }).catch(err => {
        console.error('[TELEGRAM-CMD] Error saat startWhatsAppSocket:', err.message);
      });
      return;
    }

    if (textInput && /^(\/wa_logout|\/walogout|\/logout_wa)\b/i.test(textInput.trim())) {
      console.log('[TELEGRAM-CMD] Menerima perintah /wa_logout dari Telegram');
      const waAdapter = require('../whatsapp/adapter');
      await waAdapter.logoutWhatsAppSession();
      await respondToTelegram(
        '🛑 <b>Sesi WhatsApp Berhasil Dihapus</b>\n\nPintu 2 (WhatsApp) telah diputuskan dan data kredensial di cloud telah dibersihkan. Anda bisa mengetik /wa_login kapan saja untuk scan nomor baru.'
      );
      deliverWebhookReply();
      return;
    }

    if (textInput && /^(\/trigger_weekly|\/force_weekly|\/weekly_inference)\b/i.test(textInput.trim())) {
      console.log('[TELEGRAM-CMD] Menerima perintah /trigger_weekly dari Telegram');
      await respondToTelegram(
        '🚀 <b>Memulai Weekly Cognitive Sunday Pass...</b>\n\nSedang menganalisis observasi perilaku 7 hari terakhir dan memanggil 15 Tier AI. Hasil proposal dan ringkasan akan dikirim ke obrolan ini dalam beberapa detik...'
      );
      deliverWebhookReply();
      
      // Jalankan secara asinkron di background
      (async () => {
        try {
          const inferenceEngine = require('../../domain/Inference_Engine');
          const { sendTelegramOutbound } = require('../webhook');
          
          const result = await inferenceEngine.runWeeklyIdentityInference();
          console.log(`[TELEGRAM-CMD] Weekly Inference done: saved=${result.saved} pendingSent=${result.pendingSent} staged=${result.staged}`);

          if (result.success && result.saved > 0) {
            const summaryMsg = [
              `🧠 <b>Weekly Identity Inference Selesai</b>`,
              `<i>(Siklus Pemahaman Mingguan N.E.X.A — Manual Trigger)</i>`,
              '',
              `📊 Hipotesis yang dianalisis : <b>${result.totalHypotheses}</b>`,
              `✅ Proposal baru tersimpan   : <b>${result.saved}</b>`,
              `📨 Dikirim untuk review      : <b>${result.pendingSent}</b>`,
              `📂 Di-stage (bukti kurang)   : <b>${result.staged}</b>`,
              `⚡ Diabaikan (duplikat/lemah): <b>${result.skipped}</b>`,
              '',
              result.pendingSent > 0
                ? `💡 Silakan review proposal identitas di atas, Tuan.`
                : `📝 Semua hipotesis minggu ini di-stage untuk observasi lanjutan.`
            ].join('\n');
            await sendTelegramOutbound(summaryMsg, true);
          } else {
            await sendTelegramOutbound(`🧠 <b>Weekly Identity Inference Selesai</b>\n\nTidak ada hipotesis baru minggu ini (atau data observasi belum cukup). Model identitas stabil.`, true);
          }
        } catch (e) {
          console.error('[TELEGRAM-CMD] Error saat trigger weekly inference:', e.message);
        }
      })();
      return;
    }


    // ============================================================
    // [PHASE 6] AWAITING IDENTITY REJECTION REASON
    // Jika user membalas setelah klik REJECT pada proposal identitas
    // ============================================================
    if (conversationContext?.intent === 'AWAITING_IDENTITY_REJECTION_REASON' && textInput) {
      const ageMs = Date.now() - (conversationContext.askedAt || 0);
      const looksLikeCheckin = /^\d/.test(textInput.trim()) || /\b(tidur|energi|fokus|skor)\b/i.test(textInput);
      
      // Beri window 10 menit untuk membalas alasan, dan pastikan bukan pesan check-in
      if (ageMs <= 10 * 60 * 1000 && !looksLikeCheckin) {
        const proposalId = conversationContext.extractedData?.proposalId;
        const userReason = String(textInput).trim();
        const isSkip = /tidak apa.apa|skip|tidak perlu|ga perlu|nggak perlu/i.test(userReason);

        if (proposalId && !isSkip) {
          // Simpan alasan penolakan ke database
          await supabaseMemories.rejectIdentityProposal(proposalId, userReason).catch(() => {});
          console.log(`[IDENTITY] Rejection reason recorded for proposal #${proposalId}: "${userReason}"`);
          await respondToTelegram(
            `🧠 Terima kasih atas koreksinya, Tuan. Saya mencatat bahwa: _"${userReason}"_\n\nSaya akan memperhitungkan konteks ini agar tidak mengulang kesimpulan yang sama di masa mendatang. Pemahaman saya tentang Anda terus berkembang.`
          );
        } else {
          await respondToTelegram(
            `Baik, Tuan. Tidak masalah — saya akan lebih berhati-hati dalam menarik kesimpulan ke depannya. 🙏`
          );
        }
        conversationContext = null;
        deliverWebhookReply();
        return;
      } else {
        // Context expired, reset
        conversationContext = null;
      }
    }

    // ============================================================
    // [PHASE 6] MORNING CHECK-IN PARSER (AI-Calibrated Narrative)
    // Memproses balasan angka maupun cerita/alasan kondisi pagi.
    // Prasyarat: harus ada riwayat MORNING_BRIEFING_SENT hari ini
    // ============================================================
    if (textInput) {
      const intelligenceBrief = require("../../domain/Intelligence_Brief");

      // 1. Cek dulu apakah hari ini sudah ada Morning Briefing yang dikirim (dalam 4 jam terakhir)
      let morningBriefingSentToday = false;
      try {
        const { supabase } = supabaseMemories;
        if (supabase) {
          const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
          const { data: briefLogs } = await supabase
            .from('nexa_behavior_log')
            .select('id')
            .eq('event_type', 'MORNING_BRIEFING_SENT')
            .gte('created_at', fourHoursAgo)
            .limit(1);
          morningBriefingSentToday = !!(briefLogs && briefLogs.length > 0);
        }
      } catch (_) { /* Non-blocking */ }

      if (morningBriefingSentToday && !/^detail$/i.test(textInput.trim())) {
        // Pre-check heuristic: Pesan harus berupa angka atau mengandung keyword pagi
        const hasCheckinKeyword = /\b(tidur|energi|fokus|skor|semalam|bangun|kondisi)\b/i.test(textInput) || /^\d/.test(textInput.trim());
        
        let checkInData = null;
        if (hasCheckinKeyword) {
          checkInData = await intelligenceBrief.parseMorningCheckInWithAI(textInput);
        }

        if (checkInData) {
          console.log(`[INTELLIGENCE] Morning Check-In calibrated: sleep=${checkInData.sleep}, energy=${checkInData.energy}, focus="${checkInData.focus}" | notes=${checkInData.calibration_notes}`);

          // Simpan ke behavior log lengkap dengan cerita & alasan kalibrasi
          await intelligenceBrief.saveCheckInData(
            checkInData.sleep,
            checkInData.energy,
            checkInData.focus,
            checkInData.raw_story,
            checkInData.calibration_notes
          );

          // Generate respons 2 Bubble dari N.E.X.A
          const checkInReplies = await intelligenceBrief.generateCheckInResponse(
            checkInData.sleep,
            checkInData.energy,
            checkInData.focus,
            checkInData.reply_bubbles
          );

          if (typeof checkInReplies === 'object' && checkInReplies.bubble1) {
            await respondToTelegram(checkInReplies.bubble1);
            if (checkInReplies.bubble2) {
              await sendTelegramOutbound(checkInReplies.bubble2);
            }
          } else {
            await respondToTelegram(String(checkInReplies));
          }
          deliverWebhookReply();
          return;
        }
      }

      // ── Deteksi request "Detail" setelah Morning Briefing ───
      if (/^detail$/i.test(textInput.trim()) && morningBriefingSentToday) {
        console.log('[INTELLIGENCE] User requested Morning Briefing DETAIL mode.');
        const detailBriefing = await intelligenceBrief.generateMorningBriefingDetail();
        await respondToTelegram(detailBriefing);
        deliverWebhookReply();
        return;
      }
    }

    // ============================================================
    // VAULT CONFIRMATION LOOP (KONFIRM / EKSTRAK ULANG / EDIT)
    // ============================================================
    if (pendingVaultContext && textInput) {
      const normalized = String(textInput).trim();
      const upper = normalized.toUpperCase();
      const ageMs = Date.now() - (pendingVaultContext.askedAt || 0);
      if (ageMs <= 15 * 60 * 1000) {
        if (upper === 'KONFIRM' || upper === 'CONFIRM') {
          await supabaseMemories.updateVaultItemById(pendingVaultContext.vaultRowId, {
            status: 'CONFIRMED',
            category: pendingVaultContext.category,
            metadata_json: pendingVaultContext.metadata,
            confirmed_at: new Date().toISOString()
          }).catch((e) => console.error('[VAULT] Confirm update failed:', e.message));

          pendingVaultContext = null;
          await respondToTelegram('✅ Baik, Tuan. Metadata Vault dikonfirmasi dan disimpan.');

          return;
        }

        if (upper === 'EKSTRAK ULANG' || upper === 'EXTRACT ULANG' || upper === 'ULANGI') {
          try {
            const reExtracted = await extractVaultMetadataFromVision({
              fileId: pendingVaultContext.telegramFileId,
              fileName: pendingVaultContext.fileName,
              promptHint: 'Ekstrak ulang metadata dokumen ini. Fokus pada key-value yang paling akurat, lengkap, dan tidak redundan.'
            });
            pendingVaultContext.metadata = {
              ...(pendingVaultContext.metadata || {}),
              ...reExtracted,
              source: 'VISION_REEXTRACT'
            };
            pendingVaultContext.askedAt = Date.now();

            await respondToTelegram(
              `🧠 Ekstrak ulang selesai, Tuan. Ini draft metadata terbaru:\n` +
              `${escapeHtml(formatVaultMetadata(pendingVaultContext.metadata))}\n\n` +
              `Balas: <b>KONFIRM</b> / <b>EKSTRAK ULANG</b> / <b>EDIT key: value; key2: value2</b>`
            );



            return;
          } catch (e) {
            await respondToTelegram(`❌ Ekstrak ulang gagal: <code>${escapeHtml(e.message)}</code>`);

            return;
          }
        }

        const edits = parseVaultEditCommand(normalized);
        if (edits) {
          pendingVaultContext.metadata = { ...(pendingVaultContext.metadata || {}), ...edits, source: 'USER_EDIT' };
          if (edits.category) pendingVaultContext.category = String(edits.category).toUpperCase();
          pendingVaultContext.askedAt = Date.now();


          await respondToTelegram(
            `✅ Dicatat, Tuan. Draft metadata sekarang:\n${escapeHtml(formatVaultMetadata(pendingVaultContext.metadata))}\n\n` +
            `Balas: <b>KONFIRM</b> / <b>EKSTRAK ULANG</b> / <b>EDIT key: value; key2: value2</b>`
          );

          return;
        }
      } else {
        pendingVaultContext = null;
      }
    }

    // ============================================================
    // VAULT UPLOAD (Telegram media -> Google Drive -> Vision metadata -> Supabase index)
    // Triggered when caption/text contains "/vault" or "arsip"
    // ============================================================
    const isVaultTriggered = /(^|\s)(\/vault|arsip|arsipkan|vault)(\s|$)/i.test(vaultTriggerText);
    if (isVaultTriggered && (message.document || (message.photo && message.photo.length > 0))) {
      try {
        const fileId = message.document?.file_id || message.photo?.[message.photo.length - 1]?.file_id;
        const rawFileName = message.document?.file_name || `photo_${Date.now()}.jpg`;
        const mimeType = message.document?.mime_type || 'image/jpeg';

        let draftMeta = { judul: rawFileName, source: 'VISION_PENDING' };
        let finalFileName = rawFileName;

        if (/^image\//i.test(mimeType) && fileId) {
          try {
            draftMeta = await extractVaultMetadataFromVision({
              fileId,
              fileName: rawFileName,
              promptHint: 'Ekstrak metadata dokumen ini lengkap dalam key-value yang relevan sesuai jenis dokumen. Wajib keluarkan field "judul" dengan nama dokumen yang sangat spesifik dan representatif terhadap isi gambar.'
            });

            // Generate smart file name based on vision-extracted title
            if (draftMeta.judul && draftMeta.judul !== rawFileName) {
              const ext = rawFileName.includes('.') ? rawFileName.split('.').pop() : 'jpg';
              let safeJudul = draftMeta.judul.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_');
              if (safeJudul.length > 60) safeJudul = safeJudul.substring(0, 60);
              if (safeJudul.length > 0) finalFileName = `${safeJudul}_${Date.now()}.${ext}`;
            }
          } catch (e) {
            console.warn('[VAULT] Vision metadata extraction failed before upload:', e.message);
            draftMeta = {
              judul: rawFileName,
              catatan: 'Ekstraksi otomatis gagal. Gunakan EKSTRAK ULANG atau EDIT untuk menyempurnakan.',
              source: 'VISION_FAILED'
            };
          }
        } else {
          draftMeta = {
            judul: rawFileName,
            catatan: 'File non-gambar terdeteksi. Tambahkan metadata via EDIT.',
            source: 'MANUAL_REQUIRED'
          };
        }

        const { tmpFilePath } = await downloadTelegramFileToTemp(fileId, '');
        try {
          const uploaded = await googleWorkspace.uploadFileToVault({
            filePath: tmpFilePath,
            fileName: finalFileName,
            mimeType,
            folderId: env.GOOGLE_VAULT_FOLDER_ID
          });

          // Prefer vision category if available, fallback to regex trigger
          const category = draftMeta.kategori_gambar || (/ktp|kartu identitas|sim|paspor|passport/i.test(vaultTriggerText)
            ? 'IDENTITAS'
            : /surat|dokumen|pdf|legal/i.test(vaultTriggerText)
              ? 'DOKUMEN'
              : 'ARSIP');
          const saved = await supabaseMemories.saveVaultItem({
            drive_file_id: uploaded.id,
            drive_web_view_link: uploaded.webViewLink,
            file_name: uploaded.name || finalFileName,
            mime_type: uploaded.mimeType || mimeType,
            category,
            telegram_file_id: fileId,
            source: 'TELEGRAM',
            status: 'DRAFT',
            metadata_json: draftMeta,
            ocr_text: null
          }).catch((e) => {
            console.error('[VAULT] Supabase save failed:', e.message);
            return { success: false, row: null };
          });

          if (saved?.row?.id) {
            pendingVaultContext = {
              vaultRowId: saved.row.id,
              driveFileId: uploaded.id,
              driveLink: uploaded.webViewLink,
              fileName: uploaded.name || finalFileName,
              mimeType: uploaded.mimeType || mimeType,
              telegramFileId: fileId,
              category,
              metadata: draftMeta,
              askedAt: Date.now()
            };
          }


          await respondToTelegram(
            `✅ Tersimpan di Vault Drive (DRAFT).\n<b>Nama:</b> ${escapeHtml(finalFileName)}\n<b>Kategori (tebakan):</b> ${escapeHtml(category)}\n<b>Link:</b> ${uploaded.webViewLink || '(tidak tersedia)'}\n\n` +
            `<b>Draft metadata:</b>\n${escapeHtml(formatVaultMetadata(draftMeta))}\n\n` +
            `Balas salah satu:\n- <b>KONFIRM</b>\n- <b>EKSTRAK ULANG</b>\n- <b>EDIT key: value; key2: value2</b>`
          );
        } finally {
          try { if (fs.existsSync(tmpFilePath)) fs.unlinkSync(tmpFilePath); } catch (_) { }
        }


        return;
      } catch (e) {
        console.error('[VAULT] Upload failed:', e.message);
        await respondToTelegram(`❌ Gagal menyimpan ke Vault: <code>${escapeHtml(e.message)}</code>`);

        return;
      }
    }
    const getEmailReadLimitFromText = (text, fallback = 5) => {
      const normalized = String(text || '').toLowerCase().trim();
      if (!normalized) return fallback;
      if (/\b(satu|1)\b/.test(normalized) || /paling terbaru|terbaru saja|satu saja/.test(normalized)) {
        return 1;
      }
      const explicitNumber = normalized.match(/\b(\d{1,2})\b/);
      if (explicitNumber) {
        const n = parseInt(explicitNumber[1], 10);
        if (!isNaN(n) && n > 0) return Math.min(n, 10);
      }
      return fallback;
    };
    const parseEmailDateSafe = (rawDate) => {
      const raw = String(rawDate || '').trim();
      if (!raw) return null;

      // Common Bank format: "Thu, 7 May 2026 21:38:01 +0700 (WIB)"
      // Remove trailing parenthetical timezone label to improve JS Date parsing consistency.
      const cleaned = raw.replace(/\s*\([^)]+\)\s*$/, '');
      let parsed = new Date(cleaned);
      if (!isNaN(parsed.getTime())) return parsed;

      // Fallback: strip non-essential labels and retry.
      const hasWib = /\bWIB\b/i.test(cleaned);
      let strToParse = cleaned.replace(/\bWIB\b/gi, '').trim();
      if (hasWib && !strToParse.match(/[+-]\d{2,4}/)) {
        strToParse += ' +0700'; // Append correct offset if WIB was detected and no other offset exists
      }
      parsed = new Date(strToParse);
      if (!isNaN(parsed.getTime())) return parsed;

      return null;
    };
    const getJakartaDateOnly = (date) => {
      const d = parseEmailDateSafe(date);
      if (!d) return null;
      if (isNaN(d.getTime())) return null;
      const jakarta = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
      return `${jakarta.getFullYear()}-${String(jakarta.getMonth() + 1).padStart(2, '0')}-${String(jakarta.getDate()).padStart(2, '0')}`;
    };
    const getEmailTemporalFilterFromText = (text) => {
      const normalized = String(text || '').toLowerCase();
      if (!normalized) return null;
      if (/hari ini|today/.test(normalized)) return { type: 'today' };
      if (/kemarin|yesterday/.test(normalized)) return { type: 'yesterday' };
      if (/minggu lalu|last week/.test(normalized)) return { type: 'last_week' };
      return null;
    };
    const parseDayOfMonthHint = (text) => {
      const normalized = String(text || '').toLowerCase();
      if (!normalized) return null;
      const m = normalized.match(/\b(?:tgl|tanggal)\s*(\d{1,2})\b/);
      if (!m) return null;
      const day = parseInt(m[1], 10);
      if (isNaN(day) || day < 1 || day > 31) return null;
      return day;
    };
    const isEmailAnalyticsQuestion = (text) => {
      const normalized = String(text || '').toLowerCase().trim();
      if (!normalized) return false;
      return /(apakah|berapa|hanya|cuma|total|jumlah).*(kali|transaksi|email)|transaksi.*(tgl|tanggal)/.test(normalized);
    };
    const isEmailDateOnlyQuestion = (text) => {
      const normalized = String(text || '').toLowerCase().trim();
      if (!normalized) return false;
      return /^(pada\s+)?(tgl|tanggal)\s*\d{1,2}\??$/.test(normalized);
    };

    const extractNominalFromEmail = (email) => {
      const blob = `${email?.subject || ''}\n${email?.body || ''}\n${email?.snippet || ''}`;
      const nominalMatch = blob.match(/(?:nominal transaksi|jumlah transfer|nominal|rp)\s*(?:transaksi|transfer)?\s*rp?\s*([0-9][0-9\.\,]+)/i);
      if (!nominalMatch) return null;
      // AUDIT FIX (CRITICAL-2): Use robust IDR/USD-aware parser — mirrors Finance_Engine._parseFlexibleCurrency
      const { _parseFlexibleCurrency } = require("../../domain/Finance_Engine");
      const raw = String(nominalMatch[1]).trim();
      const nominal = _parseFlexibleCurrency(raw);
      return isNaN(nominal) || nominal <= 0 ? null : nominal;
    };
    const extractFinanceTransactionsFromEmails = (emails) => {
      const rows = [];
      for (const e of emails || []) {
        const blob = `${e.subject || ''}\n${e.body || ''}\n${e.snippet || ''}`;
        const nominal = extractNominalFromEmail(e);
        if (!nominal) continue;

        let destination = 'Auto-Sync Transaction';
        const merchantMatch = blob.match(/penerima\s+([a-z0-9\s\&\.\-]+)/i);
        if (merchantMatch?.[1]) {
          let rawDest = merchantMatch[1].split('\n')[0]; // Take only the first line
          rawDest = rawDest.replace(/&nbsp;/ig, ' ');
          rawDest = rawDest.replace(/&\w+;/g, ' '); // Strip other HTML entities
          rawDest = rawDest.replace(/\s*-?\s*ID\s+Tanggal.*$/i, ''); // Strip trailing ID Tanggal
          rawDest = rawDest.replace(/\s*-?\s*Tanggal.*$/i, ''); // Strip trailing Tanggal
          destination = rawDest.replace(/\s+/g, ' ').trim().substring(0, 80);
        }
        const parsedDate = parseEmailDateSafe(e.date);
        const dateIso = parsedDate ? parsedDate.toISOString() : new Date().toISOString();
        rows.push({
          nominal,
          type: 'EXPENSE',
          destination,
          category: null, // Let Finance_Engine AI auto-categorize based on destination
          description: `pengeluaran ke ${destination}`,
          time: dateIso
        });
      }
      return rows;
    };
    const filterEmailsByTemporalHint = (emails, temporalHint) => {
      if (!temporalHint || !emails || emails.length === 0) return emails || [];

      const nowJakarta = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
      const todayKey = `${nowJakarta.getFullYear()}-${String(nowJakarta.getMonth() + 1).padStart(2, '0')}-${String(nowJakarta.getDate()).padStart(2, '0')}`;
      const yesterdayDate = new Date(nowJakarta);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterdayKey = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getDate()).padStart(2, '0')}`;
      const weekAgoDate = new Date(nowJakarta);
      weekAgoDate.setDate(weekAgoDate.getDate() - 7);

      if (temporalHint.type === 'today') {
        return emails.filter((e) => getJakartaDateOnly(e.date) === todayKey);
      }
      if (temporalHint.type === 'yesterday') {
        return emails.filter((e) => getJakartaDateOnly(e.date) === yesterdayKey);
      }
      if (temporalHint.type === 'last_week') {
        return emails.filter((e) => {
          const d = parseEmailDateSafe(e.date);
          if (!d) return false;
          return !isNaN(d.getTime()) && d >= weekAgoDate && d <= nowJakarta;
        });
      }
      return emails;
    };
    const filterEmailsByDayOfMonth = (emails, dayOfMonth) => {
      if (!Array.isArray(emails) || !dayOfMonth) return emails || [];
      return emails.filter((e) => {
        const d = parseEmailDateSafe(e.date);
        if (!d) return false;
        if (isNaN(d.getTime())) return false;
        const jakarta = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
        return jakarta.getDate() === dayOfMonth;
      });
    };
    const toGmailDateLiteral = (dateObj) => {
      return `${dateObj.getFullYear()}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')}`;
    };
    const getJakartaNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const getTemporalGmailQuerySuffix = (temporalHint, dayHint) => {
      const nowJakarta = getJakartaNow();

      if (temporalHint?.type === 'today') {
        const start = new Date(nowJakarta); start.setHours(0, 0, 0, 0);
        const end = new Date(start); end.setDate(end.getDate() + 1);
        return ` after:${toGmailDateLiteral(start)} before:${toGmailDateLiteral(end)}`;
      }
      if (temporalHint?.type === 'yesterday') {
        const end = new Date(nowJakarta); end.setHours(0, 0, 0, 0);
        const start = new Date(end); start.setDate(start.getDate() - 1);
        return ` after:${toGmailDateLiteral(start)} before:${toGmailDateLiteral(end)}`;
      }
      if (temporalHint?.type === 'last_week') {
        const end = new Date(nowJakarta); end.setHours(23, 59, 59, 999);
        const start = new Date(nowJakarta); start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0);
        return ` after:${toGmailDateLiteral(start)} before:${toGmailDateLiteral(end)}`;
      }
      if (dayHint) {
        const start = new Date(nowJakarta.getFullYear(), nowJakarta.getMonth(), dayHint, 0, 0, 0, 0);
        const end = new Date(start); end.setDate(end.getDate() + 1);
        return ` after:${toGmailDateLiteral(start)} before:${toGmailDateLiteral(end)}`;
      }
      return '';
    };

    const isStopEmailFollowUp = (text) => {
      const normalized = String(text || '').toLowerCase().trim();
      if (!normalized) return false;
      return /^(oke|ok|baik|sip|siap)?\s*(cukup|sudah cukup|berhenti|stop|udah|sudahi)\s*!?$/.test(normalized);
    };
    const isEmailHistoryFollowUp = (text) => {
      const normalized = String(text || '').toLowerCase().trim();
      if (!normalized) return false;
      return /sebelum itu|sebelumnya|email sebelumnya|yang sebelum|prior|email di bawahnya|email tadi/.test(normalized);
    };
    const isGenericContinuation = (text) => {
      const normalized = String(text || '').toLowerCase().trim();
      if (!normalized) return false;
      return /^(lanjut|teruskan|yang tadi|yang itu|itu saja|lagi|next|berikutnya|lanjutkan)$/.test(normalized);
    };
    const isAmbiguousFollowUp = (text) => {
      const normalized = String(text || '').toLowerCase().trim();
      if (!normalized) return false;
      return /^(lanjut|teruskan|yang tadi|yang itu|itu|itu aja|itu saja|sebelumnya|sebelum itu|lagi|next|berikutnya|lanjutkan|hapus itu|ubah itu|edit itu)$/.test(normalized);
    };
    const hasStrongNewIntentCue = (text) => {
      const normalized = String(text || '').toLowerCase();
      if (!normalized) return false;
      return /(email|gmail|database|supabase|kalender|agenda|jadwal|task|tugas|keuangan|pengeluaran|pemasukan|search|cari|berita|dokumen|2nd brain|profil|identitas)/.test(normalized);
    };
    const normalizeKeywordCandidate = (text) => {
      const normalized = String(text || '').toLowerCase().trim();
      return normalized
        .replace(/^(hapus|delete|ubah|edit|update|ganti|selesaikan|complete)\s*/g, '')
        .replace(/^(itu|yang itu|yang tadi)\s*/g, '')
        .trim();
    };
    const buildGlobalFollowUpRouting = (text, ctx) => {
      if (!ctx || !ctx.intent) return null;
      if (Date.now() - (ctx.askedAt || 0) > 10 * 60 * 1000) return null;
      if (!isAmbiguousFollowUp(text) || hasStrongNewIntentCue(text)) return null;

      const normalized = String(text || '').toLowerCase().trim();
      const keyword = normalizeKeywordCandidate(normalized);
      const fallbackKeyword = ctx.extractedData?.search_keyword || ctx.extractedData?.summary || ctx.extractedData?.title || ctx.extractedData?.destination || ctx.extractedData?.content || '';
      const mergedKeyword = keyword || fallbackKeyword;

      if (ctx.intent === 'FINANCE') {
        if (/(hapus|delete)/.test(normalized)) {
          return { intent: 'FINANCE', extracted_data: { action: 'DELETE', search_keyword: mergedKeyword }, reply_message: '', god_mode_trigger: false };
        }
        if (/(ubah|edit|update|ganti)/.test(normalized)) {
          return { intent: 'FINANCE', extracted_data: { action: 'EDIT', search_keyword: mergedKeyword }, reply_message: '', god_mode_trigger: false };
        }
        return { intent: 'FINANCE', extracted_data: { action: 'READ_LATEST' }, reply_message: '', god_mode_trigger: false };
      }

      if (ctx.intent === 'TASK') {
        if (/(hapus|delete)/.test(normalized)) {
          return { intent: 'TASK', extracted_data: { action: 'DELETE', search_keyword: mergedKeyword }, reply_message: '', god_mode_trigger: false };
        }
        if (/(selesai|complete|done)/.test(normalized)) {
          return { intent: 'TASK', extracted_data: { action: 'COMPLETE', search_keyword: mergedKeyword }, reply_message: '', god_mode_trigger: false };
        }
        if (/(ubah|edit|update|ganti)/.test(normalized)) {
          return { intent: 'TASK', extracted_data: { action: 'EDIT', search_keyword: mergedKeyword }, reply_message: '', god_mode_trigger: false };
        }
        return { intent: 'TASK', extracted_data: { action: 'READ' }, reply_message: '', god_mode_trigger: false };
      }

      if (ctx.intent === 'CALENDAR') {
        if (/(hapus|delete)/.test(normalized)) {
          return { intent: 'CALENDAR', extracted_data: { action: 'DELETE', summary: mergedKeyword || ctx.extractedData?.summary }, reply_message: '', god_mode_trigger: false };
        }
        if (/(ubah|edit|update|ganti)/.test(normalized)) {
          return { intent: 'CALENDAR', extracted_data: { action: 'UPDATE', summary: mergedKeyword || ctx.extractedData?.summary }, reply_message: '', god_mode_trigger: false };
        }
        return { intent: 'CALENDAR', extracted_data: { action: 'READ' }, reply_message: '', god_mode_trigger: false };
      }

      if (ctx.intent === '2ND_BRAIN' || ctx.intent === 'USER_PROFILE' || ctx.intent === 'CORE_IDENTITY') {
        if (/(hapus|delete)/.test(normalized)) {
          return { intent: ctx.intent, extracted_data: { action: 'DELETE', search_keyword: mergedKeyword }, reply_message: '', god_mode_trigger: false };
        }
      }

      if (ctx.intent === 'WEB_SEARCH') {
        return {
          intent: 'WEB_SEARCH',
          extracted_data: {
            query: ctx.extractedData?.query || ctx.lastUserText || '',
            type: ctx.extractedData?.type || 'search'
          },
          reply_message: '',
          god_mode_trigger: false
        };
      }

      return null;
    };
    const getClarificationMessage = (routing, originalText) => {
      if (!routing || !routing.intent) return null;
      const data = routing.extracted_data || {};
      const intent = routing.intent;
      const lowerText = String(originalText || '').toLowerCase();

      if (intent === 'INCOMPLETE_INFO') {
        return routing.reply_message || '❓ Instruksi masih belum lengkap, Tuan. Mohon tambahkan detailnya.';
      }

      if (intent === 'FINANCE') {
        if (data.action === 'DELETE' || data.action === 'EDIT') {
          if (!data.search_keyword) {
            if (data.nominal) data.search_keyword = String(data.nominal);
            else if (data.destination) data.search_keyword = data.destination;
            else if (data.description) data.search_keyword = data.description;
            else {
              if (lowerText.split(' ').length <= 6) data.search_keyword = originalText;
            }
          }
          if (!data.search_keyword || /^(ini|itu|transaksi|kategori|kategoriny|kategorinya|perbaiki|ubah|sesuaikan|yang|saya|balas|\s)*$/i.test(String(data.search_keyword).trim())) {
            // [REPLY-AWARE SNIPER FIX v2] Jika user membalas pesan konfirmasi transaksi,
            // ekstrak keyword dari teks pesan yang di-reply secara langsung (full text),
            // bukan hanya dari snippet yang di-inject ke textInput (rentan terpotong).
            const rawReplyText = message && message.reply_to_message && message.reply_to_message.text
              ? message.reply_to_message.text
              : null;

            // Juga coba dari snippet yang sudah di-inject ke textInput (fallback)
            const injectedSnippetMatch = String(originalText).match(/\[(?:KONTEKS_AKSI|KONTEKS_REFERENSI)[^\]]*Menanggapi pesan N\.E\.X\.A:\s*"([\s\S]{0,800})"\]/);
            const snippetToSearch = rawReplyText || (injectedSnippetMatch && injectedSnippetMatch[1]) || '';

            if (snippetToSearch) {
              // Prioritas 1: Catatan/Deskripsi/Merchant (paling spesifik)
              const catatanMatch = snippetToSearch.match(/(?:Deskripsi|Catatan|Tujuan|Merchant)\s*:\s*([^\n\r,]{2,80})/i);
              // Prioritas 2: Format "Nominal (Rp): Rp5.000" → ekstrak angka
              const nominalLabelMatch = snippetToSearch.match(/Nominal\s*\([Rr][Pp]\)\s*:\s*[Rr][Pp][.\s]*([0-9][0-9.,]+)/i);
              // Prioritas 3: Rp-prefix di mana saja
              const nominalRpMatch = snippetToSearch.match(/[Rr][Pp]\.?\s*([0-9][0-9.,]+)/);

              if (catatanMatch && catatanMatch[1] && catatanMatch[1].trim().length > 1) {
                data.search_keyword = catatanMatch[1].trim();
              } else if (nominalLabelMatch && nominalLabelMatch[1]) {
                data.search_keyword = nominalLabelMatch[1].replace(/[^0-9]/g, '');
              } else if (nominalRpMatch && nominalRpMatch[1]) {
                data.search_keyword = nominalRpMatch[1].replace(/[^0-9]/g, '');
              } else {
                data.search_keyword = 'latest';
              }
            } else {
              return '❓ Transaksi mana yang ingin diubah/dihapus, Tuan? Sebutkan kata kunci unik, nominal, atau nomor transaksi.';
            }
          }
        }
        // Only block if action explicitly requires a nominal AND none was provided
        const splitEngine = require("../../domain/Split_Engine");
        const isSplitReplyOrIntent = /\bsplit\b|\bpecah\b|\brincian\b/i.test(originalText) ||
          splitEngine.isSplitIntent(originalText) ||
          (data.items && Array.isArray(data.items) && data.items.length > 0) ||
          (data.transactions && Array.isArray(data.transactions) && data.transactions.length > 0) ||
          data.is_split === true ||
          (message && message.reply_to_message);
        if (
          !isSplitReplyOrIntent &&
          data.action !== 'IMPORT_FROM_EMAIL' &&
          data.action !== 'READ_LATEST' &&
          data.action !== 'READ_ANALYTICS' &&
          data.action !== 'DELETE' &&
          data.action !== 'UNDO_DELETE' &&
          data.action !== 'CANCEL_TRANSACTION' &&
          data.action !== 'EDIT' &&
          data.action !== 'UPDATE_PENDING' &&
          data.action === 'RECORD' &&
          (isNaN(parseFloat(data.nominal)) || parseFloat(data.nominal) <= 0)
        ) {
          return '❓ Nominal transaksi belum valid. Mohon sebutkan angka positifnya, Tuan.';
        }

      }

      if (intent === 'CALENDAR' && data.action === 'CREATE') {
        if (!data.summary) return '❓ Nama agendanya apa, Tuan?';
        if (!data.start) return `❓ Jadwal "${escapeHtml(data.summary)}" dimulai kapan, Tuan?`;
      }

      if (intent === 'TASK') {
        if (data.action === 'CREATE' && !data.title) return '❓ Nama tugas yang ingin dibuat apa, Tuan?';
        if ((data.action === 'DELETE' || data.action === 'COMPLETE' || data.action === 'EDIT') && !data.search_keyword && !data.title) {
          return '❓ Tugas mana yang dimaksud, Tuan? Sebutkan kata kunci judul tugasnya.';
        }
      }

      if (intent === 'EMAIL') {
        if (data.action === 'SEND' && (!data.to || !data.subject || !data.content)) {
          return '❓ Untuk kirim email, mohon lengkapi penerima, subjek, dan isi emailnya, Tuan.';
        }
        if (data.action === 'DELETE' && !data.search_keyword) {
          return '❓ Email mana yang ingin dihapus, Tuan? Beri kata kunci subjek/pengirim.';
        }
      }

      if (intent === 'DATABASE') {
        const action = data.action || 'LIST_TABLES';
        if (action !== 'LIST_TABLES' && !data.table_name) {
          return '❓ Tabel Supabase mana yang dimaksud, Tuan?';
        }
        if (action === 'INSERT_ROW' && (!data.row_data || typeof data.row_data !== 'object')) {
          return `❓ Data yang ingin ditambahkan ke tabel <b>${escapeHtml(data.table_name || '(belum disebut)')}</b> apa, Tuan?`;
        }
        if (action === 'UPDATE_ROW' && (!data.update_data || typeof data.update_data !== 'object')) {
          return `❓ Data perubahan untuk tabel <b>${escapeHtml(data.table_name || '(belum disebut)')}</b> apa, Tuan?`;
        }
        if (action === 'DELETE_ALL_ROWS') {
          return null; // Bebaskan, biarkan execution block yang meminta konfirmasi atau biarkan AI Router menyampaikannya.
        }
        if ((action === 'UPDATE_ROW' || action === 'DELETE_ROW') && !data.row_id && !data.search_keyword) {
          return '❓ Baris mana yang ingin diubah/hapus, Tuan? Sertakan row id atau kata kunci pencarian.';
        }
      }

      if (intent === '2ND_BRAIN') {
        const action = data.action || 'READ';
        if ((action === 'EDIT' || action === 'DELETE') && !data.search_keyword) {
          return '❓ Arsip mana yang dimaksud, Tuan? Mohon beri kata kunci untuk mencari arsipnya.';
        }
        if ((action === 'APPEND' || action === 'EDIT') && !data.content) {
          return '❓ Konten arsip yang ingin disimpan/diubah belum ada, Tuan.';
        }
      }

      if (intent === 'USER_PROFILE' || intent === 'CORE_IDENTITY') {
        const action = data.action || (data.content ? 'APPEND' : 'READ');
        if (action === 'APPEND' && !data.content) {
          return '❓ Fakta/aturan yang ingin ditambahkan apa, Tuan?';
        }
        if (action === 'DELETE' && !data.search_keyword) {
          return '❓ Item mana yang ingin dihapus dari memori, Tuan?';
        }
      }

      if (intent === 'NORMAL_CHAT' && /(hapus|delete|ubah|edit|update)\s+(itu|yang tadi)/.test(lowerText) && conversationContext?.intent) {
        return `❓ Apakah maksud Tuan untuk <b>${conversationContext.intent}</b> pada item sebelumnya? Mohon konfirmasi singkat.`;
      }

      return null;
    };


    // ============================================================
    // VOICE NOTE PROCESSING
    // ============================================================
    if (message.voice) {
      try {
        console.log('[TELEGRAM] Voice note received. Transcribing (6-Tier God Mode)...');
        textInput = await voiceEngine.transcribeTelegramVoice(message.voice.file_id);
        console.log('[VOICE] Transcription result:', textInput);
      } catch (e) {
        console.error('[VOICE] All 6 Voice Tiers FAILED:', e.message);
        await respondToTelegram('⚠️ Maaf Tuan, seluruh 6 lapisan sistem pendengaran N.E.X.A (4x Groq Whisper + 2x Gemini Native Audio) gagal merespons. Mohon coba kirim ulang pesan suaranya dalam beberapa menit.');
        return;
      }
    }

    // ============================================================
    // IMAGE / VISION PROCESSING
    // ============================================================
    if (message.photo && message.photo.length > 0) {
      try {
        console.log('[TELEGRAM] Photo received. Processing (11-Tier God Mode Vision)...');
        const largestPhoto = message.photo[message.photo.length - 1];
        const visionDescription = await visionEngine.processTelegramImage(largestPhoto.file_id, message.caption || '');
        textInput = `[SISTEM PENGLIHATAN N.E.X.A TELAH MEMBACA GAMBAR]
Deskripsi Gambar: ${visionDescription}
Konteks/Caption dari Tuan Faqih: "${message.caption || '(Tidak ada caption)'}"

Instruksi untuk AI Router: Jika Tuan Faqih meminta sesuatu terkait gambar, gunakan 'Deskripsi Gambar' di atas sebagai matamu untuk menjawabnya secara natural.`;
        console.log('[VISION] Image analysis result formatted for Router.');
      } catch (e) {
        console.error('[VISION] All 11 Vision Tiers FAILED:', e.message);
        await respondToTelegram('⚠️ Maaf Tuan, seluruh 11 lapisan sistem penglihatan N.E.X.A (4x Gemini 2.5 + 4x Groq + 2x Gemini 2.0 + HuggingFace) gagal merespons. Semua provider AI sedang down secara bersamaan.');
        return;
      }
    } else if (message.caption && !textInput) {
      textInput = message.caption;
    }

    if (!textInput || textInput.trim() === '') {
      return;
    }

    console.log('[TELEGRAM] Received message:', textInput.substring(0, 100));

    // ============================================================
    // PENDING CALENDAR RESOLUTION — intercept follow-up duration reply
    // ============================================================
    if (pendingCalendarContext) {
      const agendaManager = require("../../domain/Agenda_Manager");
      const resolved = await agendaManager.tryResolvePending(textInput, pendingCalendarContext);
      if (resolved) {
        // Clear the pending context and cancel the 15-min timeout
        agendaManager.cancelPending(pendingCalendarContext.summary);
        pendingCalendarContext = null;

        if (resolved.status === 'CONFLICT_DETECTED') {
          // Store the conflicting event for user confirmation
          pendingConflictEvent = { ...resolved.pendingEvent, askedAt: Date.now() };
        }

        await respondToTelegram(resolved.message);
        if (resolved.status === 'SUCCESS') {
          setTimeout(async () => {
            try {
              const { executeWithFallback } = require("../../core/Fallback_Engine");
              const { NEXA_PERSONALITY } = require("../../config/personality");
              const prompt = `System Time (Asia/Jakarta): ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\nUser Asked: "${textInput}"\n\nCalendar Result:\n${resolved.message}\n\nTask: Write a 1-2 sentence friendly response IN INDONESIAN analyzing the newly added calendar event above. Act as a caring personal assistant. Provide a brief prep suggestion or encouragement. DO NOT repeat the confirmation text. Keep it concise, warm, and natural. DO NOT wrap your response in quotation marks or speech marks. Answer directly without quotes.`;
              const advice = await executeWithFallback(prompt, NEXA_PERSONALITY, 0.7, false);
              if (advice && !advice.includes('DUMB_MODE')) {
                await sendTelegramOutbound(stripSurroundingQuotes(advice));
              }
            } catch (err) { console.error('[CALENDAR PENDING] Advice failed:', err.message); }
          }, 1500);
        }

        return;
      }
    }

    // ============================================================
    // PENDING DELETION REPLY INTERCEPTOR (AI-Powered)
    // ============================================================
    const pendingDelCtx = financeEngine.getPendingDeletionsContext();
    if (pendingDelCtx) {
      // Extract context: what transaction is about to be deleted
      let delContext = 'hapus transaksi keuangan';
      try {
        const [firstEntry] = pendingDelCtx.values();
        if (firstEntry && firstEntry.rowData) {
          const r = firstEntry.rowData;
          delContext = `hapus transaksi "${r[6] || r[4] || '-'}" senilai Rp${Math.abs(r[7] || 0).toLocaleString('id-ID')}`;
        }
      } catch (_) {}

      const { classifyYesNo } = require("../../core/AI_Router");
      const verdict = await classifyYesNo(textInput, delContext);
      console.log(`[FINANCE INTERCEPTOR] AI deletion verdict: "${verdict}" for input: "${textInput}"`);

      if (verdict === 'YES') {
        const reply = await financeEngine.confirmDeleteTransaction(true);
        await respondToTelegram(reply || '✅ Transaksi telah dihapus.');

        return;
      } else if (verdict === 'NO') {
        const reply = await financeEngine.confirmDeleteTransaction(false);
        await respondToTelegram(reply || '✅ Penghapusan dibatalkan.');

        return;
      }
      // AMBIGUOUS — fall through to normal routing; don't act on unclear input
    }

    // ============================================================
    // [SPLIT] INTERCEPTOR: JAWABAN KEKURANGAN NOMINAL SPLIT
    // ============================================================
    const splitEngine = require("../../domain/Split_Engine");
    const chatIdStr = String(message.chat.id);
    if (splitEngine.hasPendingRemainder(chatIdStr) && textInput) {
      console.log(`[SPLIT] Menerima balasan keterangan untuk sisa nominal split dari chat ${chatIdStr}: "${textInput}"`);
      const remReplyMsg = await splitEngine.resolveRemainderReply(chatIdStr, textInput);
      if (remReplyMsg) {
        await respondToTelegram(remReplyMsg);
        return;
      }
    }

    // ============================================================
    // [SPLIT] TITIK 1: FOTO STRUK SAAT PENDING FINANCE
    // Jika user mengirim foto SAAT ada pending confirmation aktif,
    // intersep sebagai struk belanja untuk split — jangan kirim ke Vault.
    // ============================================================
    const pendingCountForSplit = financeEngine.getPendingConfirmationsCount
      ? financeEngine.getPendingConfirmationsCount()
      : 0;
    if (message.photo && message.photo.length > 0 && pendingCountForSplit > 0) {
      try {
        const splitEngine = require("../../domain/Split_Engine");
        const largestPhoto = message.photo[message.photo.length - 1];

        // Cari pending tx untuk dapat data induk (nominal, akun, tanggal)
        const pendingCtxForSplit = await financeEngine.getPendingConfirmationsContext();
        const firstPendingKey = pendingCtxForSplit ? Object.keys(pendingCtxForSplit)[0] : null;
        const firstPendingTx = firstPendingKey ? pendingCtxForSplit[firstPendingKey] : null;
        const totalNominalForSplit = firstPendingTx ? (firstPendingTx.nominal || null) : null;

        console.log(`[SPLIT] Foto struk diterima saat ada ${pendingCountForSplit} pending tx. Memproses sebagai struk split...`);
        const splitItems = await splitEngine.parseSplitFromImage(largestPhoto.file_id, totalNominalForSplit);

        if (splitItems && splitItems.length >= 2) {
          // Eksekusi split: hapus pending, insert N baris
          const dDate = firstPendingTx?.time ? new Date(firstPendingTx.time) : new Date();
          const baseTx = {
            type: firstPendingTx?.type || 'EXPENSE',
            account: firstPendingTx?.account || null,
            dateISO: firstPendingTx?.dateISO || dDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }),
            timeHHMM: firstPendingTx?.timeHHMM || (firstPendingTx?.time ? dDate.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }) : null),
            paymentMethod: firstPendingTx?.paymentMethod || firstPendingTx?.payment_method || null,
          };
          // Batalkan pending confirmation lama
          await financeEngine.confirmPendingTransactions(false, null, null, null, null, firstPendingKey);
          // Eksekusi split atau tanyakan jika ada kekurangan nominal (remainder)
          const storeName = firstPendingTx?.destination || 'Belanja';
          const splitMsg = await splitEngine.handleSplitWithRemainder(chatIdStr, splitItems, totalNominalForSplit, baseTx, storeName, null, respondToTelegram);
          await respondToTelegram(splitMsg);
          return;
        } else {
          console.log('[SPLIT] Struk tidak terdeteksi atau kurang dari 2 item. Lanjut ke Vision normal.');
          // Fall through ke IMAGE/VISION block normal
        }
      } catch (e) {
        console.error('[SPLIT] Error saat parse struk:', e.message);
        // Fall through ke IMAGE/VISION block normal
      }
    }

    // ============================================================
    // PENDING FINANCE REPLY INTERCEPTOR (AI-Powered)
    // Catches user replies aimed at a hanging Auto-Sync transaction
    // confirmation — BEFORE the AI Router gets a chance to
    // misinterpret them as a new RECORD intent.
    // Uses classifyPendingTransactionIntent() instead of rigid regex.
    // ============================================================
    const pendingFinanceCtx = await financeEngine.getPendingConfirmationsContext();
    if (pendingFinanceCtx) {
      // ── TARGETED REPLY RESOLUTION ──────────────────────────────────────────
      // When the user explicitly replies to one of N.E.X.A's confirmation messages,
      // extract the original message text snippet and resolve which pending transaction
      // the user is talking about (based on nominal amount in the original message).
      // This prevents the "blind loop" where answering Tx A accidentally updates Tx B.
      let targetKey = null;
      const replySnippet = message.reply_to_message && message.reply_to_message.text
        ? message.reply_to_message.text.substring(0, 500)
        : null;
      if (replySnippet) {
        targetKey = financeEngine.resolveTargetKeyFromSnippet(replySnippet);
        if (targetKey) {
          console.log(`[FINANCE INTERCEPTOR] Reply targeted to pending tx key: ${targetKey}`);
        }
      }

      // Build context for the AI classifier: use the targeted tx if resolved, otherwise first pending
      let pendingTxContext = {};
      try {
        const pendingRows = await supabaseMemories.getPendingTransactions();
        if (pendingRows && pendingRows.length > 0) {
          // If we resolved a target from the reply, find its row in Supabase for accurate context
          let contextRow = null;
          if (targetKey) {
            contextRow = pendingRows.find(r => r.composite_key === targetKey);
          }
          const rowData = (contextRow || pendingRows[0]).tx_data || {};
          pendingTxContext = { nominal: rowData.nominal, destination: rowData.destination, type: rowData.type };
        }
      } catch (_) {}

      const { classifyPendingTransactionIntent } = require("../../core/AI_Router");
      const parsedData = await classifyPendingTransactionIntent(textInput, pendingTxContext);
      const intent = parsedData.intent;
      console.log(`[FINANCE INTERCEPTOR] AI classified intent: "${intent}" for input: "${textInput}"`, parsedData.updates);

      if (intent === 'CONFIRM') {
        const confirmReply = await financeEngine.confirmPendingTransactions(true, null, null, null, null, targetKey);
        await respondToTelegram(confirmReply || '✅ Transaksi telah dicatat.');

        return;
      } else if (intent === 'CANCEL') {
        const cancelReply = await financeEngine.confirmPendingTransactions(false, null, null, null, null, targetKey);
        await respondToTelegram(cancelReply || '❌ Transaksi dibatalkan.');

        return;
      } else if (intent === 'UPDATE') {
        const up = parsedData.updates || {};
        const updatedMsg = await financeEngine.updatePendingTransaction(
          up.description || null,
          up.category || null,
          null, // nominal
          up.account || null,
          up.payment_method || null,
          targetKey
        );
        if (updatedMsg) {
          await respondToTelegram(updatedMsg);

          return;
        }
        // If updatePendingTransaction returned null (already auto-saved), fall through to normal routing
      } else {
        // [SPLIT] TITIK 2: TEKS/VOICE RINCIAN SPLIT SAAT PENDING
        // Sebelum menganggap ini AMBIGUOUS, cek dulu apakah user
        // sedang memberikan rincian split multi-item.
        const splitEngine = require("../../domain/Split_Engine");
        const rawInputForSplit = textInput || '';
        if (splitEngine.isSplitIntent(rawInputForSplit)) {
          try {
            // Ambil data pending yang menjadi target (nominal, akun, dll.)
            let targetPendingTx = null;
            try {
              const pendingRows = await supabaseMemories.getPendingTransactions();
              if (pendingRows && pendingRows.length > 0) {
                const contextRow = targetKey ? pendingRows.find(r => r.composite_key === targetKey) : null;
                targetPendingTx = (contextRow || pendingRows[0]).tx_data || null;
              }
            } catch (_) {}

            const totalNomForSplit = targetPendingTx?.nominal || null;
            const storeForSplit = targetPendingTx?.destination || '';
            console.log(`[SPLIT] Teks split terdeteksi saat pending. Total: ${totalNomForSplit}. Parsing...`);

            const splitItems = await splitEngine.parseSplitFromText(rawInputForSplit, totalNomForSplit, storeForSplit);
            if (splitItems && splitItems.length >= 2) {
              const dDate = targetPendingTx?.time ? new Date(targetPendingTx.time) : new Date();
              const baseTx = {
                type: targetPendingTx?.type || 'EXPENSE',
                account: targetPendingTx?.account || null,
                dateISO: targetPendingTx?.dateISO || dDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }),
                timeHHMM: targetPendingTx?.timeHHMM || (targetPendingTx?.time ? dDate.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }) : null),
                paymentMethod: targetPendingTx?.paymentMethod || targetPendingTx?.payment_method || null,
              };
              // Batalkan pending confirmation lama
              await financeEngine.confirmPendingTransactions(false, null, null, null, null, targetKey);
              // Eksekusi split atau tanyakan jika ada kekurangan nominal (remainder)
              const splitMsg = await splitEngine.handleSplitWithRemainder(chatIdStr, splitItems, totalNomForSplit, baseTx, storeForSplit, null, respondToTelegram);
              await respondToTelegram(splitMsg);
              return;
            }
          } catch (splitErr) {
            console.error('[SPLIT] Error saat parse teks split:', splitErr.message);
          }
        }

        // AMBIGUOUS — ask for clarification without touching the pending transaction
        await respondToTelegram(
          `❓ Masih ada transaksi yang menunggu konfirmasi Tuan. Balas:\n` +
          `• <b>ya / masukkan / catat</b> → simpan transaksi\n` +
          `• <b>batal</b> → batalkan transaksi\n` +
          `• <b>Kalimat deskripsi</b> → ubah catatan transaksi\n` +
          `• <b>Foto struk / rincian item</b> → pecah ke beberapa kategori (split)`
        );

        return;
      }
    }


    // ============================================================
    // PENDING TASK CATEGORY INTERCEPTOR (AI-Powered)
    // ============================================================
    const chatId = String(message.chat.id);
    if (taskManager.pendingTaskCategories.has(chatId)) {
      const pendingTask = taskManager.pendingTaskCategories.get(chatId);
      
      const normalized = textInput.toLowerCase().trim();
      // Hard cancel check first (AI is overkill for explicit "batal")
      if (normalized === 'batal' || normalized === 'batalkan' || normalized === 'cancel') {
        taskManager.cancelPendingTask(chatId);
        await respondToTelegram('🚫 Penambahan tugas dibatalkan.');

        return;
      }


      // ── HANDLER: User menjawab pertanyaan sinkronisasi kalender ──
      if (pendingTask.type === 'CONFIRM_SYNC') {
        const { classifyYesNo, callAI } = require("../../core/AI_Router");
        const syncContext = `sinkronisasi tugas "${pendingTask.title}" ke kalender`;
        const verdict = await classifyYesNo(textInput, syncContext);
        console.log(`[TASK SYNC INTERCEPTOR] AI verdict: "${verdict}" for input: "${textInput}"`);

        if (verdict === 'NO') {
          // User tidak mau sinkronisasi → buat floating task langsung
          if (pendingTask.timerId) clearTimeout(pendingTask.timerId);
          taskManager.pendingTaskCategories.delete(chatId);
          const floatResult = await taskManager.handleTaskIntent({
            action: 'CREATE',
            title: pendingTask.title,
            notes: pendingTask.notes,
            due_date: pendingTask.dueDate,
            list_name: pendingTask.listName,
            duration_minutes: pendingTask.durationMins,
            sync_calendar: false,
            calendar_start_time: null,
          }, null);
          if (floatResult && floatResult.message) {
            await respondToTelegram(floatResult.message);
            _triggerConversationalSynthesis(textInput, floatResult.message, 'CREATE');
          }
          return;
        }

        if (verdict === 'YES') {
          // User mau sinkronisasi → ekstrak waktu pengerjaan dari teks user
          if (pendingTask.timerId) clearTimeout(pendingTask.timerId);
          taskManager.pendingTaskCategories.delete(chatId);

          const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
          const extractPrompt = `Extract task START time from the user text as ISO 8601 with +07:00 offset. Today's ISO date: ${todayIso}. If no specific time is mentioned, reply ONLY_TIME_BLOCKING. Reply ONLY with the ISO string or ONLY_TIME_BLOCKING.\n\nUser text: "${textInput}"`;
          let calStartTime = null;
          try {
            const aiResp = await callAI(extractPrompt);
            const cleaned = aiResp.trim();
            if (cleaned !== 'ONLY_TIME_BLOCKING' && cleaned.includes('T') && (cleaned.includes('+') || cleaned.includes('Z'))) {
              calStartTime = cleaned;
            }
          } catch (e) {
            console.warn('[TASK SYNC INTERCEPTOR] Failed to extract calendar_start_time:', e.message);
          }

          // Ekstrak durasi dari teks user (default 60 menit)
          let durationMins = pendingTask.durationMins || 60;
          try {
            const durPrompt = `Extract task duration in minutes from the user text. Reply ONLY with an integer. If not mentioned, reply 0.\n\nUser text: "${textInput}"`;
            const durResp = await callAI(durPrompt);
            const parsedDur = parseInt(durResp.trim());
            if (!isNaN(parsedDur) && parsedDur > 0) durationMins = parsedDur;
          } catch (e) { /* pakai default */ }

          if (!pendingTask.dueDate && calStartTime) {
            pendingTask.dueDate = calStartTime.split('T')[0];
          }

          const syncResult = await taskManager.handleTaskIntent({
            action: 'CREATE',
            title: pendingTask.title,
            notes: pendingTask.notes,
            due_date: pendingTask.dueDate,
            list_name: pendingTask.listName,
            duration_minutes: durationMins,
            sync_calendar: true,
            calendar_start_time: calStartTime,
          }, null);
          if (syncResult && syncResult.message) {
            await respondToTelegram(syncResult.message);
            _triggerConversationalSynthesis(textInput, syncResult.message, 'CREATE');
          }
          return;
        }

        // AMBIGUOUS — Tanya kembali
        await respondToTelegram(`🤔 Maaf Tuan, saya kurang menangkap. Apakah tugas '<b>${escapeHtml(pendingTask.title)}</b>' ingin dijadwalkan di Kalender?\n\n• <b>Ya</b>, besok jam 8 malam\n• <b>Tidak</b>`);
        return;
      }

      if (pendingTask.type === 'CONFIRM_DURATION') {

        const { callAI } = require("../../core/AI_Router");
        const aiPrompt = `User replies: "${textInput}". Extract the intended duration in minutes. If no duration is mentioned, respond with "0".`;
        const aiResp = await callAI(aiPrompt);
        const parsed = parseInt(aiResp.trim());
        let durationMins = (!isNaN(parsed) && parsed > 0) ? parsed : 30; // fallback to 30 if unparseable
        
        pendingTask.durationMins = durationMins;
        
        // Calculate autonomous block here before executing
        if (pendingTask.dueDate) {
          const targetDateMs = new Date(pendingTask.dueDate.split('T')[0] + 'T00:00:00+07:00').getTime();
          const nowMs = Date.now();
          const timeMinIso = new Date(nowMs).toISOString();
          const timeMaxIso = new Date(Math.max(nowMs + 24 * 3600000, targetDateMs + 24 * 3600000 - 1)).toISOString();

          try {
            const { findEmptySlot } = require("../../infrastructure/Google_Workspace");
            const slot = await findEmptySlot(durationMins, timeMinIso, timeMaxIso);
            if (slot) {
              pendingTask.dueDate = slot.start; 
              const dueMs = new Date(pendingTask.dueDate);
              const h = dueMs.toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
              const timeLabel = `${h} WIB (Auto-Blocked)`;
              pendingTask.notes = pendingTask.notes ? `⏰ Jam: ${timeLabel}\n${pendingTask.notes}` : `⏰ Jam: ${timeLabel}`;
              pendingTask.hasAutonomousBlock = true;
            }
          } catch (e) {
            console.error('[AUTONOMOUS BLOCKING] Failed to find slot:', e.message);
          }
        }
        
        const resTask = await taskManager.executePendingTask(chatId, pendingTask.listName);
        if (resTask && resTask.message) {
          await respondToTelegram(resTask.message);
          _triggerConversationalSynthesis(textInput, resTask.message, 'CREATE');

          return;
        }
      } else {
        // CONFIRM_LIST logic
        const { classifyYesNo } = require("../../core/AI_Router");
        const taskTitle = pendingTask && pendingTask.title ? pendingTask.title : 'tugas baru';
        const suggestedList = pendingTask && pendingTask.listName ? pendingTask.listName : 'daftar tugas';
        const taskContext = `konfirmasi apakah tugas "${taskTitle}" dimasukkan ke list "${suggestedList}"`;

        const verdict = await classifyYesNo(textInput, taskContext);
        console.log(`[TASK INTERCEPTOR] AI verdict: "${verdict}" for input: "${textInput}"`);

        let overrideList = null;
        if (verdict === 'YES') {
          overrideList = null; // Use the suggested list
        } else if (verdict === 'NO') {
          overrideList = 'Tugas Saya'; // Default fallback list
        } else {
          // AMBIGUOUS — user likely typed a custom list name
          overrideList = textInput.trim();
        }

        const resTask = await taskManager.executePendingTask(chatId, overrideList);
        if (resTask && resTask.message) {
          await respondToTelegram(resTask.message);
          _triggerConversationalSynthesis(textInput, resTask.message, 'CREATE');

          return;
        }
      }
    }

    // ============================================================
    // PENDING CONFLICT CONFIRMATION — AI-Powered (intercept ya/batal)
    // ============================================================
    if (pendingConflictEvent && (Date.now() - (pendingConflictEvent.askedAt || 0)) < 10 * 60 * 1000) {
      const ev = pendingConflictEvent;
      const conflictContext = `tambahkan jadwal "${ev.summary}" walaupun ada bentrok jadwal lain`;
      const { classifyYesNo } = require("../../core/AI_Router");
      const verdict = await classifyYesNo(textInput, conflictContext);
      console.log(`[CALENDAR INTERCEPTOR] AI conflict verdict: "${verdict}" for input: "${textInput}"`);

      if (verdict === 'YES' || verdict === 'NO') {
        if (verdict === 'YES') {
          try {
            const result = await googleWorkspace.createCalendarEvent(
              ev.summary, ev.start, ev.end, ev.description || '',
              ev.location || '', ev.reminder_minutes || [], ev.recurrence || ''
            );
            let successMsg = `✅ Jadwal '<b>${ev.summary}</b>' berhasil ditambahkan (meskipun ada bentrok).`;
            if (ev.location) successMsg += `\n📍 Lokasi: ${ev.location}`;
            if (ev.recurrence) successMsg += `\n🔄 Dijadwalkan berulang.`;
            await respondToTelegram(successMsg);
          } catch (e) {
            await respondToTelegram(`❌ Gagal menambahkan jadwal: ${e.message}`);
          }
        } else {
          await respondToTelegram('🚫 Baik Tuan, penambahan jadwal dibatalkan karena ada bentrok.');
        }
        pendingConflictEvent = null;

        return;
      }
      // AMBIGUOUS — fall through to normal routing
    }

    // ============================================================
    // PENDING PROACTIVE TASKS CONFIRMATION — AI-Powered (intercept ya/buatkan)
    // ============================================================
    if (pendingProactiveTasks && (Date.now() - (pendingProactiveTasks.askedAt || 0)) < 15 * 60 * 1000) {
      const pTasks = pendingProactiveTasks;
      const proactiveContext = `buatkan tugas persiapan untuk agenda "${pTasks.summary}" (${(pTasks.tasks || []).join(', ')})`;
      const { classifyYesNo } = require("../../core/AI_Router");
      const verdict = await classifyYesNo(textInput, proactiveContext);
      console.log(`[PROACTIVE TASKS INTERCEPTOR] AI verdict: "${verdict}" for input: "${textInput}"`);

      if (verdict === 'YES' || verdict === 'NO') {
        if (verdict === 'YES') {
          try {
            let createdCount = 0;
            const createdNames = [];
            const targetDue = pTasks.start ? pTasks.start.split('T')[0] : new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
            for (const taskTitle of (pTasks.tasks || [])) {
              await taskManager.handleTaskIntent({
                action: 'CREATE',
                title: taskTitle,
                due_date: targetDue,
                notes: `Tugas persiapan proaktif untuk agenda: ${pTasks.summary}`,
                sync_calendar: false,
                calendar_start_time: null
              }, chatIdStr);
              createdCount++;
              createdNames.push(`'<b>${escapeHtml(taskTitle)}</b>'`);
            }
            const successText = `✅ Berhasil membuat <b>${createdCount} tugas persiapan</b> untuk agenda '<b>${escapeHtml(pTasks.summary)}</b>':\n${createdNames.join('\n')}`;
            await respondToTelegram(successText);
            _triggerConversationalSynthesis(textInput, successText, 'CREATE');
          } catch (e) {
            await respondToTelegram(`❌ Gagal membuat tugas persiapan: ${e.message}`);
          }
        } else {
          await respondToTelegram(`🚫 Baik Tuan, saran tugas persiapan untuk '<b>${escapeHtml(pTasks.summary)}</b>' dilewatkan.`);
        }
        pendingProactiveTasks = null;
        return;
      }
      // AMBIGUOUS — fall through to normal routing
    }

    // Email follow-up override: keep intent in EMAIL context to avoid misrouting to CALENDAR/NORMAL_CHAT
    let routingData;
    if (pendingEmailContext && isEmailHistoryFollowUp(textInput)) {
      routingData = {
        intent: 'EMAIL',
        extracted_data: {
          action: 'READ',
          search_keyword: pendingEmailContext.searchKeyword || '',
          max_results: 1,
          before_current: true
        },
        reply_message: '',
        god_mode_trigger: false
      };
      console.log('[ROUTER] Email follow-up context override activated.');
    } else if (
      pendingEmailContext &&
      isGenericContinuation(textInput) &&
      Date.now() - pendingEmailContext.askedAt < 10 * 60 * 1000
    ) {
      routingData = {
        intent: 'EMAIL',
        extracted_data: {
          action: 'READ',
          search_keyword: pendingEmailContext.searchKeyword || '',
          max_results: 1,
          before_current: true
        },
        reply_message: '',
        god_mode_trigger: false
      };
      console.log('[ROUTER] Generic continuation mapped to EMAIL follow-up.');
    } else {
      // FIX TEMUAN 2: Coba global follow-up dulu jika ada conversationContext,
      // tapi jika bukan perintah follow-up (return null), tetap kirim ke AI Router
      // dengan SEMUA runtimeHints lengkap — bukan hanya conversationContext saja.
      if (conversationContext) {
        const globalFollowUpRouting = buildGlobalFollowUpRouting(textInput, conversationContext);
        if (globalFollowUpRouting) {
          routingData = globalFollowUpRouting;
          console.log('[ROUTER] Global follow-up context override activated for intent:', routingData.intent);
        }
      }
      // Jika bukan follow-up yang dikenali (routingData masih undefined), kirim ke AI Router
      // dengan semua pending contexts agar AI Router tahu state runtime sistem saat ini.
      if (!routingData) {
        routingData = await aiRouter.routeUserMessage(textInput, {
          conversationContext,
          pendingCalendarContext,
          pendingEmailContext,
          pendingDatabaseContext,
          pendingVaultContext
        });
      }
    }
    console.log('[ROUTER] Intent identified:', routingData.intent);
    conversationContext = {
      intent: routingData.intent,
      extractedData: routingData.extracted_data || null,
      lastUserText: textInput,
      lastAssistantReply: conversationContext?.lastAssistantReply || '',
      askedAt: Date.now()
    };

    // [PHASE 6] Log perilaku interaksi user & fakta ke nexa_behavior_log
    const behaviorEngine = require("../../domain/Behavior_Engine");
    behaviorEngine.logUserInteraction(routingData.intent, textInput, routingData.mood || 'NEUTRAL').catch(() => {});
    if (routingData.mood && routingData.mood !== 'NEUTRAL') {
      behaviorEngine.logMood(routingData.mood, textInput).catch(() => {});
    }

    // [PHASE 8] Passive Background Learning (Auto-Extraction) — USER FACTS
    // Fakta tentang Tuan Faqih → disimpan ke nexa_user_profile (legacy) seperti biasa
    // Fakta tentang N.E.X.A    → DIALIHKAN senyap ke nexa_self_model (PHASE 8)
    if (routingData.learned_user_facts && Array.isArray(routingData.learned_user_facts) && routingData.learned_user_facts.length > 0) {
      const aiRouter = require("../../core/AI_Router");
      const supabaseMem = require("../../infrastructure/Supabase_Memories");
      for (const fact of routingData.learned_user_facts) {
        if (typeof fact === 'string' && fact.trim().length > 0) {
          // Safety guard: use smart scorer instead of rigid regex
          if (isFactAboutNexa(fact)) {
            // [PHASE 8] Reroute ke nexa_self_model (senyap, tanpa Telegram notification)
            console.log('[SELF-MODEL] Passive Learning → Self-Model (rerouted from user_facts):', fact.substring(0, 80));
            const selfKey = fact.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 50);
            const selfLayer = _classifySelfModelLayer(fact);
            supabaseMem.upsertSelfModelTrait(selfLayer, selfKey, fact, 'PASSIVE_LEARNING', fact).catch(() => {});
          } else {
            console.log('[ROUTER] Passive Learning - User Fact:', fact);
            await aiRouter.deduplicateAndSaveFact(fact, 'USER_PROFILE');
            behaviorEngine.logPassiveLearning(fact, 'USER_PROFILE').catch(() => {});
          }
        }
      }
      invalidatePersonalFactsCache();
    }

    // [PHASE 8] Passive Background Learning — CORE IDENTITY (dari AI Router explicit extraction)
    // Semua learned_core_identities dialihkan ke nexa_self_model (senyap)
    if (routingData.learned_core_identities && Array.isArray(routingData.learned_core_identities) && routingData.learned_core_identities.length > 0) {
      const supabaseMem = require("../../infrastructure/Supabase_Memories");
      for (const fact of routingData.learned_core_identities) {
        if (typeof fact === 'string' && fact.trim().length > 0) {
          console.log('[SELF-MODEL] Passive Learning → Self-Model (from learned_core_identities):', fact.substring(0, 80));
          const selfKey = fact.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 50);
          const selfLayer = _classifySelfModelLayer(fact);
          supabaseMem.upsertSelfModelTrait(selfLayer, selfKey, fact, 'PASSIVE_LEARNING', fact).catch(() => {});
        }
      }
      // invalidatePersonalFactsCache() tidak diperlukan karena self_model tidak di-cache dengan personalFacts
    }

    // [PHASE 7 — M2] Stated-vs-Revealed Reconciler + Decision Journal
    // Fire-and-forget: tidak memblokir respons webhook
    if (textInput && textInput.length >= 10) {
      const intentionEngine = require("../../domain/Intention_Engine");
      intentionEngine.detectAndSaveIntention(textInput, routingData).catch(() => {});

      // Deteksi keputusan penting untuk intent yang relevan
      const DECISION_INTENTS = new Set(['FINANCE', 'DISCIPLINE', 'CALENDAR', 'ADVICE', 'NORMAL_CHAT']);
      if (DECISION_INTENTS.has(String(routingData.intent || '').toUpperCase())) {
        // Ambil emotional state dari mood yang terdeteksi jika ada
        const detectedMood = routingData.detected_mood || 'NEUTRAL';
        intentionEngine.detectAndSaveDecision(textInput, routingData, detectedMood).catch(() => {});
      }
    }

    // [PHASE 7 — M4] Anticipatory Engine — JARVIS-level Proactive Intervention
    // Fire-and-forget: tidak memblokir respons webhook sama sekali.
    // Memeriksa apakah konteks saat ini mengaktifkan pola negatif yang diketahui.
    {
      const anticipatoryEngine = require("../../domain/Anticipatory_Engine");

      // Bangun konteks untuk anticipation pass
      // Jam Jakarta (UTC+7)
      const jakartaHour = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })
      ).getHours();

      // [BUG FIX #3] Hitung session advice count secara riil.
      const currentChatId = message?.chat?.id || 'default';
      const currentIntent = String(routingData.intent || 'NORMAL_CHAT').toUpperCase();
      const sessionAdviceCount = currentIntent === 'ADVICE'
        ? _trackAdviceSession(currentChatId)
        : _getAdviceSessionCount(currentChatId);

      // Jalankan anticipation check secara async (ambil mood context & run check bersamaan)
      (async () => {
        try {
          const moodCtx = await anticipatoryEngine.getLatestMoodContext();
          await anticipatoryEngine.runAnticipationPass({
            intent:            routingData.intent || 'NORMAL_CHAT',
            mood:              routingData.detected_mood || 'NEUTRAL',
            hour:              jakartaHour,
            mood_7d_trend:     moodCtx.mood_7d_trend,
            mood_7d_variance:  moodCtx.mood_7d_variance,
            sessionAdviceCount // [BUG FIX #3] Nilai riil dari session counter, bukan hardcoded 0
          });

        } catch (_) {}
      })();
    }

    // Execute Domain Logic based on Intent
    let domainReply = null;

    // [SPLIT] TITIK 3 (UNIVERSAL PRIORITY): PERINTAH SPLIT PADA TRANSAKSI EXISTING (via reply to bot receipt)
    const isReplyToBotReceipt = message.reply_to_message &&
      message.reply_to_message.from &&
      message.reply_to_message.from.is_bot === true &&
      /(?:Nominal|Berhasil mencatat|Pengeluaran|Pemasukan)/i.test(message.reply_to_message.text || '');

    if (routingData.intent === 'FINANCE' && isReplyToBotReceipt) {
      const splitEngine = require("../../domain/Split_Engine");
      const isSplitCmd = /\bsplit\b|\bpecah\b|\brincian\b/i.test(textInput);
      if (isSplitCmd) {
        try {
          const replyTxt = message.reply_to_message.text || '';
          let kw = 'latest';
          const catatanMatch = replyTxt.match(/(?:Deskripsi|Catatan|Tujuan|Merchant)\s*:\s*([^\n\r,]{2,80})/i);
          const nominalLabelMatch = replyTxt.match(/Nominal\s*\([Rr][Pp]\)\s*:\s*[Rr][Pp][.\s]*([0-9][0-9.,]+)/i);
          const nominalRpMatch = replyTxt.match(/[Rr][Pp]\.?\s*([0-9][0-9.,]+)/);
          if (catatanMatch && catatanMatch[1] && catatanMatch[1].trim().length > 1) {
            kw = catatanMatch[1].trim();
          } else if (nominalLabelMatch && nominalLabelMatch[1]) {
            kw = nominalLabelMatch[1].replace(/[^0-9]/g, '');
          } else if (nominalRpMatch && nominalRpMatch[1]) {
            kw = nominalRpMatch[1].replace(/[^0-9]/g, '');
          }

          const existingRows = await require("../../infrastructure/Supabase_Finance").readTransactions({ limit: 50 });
          const Finance_Engine_module = require("../../domain/Finance_Engine");
          const matchIndex = Finance_Engine_module._findBestTransactionMatch
            ? Finance_Engine_module._findBestTransactionMatch(existingRows, kw)
            : -1;

          if (matchIndex !== -1) {
            const targetTx = existingRows[matchIndex];
            const nomMatch = replyTxt.match(/[Rr][Pp][.\s]*([0-9][0-9.,]+)/);
            const totalNomForSplit = nomMatch ? Number(nomMatch[1].replace(/[^0-9]/g, '')) : Math.abs(targetTx.amount || 0);

            console.log(`[SPLIT] Universal priority split on existing tx: ${targetTx.id}, total: ${totalNomForSplit}`);
            const splitItems = await splitEngine.parseSplitFromText(textInput, totalNomForSplit, targetTx.description || '');

            if (splitItems && splitItems.length >= 2) {
              const baseTx = {
                type: targetTx.type || 'expense',
                account: targetTx.accounts?.name || null,
                dateISO: targetTx.transaction_date,
                timeHHMM: targetTx.transaction_time ? targetTx.transaction_time.slice(0, 5) : null,
                paymentMethod: targetTx.payment_method || null,
              };
              domainReply = await splitEngine.handleSplitWithRemainder(chatId, splitItems, totalNomForSplit, baseTx, targetTx.description || '', targetTx.id, respondToTelegram);
            }
          }
        } catch (splitErr) {
          console.error('[SPLIT] Error universal priority split existing tx:', splitErr.message);
        }
      }
    }

    // [SPLIT] TITIK 4: UNIVERSAL TEXT SPLIT INTERCEPTOR
    // Dipindahkan ke atas sebelum clarification message agar split selalu dievaluasi duluan
    // jika terdeteksi dari is_split (AI Router) atau isSplitIntent (RegEx).
    if (routingData.intent === 'FINANCE' && !domainReply && routingData.extracted_data && (
      routingData.extracted_data.is_split === true ||
      require("../../domain/Split_Engine").isSplitIntent(textInput)
    )) {
      const splitEngine = require("../../domain/Split_Engine");
      const ed = routingData.extracted_data;
      const isAiSplit = ed.is_split === true && Array.isArray(ed.items) && ed.items.length >= 2;
      try {
        const nowJakarta = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
        const timeNow = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
        const baseTx = {
          type: ed.type || 'EXPENSE',
          account: ed.account || null,
          dateISO: ed.time ? ed.time.substring(0, 10) : nowJakarta,
          timeHHMM: ed.time ? ed.time.substring(11, 16) : timeNow,
          paymentMethod: ed.payment_method || null,
        };
        const storeName = ed.store_name || ed.destination || '';
        let itemsToSplit = isAiSplit ? ed.items : null;

        console.log(`[SPLIT] TITIK 4 Intercepted! isAiSplit: ${isAiSplit}`);
        if (!itemsToSplit || itemsToSplit.length < 2) {
          itemsToSplit = await splitEngine.parseSplitFromText(textInput, ed.total_nominal || ed.nominal || null, storeName);
        }

        if (itemsToSplit && itemsToSplit.length >= 2) {
          let totalNom = ed.total_nominal || null;
          if (!totalNom) {
            const totMatch = textInput.match(/([0-9]+[.,]?[0-9]*)\s*(?:rb|ribu|k|000)\b/i);
            if (totMatch) {
              let rawNum = parseFloat(totMatch[1].replace(',', '.'));
              totalNom = rawNum < 1000 ? rawNum * 1000 : rawNum;
            } else {
              totalNom = itemsToSplit.reduce((s, i) => s + (i.nominal || 0), 0);
            }
          }
          const chatIdStr = String(message.chat.id);
          const handleSplitResult = await splitEngine.handleSplitWithRemainder(chatIdStr, itemsToSplit, totalNom, baseTx, storeName, null, respondToTelegram);
          
          // BUG 6 FIX: Jika handleSplitResult mereturn pesan pertanyaan remainder, kita set ke domainReply.
          // Jika handleSplitResult mereturn konfirmasi, kita set ke domainReply.
          domainReply = handleSplitResult;
          console.log(`[SPLIT] Universal text split processed for ${itemsToSplit.length} items (source: ${isAiSplit ? 'AI_Router' : 'TextParser'}).`);
        } else {
          console.log(`[SPLIT] Gagal mengekstrak >=2 items dari text. Fallback ke routing normal.`);
        }
      } catch (splitErr) {
        console.error('[SPLIT] Error saat universal text split:', splitErr.message);
      }
    }

    if (!domainReply) {
      const clarificationMessage = getClarificationMessage(routingData, textInput);
      if (clarificationMessage) {
        domainReply = clarificationMessage;
      } else switch (routingData.intent) {
        case 'FINANCE':

        if (routingData.extracted_data && routingData.extracted_data.action === 'IMPORT_FROM_EMAIL') {
          const gmailClient = require("../../infrastructure/Gmail_Client");
          const candidateEmails = pendingEmailContext?.lastBatch?.length
            ? pendingEmailContext.lastBatch
            : await gmailClient.getLatestEmails('livin OR from:noreply.livin@bankmandiri.co.id', 30);
          const temporalHint = getEmailTemporalFilterFromText(textInput);
          const dayHint = parseDayOfMonthHint(textInput);
          let scopedEmails = filterEmailsByTemporalHint(candidateEmails, temporalHint);
          if (dayHint) scopedEmails = filterEmailsByDayOfMonth(scopedEmails, dayHint);
          const txRows = extractFinanceTransactionsFromEmails(scopedEmails);

          if (txRows.length === 0) {
            domainReply = '📭 Data transaksi keuangan otomatis tidak ditemukan di email yang dianalisis. Coba sebutkan rentang waktu yang lebih jelas, Tuan.';
            break;
          }

          let success = 0;
          let duplicate = 0;
          for (const tx of txRows.slice(0, 20)) {
            try {
              const result = await financeEngine.processTransaction(tx, 'GMAIL_POLLING');
              if (result?.status === 'DUPLICATE') duplicate += 1;
              else success += 1;
            } catch (_) {
              // Skip failed row and continue
            }
          }
          domainReply = `✅ Sinkronisasi Keuangan selesai.\n- Berhasil dicatat: <b>${success}</b>\n- Duplikasi diabaikan: <b>${duplicate}</b>\n- Sumber dianalisis: <b>${txRows.length}</b> transaksi email`;
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'READ_LATEST') {
          const ed = routingData.extracted_data;
          // Use precise search if any filter is present
          const hasFilter = ed.date_text || ed.search_keyword || ed.type || ed.category;
          let recentData;
          if (hasFilter) {
            recentData = await financeEngine.searchTransactions({
              date_text: ed.date_text || ed.time || null,
              keyword:   ed.search_keyword || null,
              type:      ed.type        || null,
              category:  ed.category    || null,
              limit:     ed.limit       || 30
            });
          } else {
            recentData = await financeEngine.getRecentTransactions(5);
          }
          domainReply = recentData;
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'READ_ANALYTICS') {
          const analyticsData = await financeEngine.getFinanceAnalytics(routingData.extracted_data.date_text);
          domainReply = (routingData.reply_message ? routingData.reply_message + '\n\n' : '') + analyticsData;
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'DELETE') {
          const result = await financeEngine.deleteTransaction(routingData.extracted_data.search_keyword);
          domainReply = result.message;
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'UNDO_DELETE') {
          const result = await financeEngine.undoDeleteTransaction();
          domainReply = result.message;
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'CONFIRM_TRANSACTION') {
          const replySnippetFin = message.reply_to_message && message.reply_to_message.text
            ? message.reply_to_message.text.substring(0, 500)
            : null;
          const targetKeyFin = replySnippetFin ? financeEngine.resolveTargetKeyFromSnippet(replySnippetFin) : null;
          const confirmationReply = await financeEngine.confirmPendingTransactions(
            true,
            routingData.extracted_data.description || null,
            routingData.extracted_data.category || null,
            null,
            null,
            targetKeyFin
          );
          if (confirmationReply) {
            domainReply = confirmationReply;
          } else {
            domainReply = '✅ Tidak ada transaksi yang tertunda. Kemungkinan transaksi telah disimpan otomatis karena melewati batas waktu 5 menit. Jika ingin mengubahnya, silakan gunakan perintah Edit (contoh: "Ubah transaksi 50rb menjadi...").';
          }
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'UPDATE_PENDING') {
          const replySnippetUpd = message.reply_to_message && message.reply_to_message.text
            ? message.reply_to_message.text.substring(0, 500)
            : null;
          const targetKeyUpd = replySnippetUpd ? financeEngine.resolveTargetKeyFromSnippet(replySnippetUpd) : null;
          const updatedMsg = await financeEngine.updatePendingTransaction(
            routingData.extracted_data.description || null,
            routingData.extracted_data.category || null,
            routingData.extracted_data.nominal || null,
            routingData.extracted_data.account || null,
            routingData.extracted_data.payment_method || null,
            targetKeyUpd
          );
          if (updatedMsg) {
            domainReply = updatedMsg;
          } else {
            domainReply = '❌ Tidak ada transaksi yang tertunda untuk diubah. Kemungkinan transaksi telah disimpan otomatis. Silakan gunakan perintah Edit dengan menyebut nominal (contoh: "Edit transaksi 50rb menjadi...").';
          }
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'CANCEL_TRANSACTION') {
          const replySnippetCan = message.reply_to_message && message.reply_to_message.text
            ? message.reply_to_message.text.substring(0, 500)
            : null;
          const targetKeyCan = replySnippetCan ? financeEngine.resolveTargetKeyFromSnippet(replySnippetCan) : null;
          const confirmationReply = await financeEngine.confirmPendingTransactions(false, null, null, null, null, targetKeyCan);
          domainReply = confirmationReply || 'Tidak ada transaksi yang tertunda.';
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'EDIT') {
          let kw = routingData.extracted_data.search_keyword;
          // [SNIPER FIX v2] Jika keyword kosong/vague, ekstrak langsung dari teks pesan
          // yang di-reply (full text, bukan snippet yang bisa terpotong).
          if (!kw || /^(ini|itu|transaksi|kategori|kategoriny|kategorinya|perbaiki|ubah|sesuaikan|yang|saya|balas|\s)*$/i.test(String(kw).trim())) {
            const replyTxt = message.reply_to_message && message.reply_to_message.text
              ? message.reply_to_message.text
              : null;
            if (replyTxt) {
              // Prioritas 1: Field Deskripsi/Catatan (paling unik & spesifik)
              const catatanMatch = replyTxt.match(/(?:Deskripsi|Catatan|Tujuan|Merchant)\s*:\s*([^\n\r,]{2,80})/i);
              // Prioritas 2: Format khas pesan sinkronisasi "Nominal (Rp): Rp5.000"
              const nominalLabelMatch = replyTxt.match(/Nominal\s*\([Rr][Pp]\)\s*:\s*[Rr][Pp][.\s]*([0-9][0-9.,]+)/i);
              // Prioritas 3: Rp-prefix generik di mana saja
              const nominalRpMatch = replyTxt.match(/[Rr][Pp]\.?\s*([0-9][0-9.,]+)/);
              if (catatanMatch && catatanMatch[1] && catatanMatch[1].trim().length > 1) {
                kw = catatanMatch[1].trim();
              } else if (nominalLabelMatch && nominalLabelMatch[1]) {
                kw = nominalLabelMatch[1].replace(/[^0-9]/g, '');
              } else if (nominalRpMatch && nominalRpMatch[1]) {
                kw = nominalRpMatch[1].replace(/[^0-9]/g, '');
              } else {
                kw = 'latest';
              }
            }
          }

          const result = await financeEngine.editTransaction(
            kw,
            routingData.extracted_data.nominal,
            routingData.extracted_data.description || routingData.extracted_data.destination,
            routingData.extracted_data.category,
            routingData.extracted_data.account,
            routingData.extracted_data.payment_method
          );
          domainReply = result.message;
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'CATEGORY_BREAKDOWN') {
          domainReply = await financeEngine.getCategoryInsight(routingData.extracted_data.date_text || null);
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'PERIOD_COMPARISON') {
          domainReply = await financeEngine.getPeriodComparisonReport(routingData.extracted_data.date_text || null);
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'TOP_EXPENSES') {
          const topLimit = routingData.extracted_data.limit || 5;
          domainReply = await financeEngine.getTopExpensesReport(routingData.extracted_data.date_text || null, topLimit);
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'ACCOUNT_BALANCES') {
          domainReply = await financeEngine.getAccountBalancesReport();
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'DAILY_TREND') {
          domainReply = await financeEngine.getDailyTrendReport(routingData.extracted_data.date_text || null);
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'SMART_SUMMARY') {
          domainReply = await financeEngine.getSmartFinanceSummary(routingData.extracted_data.date_text || null);
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'MONTHLY_SUMMARY') {
          domainReply = await financeEngine.getMonthlySummaryReport();
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'SAVING_RATE') {
          domainReply = await financeEngine.getSavingRateReport(routingData.extracted_data.date_text || null);
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'BALANCE_TREND') {
          domainReply = await financeEngine.getDailyBalanceTrendReport(routingData.extracted_data.date_text || null);
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'RECORD_MULTIPLE' && Array.isArray(routingData.extracted_data.transactions)) {
          let replies = [];
          for (const tx of routingData.extracted_data.transactions) {
            const txData = {
              nominal: tx.nominal,
              type: tx.type || 'EXPENSE',
              destination: tx.destination || tx.merchant || 'Unknown',
              category: tx.category || 'Uncategorized',
              description: tx.description || '-',
              time: tx.time || new Date().toISOString(),
              account: tx.account || null,
              payment_method: tx.payment_method || null
            };
            const confirmMsg = await financeEngine.requestTransactionConfirmation(txData, 'PENCATATAN KEUANGAN BARU');
            if (confirmMsg) {
              replies.push(confirmMsg);
              const cleanMerch = (txData.destination || txData.merchant || 'Unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
              const cKey = `${txData.nominal}_${cleanMerch}`;
              supabaseMemories.markPendingTransactionSent(cKey).catch(() => { });
            } else {
              replies.push(`⚠️ Transaksi ${txData.nominal} ke ${txData.destination} tampaknya sudah dicatat atau tertunda.`);
            }
          }
          domainReply = replies.join('\n\n---\n\n');
        } else if (routingData.extracted_data && (routingData.extracted_data.nominal || routingData.extracted_data.action === 'RECORD')) {

          const txData = {
            nominal: routingData.extracted_data.nominal,
            type: routingData.extracted_data.type || 'EXPENSE',
            destination: routingData.extracted_data.destination || routingData.extracted_data.merchant || 'Unknown',
            category: routingData.extracted_data.category || 'Uncategorized',
            description: routingData.extracted_data.description || '-',
            time: routingData.extracted_data.time || new Date().toISOString(),
            account: routingData.extracted_data.account || null,
            payment_method: routingData.extracted_data.payment_method || null
          };
          const confirmMsg = await financeEngine.requestTransactionConfirmation(txData, 'PENCATATAN KEUANGAN BARU');
          if (confirmMsg) {
            domainReply = confirmMsg;
            const cleanMerch = (txData.destination || txData.merchant || 'Unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
            const cKey = `${txData.nominal}_${cleanMerch}`;
            supabaseMemories.markPendingTransactionSent(cKey).catch(() => { });
          } else {
            domainReply = '⚠️ Transaksi ini tampaknya sudah pernah dicatat sebelumnya (duplikat) atau sedang menunggu konfirmasi.';
          }
        }
        break;

      case 'DISCIPLINE':
        if (routingData.god_mode_trigger) {
          await godMode.triggerGodMode(3, { source: 'Telegram Instruction' });
        }
        break;

      case 'CALENDAR':
        if (routingData.extracted_data) {
          const agendaManager = require("../../domain/Agenda_Manager");
          // AI Router nests calendar data under 'CALENDAR' key — unwrap it for Agenda_Manager
          const calData = routingData.extracted_data.CALENDAR || routingData.extracted_data;

          // Sanitize hallucinated summary for READ actions
          if (calData.summary && typeof calData.summary === 'string' && ['READ', 'READ_TODAY', 'READ_TOMORROW', 'READ_UPCOMING'].includes(calData.action)) {
            const sLower = calData.summary.trim().toLowerCase();
            if (sLower.length > 25 || /adalah|tidak ada|jadwal|tugas|jatuh tempo|hari besok|hari ini|minggu ini|senin|selasa|rabu|kamis|jumat|sabtu|minggu|juli|agustus|januari|februari|maret|april|mei|juni|september|oktober|november|desember|202[0-9]/i.test(sLower)) {
              console.warn(`[WEBHOOK] Hallucinated READ summary ignored: "${calData.summary}"`);
              calData.summary = null;
            }
          }

          // If there's a pending calendar and the current CREATE has an end time + matching summary, merge!
          if (pendingCalendarContext && calData.action === 'CREATE' && calData.end && !calData.summary) {
            calData.summary = pendingCalendarContext.summary;
            calData.start = pendingCalendarContext.start;
            agendaManager.cancelPending(pendingCalendarContext.summary);
            pendingCalendarContext = null;
          }

          const calResult = await agendaManager.handleCalendarIntent(calData, textInput);

          if (calResult && calResult.status === 'PENDING_END') {
            pendingCalendarContext = { summary: calData.summary, start: calData.start, askedAt: Date.now() };
          } else if (calResult && calResult.status === 'CONFLICT_DETECTED') {
            // Store the conflicting event for user confirmation
            pendingConflictEvent = { ...calResult.pendingEvent, askedAt: Date.now() };
          } else if (calResult && calResult.status === 'SUCCESS') {
            pendingCalendarContext = null;
            pendingConflictEvent = null;
          }

          if (calResult && calResult.proactiveTasks && calResult.proactiveTasks.tasks && calResult.proactiveTasks.tasks.length > 0) {
            pendingProactiveTasks = { summary: calResult.proactiveTasks.summary, tasks: calResult.proactiveTasks.tasks, start: calData.start || null, askedAt: Date.now() };
          }

          if (calResult && calResult.message) {
            domainReply = calResult.message;
            
            // Add a friendly follow-up message only for present/future queries
            const action = calData.action;
            let isPast = false;
            
            if (calData.start) {
              const reqDate = new Date(calData.start);
              const jakartaDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
              const todayJakartaStart = new Date(`${jakartaDateStr}T00:00:00+07:00`);
              if (reqDate < todayJakartaStart) {
                isPast = true;
              }
            }
            
            if (!isPast && ['CREATE', 'UPDATE', 'READ', 'READ_TODAY', 'READ_TOMORROW', 'READ_UPCOMING'].includes(action)) {
              _triggerConversationalSynthesis(textInput, calResult.message, action);
            }
          }
        }
        break;

      case 'TASK':
        if (routingData.extracted_data) {
          const chatId = String(message.chat.id);
          const taskResult = await taskManager.handleTaskIntent(routingData.extracted_data, chatId);
          if (taskResult && taskResult.status === 'PENDING_CONFIRM') {
            // Set up 5-minute auto-confirm timer
            const { pendingTaskCategories, executePendingTask } = taskManager;
            const pendingId = chatId || 'default';
            // Clear any old pending for this chat
            const old = pendingTaskCategories.get(pendingId);
            if (old && old.timerId) clearTimeout(old.timerId);

            const timerId = setTimeout(async () => {
              if (pendingTaskCategories.has(pendingId)) {
                try {
                  const res = await executePendingTask(pendingId);
                  if (res && res.message) {
                    await sendTelegramOutbound(res.message + '\n\n<i>(Dikategorikan otomatis karena tidak ada konfirmasi dalam 5 menit)</i>');
                  }
                } catch (e) { console.error('[TASK] Auto-confirm failed:', e.message); }
              }
            }, 5 * 60 * 1000);

            pendingTaskCategories.set(pendingId, {
              type: 'CONFIRM_LIST',
              title: taskResult.title,
              notes: taskResult.notes,
              dueDate: taskResult.due_date,
              listName: taskResult.pendingListName,
              durationMins: taskResult.durationMins,
              hasAutonomousBlock: taskResult.hasAutonomousBlock,
              // BUG #1 FIX: simpan konteks sinkronisasi kalender agar tidak hilang
              syncCalendar: taskResult.sync_calendar || false,
              calendarStartTime: taskResult.calendar_start_time || null,
              timerId,
              chatId: pendingId
            });

            domainReply = `📋 Tugas '<b>${taskResult.title}</b>' akan saya masukkan ke list <b>${taskResult.pendingListName}</b>.\n\nKonfirmasi? Balas:\n• <b>ya</b> — masukkan sekarang\n• <b>nama list lain</b> — pindah ke list tersebut\n• <b>tidak</b> — masukkan ke Tugas Saya\n\n<i>⏱️ Auto-masuk dalam 5 menit jika tidak ada respons.</i>`;
          } else if (taskResult && taskResult.status === 'PENDING_DURATION') {
            // Set up 5-minute timer to create WITHOUT autonomous block
            const { pendingTaskCategories, executePendingTask } = taskManager;
            const pendingId = chatId || 'default';
            const old = pendingTaskCategories.get(pendingId);
            if (old && old.timerId) clearTimeout(old.timerId);

            const timerId = setTimeout(async () => {
              if (pendingTaskCategories.has(pendingId)) {
                try {
                  const res = await executePendingTask(pendingId);
                  if (res && res.message) {
                    await sendTelegramOutbound(res.message);
                  }
                } catch (e) { console.error('[TASK] Auto-create without block failed:', e.message); }
              }
            }, 5 * 60 * 1000);

            pendingTaskCategories.set(pendingId, {
              type: 'CONFIRM_DURATION',
              title: taskResult.title,
              notes: taskResult.notes,
              dueDate: taskResult.due_date,
              listName: taskResult.list_name,
              durationMins: 0,
              hasAutonomousBlock: false,
              timerId,
              chatId: pendingId
            });

            domainReply = taskResult.message;
          } else if (taskResult && taskResult.status === 'PENDING_SYNC_CONFIRM') {
            // ── Set up 5-minute timer — auto-create as floating task if no response ──
            const { pendingTaskCategories } = taskManager;
            const pendingId = chatId || 'default';
            const old = pendingTaskCategories.get(pendingId);
            if (old && old.timerId) clearTimeout(old.timerId);

            const timerId = setTimeout(async () => {
              if (pendingTaskCategories.has(pendingId)) {
                try {
                  // Timeout → buat floating task tanpa sinkronisasi kalender
                  const pd = pendingTaskCategories.get(pendingId);
                  pendingTaskCategories.delete(pendingId);
                  const floatRes = await taskManager.handleTaskIntent({
                    action: 'CREATE',
                    title: pd.title,
                    notes: pd.notes,
                    due_date: pd.dueDate,
                    list_name: pd.listName,
                    duration_minutes: pd.durationMins,
                    sync_calendar: false,
                    calendar_start_time: null,
                  }, null);
                  if (floatRes && floatRes.message) {
                    await sendTelegramOutbound(floatRes.message + '\n\n<i>(Tugas disimpan tanpa sinkronisasi kalender karena tidak ada respons dalam 5 menit)</i>');
                  }
                } catch (e) { console.error('[TASK SYNC] Auto-create floating failed:', e.message); }
              }
            }, 5 * 60 * 1000);

            pendingTaskCategories.set(pendingId, {
              type: 'CONFIRM_SYNC',
              title: taskResult.title,
              notes: taskResult.notes,
              dueDate: taskResult.due_date,
              listName: taskResult.list_name,
              durationMins: taskResult.duration_minutes || 60,
              timerId,
              chatId: pendingId
            });

            domainReply = taskResult.message;
          } else if (taskResult && taskResult.message) {
            domainReply = taskResult.message;

            // Add conversational advice / synthesis for CREATE, READ and COMPLETE actions
            const action = routingData.extracted_data.action;
            if (['CREATE', 'CREATE_SUBTASK', 'READ', 'READ_TODAY', 'READ_TOMORROW', 'READ_UPCOMING', 'READ_OVERDUE', 'READ_LISTS', 'COMPLETE'].includes(action)) {
              _triggerConversationalSynthesis(textInput, taskResult.message, action);
            }
          }
        }
        break;

      case 'WEB_SEARCH': {
        const searchData = routingData.extracted_data || {};
        const query = searchData.query || textInput;
        const searchType = searchData.type || 'search';
        console.log(`[SEARCH] Searching web: "${query}" [type: ${searchType}]`);
        const searchResult = await webSearch.searchWeb(query, searchType);

        console.log('[SEARCH] Synthesizing response with AI...');
        const prompt = `Sebagai N.E.X.A, asisten AI pribadi Tuan Faqih Hidayatulloh, Anda baru saja melakukan penelusuran web untuk menjawab pernyataannya.
        
Pernyataan/Pertanyaan Tuan Faqih: "${textInput}"

Hasil Penelusuran Web:
${searchResult}

Tugas: Jawablah Tuan Faqih secara natural, cerdas, dan luwes berdasarkan hasil penelusuran di atas. Berikan jawaban yang informatif seolah Anda sedang berdiskusi. Jangan sekadar menyalin ulang hasil pencariannya. Berikan kesimpulan atau opini jika relevan.`;

        const synthesizedReply = await aiRouter.callAI(prompt);
        domainReply = synthesizedReply;
        break;
      }


      case '2ND_BRAIN':
        if (routingData.extracted_data) {
          const factType = routingData.extracted_data.type || 'IDEA';
          const brainAction = routingData.extracted_data.action || 'APPEND';
          const googleWorkspace = require("../../infrastructure/Google_Workspace");

          if (brainAction === 'READ') {
            const docContent = await googleWorkspace.readIdeaDoc();
            domainReply = `📖 *Isi Arsip 2nd Brain:*\n\n${docContent.substring(0, 3000)}${docContent.length > 3000 ? '\n\n...(terpotong)' : ''}`;
          } else if (brainAction === 'EDIT') {
            const vaultRes = await supabaseMemories.editIdeaInVault(
              routingData.extracted_data.search_keyword,
              routingData.extracted_data.content
            ).catch(e => console.error('[2ND_BRAIN] Supabase edit error:', e));

            let docsSuccess = false;
            if (vaultRes && vaultRes.success && vaultRes.editedRows && vaultRes.editedRows.length > 0) {
              for (const row of vaultRes.editedRows) {
                docsSuccess = await googleWorkspace.editIdeaDoc(row.content, routingData.extracted_data.content);
              }
            } else {
              // Fallback
              docsSuccess = await googleWorkspace.editIdeaDoc(routingData.extracted_data.search_keyword, routingData.extracted_data.content);
            }

            invalidatePersonalFactsCache();
            domainReply = (vaultRes?.success || docsSuccess) ? `✅ Arsip berhasil diubah di Database (dan sinkronisasi Docs).` : `❌ Gagal menemukan/mengubah arsip.`;
          } else if (brainAction === 'DELETE') {
            const vaultRes = await supabaseMemories.deleteIdeaFromVault(
              routingData.extracted_data.search_keyword
            ).catch(e => console.error('[2ND_BRAIN] Supabase delete error:', e));

            let docsSuccess = false;
            if (vaultRes && vaultRes.success && vaultRes.deletedRows && vaultRes.deletedRows.length > 0) {
              for (const row of vaultRes.deletedRows) {
                docsSuccess = await googleWorkspace.deleteIdeaDoc(row.content);
              }
            } else {
              docsSuccess = await googleWorkspace.deleteIdeaDoc(routingData.extracted_data.search_keyword);
            }

            invalidatePersonalFactsCache();
            domainReply = (vaultRes?.success || docsSuccess) ? `🗑️ Arsip berhasil dihapus dari Database (dan sinkronisasi Docs).` : `❌ Gagal menemukan/menghapus arsip.`;
          } else if (routingData.extracted_data.content) { // APPEND
            await supabaseMemories.saveIdeaToVault(
              routingData.extracted_data.content
            ).catch(e => console.error('[2ND_BRAIN] Supabase vault save error:', e));

            const docUrl = await googleWorkspace.appendToIdeaDoc(
              routingData.extracted_data.title || 'Ideation N.E.X.A',
              routingData.extracted_data.content,
              'IDEA'
            ).catch(e => { console.error('[2ND_BRAIN] Google Doc error:', e); return null; });

            if (docUrl) {
              domainReply = `✅ Ide berhasil disimpan ke arsip dan Google Docs:\n${docUrl}`;
            }
            console.log(`[2ND_BRAIN] Saved IDEA to Supabase and Google Docs.`);
          }
        }
        break;

      case 'USER_PROFILE': {
        const _formatMemoryReply = (aiReply, fallbackText, badgeText) => {
          const base = (aiReply && typeof aiReply === 'string' && aiReply.trim().length > 3)
            ? aiReply.trim()
            : fallbackText;
          return `${base}\n\n${badgeText}`;
        };

        if (routingData.extracted_data) {
          const action = routingData.extracted_data.action || (routingData.extracted_data.content ? 'APPEND' : 'READ');
          if (action === 'APPEND' && routingData.extracted_data.content) {
            const aiRouter = require("../../core/AI_Router");
            const content = routingData.extracted_data.content;
            if (isFactAboutNexa(content)) {
              console.log('[ROUTER] USER_PROFILE redirected to CORE_IDENTITY for fact about N.E.X.A:', content);
              const saved = await aiRouter.deduplicateAndSaveFact(content, 'CORE_IDENTITY');
              invalidatePersonalFactsCache();
              domainReply = _formatMemoryReply(
                routingData.reply_message,
                saved ? `Baik Tuan Faqih, fakta mengenai diri saya (N.E.X.A) telah saya pelajari dan saya tanamkan ke memori inti.` : `Tentu Tuan Faqih, hal mengenai diri saya tersebut memang sudah tersimpan di dalam memori inti saya.`,
                saved ? `✅ <i>Tersimpan di Memori Inti N.E.X.A</i>` : `ℹ️ <i>Sudah Tercatat di Memori Inti</i>`
              );
            } else {
              const saved = await aiRouter.deduplicateAndSaveFact(content, 'USER_PROFILE');
              invalidatePersonalFactsCache();
              domainReply = _formatMemoryReply(
                routingData.reply_message,
                saved ? `Siap Tuan Faqih, informasi tersebut sudah saya catat dan simpan ke dalam profil personal Anda.` : `Tentu Tuan Faqih, fakta tersebut memang sudah ada di dalam catatan profil Anda sebelumnya.`,
                saved ? `✅ <i>Tersimpan di Memori Personal</i>` : `ℹ️ <i>Sudah Tercatat di Memori Personal</i>`
              );
            }
          } else if (action === 'DELETE' && routingData.extracted_data.search_keyword) {
            const success = await supabaseMemories.deleteFromUserProfile(routingData.extracted_data.search_keyword);
            invalidatePersonalFactsCache();
            domainReply = _formatMemoryReply(
              routingData.reply_message,
              success ? `Baik Tuan Faqih, catatan personal terkait hal tersebut telah saya hapus dari database profil Anda.` : `Maaf Tuan Faqih, saya tidak menemukan catatan terkait hal tersebut di memori profil Anda.`,
              success ? `🗑️ <i>Dihapus dari Memori Personal</i>` : `❌ <i>Fakta Tidak Ditemukan</i>`
            );
          } else if (action === 'READ') {
            const keyword = routingData.extracted_data.search_keyword || textInput;
            const facts = await supabaseMemories.getPersonalFacts();
            const aiRouter = require("../../core/AI_Router");
            const relevantFacts = facts.userProfile ? aiRouter.selectUserProfileFacts(facts.userProfile, textInput) : [];
            const relevantVault = (facts.vaultItems && aiRouter.selectVaultFacts) ? aiRouter.selectVaultFacts(facts.vaultItems, textInput) : [];
            
            if (relevantFacts.length > 0 || relevantVault.length > 0) {
              const list = [
                ...relevantFacts.map(f => `- [USER PROFILE] ${f}`),
                ...relevantVault.map(f => `- [VAULT DOKUMEN/ARSIP] ${f}`)
              ].join('\n');
              const prompt = `FILTERED PERMANENT FACTS & VAULT DOCUMENTS ABOUT TUAN FAQIH:\n${list}\n\nUSER ASKED: "${keyword}"\n\nTASK: Answer the user's question accurately using ONLY the relevant facts and vault document metadata above. If the answer (such as birth place, NIK, birth date, name, address) is found in the VAULT DOKUMEN/ARSIP metadata, answer clearly and proudly citing that it is recorded in their vaulted documents. Summarize them into a warm, natural narrative from an assistant's perspective. Do NOT use bullet points unless requested. CRITICAL RULE: ALWAYS address and refer to the user as "Tuan" or "Tuan Faqih". NEVER address or refer to the user as "Bapak", "Mas", or "Anda". MUST answer in fluent, elegant Indonesian.`;
              domainReply = await aiRouter.callAI(prompt);
            } else {
              domainReply = `🧠 Saat ini saya belum memiliki catatan fakta personal permanen maupun arsip di Vault terkait hal tersebut, Tuan Faqih.`;
            }
          }
        }
        break;
      }

      case 'CORE_IDENTITY': {
        const _formatMemoryReply = (aiReply, fallbackText, badgeText) => {
          const base = (aiReply && typeof aiReply === 'string' && aiReply.trim().length > 3)
            ? aiReply.trim()
            : fallbackText;
          return `${base}\n\n${badgeText}`;
        };

        if (routingData.extracted_data) {
          const action = routingData.extracted_data.action || (routingData.extracted_data.content ? 'APPEND' : 'READ');
          if (action === 'APPEND' && routingData.extracted_data.content) {
            const aiRouter = require("../../core/AI_Router");
            const saved = await aiRouter.deduplicateAndSaveFact(routingData.extracted_data.content, 'CORE_IDENTITY');
            invalidatePersonalFactsCache();
            domainReply = _formatMemoryReply(
              routingData.reply_message,
              saved ? `Dimengerti Tuan Faqih, aturan identitas dan pedoman perilaku utama N.E.X.A telah saya perbarui.` : `Tentu Tuan Faqih, pedoman tersebut sudah ada di memori identitas inti saya.`,
              saved ? `✅ <i>Tersimpan di Memori Inti N.E.X.A</i>` : `ℹ️ <i>Sudah Tercatat di Memori Inti</i>`
            );
          } else if (action === 'DELETE' && routingData.extracted_data.search_keyword) {
            const success = await supabaseMemories.deleteFromCoreIdentity(routingData.extracted_data.search_keyword);
            invalidatePersonalFactsCache();
            domainReply = _formatMemoryReply(
              routingData.reply_message,
              success ? `Baik Tuan Faqih, aturan identitas terkait telah saya hapus dari memori inti.` : `Maaf Tuan Faqih, aturan tersebut tidak ditemukan di sistem memori inti.`,
              success ? `🗑️ <i>Dihapus dari Memori Inti N.E.X.A</i>` : `❌ <i>Aturan Tidak Ditemukan</i>`
            );
          } else if (action === 'READ') {

             const keyword = routingData.extracted_data.search_keyword || textInput;
             const facts = await supabaseMemories.getPersonalFacts();
             if (facts.coreIdentity && facts.coreIdentity.length > 0) {
                const aiRouter = require("../../core/AI_Router");
                const relevantIdentity = aiRouter.selectCoreIdentityFacts(facts.coreIdentity, textInput);
                const list = relevantIdentity.map(f => `- ${f}`).join('\n');
                const prompt = `FILTERED N.E.X.A CORE IDENTITIES & RULES:\n${list}\n\nUSER ASKED: "${keyword}"\n\nTASK: Answer the user gracefully and authoritatively based on your identity rules above. If it's a casual greeting, respond naturally as an assistant. Do NOT ask the user to specify aspects unless they requested the full list. CRITICAL RULE: ALWAYS address and refer to the user as "Tuan" or "Tuan Faqih". NEVER address or refer to the user as "Bapak", "Mas", or "Anda". MUST answer in fluent, elegant Indonesian.`;
                domainReply = await aiRouter.callAI(prompt);
             } else {
                domainReply = `🤖 Saat ini tidak ada aturan identitas inti khusus yang diterapkan.`;
             }
          }
        }
        break;
      }



      case 'EMAIL':
        const gmailClient = require("../../infrastructure/Gmail_Client");
        if (routingData.extracted_data) {
          const action = routingData.extracted_data.action;
          if (action === 'READ') {
            if (isStopEmailFollowUp(textInput)) {
              pendingEmailContext = null;
              domainReply = '✅ Siap, saya hentikan pembacaan email dulu. Kalau perlu lanjut, tinggal bilang.';
              break;
            }

            const dayHint = parseDayOfMonthHint(textInput);
            const shouldRunEmailAnalytics =
              isEmailAnalyticsQuestion(textInput) ||
              isEmailDateOnlyQuestion(textInput) ||
              (dayHint && Boolean(pendingEmailContext?.lastBatch?.length));

            if (shouldRunEmailAnalytics) {
              const searchKeywordForAnalytics = routingData.extracted_data.search_keyword || pendingEmailContext?.searchKeyword || 'keuangan';
              const temporalHintForAnalytics = getEmailTemporalFilterFromText(textInput);
              const temporalQuerySuffixForAnalytics = getTemporalGmailQuerySuffix(temporalHintForAnalytics, dayHint);
              const analyticsQuery = `${searchKeywordForAnalytics}${temporalQuerySuffixForAnalytics}`;
              const sourceBatch = pendingEmailContext?.lastBatch?.length
                ? pendingEmailContext.lastBatch
                : await gmailClient.getLatestEmails(analyticsQuery, 50);
              const scoped = dayHint
                ? filterEmailsByDayOfMonth(sourceBatch, dayHint)
                : sourceBatch;
              const total = scoped.length;
              if (dayHint) {
                domainReply = total <= 0
                  ? `📭 Saya tidak menemukan transaksi/email keuangan pada tanggal <b>${dayHint}</b> di batch email terakhir.`
                  : `📊 Pada tanggal <b>${dayHint}</b>, terdeteksi <b>${total}</b> transaksi/email keuangan di batch yang saya analisis.`;
              } else {
                domainReply = `📊 Dari batch email terakhir, saya menemukan <b>${total}</b> email transaksi keuangan yang relevan.`;
              }
              pendingEmailContext = {
                searchKeyword: searchKeywordForAnalytics,
                lastLimit: pendingEmailContext?.lastLimit || 5,
                cursorIndex: pendingEmailContext?.cursorIndex || 0,
                lastBatch: sourceBatch.slice(0, 50),
                askedAt: Date.now()
              };
              break;
            }

            const requestedLimitRaw = routingData.extracted_data.max_results;
            const requestedLimit = parseInt(requestedLimitRaw, 10);
            const maxResults = (!isNaN(requestedLimit) && requestedLimit > 0)
              ? Math.min(requestedLimit, 10)
              : getEmailReadLimitFromText(textInput, 5);
            const temporalHint = getEmailTemporalFilterFromText(textInput);
            const dayHintForRead = parseDayOfMonthHint(textInput);

            const followUpPrevious = Boolean(routingData.extracted_data.before_current);
            const searchKeyword = routingData.extracted_data.search_keyword || '';
            const baseQuery = searchKeyword || 'livin OR from:noreply.livin@bankmandiri.co.id';
            const temporalQuerySuffix = getTemporalGmailQuerySuffix(temporalHint, dayHintForRead);
            const queryWithTemporalWindow = `${baseQuery}${temporalQuerySuffix}`;
            let emails = [];
            let contextCursorIndex = 0;
            let candidateEmailsForContext = [];

            if (followUpPrevious && pendingEmailContext) {
              const fullBatch = await gmailClient.getLatestEmails(searchKeyword || pendingEmailContext.searchKeyword || baseQuery, 20);
              candidateEmailsForContext = fullBatch;
              const nextCursor = (pendingEmailContext.cursorIndex || 0) + 1;
              if (nextCursor < fullBatch.length) {
                emails = [fullBatch[nextCursor]];
                contextCursorIndex = nextCursor;
              } else {
                emails = [];
              }
            } else {
              // Pull a wider batch first (already windowed by Gmail query when temporal hint exists).
              const candidateEmails = await gmailClient.getLatestEmails(queryWithTemporalWindow, Math.max(maxResults, 20));
              candidateEmailsForContext = candidateEmails;
              let filteredEmails = filterEmailsByTemporalHint(candidateEmails, temporalHint);
              if (dayHintForRead) filteredEmails = filterEmailsByDayOfMonth(filteredEmails, dayHintForRead);
              emails = filteredEmails.slice(0, maxResults);
            }

            if (emails.length === 0) {
              if (temporalHint?.type === 'yesterday') {
                domainReply = '📭 Tidak ada email yang cocok untuk <b>hari kemarin</b>.';
              } else if (temporalHint?.type === 'today') {
                domainReply = '📭 Tidak ada email yang cocok untuk <b>hari ini</b>.';
              } else {
                domainReply = "Kotak masuk kosong atau tidak ada email yang cocok dengan pencarian.";
              }
            } else {
              const escapeHTML = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              domainReply = `📧 <b>Email Terbaru Anda (${emails.length}):</b>\n\n` + emails.map(e => {
                const parsedNominal = extractNominalFromEmail(e);
                const nominalLine = parsedNominal
                  ? `\n<b>Nominal:</b> Rp${parsedNominal.toLocaleString('id-ID')}`
                  : '';
                return `[${escapeHTML(e.date)}]\n<b>Dari:</b> ${escapeHTML(e.from)}\n<b>Subjek:</b> ${escapeHTML(e.subject)}${nominalLine}\n<b>Snippet:</b> <i>${escapeHTML(e.snippet)}</i>\n`;
              }).join('\n---\n');
              pendingEmailContext = {
                searchKeyword,
                lastLimit: maxResults,
                cursorIndex: contextCursorIndex,
                lastBatch: candidateEmailsForContext.slice(0, 50),
                askedAt: Date.now()
              };
            }
          } else if (action === 'SEND') {
            const success = await gmailClient.sendEmail(
              routingData.extracted_data.to,
              routingData.extracted_data.subject,
              routingData.extracted_data.content
            );
            pendingEmailContext = null;
            domainReply = success ? `✅ Email berhasil dikirim ke ${routingData.extracted_data.to}.` : `❌ Gagal mengirim email.`;
          } else if (action === 'DELETE') {
            const emails = await gmailClient.getLatestEmails(routingData.extracted_data.search_keyword, 1);
            if (emails.length > 0) {
              const success = await gmailClient.deleteEmail(emails[0].id);
              domainReply = success ? `🗑️ Email dengan subjek "${emails[0].subject}" berhasil dihapus.` : `❌ Gagal menghapus email.`;
            } else {
              domainReply = `Tidak ditemukan email dengan kata kunci tersebut untuk dihapus.`;
            }
            pendingEmailContext = null;
          }
        }
        break;

      case 'DATABASE': {
        const dbData = routingData.extracted_data || {};
        const dbAction = dbData.action || 'LIST_TABLES';
        const tableName = dbData.table_name;

        if (!tableName && dbAction !== 'LIST_TABLES') {
          domainReply = `❓ Tabel Supabase mana yang ingin Anda kelola?\nPilih salah satu:\n- nexa_chat_memories\n- nexa_finance_dedup\n- nexa_user_profile\n- nexa_core_identity\n- nexa_2nd_brain`;
          pendingDatabaseContext = { tableName: '', lastAction: dbAction, askedAt: Date.now() };
          break;
        }

        if (dbAction === 'LIST_TABLES') {
          const overview = await supabaseMemories.getDatabaseOverview();
          if (!overview.success) {
            domainReply = `❌ Gagal membaca overview database: ${escapeHtml(overview.error)}`;
            break;
          }
          const lines = overview.tables.map((t) => {
            const info = overview.counts[t];
            if (info?.error) return `- <b>${t}</b>: error (${escapeHtml(info.error)})`;
            return `- <b>${t}</b>: ${info?.count || 0} baris`;
          });
          domainReply = `🗄️ <b>Overview Supabase (5 tabel N.E.X.A):</b>\n${lines.join('\n')}\n\nBalas dengan aksi jelas, misalnya:\n- "baca nexa_core_identity 5 data"\n- "tambah nexa_user_profile: aku suka teh"\n- "hapus nexa_2nd_brain id 12"`;
          pendingDatabaseContext = { tableName: '', lastAction: dbAction, askedAt: Date.now() };
        } else if (dbAction === 'READ_TABLE') {
          const result = await supabaseMemories.readDatabaseTable(tableName, {
            limit: dbData.max_results || 5,
            searchKeyword: dbData.search_keyword || ''
          });
          if (!result.success) {
            domainReply = `❌ Gagal membaca tabel <b>${escapeHtml(tableName)}</b>: ${escapeHtml(result.error)}`;
            break;
          }
          if (!result.rows || result.rows.length === 0) {
            domainReply = `📭 Tabel <b>${escapeHtml(result.table)}</b> tidak memiliki data yang cocok.`;
            break;
          }
          const rowsPreview = result.rows.map((r) => {
            if (tableName && (tableName.toLowerCase() === 'nexa_vault_items' || result.table === 'nexa_vault_items')) {
              let metaDetails = typeof r.metadata_json === 'object' && r.metadata_json
                ? Object.entries(r.metadata_json).map(([k,v]) => `${k}: ${v}`).join(' | ')
                : String(r.metadata_json || '');
              return `• [${r.category || 'ARSIP'}] ${r.file_name} — ${metaDetails} (Link: ${r.drive_web_view_link || '-'})`;
            }
            const summary = Object.entries(r)
              .slice(0, 4)
              .map(([k, v]) => `${k}: ${String(v).substring(0, 80)}`)
              .join(' | ');
            return `• ${escapeHtml(summary)}`;
          }).join('\n');
          domainReply = `📚 <b>Data ${escapeHtml(result.table)} (${result.rows.length} baris):</b>\n${rowsPreview}`;
          pendingDatabaseContext = { tableName: result.table, lastAction: dbAction, askedAt: Date.now() };
        } else if (dbAction === 'INSERT_ROW') {
          const result = await supabaseMemories.insertDatabaseRow(tableName, dbData.row_data || {});
          domainReply = result.success
            ? `✅ Insert berhasil ke <b>${escapeHtml(result.table)}</b> (id: ${result.row?.id || '-'})`
            : `❌ Insert gagal ke <b>${escapeHtml(tableName)}</b>: ${escapeHtml(result.error)}`;
          pendingDatabaseContext = { tableName: result.table || tableName, lastAction: dbAction, askedAt: Date.now() };
        } else if (dbAction === 'UPDATE_ROW') {
          const result = await supabaseMemories.updateDatabaseRows(
            tableName,
            dbData.update_data || {},
            { rowId: dbData.row_id, searchKeyword: dbData.search_keyword }
          );
          domainReply = result.success
            ? `✅ Update berhasil di <b>${escapeHtml(result.table)}</b>. Baris terubah: ${result.updatedRows.length}`
            : `❌ Update gagal di <b>${escapeHtml(tableName)}</b>: ${escapeHtml(result.error)}`;
          pendingDatabaseContext = { tableName: result.table || tableName, lastAction: dbAction, askedAt: Date.now() };
        } else if (dbAction === 'DELETE_ROW') {
          const result = await supabaseMemories.deleteDatabaseRows(
            tableName,
            { rowId: dbData.row_id, searchKeyword: dbData.search_keyword }
          );
          domainReply = result.success
            ? `🗑️ Delete berhasil di <b>${escapeHtml(result.table)}</b>. Baris terhapus: ${result.deletedRows.length}`
            : `❌ Delete gagal di <b>${escapeHtml(tableName)}</b>: ${escapeHtml(result.error)}`;
          pendingDatabaseContext = { tableName: result.table || tableName, lastAction: dbAction, askedAt: Date.now() };
        } else if (dbAction === 'DELETE_ALL_ROWS') {
          // Hanya set peringatan konfirmasi
          domainReply = routingData.reply_message || `⚠️ <b>PERINGATAN!</b> Anda meminta untuk menghapus SELURUH isi dari tabel <b>${escapeHtml(tableName)}</b>.\n\nApakah Anda benar-benar yakin ingin memusnahkan semua datanya? Balas <b>"YA"</b> untuk mengeksekusi, atau <b>"BATAL"</b>.`;
          pendingDatabaseContext = { tableName, lastAction: dbAction, awaitingConfirmation: true, askedAt: Date.now() };
        } else if (dbAction === 'DELETE_ALL_ROWS_CONFIRMED') {
          // AI router telah menyatakan user setuju. Gunakan tabel dari context jika AI lupa.
          const targetTable = tableName || pendingDatabaseContext?.tableName;
          if (!targetTable) {
            domainReply = `❌ Kesalahan memori: N.E.X.A lupa tabel mana yang ingin dihapus massal. Silakan ulangi perintah dari awal.`;
            pendingDatabaseContext = null;
          } else {
            let driveDeletedMsg = '';
            if (targetTable === 'nexa_vault_items') {
              const googleWorkspace = require("../../infrastructure/Google_Workspace");
              const driveSuccess = await googleWorkspace.deleteAllVaultFiles();
              driveDeletedMsg = driveSuccess
                ? '\n🗑️ Semua file fisik di Google Drive Vault juga telah dimasukkan ke Trash.'
                : '\n⚠️ Gagal menghapus file fisik di Google Drive Vault.';
            }

            const result = await supabaseMemories.deleteAllDatabaseRows(targetTable);
            domainReply = result.success
              ? `💥 <b>Pemusnahan Massal Selesai</b>.\nSeluruh data di tabel <b>${escapeHtml(result.table)}</b> telah dihapus. Jumlah baris yang terdampak: ${result.deletedRows.length}${driveDeletedMsg}`
              : `❌ Gagal memusnahkan isi tabel <b>${escapeHtml(targetTable)}</b>: ${escapeHtml(result.error)}`;
            pendingDatabaseContext = null;
          }
        } else if (dbAction === 'CANCEL_ACTION') {
          domainReply = '✅ Aksi database dibatalkan, Tuan.';
          pendingDatabaseContext = null;
        } else if (dbAction === 'DELETE_ROWS') {
          domainReply = `❌ Penghapusan banyak baris secara otomatis belum didukung. Hapus satu per satu menggunakan kata kunci (contoh: "Hapus transaksi 150000"). Jika ini tabel Supabase, silakan buat skrip khusus.`;
        } else {
          domainReply = `❌ Aksi database tidak dikenali: ${escapeHtml(dbAction)}`;
        }
        break;
      }
      // [FALLBACK HANDLER] intent 'EDIT' top-level adalah intent tidak valid yang kadang
      // dikembalikan AI Router saat konteks percakapan terlalu jauh (reply ke pesan lama).
      // Redirect transparansi ke FINANCE editTransaction agar NEXA tidak diam/bingung.
      case 'EDIT': {
        let editKw = routingData.extracted_data?.search_keyword || null;
        // Selalu coba ekstrak dari reply_to_message jika keyword kosong/vague
        if (!editKw || /^(ini|itu|transaksi|perbaiki|ubah|sesuaikan|\s)*$/i.test(String(editKw).trim())) {
          const replyTxtEdit = message.reply_to_message && message.reply_to_message.text
            ? message.reply_to_message.text
            : null;
          if (replyTxtEdit) {
            const cMatch = replyTxtEdit.match(/(?:Deskripsi|Catatan|Tujuan|Merchant)\s*:\s*([^\n\r,]{2,80})/i);
            const nLabelMatch = replyTxtEdit.match(/Nominal\s*\([Rr][Pp]\)\s*:\s*[Rr][Pp][\.\s]*([0-9][0-9.,]+)/i);
            const nRpMatch = replyTxtEdit.match(/[Rr][Pp]\.?\s*([0-9][0-9.,]+)/);
            if (cMatch && cMatch[1] && cMatch[1].trim().length > 1) {
              editKw = cMatch[1].trim();
            } else if (nLabelMatch && nLabelMatch[1]) {
              editKw = nLabelMatch[1].replace(/[^0-9]/g, '');
            } else if (nRpMatch && nRpMatch[1]) {
              editKw = nRpMatch[1].replace(/[^0-9]/g, '');
            } else {
              editKw = 'latest';
            }
          } else {
            editKw = 'latest';
          }
        }
        const editResult = await financeEngine.editTransaction(
          editKw,
          routingData.extracted_data?.nominal,
          routingData.extracted_data?.description || routingData.extracted_data?.destination,
          routingData.extracted_data?.category,
          routingData.extracted_data?.account,
          routingData.extracted_data?.payment_method
        );
        domainReply = editResult.message;
        break;
      }

      case 'DIAGNOSE_SYSTEM': {
        const logger = require("../../utils/logger");
        const aiRouter = require("../../core/AI_Router");
        const recentLogs = logger.getRecentLogs();
        if (!recentLogs || recentLogs.trim() === '') {
          domainReply = '✅ Sistem berjalan normal. Belum ada log baru yang terekam di memori saat ini.';
        } else {
          // Send to AI for diagnosis
          domainReply = await aiRouter.analyzeSystemLogs(textInput, recentLogs);
        }
        break;
      }
    }
    }

    // Send reply via Webhook Response Method (ZERO outbound needed)
    let aiDraftReply = routingData.reply_message;
    if (aiDraftReply && typeof aiDraftReply === 'object') {
      aiDraftReply = aiDraftReply.text || aiDraftReply.message || JSON.stringify(aiDraftReply);
    }
    const finalReply = domainReply || aiDraftReply;
    if (finalReply) {
      // Save ONLY the actual final message that the user receives
      console.log('[TELEGRAM] Replying with intent:', routingData.intent);
      conversationContext = {
        ...(conversationContext || {}),
        lastAssistantReply: finalReply,
        askedAt: Date.now()
      };
      // Save ONLY the actual final message that the user receives centrally.
      // We removed scattered saves in AI_Router so this is the authoritative save point.
      await respondToTelegram(finalReply, false);
    }

    } catch (error) {
      console.error('[TELEGRAM] Error processing message:', error.message);
      webhookReply = `⚠️ N.E.X.A mengalami gangguan internal:\n<code>${escapeHtml(error.message)}</code>\n\nSilakan cek log server di Hugging Face Space dashboard.`;
    } finally {
      stopTyping();
      deliverWebhookReply();
    }
  }); // END setImmediate
}

module.exports = { handleTelegramWebhook };
