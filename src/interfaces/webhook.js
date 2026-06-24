const express = require('express');
const router = express.Router();
const https = require('https');
const fs = require('fs');
const { downloadProxyToFile, fetchProxyJSON } = require('../utils/telegram_proxy.js');
const { buildProxyChain, sendTelegramMessage } = require('../utils/telegram_network');
const path = require('path');
const os = require('os');
const env = require('../config/env');
const security = require('../utils/security');
const aiRouter = require('../core/AI_Router');
const { invalidatePersonalFactsCache } = aiRouter;
const financeEngine = require('../domain/Finance_Engine');
const godMode = require('../domain/Discipline_GodMode');
const voiceEngine = require('../core/Voice_Engine');
const visionEngine = require('../core/Vision_Engine');
const supabaseMemories = require('../infrastructure/Supabase_Memories');
const taskManager = require('../domain/Task_Manager');
const webSearch = require('../infrastructure/Web_Search');
const googleWorkspace = require('../infrastructure/Google_Workspace');

// Pending Calendar Context: holds an incomplete calendar CREATE until user provides missing info
// Structure: { summary, start, askedAt }
let pendingCalendarContext = null;
// Pending Conflict Event: holds a conflicting calendar event waiting for user confirmation
// Structure: { pendingEvent: { summary, start, end, description, location, reminder_minutes, recurrence }, askedAt }
let pendingConflictEvent = null;
// Pending Email Context: keeps last email search context for follow-up commands
// Structure: { searchKeyword, lastLimit, cursorIndex, lastBatch, askedAt }
let pendingEmailContext = null;
// Pending Database Context: keeps last database table/action for follow-up commands
// Structure: { tableName, lastAction, askedAt }
let pendingDatabaseContext = null;
// Global conversation context for cross-feature follow-up continuity
// Structure: { intent, extractedData, lastUserText, lastAssistantReply, askedAt }
let conversationContext = null;

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
// VAULT EXTRACTION â€” 5-LAYER PIPELINE
// =============================================================

// --- Schema Registry Removed (Digantikan oleh Direct Multimodal JSON Extraction) ---

// Field yang secara alami bisa panjang â€” TIDAK dibuang ke catatan
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
// extractVaultMetadataFromVision â€” DIRECT MULTIMODAL EXTRACTION
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
  const proxies = getProxyList(fileUrl);

  console.log('[VAULT] Step 2: Downloading document binary...');

  for (const proxy of proxies) {
    try {
      console.log(`[VAULT] Downloading binary via: ${proxy.name}...`);
      const result = await downloadProxyToFile(proxy.url, ext, 20 * 1024 * 1024);
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
// OUTBOUND TELEGRAM SENDER
// Routes through Cloudflare Worker proxy because HuggingFace
// blocks ALL outbound connections to api.telegram.org.
// Used when webhook response is already consumed (timeout, cron).
// ============================================================
async function sendTelegramOutbound(text, skipMemory = false) {
  try {
    if (!skipMemory) {
      await supabaseMemories.saveChatMemory('nexa', String(text).substring(0, 4000)).catch(() => { });
    }

    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
    const botToken = env.TELEGRAM_BOT_TOKEN.trim();
    const chatId = env.TELEGRAM_CHAT_ID.trim();

    const result = await sendTelegramMessage(text, chatId, botToken);
    console.log('[TELEGRAM-OUTBOUND] Sent via relay:', JSON.stringify(result).substring(0, 200));
  } catch (e) {
    console.error('[TELEGRAM-OUTBOUND] Error:', e.message);
    throw e;
  }
}

// ============================================================
// TELEGRAM WEBHOOK — Webhook Response Method (PRIMARY)
// ============================================================
// HF intentionally blocks outbound to api.telegram.org and *.workers.dev.
// Telegram allows embedding Bot API calls IN the webhook HTTP response body.
// This delivers replies with ZERO outbound connections. Docs:
// https://core.telegram.org/bots/api#making-requests-when-getting-updates
// Outbound relay (Vercel) is only for cron/tasker/timeout callbacks.
// ============================================================
router.post('/telegram', security.telegramWebhookSecret, security.telegramIdentityLock, (req, res) => {
  const message = req.body?.message || req.body?.edited_message;

  if (!message) {
    return res.status(200).send('OK');
  }

  // DO NOT send res.status(200) here — keep connection open for webhook response
  let webhookReply = null;

  setImmediate(async () => {
    // Helper: escape untrusted strings for HTML parse_mode
    const escapeHtml = (str) => String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    // ============================================================
    // respondToTelegram — Capture reply for webhook response (zero outbound)
    // ============================================================
    const respondToTelegram = async (text, skipMemory = false) => {
      if (!skipMemory) {
        await supabaseMemories.saveChatMemory('nexa', String(text).substring(0, 4000)).catch(() => { });
      }
      webhookReply = String(text).substring(0, 4000);
    };

    const deliverWebhookReply = () => {
      if (res.headersSent) return;
      if (webhookReply) {
        console.log('[TELEGRAM] Delivering via webhook response (zero outbound)');
        res.status(200).json({
          method: 'sendMessage',
          chat_id: message.chat.id,
          text: webhookReply,
          parse_mode: 'HTML',
        });
      } else {
        res.status(200).send('OK');
      }
    };

    let textInput = message.text;
    const captionText = message.caption || '';
    const vaultTriggerText = `${textInput || ''} ${captionText || ''}`.toLowerCase();

    // [AUDIT FIX] Centralized INCOMING memory save (Anti-Amnesia)
    // Lock the user's message into Supabase IMMEDIATELY.
    // This guarantees N.E.X.A never loses context even if an error crashes the router below.
    const rawInputStr = (textInput || captionText || '[Attachment/Media]').substring(0, 4000);
    await supabaseMemories.saveChatMemory('user', rawInputStr).catch(() => {});

    try {
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
          await respondToTelegram('âœ… Baik, Tuan. Metadata Vault dikonfirmasi dan disimpan.');

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
              `ðŸ§  Ekstrak ulang selesai, Tuan. Ini draft metadata terbaru:\n` +
              `${escapeHtml(formatVaultMetadata(pendingVaultContext.metadata))}\n\n` +
              `Balas: <b>KONFIRM</b> / <b>EKSTRAK ULANG</b> / <b>EDIT key: value; key2: value2</b>`
            );



            return;
          } catch (e) {
            await respondToTelegram(`âŒ Ekstrak ulang gagal: <code>${escapeHtml(e.message)}</code>`);

            return;
          }
        }

        const edits = parseVaultEditCommand(normalized);
        if (edits) {
          pendingVaultContext.metadata = { ...(pendingVaultContext.metadata || {}), ...edits, source: 'USER_EDIT' };
          if (edits.category) pendingVaultContext.category = String(edits.category).toUpperCase();
          pendingVaultContext.askedAt = Date.now();


          await respondToTelegram(
            `âœ… Dicatat, Tuan. Draft metadata sekarang:\n${escapeHtml(formatVaultMetadata(pendingVaultContext.metadata))}\n\n` +
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
            `âœ… Tersimpan di Vault Drive (DRAFT).\n<b>Nama:</b> ${escapeHtml(finalFileName)}\n<b>Kategori (tebakan):</b> ${escapeHtml(category)}\n<b>Link:</b> ${uploaded.webViewLink || '(tidak tersedia)'}\n\n` +
            `<b>Draft metadata:</b>\n${escapeHtml(formatVaultMetadata(draftMeta))}\n\n` +
            `Balas salah satu:\n- <b>KONFIRM</b>\n- <b>EKSTRAK ULANG</b>\n- <b>EDIT key: value; key2: value2</b>`
          );
        } finally {
          try { if (fs.existsSync(tmpFilePath)) fs.unlinkSync(tmpFilePath); } catch (_) { }
        }


        return;
      } catch (e) {
        console.error('[VAULT] Upload failed:', e.message);
        await respondToTelegram(`âŒ Gagal menyimpan ke Vault: <code>${escapeHtml(e.message)}</code>`);

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
      // AUDIT FIX (CRITICAL-2): Use robust IDR/USD-aware parser â€” mirrors Finance_Engine._parseFlexibleCurrency
      const { _parseFlexibleCurrency } = require('../domain/Finance_Engine');
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
        return routing.reply_message || 'â“ Instruksi masih belum lengkap, Tuan. Mohon tambahkan detailnya.';
      }

      if (intent === 'FINANCE') {
        if (data.action === 'DELETE' || data.action === 'EDIT') {
          if (!data.search_keyword) {
            // AI Router sometimes puts the target keyword in nominal, destination, or description
            if (data.nominal) data.search_keyword = String(data.nominal);
            else if (data.destination) data.search_keyword = data.destination;
            else if (data.description) data.search_keyword = data.description;
            else {
              // if still nothing, try to use the raw text if it looks like a short reply
              if (lowerText.split(' ').length <= 6) data.search_keyword = originalText;
            }
          }
          if (!data.search_keyword || String(data.search_keyword).trim() === '') {
            return 'â“ Transaksi mana yang ingin diubah/dihapus, Tuan? Sebutkan kata kunci unik, nominal, atau nomor transaksi.';
          }
        }
        // Only block if action explicitly requires a nominal AND none was provided
        if (
          data.action !== 'IMPORT_FROM_EMAIL' &&
          data.action !== 'READ_LATEST' &&
          data.action !== 'READ_ANALYTICS' &&
          data.action !== 'DELETE' &&
          data.action !== 'UNDO_DELETE' &&
          data.action !== 'CANCEL_TRANSACTION' &&
          data.action !== 'EDIT' &&
          data.action !== 'UPDATE_PENDING' &&
          (data.action === 'RECORD' || data.action === 'RECORD_MULTIPLE') &&
          (isNaN(parseFloat(data.nominal)) || parseFloat(data.nominal) <= 0)
        ) {
          return 'â“ Nominal transaksi belum valid. Mohon sebutkan angka positifnya, Tuan.';
        }

      }

      if (intent === 'CALENDAR' && data.action === 'CREATE') {
        if (!data.summary) return 'â“ Nama agendanya apa, Tuan?';
        if (!data.start) return `â“ Jadwal "${escapeHtml(data.summary)}" dimulai kapan, Tuan?`;
      }

      if (intent === 'TASK') {
        if (data.action === 'CREATE' && !data.title) return 'â“ Nama tugas yang ingin dibuat apa, Tuan?';
        if ((data.action === 'DELETE' || data.action === 'COMPLETE' || data.action === 'EDIT') && !data.search_keyword) {
          return 'â“ Tugas mana yang dimaksud, Tuan? Sebutkan kata kunci judul tugasnya.';
        }
      }

      if (intent === 'EMAIL') {
        if (data.action === 'SEND' && (!data.to || !data.subject || !data.content)) {
          return 'â“ Untuk kirim email, mohon lengkapi penerima, subjek, dan isi emailnya, Tuan.';
        }
        if (data.action === 'DELETE' && !data.search_keyword) {
          return 'â“ Email mana yang ingin dihapus, Tuan? Beri kata kunci subjek/pengirim.';
        }
      }

      if (intent === 'DATABASE') {
        const action = data.action || 'LIST_TABLES';
        if (action !== 'LIST_TABLES' && !data.table_name) {
          return 'â“ Tabel Supabase mana yang dimaksud, Tuan?';
        }
        if (action === 'INSERT_ROW' && (!data.row_data || typeof data.row_data !== 'object')) {
          return `â“ Data yang ingin ditambahkan ke tabel <b>${escapeHtml(data.table_name || '(belum disebut)')}</b> apa, Tuan?`;
        }
        if (action === 'UPDATE_ROW' && (!data.update_data || typeof data.update_data !== 'object')) {
          return `â“ Data perubahan untuk tabel <b>${escapeHtml(data.table_name || '(belum disebut)')}</b> apa, Tuan?`;
        }
        if (action === 'DELETE_ALL_ROWS') {
          return null; // Bebaskan, biarkan execution block yang meminta konfirmasi atau biarkan AI Router menyampaikannya.
        }
        if ((action === 'UPDATE_ROW' || action === 'DELETE_ROW') && !data.row_id && !data.search_keyword) {
          return 'â“ Baris mana yang ingin diubah/hapus, Tuan? Sertakan row id atau kata kunci pencarian.';
        }
      }

      if (intent === '2ND_BRAIN') {
        const action = data.action || 'READ';
        if ((action === 'EDIT' || action === 'DELETE') && !data.search_keyword) {
          return 'â “ Arsip mana yang dimaksud, Tuan? Mohon beri kata kunci untuk mencari arsipnya.';
        }
        if ((action === 'APPEND' || action === 'EDIT') && !data.content) {
          return 'â “ Konten arsip yang ingin disimpan/diubah belum ada, Tuan.';
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
        return `â“ Apakah maksud Tuan untuk <b>${conversationContext.intent}</b> pada item sebelumnya? Mohon konfirmasi singkat.`;
      }

      return null;
    };
    // Database follow-up is now purely handled by AI Router's natural language comprehension

    // ============================================================
    // LAPISAN 4: BLACK BOX â€” Emergency Telegram Buffer Parser
    // ============================================================
    if (textInput && textInput.trim().startsWith('[BUFFER]')) {
      console.log('[BUFFER] Emergency buffer message received from Tasker via Telegram.');
      try {
        const bufferContent = textInput.replace('[BUFFER]', '').trim();
        const parts = bufferContent.split('|').map(s => s.trim());

        if (parts.length < 2) {
          await respondToTelegram('âš ï¸ [BUFFER] Format tidak valid. Gunakan: [BUFFER] nominal | merchant | timestamp');
          return;
        }

        const nominal = parseFloat(parts[0]);
        const merchant = parts[1] || 'Unknown';
        const rawTime = parts[2] || '';
        const parsedTime = rawTime ? new Date(rawTime) : new Date();
        const transactionTime = isNaN(parsedTime.getTime()) ? new Date() : parsedTime;

        if (isNaN(nominal) || nominal <= 0) {
          await respondToTelegram('âš ï¸ [BUFFER] Nominal tidak valid. Harus berupa angka positif.');
          return;
        }

        const result = await financeEngine.processTransaction({
          nominal,
          type: 'EXPENSE',
          destination: merchant,
          category: 'Auto-Buffer Recovery',
          description: 'Recovered from Telegram Buffer (Server was starting up)',
          time: transactionTime.toISOString()
        }, 'TASKER_FINANCE');

        if (result.status === 'DUPLICATE') {
          await respondToTelegram(`âš ï¸ [BUFFER] Transaksi Rp${nominal.toLocaleString('id-ID')} ke ${merchant} sudah tercatat sebelumnya. Duplikasi diabaikan.`);
        } else {
          await respondToTelegram(`âœ… [BUFFER] Pulih: Rp${nominal.toLocaleString('id-ID')} ke ${merchant} berhasil dicatat.`);
        }
      } catch (bufferErr) {
        console.error('[BUFFER] Recovery failed:', bufferErr.message);
        await respondToTelegram(`âŒ [BUFFER] Gagal memulihkan transaksi: ${bufferErr.message}`);
      }
      return;
    }

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
        await respondToTelegram('âš ï¸ Maaf Tuan, seluruh 6 lapisan sistem pendengaran N.E.X.A (4x Groq Whisper + 2x Gemini Native Audio) gagal merespons. Mohon coba kirim ulang pesan suaranya dalam beberapa menit.');
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
        await respondToTelegram('âš ï¸ Maaf Tuan, seluruh 11 lapisan sistem penglihatan N.E.X.A (4x Gemini 2.5 + 4x Groq + 2x Gemini 2.0 + HuggingFace) gagal merespons. Semua provider AI sedang down secara bersamaan.');
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
    // PENDING CALENDAR RESOLUTION â€” intercept follow-up duration reply
    // ============================================================
    if (pendingCalendarContext) {
      const agendaManager = require('../domain/Agenda_Manager');
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

      const { classifyYesNo } = require('../core/AI_Router');
      const verdict = await classifyYesNo(textInput, delContext);
      console.log(`[FINANCE INTERCEPTOR] AI deletion verdict: "${verdict}" for input: "${textInput}"`);

      if (verdict === 'YES') {
        const reply = await financeEngine.confirmDeleteTransaction(true);
        await respondToTelegram(reply || 'âœ… Transaksi telah dihapus.');

        return;
      } else if (verdict === 'NO') {
        const reply = await financeEngine.confirmDeleteTransaction(false);
        await respondToTelegram(reply || 'âœ… Penghapusan dibatalkan.');

        return;
      }
      // AMBIGUOUS â€” fall through to normal routing; don't act on unclear input
    }

    // ============================================================
    // PENDING FINANCE REPLY INTERCEPTOR (AI-Powered)
    // Catches user replies aimed at a hanging Auto-Sync transaction
    // confirmation â€” BEFORE the AI Router gets a chance to
    // misinterpret them as a new RECORD intent.
    // Uses classifyPendingTransactionIntent() instead of rigid regex.
    // ============================================================
    const pendingFinanceCtx = await financeEngine.getPendingConfirmationsContext();
    if (pendingFinanceCtx) {
      // Extract the first pending tx for context to give the AI classifier
      let pendingTxContext = {};
      try {
        const pendingRows = await supabaseMemories.getPendingTransactions();
        if (pendingRows && pendingRows.length > 0) {
          const first = pendingRows[0].tx_data || {};
          pendingTxContext = { nominal: first.nominal, destination: first.destination, type: first.type };
        }
      } catch (_) {}

      const { classifyPendingTransactionIntent } = require('../core/AI_Router');
      const parsedData = await classifyPendingTransactionIntent(textInput, pendingTxContext);
      const intent = parsedData.intent;
      console.log(`[FINANCE INTERCEPTOR] AI classified intent: "${intent}" for input: "${textInput}"`, parsedData.updates);

      if (intent === 'CONFIRM') {
        const confirmReply = await financeEngine.confirmPendingTransactions(true);
        await respondToTelegram(confirmReply || 'âœ… Transaksi telah dicatat.');

        return;
      } else if (intent === 'CANCEL') {
        const cancelReply = await financeEngine.confirmPendingTransactions(false);
        await respondToTelegram(cancelReply || 'âŒ Transaksi dibatalkan.');

        return;
      } else if (intent === 'UPDATE') {
        const up = parsedData.updates || {};
        const updatedMsg = await financeEngine.updatePendingTransaction(
          up.description || null,
          up.category || null,
          null, // nominal
          up.account || null,
          up.payment_method || null
        );
        if (updatedMsg) {
          await respondToTelegram(updatedMsg);

          return;
        }
        // If updatePendingTransaction returned null (already auto-saved), fall through to normal routing
      } else {
        // AMBIGUOUS â€” ask for clarification without touching the pending transaction
        await respondToTelegram(
          `â“ Masih ada transaksi yang menunggu konfirmasi Tuan. Balas:\n` +
          `â€¢ <b>ya / masukkan / catat</b> â†’ simpan transaksi\n` +
          `â€¢ <b>batal</b> â†’ batalkan transaksi\n` +
          `â€¢ <b>Kalimat deskripsi</b> â†’ ubah catatan transaksi`
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
        await respondToTelegram('ðŸš« Penambahan tugas dibatalkan.');

        return;
      }

      if (pendingTask.type === 'CONFIRM_DURATION') {
        const { callAI } = require('../core/AI_Router');
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
            const { findEmptySlot } = require('../infrastructure/Google_Workspace');
            const slot = await findEmptySlot(durationMins, timeMinIso, timeMaxIso);
            if (slot) {
              pendingTask.dueDate = slot.start; 
              const dueMs = new Date(pendingTask.dueDate);
              const h = dueMs.toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
              const timeLabel = `${h} WIB (Auto-Blocked)`;
              pendingTask.notes = pendingTask.notes ? `â° Jam: ${timeLabel}\n${pendingTask.notes}` : `â° Jam: ${timeLabel}`;
              pendingTask.hasAutonomousBlock = true;
            }
          } catch (e) {
            console.error('[AUTONOMOUS BLOCKING] Failed to find slot:', e.message);
          }
        }
        
        const resTask = await taskManager.executePendingTask(chatId, pendingTask.listName);
        if (resTask && resTask.message) {
          await respondToTelegram(resTask.message);

          return;
        }
      } else {
        // CONFIRM_LIST logic
        const { classifyYesNo } = require('../core/AI_Router');
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
          // AMBIGUOUS â€” user likely typed a custom list name
          overrideList = textInput.trim();
        }

        const resTask = await taskManager.executePendingTask(chatId, overrideList);
        if (resTask && resTask.message) {
          await respondToTelegram(resTask.message);

          return;
        }
      }
    }

    // ============================================================
    // PENDING CONFLICT CONFIRMATION â€” AI-Powered (intercept ya/batal)
    // ============================================================
    if (pendingConflictEvent && (Date.now() - (pendingConflictEvent.askedAt || 0)) < 10 * 60 * 1000) {
      const ev = pendingConflictEvent;
      const conflictContext = `tambahkan jadwal "${ev.summary}" walaupun ada bentrok jadwal lain`;
      const { classifyYesNo } = require('../core/AI_Router');
      const verdict = await classifyYesNo(textInput, conflictContext);
      console.log(`[CALENDAR INTERCEPTOR] AI conflict verdict: "${verdict}" for input: "${textInput}"`);

      if (verdict === 'YES' || verdict === 'NO') {
        if (verdict === 'YES') {
          try {
            const result = await googleWorkspace.createCalendarEvent(
              ev.summary, ev.start, ev.end, ev.description || '',
              ev.location || '', ev.reminder_minutes || [], ev.recurrence || ''
            );
            let successMsg = `âœ… Jadwal '<b>${ev.summary}</b>' berhasil ditambahkan (meskipun ada bentrok).`;
            if (ev.location) successMsg += `\nðŸ“ Lokasi: ${ev.location}`;
            if (ev.recurrence) successMsg += `\nðŸ”„ Dijadwalkan berulang.`;
            await respondToTelegram(successMsg);
          } catch (e) {
            await respondToTelegram(`âŒ Gagal menambahkan jadwal: ${e.message}`);
          }
        } else {
          await respondToTelegram('ðŸš« Baik Tuan, penambahan jadwal dibatalkan karena ada bentrok.');
        }
        pendingConflictEvent = null;

        return;
      }
      // AMBIGUOUS â€” fall through to normal routing
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
      // dengan SEMUA runtimeHints lengkap â€” bukan hanya conversationContext saja.
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

    // Passive Background Learning (Auto-Extraction)
    if (routingData.learned_user_facts && Array.isArray(routingData.learned_user_facts) && routingData.learned_user_facts.length > 0) {
      for (const fact of routingData.learned_user_facts) {
        if (typeof fact === 'string' && fact.trim().length > 0) {
          console.log('[ROUTER] Passive Learning - User Fact:', fact);
          await supabaseMemories.saveUserProfile(fact);
        }
      }
      invalidatePersonalFactsCache();
    }

    if (routingData.learned_core_identities && Array.isArray(routingData.learned_core_identities) && routingData.learned_core_identities.length > 0) {
      for (const fact of routingData.learned_core_identities) {
        if (typeof fact === 'string' && fact.trim().length > 0) {
          console.log('[ROUTER] Passive Learning - Core Identity:', fact);
          await supabaseMemories.saveCoreIdentity(fact);
        }
      }
      invalidatePersonalFactsCache();
    }

    // Execute Domain Logic based on Intent
    let domainReply = null;
    const clarificationMessage = getClarificationMessage(routingData, textInput);
    if (clarificationMessage) {
      domainReply = clarificationMessage;
    } else switch (routingData.intent) {
      case 'FINANCE':
        if (routingData.extracted_data && routingData.extracted_data.action === 'IMPORT_FROM_EMAIL') {
          const gmailClient = require('../infrastructure/Gmail_Client');
          const candidateEmails = pendingEmailContext?.lastBatch?.length
            ? pendingEmailContext.lastBatch
            : await gmailClient.getLatestEmails('livin OR from:noreply.livin@bankmandiri.co.id', 30);
          const temporalHint = getEmailTemporalFilterFromText(textInput);
          const dayHint = parseDayOfMonthHint(textInput);
          let scopedEmails = filterEmailsByTemporalHint(candidateEmails, temporalHint);
          if (dayHint) scopedEmails = filterEmailsByDayOfMonth(scopedEmails, dayHint);
          const txRows = extractFinanceTransactionsFromEmails(scopedEmails);

          if (txRows.length === 0) {
            domainReply = 'ðŸ“­ Data transaksi keuangan otomatis tidak ditemukan di email yang dianalisis. Coba sebutkan rentang waktu yang lebih jelas, Tuan.';
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
          domainReply = `âœ… Sinkronisasi Keuangan selesai.\n- Berhasil dicatat: <b>${success}</b>\n- Duplikasi diabaikan: <b>${duplicate}</b>\n- Sumber dianalisis: <b>${txRows.length}</b> transaksi email`;
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
          const confirmationReply = await financeEngine.confirmPendingTransactions(
            true,
            routingData.extracted_data.description || null,
            routingData.extracted_data.category || null
          );
          if (confirmationReply) {
            domainReply = confirmationReply;
          } else {
            domainReply = 'âœ… Tidak ada transaksi yang tertunda. Kemungkinan transaksi telah disimpan otomatis karena melewati batas waktu 5 menit. Jika ingin mengubahnya, silakan gunakan perintah Edit (contoh: "Ubah transaksi 50rb menjadi...").';
          }
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'UPDATE_PENDING') {
          const updatedMsg = await financeEngine.updatePendingTransaction(
            routingData.extracted_data.description || null,
            routingData.extracted_data.category || null,
            routingData.extracted_data.nominal || null,
            routingData.extracted_data.account || null,
            routingData.extracted_data.payment_method || null
          );
          if (updatedMsg) {
            domainReply = updatedMsg;
          } else {
            domainReply = 'âŒ Tidak ada transaksi yang tertunda untuk diubah. Kemungkinan transaksi telah disimpan otomatis. Silakan gunakan perintah Edit dengan menyebut nominal (contoh: "Edit transaksi 50rb menjadi...").';
          }
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'CANCEL_TRANSACTION') {
          const confirmationReply = await financeEngine.confirmPendingTransactions(false);
          domainReply = confirmationReply || 'Tidak ada transaksi yang tertunda.';
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'EDIT') {
          const result = await financeEngine.editTransaction(
            routingData.extracted_data.search_keyword,
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
              replies.push(`âš ï¸ Transaksi ${txData.nominal} ke ${txData.destination} tampaknya sudah dicatat atau tertunda.`);
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
            domainReply = confirmMsg; // Send via webhook response method (proven to work on HF)
            // Mark as sent in Supabase after the webhook response is delivered
            const cleanMerch = (txData.destination || txData.merchant || 'Unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
            const cKey = `${txData.nominal}_${cleanMerch}`;
            supabaseMemories.markPendingTransactionSent(cKey).catch(() => { });
          } else {
            domainReply = 'âš ï¸ Transaksi ini tampaknya sudah pernah dicatat sebelumnya (duplikat) atau sedang menunggu konfirmasi.';
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
          const agendaManager = require('../domain/Agenda_Manager');
          // AI Router nests calendar data under 'CALENDAR' key â€” unwrap it for Agenda_Manager
          const calData = routingData.extracted_data.CALENDAR || routingData.extracted_data;

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

          if (calResult && calResult.message) {
            if (calData.action === 'READ') {
              const { executeWithFallback } = require('../core/Fallback_Engine');
              const { NEXA_PERSONALITY } = require('../config/personality');
              const prompt = `Tuan Faqih bertanya tentang kalendernya: "${textInput}"\n\nData Kalender yang Ditemukan:\n${calResult.message}\n\nTugas: Jawablah pertanyaan Tuan Faqih dengan ringkas, natural, dan langsung ke intinya berdasarkan data kalender di atas. Jika data tidak menyebutkan secara spesifik apa yang ditanyakan (contoh: tidak ada di jadwal), sampaikan dengan jujur. Jangan menggunakan format JSON.`;
              const answer = await executeWithFallback(prompt, NEXA_PERSONALITY, 0.5, false);
              domainReply = answer;
            } else {
              domainReply = calResult.message;
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
              timerId,
              chatId: pendingId
            });

            domainReply = `ðŸ“‹ Tugas '<b>${taskResult.title}</b>' akan saya masukkan ke list <b>${taskResult.pendingListName}</b>.\n\nKonfirmasi? Balas:\nâ€¢ <b>ya</b> â€” masukkan sekarang\nâ€¢ <b>nama list lain</b> â€” pindah ke list tersebut\nâ€¢ <b>tidak</b> â€” masukkan ke Tugas Saya\n\n<i>â±ï¸ Auto-masuk dalam 5 menit jika tidak ada respons.</i>`;
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
          } else if (taskResult && taskResult.message) {
            domainReply = taskResult.message;
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
          const googleWorkspace = require('../infrastructure/Google_Workspace');

          if (brainAction === 'READ') {
            const docContent = await googleWorkspace.readIdeaDoc();
            domainReply = `ðŸ“– *Isi Arsip 2nd Brain:*\n\n${docContent.substring(0, 3000)}${docContent.length > 3000 ? '\n\n...(terpotong)' : ''}`;
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
            domainReply = (vaultRes?.success || docsSuccess) ? `âœ… Arsip berhasil diubah di Database (dan sinkronisasi Docs).` : `âŒ Gagal menemukan/mengubah arsip.`;
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
            domainReply = (vaultRes?.success || docsSuccess) ? `ðŸ—‘ï¸ Arsip berhasil dihapus dari Database (dan sinkronisasi Docs).` : `âŒ Gagal menemukan/menghapus arsip.`;
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

      case 'USER_PROFILE':
        if (routingData.extracted_data) {
          const action = routingData.extracted_data.action || (routingData.extracted_data.content ? 'APPEND' : 'READ');
          if (action === 'APPEND' && routingData.extracted_data.content) {
            await supabaseMemories.saveUserProfile(routingData.extracted_data.content);
            invalidatePersonalFactsCache();
            domainReply = `✅ Fakta personal tersimpan ke database profil. Saya akan selalu mengingatnya, Tuan.`;
          } else if (action === 'DELETE' && routingData.extracted_data.search_keyword) {
            const success = await supabaseMemories.deleteFromUserProfile(routingData.extracted_data.search_keyword);
            invalidatePersonalFactsCache();
            domainReply = success ? `🗑️ Fakta personal berhasil dihapus dari memori permanen.` : `❌ Gagal menemukan fakta tersebut di profil Anda.`;
          } else if (action === 'READ') {
             const keyword = routingData.extracted_data.search_keyword;
             if (!keyword || keyword.trim() === '' || keyword.toLowerCase() === 'semua') {
                domainReply = `🧠 Saya menyimpan puluhan catatan permanen tentang profil, prinsip, dan keseharian Tuan Faqih. Agar lebih relevan, bagian spesifik apa yang ingin Tuan ketahui? (misalnya: "Apa yang kamu tahu tentang hobi saya?", atau "tentang keuangan")`;
             } else {
                const facts = await supabaseMemories.getPersonalFacts();
                if (facts.userProfile && facts.userProfile.length > 0) {
                   const list = facts.userProfile.map(f => `- ${f}`).join('\n');
                   const prompt = `Berikut adalah daftar seluruh fakta permanen tentang Tuan Faqih:\n${list}\n\nTuan Faqih sedang bertanya spesifik tentang: "${keyword}".\nTugasmu: Pilihlah HANYA fakta-fakta yang relevan dengan pertanyaan/topik "${keyword}", lalu rangkum menjadi cerita yang luwes, hangat, dan asisten-sentris. Jika TIDAK ADA fakta yang relevan dengan "${keyword}", katakan dengan sopan bahwa kamu belum memiliki catatan permanen terkait hal tersebut. Jangan gunakan bullet points jika bisa dirangkum mengalir.`;
                   const aiRouter = require('../core/AI_Router');
                   domainReply = await aiRouter.callAI(prompt);
                } else {
                   domainReply = `🧠 Saat ini saya belum memiliki catatan fakta personal permanen tentang Tuan Faqih.`;
                }
             }
          }
        }
        break;

      case 'CORE_IDENTITY':
        if (routingData.extracted_data) {
          const action = routingData.extracted_data.action || (routingData.extracted_data.content ? 'APPEND' : 'READ');
          if (action === 'APPEND' && routingData.extracted_data.content) {
            await supabaseMemories.saveCoreIdentity(routingData.extracted_data.content);
            invalidatePersonalFactsCache();
            domainReply = `✅ Aturan identitas inti N.E.X.A telah diperbarui.`;
          } else if (action === 'DELETE' && routingData.extracted_data.search_keyword) {
            const success = await supabaseMemories.deleteFromCoreIdentity(routingData.extracted_data.search_keyword);
            invalidatePersonalFactsCache();
            domainReply = success ? `🗑️ Aturan identitas inti berhasil dihapus.` : `❌ Gagal menemukan aturan tersebut di sistem.`;
          } else if (action === 'READ') {
             const keyword = routingData.extracted_data.search_keyword;
             if (!keyword || keyword.trim() === '' || keyword.toLowerCase() === 'semua') {
                domainReply = `🤖 Saya memiliki beberapa aturan identitas inti dan pedoman sikap (Core Identity). Aspek apa yang ingin Tuan tinjau? (misalnya: "aturan tentang merespons pesan" atau "gaya komunikasimu")`;
             } else {
                const facts = await supabaseMemories.getPersonalFacts();
                if (facts.coreIdentity && facts.coreIdentity.length > 0) {
                   const list = facts.coreIdentity.map(f => `- ${f}`).join('\n');
                   const prompt = `Berikut adalah daftar seluruh aturan sikap dan identitas inti (Core Identity) N.E.X.A:\n${list}\n\nTuan Faqih bertanya tentang: "${keyword}".\nTugasmu: Pilihlah HANYA aturan yang relevan dengan "${keyword}", lalu rangkum secara luwes dan berwibawa. Jika tidak ada aturan yang relevan, katakan dengan sopan bahwa tidak ada pedoman khusus tentang hal tersebut.`;
                   const aiRouter = require('../core/AI_Router');
                   domainReply = await aiRouter.callAI(prompt);
                } else {
                   domainReply = `🤖 Saat ini tidak ada aturan identitas inti khusus yang diterapkan.`;
                }
             }
          }
        }
        break;



      case 'EMAIL':
        const gmailClient = require('../infrastructure/Gmail_Client');
        if (routingData.extracted_data) {
          const action = routingData.extracted_data.action;
          if (action === 'READ') {
            if (isStopEmailFollowUp(textInput)) {
              pendingEmailContext = null;
              domainReply = 'âœ… Siap, saya hentikan pembacaan email dulu. Kalau perlu lanjut, tinggal bilang.';
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
                  ? `ðŸ“­ Saya tidak menemukan transaksi/email keuangan pada tanggal <b>${dayHint}</b> di batch email terakhir.`
                  : `ðŸ“Š Pada tanggal <b>${dayHint}</b>, terdeteksi <b>${total}</b> transaksi/email keuangan di batch yang saya analisis.`;
              } else {
                domainReply = `ðŸ“Š Dari batch email terakhir, saya menemukan <b>${total}</b> email transaksi keuangan yang relevan.`;
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
                domainReply = 'ðŸ“­ Tidak ada email yang cocok untuk <b>hari kemarin</b>.';
              } else if (temporalHint?.type === 'today') {
                domainReply = 'ðŸ“­ Tidak ada email yang cocok untuk <b>hari ini</b>.';
              } else {
                domainReply = "Kotak masuk kosong atau tidak ada email yang cocok dengan pencarian.";
              }
            } else {
              const escapeHTML = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              domainReply = `ðŸ“§ <b>Email Terbaru Anda (${emails.length}):</b>\n\n` + emails.map(e => {
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
            domainReply = success ? `âœ… Email berhasil dikirim ke ${routingData.extracted_data.to}.` : `âŒ Gagal mengirim email.`;
          } else if (action === 'DELETE') {
            const emails = await gmailClient.getLatestEmails(routingData.extracted_data.search_keyword, 1);
            if (emails.length > 0) {
              const success = await gmailClient.deleteEmail(emails[0].id);
              domainReply = success ? `ðŸ—‘ï¸ Email dengan subjek "${emails[0].subject}" berhasil dihapus.` : `âŒ Gagal menghapus email.`;
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
          domainReply = `â“ Tabel Supabase mana yang ingin Anda kelola?\nPilih salah satu:\n- nexa_chat_memories\n- nexa_finance_dedup\n- nexa_user_profile\n- nexa_core_identity\n- nexa_2nd_brain`;
          pendingDatabaseContext = { tableName: '', lastAction: dbAction, askedAt: Date.now() };
          break;
        }

        if (dbAction === 'LIST_TABLES') {
          const overview = await supabaseMemories.getDatabaseOverview();
          if (!overview.success) {
            domainReply = `âŒ Gagal membaca overview database: ${escapeHtml(overview.error)}`;
            break;
          }
          const lines = overview.tables.map((t) => {
            const info = overview.counts[t];
            if (info?.error) return `- <b>${t}</b>: error (${escapeHtml(info.error)})`;
            return `- <b>${t}</b>: ${info?.count || 0} baris`;
          });
          domainReply = `ðŸ—„ï¸ <b>Overview Supabase (5 tabel N.E.X.A):</b>\n${lines.join('\n')}\n\nBalas dengan aksi jelas, misalnya:\n- "baca nexa_core_identity 5 data"\n- "tambah nexa_user_profile: aku suka teh"\n- "hapus nexa_2nd_brain id 12"`;
          pendingDatabaseContext = { tableName: '', lastAction: dbAction, askedAt: Date.now() };
        } else if (dbAction === 'READ_TABLE') {
          const result = await supabaseMemories.readDatabaseTable(tableName, {
            limit: dbData.max_results || 5,
            searchKeyword: dbData.search_keyword || ''
          });
          if (!result.success) {
            domainReply = `âŒ Gagal membaca tabel <b>${escapeHtml(tableName)}</b>: ${escapeHtml(result.error)}`;
            break;
          }
          if (!result.rows || result.rows.length === 0) {
            domainReply = `ðŸ“­ Tabel <b>${escapeHtml(result.table)}</b> tidak memiliki data yang cocok.`;
            break;
          }
          const rowsPreview = result.rows.map((r) => {
            const summary = Object.entries(r)
              .slice(0, 4)
              .map(([k, v]) => `${k}: ${String(v).substring(0, 80)}`)
              .join(' | ');
            return `â€¢ ${escapeHtml(summary)}`;
          }).join('\n');
          domainReply = `ðŸ“š <b>Data ${escapeHtml(result.table)} (${result.rows.length} baris):</b>\n${rowsPreview}`;
          pendingDatabaseContext = { tableName: result.table, lastAction: dbAction, askedAt: Date.now() };
        } else if (dbAction === 'INSERT_ROW') {
          const result = await supabaseMemories.insertDatabaseRow(tableName, dbData.row_data || {});
          domainReply = result.success
            ? `âœ… Insert berhasil ke <b>${escapeHtml(result.table)}</b> (id: ${result.row?.id || '-'})`
            : `âŒ Insert gagal ke <b>${escapeHtml(tableName)}</b>: ${escapeHtml(result.error)}`;
          pendingDatabaseContext = { tableName: result.table || tableName, lastAction: dbAction, askedAt: Date.now() };
        } else if (dbAction === 'UPDATE_ROW') {
          const result = await supabaseMemories.updateDatabaseRows(
            tableName,
            dbData.update_data || {},
            { rowId: dbData.row_id, searchKeyword: dbData.search_keyword }
          );
          domainReply = result.success
            ? `âœ… Update berhasil di <b>${escapeHtml(result.table)}</b>. Baris terubah: ${result.updatedRows.length}`
            : `âŒ Update gagal di <b>${escapeHtml(tableName)}</b>: ${escapeHtml(result.error)}`;
          pendingDatabaseContext = { tableName: result.table || tableName, lastAction: dbAction, askedAt: Date.now() };
        } else if (dbAction === 'DELETE_ROW') {
          const result = await supabaseMemories.deleteDatabaseRows(
            tableName,
            { rowId: dbData.row_id, searchKeyword: dbData.search_keyword }
          );
          domainReply = result.success
            ? `ðŸ—‘ï¸ Delete berhasil di <b>${escapeHtml(result.table)}</b>. Baris terhapus: ${result.deletedRows.length}`
            : `âŒ Delete gagal di <b>${escapeHtml(tableName)}</b>: ${escapeHtml(result.error)}`;
          pendingDatabaseContext = { tableName: result.table || tableName, lastAction: dbAction, askedAt: Date.now() };
        } else if (dbAction === 'DELETE_ALL_ROWS') {
          // Hanya set peringatan konfirmasi
          domainReply = routingData.reply_message || `âš ï¸ <b>PERINGATAN!</b> Anda meminta untuk menghapus SELURUH isi dari tabel <b>${escapeHtml(tableName)}</b>.\n\nApakah Anda benar-benar yakin ingin memusnahkan semua datanya? Balas <b>"YA"</b> untuk mengeksekusi, atau <b>"BATAL"</b>.`;
          pendingDatabaseContext = { tableName, lastAction: dbAction, awaitingConfirmation: true, askedAt: Date.now() };
        } else if (dbAction === 'DELETE_ALL_ROWS_CONFIRMED') {
          // AI router telah menyatakan user setuju. Gunakan tabel dari context jika AI lupa.
          const targetTable = tableName || pendingDatabaseContext?.tableName;
          if (!targetTable) {
            domainReply = `âŒ Kesalahan memori: N.E.X.A lupa tabel mana yang ingin dihapus massal. Silakan ulangi perintah dari awal.`;
            pendingDatabaseContext = null;
          } else {
            let driveDeletedMsg = '';
            if (targetTable === 'nexa_vault_items') {
              const googleWorkspace = require('../infrastructure/Google_Workspace');
              const driveSuccess = await googleWorkspace.deleteAllVaultFiles();
              driveDeletedMsg = driveSuccess
                ? '\nðŸ—‘ï¸ Semua file fisik di Google Drive Vault juga telah dimasukkan ke Trash.'
                : '\nâš ï¸ Gagal menghapus file fisik di Google Drive Vault.';
            }

            const result = await supabaseMemories.deleteAllDatabaseRows(targetTable);
            domainReply = result.success
              ? `ðŸ’¥ <b>Pemusnahan Massal Selesai</b>.\nSeluruh data di tabel <b>${escapeHtml(result.table)}</b> telah dihapus. Jumlah baris yang terdampak: ${result.deletedRows.length}${driveDeletedMsg}`
              : `âŒ Gagal memusnahkan isi tabel <b>${escapeHtml(targetTable)}</b>: ${escapeHtml(result.error)}`;
            pendingDatabaseContext = null;
          }
        } else if (dbAction === 'CANCEL_ACTION') {
          domainReply = 'âœ… Aksi database dibatalkan, Tuan.';
          pendingDatabaseContext = null;
        } else if (dbAction === 'DELETE_ROWS') {
          domainReply = `âŒ Penghapusan banyak baris secara otomatis belum didukung. Hapus satu per satu menggunakan kata kunci (contoh: "Hapus transaksi 150000"). Jika ini tabel Supabase, silakan buat skrip khusus.`;
        } else {
          domainReply = `âŒ Aksi database tidak dikenali: ${escapeHtml(dbAction)}`;
        }
        break;
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
      deliverWebhookReply();
    }
  }); // END setImmediate
});

// ============================================================
// TASKER WEBHOOK (Android â†’ N.E.X.A Server)
// ============================================================
router.post('/tasker', security.webhookAuth, async (req, res) => {
  const { type, data } = req.body;

  if (!type) {
    return res.status(400).json({ error: 'Missing event type' });
  }
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid data payload' });
  }

  console.log(`[TASKER] Received event type: ${type}`);


  if (type === 'SCREEN_TIME_VIOLATION') {
    try {
      await godMode.triggerGodMode(3, { violation_app: data.app_name, session_id: 'auto' });
      res.status(200).json({ status: 'God Mode Activated' });
    } catch (e) {
      console.error('[TASKER] God mode trigger failed:', e.message);
      res.status(500).json({ error: 'God Mode Failed to Execute' });
    }

  } else if (type === 'ALARM_DISMISSED') {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      console.error('[TASKER] ALARM_DISMISSED: Telegram credentials not configured.');
      return res.status(500).json({ error: 'Telegram not configured on server' });
    }
    try {
      const intelligenceBrief = require('../domain/Intelligence_Brief');
      const briefingText = await intelligenceBrief.generateMorningBriefing();
      const safeText = String(briefingText).substring(0, 4000);
      // Tasker-initiated: must use outbound (no webhook response available)
      await sendTelegramOutbound(safeText);

      // [PHASE 6 â€” Pilar 8.2] Log wake-up event for behavioral tracking (fire-and-forget)
      try {
        const behaviorEngine = require('../domain/Behavior_Engine');
        await behaviorEngine.logWakeUp();
      } catch (_) { /* Never let behavior logging crash the main briefing flow */ }

      res.status(200).json({ status: 'Briefing sent' });
    } catch (e) {
      console.error('[TASKER] Alarm briefing failed:', e.message);
      res.status(500).json({ error: 'Briefing Failed', detail: e.message });
    }

  } else {
    res.status(400).json({ error: `Unknown event type: ${type}` });
  }
});

// ============================================================
// GMAIL WEBHOOK (Google Cloud Pub/Sub â†’ N.E.X.A Server)
// ============================================================
router.post('/gmail', async (req, res) => {
  // AUDIT FIX (CRITICAL-1): Require a secret token query param to prevent unauthorized
  // API quota drain. Add ?token=<NEXA_GODMODE_SECRET> to the Pub/Sub push URL in GCP.
  const providedToken = String(req.query?.token || '').trim();
  const expectedToken = String(env.NEXA_GODMODE_SECRET || '').trim();
  if (!expectedToken) {
    console.error('[GMAIL WEBHOOK] NEXA_GODMODE_SECRET not configured â€” rejecting request.');
    return res.status(500).send('Server auth not configured');
  }
  // Timing-safe comparison to prevent token enumeration
  const { timingSafeEqual } = require('crypto');
  const tokA = Buffer.from(providedToken, 'utf8');
  const tokB = Buffer.from(expectedToken, 'utf8');
  const isValidToken = tokA.length === tokB.length && timingSafeEqual(tokA, tokB);
  if (!isValidToken) {
    console.warn('[GMAIL WEBHOOK] Rejected: invalid or missing token query param.');
    return res.status(403).send('Forbidden');
  }

  // Google Pub/Sub sends data in req.body.message
  if (!req.body || !req.body.message) {
    return res.status(400).send('Invalid Pub/Sub payload');
  }

  console.log('[GMAIL WEBHOOK] Received authenticated push notification from Pub/Sub');

  // Acknowledge the webhook immediately so Google doesn't retry
  res.status(200).send('OK');

  try {
    const financeEngine = require('../domain/Finance_Engine');
    // Instantly trigger polling logic without waiting for the 3-minute cron
    const count = await financeEngine.pollFinanceEmails();
    if (count > 0) {
      console.log(`[GMAIL WEBHOOK] Instantly processed ${count} new Auto-Sync transactions.`);
    }
  } catch (err) {
    console.error('[GMAIL WEBHOOK] Error processing instant poll:', err.message);
  }
});

module.exports = router;
module.exports.sendTelegramOutbound = sendTelegramOutbound;
