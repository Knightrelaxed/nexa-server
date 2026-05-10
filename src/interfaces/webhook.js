const express = require('express');
const router = express.Router();
const https = require('https');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');
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
const spreadsheetManager = require('../domain/Spreadsheet_Manager');
const supabaseMemories = require('../infrastructure/Supabase_Memories');
const taskManager = require('../domain/Task_Manager');
const webSearch = require('../infrastructure/Web_Search');
const googleWorkspace = require('../infrastructure/Google_Workspace');

// Pending Calendar Context: holds an incomplete calendar CREATE until user provides missing info
// Structure: { summary, start, askedAt }
let pendingCalendarContext = null;
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
  } catch (_) {}

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      const parsed = JSON.parse(fenced[1].trim());
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (_) {}
  }

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      const parsed = JSON.parse(text.slice(first, last + 1));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (_) {}
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
  'alamat','address','keterangan','catatan','deskripsi',
  'lokasi','uraian','penjelasan','tujuan','nama_jalan',
  'tempat_tinggal','domisili','perihal','isi_surat',
  'nama_pemegang','nama_peserta','atas_nama',
]);

// Sinyal bahwa string adalah DATA terstruktur, bukan narasi
const STRUCTURED_DATA_SIGNALS = [
  /\d{5,}/,
  /\d{2}[-\/]\d{2}/,
  /Rp\.?\s*[\d.,]+/,
  /m²|m2|ha|kg/,
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
    nik:           /\b(\d{16})\b/,
    nomor_polisi:  /\b([A-Z]{1,2}\s?\d{1,4}\s?[A-Z]{1,3})\b/,
    nomor_telepon: /(?:Tel|Telp|HP|Phone)?\.?\s*(\+?62[\d\s-]{9,14}|0[\d\s-]{9,12})/i,
    website:       /(www\.[a-z0-9.-]+\.[a-z]{2,}|https?:\/\/[^\s]+)/i,
    email:         /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,})/i,
    tanggal:       /(\d{1,2}\s+(?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+\d{4})/i,
    nomor_npwp:    /(\d{2}\.\d{3}\.\d{3}\.\d{1}-\d{3}\.\d{3})/,
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
    { key: 'website',        regex: /(www\.[a-z0-9.-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)/gi },
    { key: 'email',          regex: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,})/gi },
    { key: 'nomor_telepon',  regex: /(?<!\d)(\+?62[\d\s-]{9,13}|0[\d\s-]{9,12})(?!\d)/g },
    { key: 'nama_lembaga',   regex: /([A-Z][a-z]+ (?:[A-Z][a-z]+ ){1,4}(?:Indonesia|Nasional|Kota|Kabupaten|Republik))/g },
    { key: 'nomor_referensi',regex: /(?:No\.|Nomor)\s*:?\s*([A-Z0-9\/.-]{5,20})/gi },
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

async function downloadTelegramFileToTemp(fileId, preferredExt = '') {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is missing');
  const proxyBase = env.TELEGRAM_PROXY_URL;

  const getFileUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
  const proxiedGetFileUrl = proxyBase ? `${proxyBase}${encodeURIComponent(getFileUrl)}` : getFileUrl;

  const result = await exec(
    `curl -sS --ipv4 --connect-timeout 15 --max-time 30 "${proxiedGetFileUrl}"`,
    { maxBuffer: 2 * 1024 * 1024 }
  );
  const raw = String(result.stdout || '').trim();
  if (!raw.startsWith('{')) throw new Error(`Telegram getFile non-JSON: ${raw.substring(0, 200)}`);
  const parsed = JSON.parse(raw);
  if (!parsed.ok || !parsed.result?.file_path) throw new Error(`Telegram getFile error: ${raw.substring(0, 200)}`);

  const filePath = parsed.result.file_path;
  const ext = preferredExt || (filePath.includes('.') ? filePath.split('.').pop() : '');
  const tmpFilePath = path.join(os.tmpdir(), `nexa_vault_${Date.now()}${ext ? '.' + ext : ''}`);

  const downloadUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const proxiedDownloadUrl = proxyBase ? `${proxyBase}${encodeURIComponent(downloadUrl)}` : downloadUrl;

  await exec(
    `curl -sS --ipv4 --connect-timeout 15 --max-time 60 -o "${tmpFilePath}" "${proxiedDownloadUrl}"`,
    { maxBuffer: 5 * 1024 * 1024 }
  );

  const size = fs.existsSync(tmpFilePath) ? fs.statSync(tmpFilePath).size : 0;
  if (size < 50) throw new Error(`Downloaded file too small (${size} bytes)`);

  return { tmpFilePath, originalFilePath: filePath };
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
      // Save ALL outbound Telegram messages to memory by default
      await supabaseMemories.saveChatMemory('nexa', String(text).substring(0, 4000)).catch(() => {});
    }

    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
    const botToken = env.TELEGRAM_BOT_TOKEN.trim();
    const chatId = env.TELEGRAM_CHAT_ID.trim();
    const safeText = String(text).substring(0, 4000);

    // Use GET method with query params — Telegram supports both GET and POST.
    // Our Cloudflare Worker only forwards GET requests (fetch without body),
    // so POST body would get lost.
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&parse_mode=HTML&text=${encodeURIComponent(safeText)}`;

    const proxyBase = env.TELEGRAM_PROXY_URL;
    const targetUrl = proxyBase
      ? `${proxyBase}${encodeURIComponent(telegramUrl)}`
      : telegramUrl;

    const result = await exec(
      `curl -sS --ipv4 --connect-timeout 10 --max-time 15 "${targetUrl}"`,
      { maxBuffer: 1 * 1024 * 1024 }
    );
    console.log('[TELEGRAM-OUTBOUND] Response:', result.stdout.substring(0, 200));
  } catch (e) {
    console.error('[TELEGRAM-OUTBOUND] Error:', e.stderr || e.message);
  }
}

// ============================================================
// TELEGRAM WEBHOOK — Webhook Response Method
// ============================================================
// ARCHITECTURE: Instead of making outbound HTTP calls to
// api.telegram.org (which HF Docker BLOCKS), we embed the reply
// DIRECTLY in the HTTP response body. Telegram reads it and
// delivers the message. Zero outbound connections needed.
// Docs: https://core.telegram.org/bots/api#making-requests-when-getting-updates
// ============================================================
router.post('/telegram', security.telegramWebhookSecret, security.telegramIdentityLock, async (req, res) => {
  const message = req.body?.message || req.body?.edited_message;
  if (!message) {
    return res.status(200).send('OK');
  }

  // Helper: escape untrusted strings for HTML parse_mode
  const escapeHtml = (str) => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // ============================================================
  // CORE: Webhook Response — reply via HTTP response body
  // First call sends the reply. Subsequent calls use outbound fallback.
  // ============================================================
  let hasResponded = false;

  const respondToTelegram = async (text, skipMemory = false) => {
    if (!skipMemory) {
      await supabaseMemories.saveChatMemory('nexa', String(text).substring(0, 4000)).catch(() => {});
    }

    if (hasResponded) {
      // Already used the webhook response slot — use outbound fallback
      return sendTelegramOutbound(text, true); // Pass true because we already saved it above
    }
    hasResponded = true;
    const safeText = String(text).substring(0, 4000);
    console.log('[TELEGRAM] Sending reply via Webhook Response Method.');
    return res.status(200).json({
      method: 'sendMessage',
      chat_id: env.TELEGRAM_CHAT_ID,
      text: safeText,
      parse_mode: 'HTML'
    });
  };

  // Safety timeout: if processing takes > 25s, send empty 200 to prevent Telegram retry
  const safetyTimer = setTimeout(() => {
    if (!hasResponded) {
      hasResponded = true;
      console.warn('[TELEGRAM] Safety timeout (25s) — sending empty 200 OK.');
      res.status(200).send('OK');
    }
  }, 25000);

  let textInput = message.text;
  const captionText = message.caption || '';
  const vaultTriggerText = `${textInput || ''} ${captionText || ''}`.toLowerCase();

  try {
    // ============================================================
    // FINANCE CONFIRMATION LOOP (Y/N)
    // ============================================================
    if (textInput) {
      const isY = /^(y|ya|yes|simpan|ok|oke)$/i.test(textInput.trim());
      const isN = /^(n|no|tidak|batal|cancel)$/i.test(textInput.trim());
      
      if (isY || isN) {
        const financeEngine = require('../domain/Finance_Engine');
        const confirmationReply = await financeEngine.confirmPendingTransactions(isY);
        if (confirmationReply) {
          await supabaseMemories.saveChatMemory('user', textInput);
          await respondToTelegram(confirmationReply);
          clearTimeout(safetyTimer);
          return;
        }
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
          
          await supabaseMemories.saveChatMemory('user', textInput);
          pendingVaultContext = null;
          await respondToTelegram('✅ Baik, Tuan. Metadata Vault dikonfirmasi dan disimpan.');
          clearTimeout(safetyTimer);
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
            
            await supabaseMemories.saveChatMemory('user', textInput);
            await supabaseMemories.saveChatMemory('nexa', `[SISTEM: HASIL EKSTRAKSI ULANG VISION]\n${JSON.stringify(pendingVaultContext.metadata, null, 2)}`);
            
            clearTimeout(safetyTimer);
            return;
          } catch (e) {
            await respondToTelegram(`❌ Ekstrak ulang gagal: <code>${escapeHtml(e.message)}</code>`);
            clearTimeout(safetyTimer);
            return;
          }
        }

        const edits = parseVaultEditCommand(normalized);
        if (edits) {
          pendingVaultContext.metadata = { ...(pendingVaultContext.metadata || {}), ...edits, source: 'USER_EDIT' };
          if (edits.category) pendingVaultContext.category = String(edits.category).toUpperCase();
          pendingVaultContext.askedAt = Date.now();
          
          await supabaseMemories.saveChatMemory('user', textInput);
          await supabaseMemories.saveChatMemory('nexa', `[SISTEM: DRAFT METADATA DIUPDATE MANUAL]\n${JSON.stringify(pendingVaultContext.metadata, null, 2)}`);

          await respondToTelegram(
            `✅ Dicatat, Tuan. Draft metadata sekarang:\n${escapeHtml(formatVaultMetadata(pendingVaultContext.metadata))}\n\n` +
            `Balas: <b>KONFIRM</b> / <b>EKSTRAK ULANG</b> / <b>EDIT key: value; key2: value2</b>`
          );
          clearTimeout(safetyTimer);
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

          await supabaseMemories.saveChatMemory('user', `[SISTEM: MENGUNGGAH GAMBAR] Tuan Faqih mengirimkan gambar dokumen/arsip dengan nama: ${finalFileName}`);
          await supabaseMemories.saveChatMemory('nexa', `[SISTEM: HASIL EKSTRAKSI VISION] Saya telah membaca gambar tersebut dan mengekstrak data berikut:\n${JSON.stringify(draftMeta, null, 2)}`);

          await respondToTelegram(
            `✅ Tersimpan di Vault Drive (DRAFT).\n<b>Nama:</b> ${escapeHtml(finalFileName)}\n<b>Kategori (tebakan):</b> ${escapeHtml(category)}\n<b>Link:</b> ${uploaded.webViewLink || '(tidak tersedia)'}\n\n` +
            `<b>Draft metadata:</b>\n${escapeHtml(formatVaultMetadata(draftMeta))}\n\n` +
            `Balas salah satu:\n- <b>KONFIRM</b>\n- <b>EKSTRAK ULANG</b>\n- <b>EDIT key: value; key2: value2</b>`
          );
        } finally {
          try { if (fs.existsSync(tmpFilePath)) fs.unlinkSync(tmpFilePath); } catch (_) {}
        }

        clearTimeout(safetyTimer);
        return;
      } catch (e) {
        console.error('[VAULT] Upload failed:', e.message);
        await respondToTelegram(`❌ Gagal menyimpan ke Vault: <code>${escapeHtml(e.message)}</code>`);
        clearTimeout(safetyTimer);
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

      // Common Livin format: "Thu, 7 May 2026 21:38:01 +0700 (WIB)"
      // Remove trailing parenthetical timezone label to improve JS Date parsing consistency.
      const cleaned = raw.replace(/\s*\([^)]+\)\s*$/, '');
      let parsed = new Date(cleaned);
      if (!isNaN(parsed.getTime())) return parsed;

      // Fallback: strip non-essential labels and retry.
      parsed = new Date(cleaned.replace(/\bWIB\b/gi, '').trim());
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
      const nominal = parseFloat(String(nominalMatch[1]).replace(/\./g, '').replace(',', '.'));
      return isNaN(nominal) || nominal <= 0 ? null : nominal;
    };
    const extractLivinTransactionsFromEmails = (emails) => {
      const rows = [];
      for (const e of emails || []) {
        const blob = `${e.subject || ''}\n${e.body || ''}\n${e.snippet || ''}`;
        const nominal = extractNominalFromEmail(e);
        if (!nominal) continue;

        let destination = 'Livin Transaction';
        const merchantMatch = blob.match(/penerima\s+([a-z0-9\s\&\.\-]+)/i);
        if (merchantMatch?.[1]) {
          destination = merchantMatch[1].trim().substring(0, 80);
        }
        const parsedDate = parseEmailDateSafe(e.date);
        const dateIso = parsedDate ? parsedDate.toISOString() : new Date().toISOString();
        rows.push({
          nominal,
          type: 'EXPENSE',
          destination,
          category: 'Livin Email',
          description: (e.subject || 'Transaksi dari email Livin').substring(0, 100),
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
      return /(email|gmail|database|supabase|kalender|agenda|jadwal|task|tugas|keuangan|pengeluaran|pemasukan|search|cari|berita|spreadsheet|sheet|dokumen|2nd brain|profil|identitas)/.test(normalized);
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
          if (!data.search_keyword || String(data.search_keyword).trim() === '') {
            return '❓ Transaksi mana yang ingin diubah/dihapus, Tuan? Sebutkan kata kunci unik, nominal, atau nomor transaksi.';
          }
        }
        if (
          data.action !== 'IMPORT_FROM_EMAIL' &&
          (data.action === 'RECORD' || data.nominal !== undefined) &&
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
        if ((data.action === 'DELETE' || data.action === 'COMPLETE' || data.action === 'EDIT') && !data.search_keyword) {
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
        const action = data.action || 'APPEND';
        if ((action === 'EDIT' || action === 'DELETE') && !data.search_keyword) {
          return '❓ Arsip mana yang dimaksud, Tuan? Mohon beri kata kunci untuk mencari arsipnya.';
        }
        if ((action === 'APPEND' || action === 'EDIT') && !data.content) {
          return '❓ Konten arsip yang ingin disimpan/diubah belum ada, Tuan.';
        }
      }

      if (intent === 'USER_PROFILE' || intent === 'CORE_IDENTITY') {
        const action = data.action || 'APPEND';
        if (action === 'APPEND' && !data.content) {
          return '❓ Fakta/aturan yang ingin ditambahkan apa, Tuan?';
        }
        if (action === 'DELETE' && !data.search_keyword) {
          return '❓ Item mana yang ingin dihapus dari memori, Tuan?';
        }
      }

      if (intent === 'SPREADSHEET') {
        if (!data.action || !data.table_name) {
          return '❓ Untuk Spreadsheet, mohon sebutkan aksi dan nama tabel/file yang dimaksud, Tuan.';
        }
      }

      if (intent === 'NORMAL_CHAT' && /(hapus|delete|ubah|edit|update)\s+(itu|yang tadi)/.test(lowerText) && conversationContext?.intent) {
        return `❓ Apakah maksud Tuan untuk <b>${conversationContext.intent}</b> pada item sebelumnya? Mohon konfirmasi singkat.`;
      }

      return null;
    };
    // Database follow-up is now purely handled by AI Router's natural language comprehension
    
    // ============================================================
    // LAPISAN 4: BLACK BOX — Emergency Telegram Buffer Parser
    // ============================================================
    if (textInput && textInput.trim().startsWith('[BUFFER]')) {
      console.log('[BUFFER] Emergency buffer message received from Tasker via Telegram.');
      try {
        const bufferContent = textInput.replace('[BUFFER]', '').trim();
        const parts = bufferContent.split('|').map(s => s.trim());

        if (parts.length < 2) {
          await respondToTelegram('⚠️ [BUFFER] Format tidak valid. Gunakan: [BUFFER] nominal | merchant | timestamp');
          clearTimeout(safetyTimer);
          return;
        }

        const nominal = parseFloat(parts[0]);
        const merchant = parts[1] || 'Unknown';
        const rawTime = parts[2] || '';
        const parsedTime = rawTime ? new Date(rawTime) : new Date();
        const transactionTime = isNaN(parsedTime.getTime()) ? new Date() : parsedTime;

        if (isNaN(nominal) || nominal <= 0) {
          await respondToTelegram('⚠️ [BUFFER] Nominal tidak valid. Harus berupa angka positif.');
          clearTimeout(safetyTimer);
          return;
        }

        const result = await financeEngine.processTransaction({
          nominal,
          type: 'EXPENSE',
          destination: merchant,
          category: 'Auto-Buffer Recovery',
          description: 'Recovered from Telegram Buffer (Server was starting up)',
          time: transactionTime.toISOString()
        }, 'TASKER_LIVIN');

        if (result.status === 'DUPLICATE') {
          await respondToTelegram(`⚠️ [BUFFER] Transaksi Rp${nominal.toLocaleString('id-ID')} ke ${merchant} sudah tercatat sebelumnya. Duplikasi diabaikan.`);
        } else {
          await respondToTelegram(`✅ [BUFFER] Pulih: Rp${nominal.toLocaleString('id-ID')} ke ${merchant} berhasil dicatat.`);
        }
      } catch (bufferErr) {
        console.error('[BUFFER] Recovery failed:', bufferErr.message);
        await respondToTelegram(`❌ [BUFFER] Gagal memulihkan transaksi: ${bufferErr.message}`);
      }
      clearTimeout(safetyTimer);
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
        await respondToTelegram('⚠️ Maaf Tuan, seluruh 6 lapisan sistem pendengaran N.E.X.A (4x Groq Whisper + 2x Gemini Native Audio) gagal merespons. Mohon coba kirim ulang pesan suaranya dalam beberapa menit.');
        clearTimeout(safetyTimer);
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
        textInput = await visionEngine.processTelegramImage(largestPhoto.file_id, message.caption || '');
        console.log('[VISION] Image analysis result:', textInput);
      } catch (e) {
        console.error('[VISION] All 11 Vision Tiers FAILED:', e.message);
        await respondToTelegram('⚠️ Maaf Tuan, seluruh 11 lapisan sistem penglihatan N.E.X.A (4x Gemini 2.5 + 4x Groq + 2x Gemini 2.0 + HuggingFace) gagal merespons. Semua provider AI sedang down secara bersamaan.');
        clearTimeout(safetyTimer);
        return;
      }
    } else if (message.caption && !textInput) {
      textInput = message.caption;
    }

    if (!textInput || textInput.trim() === '') {
      clearTimeout(safetyTimer);
      if (!hasResponded) {
        hasResponded = true;
        res.status(200).send('OK');
      }
      return;
    }

    console.log('[TELEGRAM] Received message:', textInput.substring(0, 100));

    // ============================================================
    // PENDING CALENDAR RESOLUTION — intercept follow-up duration reply
    // ============================================================
    if (pendingCalendarContext) {
      const agendaManager = require('../domain/Agenda_Manager');
      const resolved = await agendaManager.tryResolvePending(textInput, pendingCalendarContext);
      if (resolved) {
        // Clear the pending context and cancel the 15-min timeout
        agendaManager.cancelPending(pendingCalendarContext.summary);
        pendingCalendarContext = null;
        await respondToTelegram(resolved.message);
        clearTimeout(safetyTimer);
        return;
      }
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
    } else if (conversationContext) {
      const globalFollowUpRouting = buildGlobalFollowUpRouting(textInput, conversationContext);
      if (globalFollowUpRouting) {
        routingData = globalFollowUpRouting;
        console.log('[ROUTER] Global follow-up context override activated for intent:', routingData.intent);
      }
    } else {
      // Send to AI Router
      routingData = await aiRouter.routeUserMessage(textInput, {
        last_intent: conversationContext?.intent || null,
        last_user_text: conversationContext?.lastUserText || null,
        last_assistant_reply: conversationContext?.lastAssistantReply || null,
        has_pending_calendar: Boolean(pendingCalendarContext),
        has_pending_email: Boolean(pendingEmailContext),
        has_pending_database: Boolean(pendingDatabaseContext)
      });
    }
    if (!routingData) {
      routingData = await aiRouter.routeUserMessage(textInput, {
        last_intent: conversationContext?.intent || null,
        last_user_text: conversationContext?.lastUserText || null,
        last_assistant_reply: conversationContext?.lastAssistantReply || null
      });
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
          const txRows = extractLivinTransactionsFromEmails(scopedEmails);

          if (txRows.length === 0) {
            domainReply = '📭 Data transaksi Livin tidak ditemukan di email yang dianalisis. Coba sebutkan rentang waktu yang lebih jelas, Tuan.';
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
          domainReply = `✅ Sinkronisasi Livin selesai.\n- Berhasil dicatat: <b>${success}</b>\n- Duplikasi diabaikan: <b>${duplicate}</b>\n- Sumber dianalisis: <b>${txRows.length}</b> transaksi email`;
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'READ_LATEST') {
          const recentData = await financeEngine.getRecentTransactions(5);
          domainReply = (routingData.reply_message ? routingData.reply_message + '\n\n' : '') + recentData;
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'READ_ANALYTICS') {
          const analyticsData = await financeEngine.getFinanceAnalytics();
          domainReply = (routingData.reply_message ? routingData.reply_message + '\n\n' : '') + analyticsData;
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'DELETE') {
          const result = await financeEngine.deleteTransaction(routingData.extracted_data.search_keyword);
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
            // Fallback if timeout already triggered and pending queue is empty
            const googleWorkspace = require('../infrastructure/Google_Workspace');
            const recent = await googleWorkspace.getFinanceSummary(1);
            if (recent && recent.length > 0) {
               const lastCat = recent[0][6]; // cat/desc
               const result = await financeEngine.editTransaction(lastCat, null, routingData.extracted_data.description, routingData.extracted_data.category);
               domainReply = `⏳ Waktu konfirmasi 5 menit telah habis sehingga transaksi otomatis terkunci. N.E.X.A melakukan *fallback* ke mode Edit:\n${result.message}`;
            } else {
               domainReply = 'Tidak ada transaksi yang tertunda atau bisa diubah.';
            }
          }
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'CANCEL_TRANSACTION') {
          const confirmationReply = await financeEngine.confirmPendingTransactions(false);
          domainReply = confirmationReply || 'Tidak ada transaksi yang tertunda.';
        } else if (routingData.extracted_data && routingData.extracted_data.action === 'EDIT') {
          const result = await financeEngine.editTransaction(
            routingData.extracted_data.search_keyword,
            routingData.extracted_data.nominal,
            routingData.extracted_data.description || routingData.extracted_data.destination,
            routingData.extracted_data.category
          );
          domainReply = result.message;
        } else if (routingData.extracted_data && (routingData.extracted_data.nominal || routingData.extracted_data.action === 'RECORD')) {
          const txData = {
            nominal: routingData.extracted_data.nominal,
            type: routingData.extracted_data.type || 'EXPENSE',
            destination: routingData.extracted_data.destination || routingData.extracted_data.merchant || 'Unknown',
            category: routingData.extracted_data.category || 'Uncategorized',
            description: routingData.extracted_data.description || '-',
            time: routingData.extracted_data.time || new Date().toISOString()
          };
          const confirmMsg = await financeEngine.requestTransactionConfirmation(txData, 'PENCATATAN KEUANGAN BARU');
          if (confirmMsg) {
             domainReply = confirmMsg; // Send the confirmation prompt back to the user
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
          const agendaManager = require('../domain/Agenda_Manager');
          const calData = routingData.extracted_data;

          // If there's a pending calendar and the current CREATE has an end time + matching summary, merge!
          if (pendingCalendarContext && calData.action === 'CREATE' && calData.end && !calData.summary) {
            calData.summary = pendingCalendarContext.summary;
            calData.start = pendingCalendarContext.start;
            agendaManager.cancelPending(pendingCalendarContext.summary);
            pendingCalendarContext = null;
          }

          const calResult = await agendaManager.handleCalendarIntent(calData, textInput);

          if (calResult && calResult.status === 'PENDING_END') {
            // Store context so the NEXT message can resolve it directly
            pendingCalendarContext = { summary: calData.summary, start: calData.start, askedAt: Date.now() };
          } else if (calResult && calResult.status === 'SUCCESS') {
            pendingCalendarContext = null;
          }

          if (calResult && calResult.message) {
            domainReply = calResult.message;
          }
        }
        break;

      case 'TASK':
        if (routingData.extracted_data) {
          const taskResult = await taskManager.handleTaskIntent(routingData.extracted_data);
          if (taskResult && taskResult.message) domainReply = taskResult.message;
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

      case 'USER_PROFILE':
        if (routingData.extracted_data) {
          const action = routingData.extracted_data.action || 'APPEND';
          if (action === 'APPEND' && routingData.extracted_data.content) {
            await supabaseMemories.saveUserProfile(routingData.extracted_data.content);
            invalidatePersonalFactsCache();
            domainReply = `✅ Fakta personal tersimpan ke database profil. Saya akan selalu mengingatnya, Tuan.`;
          } else if (action === 'DELETE' && routingData.extracted_data.search_keyword) {
            const success = await supabaseMemories.deleteFromUserProfile(routingData.extracted_data.search_keyword);
            invalidatePersonalFactsCache();
            domainReply = success ? `🗑️ Fakta personal berhasil dihapus dari memori permanen.` : `❌ Gagal menemukan fakta tersebut di profil Anda.`;
          }
        }
        break;

      case 'CORE_IDENTITY':
        if (routingData.extracted_data) {
          const action = routingData.extracted_data.action || 'APPEND';
          if (action === 'APPEND' && routingData.extracted_data.content) {
            await supabaseMemories.saveCoreIdentity(routingData.extracted_data.content);
            invalidatePersonalFactsCache();
            domainReply = `✅ Aturan identitas inti N.E.X.A telah diperbarui.`;
          } else if (action === 'DELETE' && routingData.extracted_data.search_keyword) {
            const success = await supabaseMemories.deleteFromCoreIdentity(routingData.extracted_data.search_keyword);
            invalidatePersonalFactsCache();
            domainReply = success ? `🗑️ Aturan identitas inti berhasil dihapus.` : `❌ Gagal menemukan aturan tersebut di sistem.`;
          }
        }
        break;

      case 'SPREADSHEET':
        if (routingData.extracted_data) {
          const result = await spreadsheetManager.processSpreadsheetIntent(routingData.extracted_data);
          if (result && result.message) {
            domainReply = result.message;
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
              domainReply = '✅ Siap, saya hentikan pembacaan email dulu. Kalau perlu lanjut, tinggal bilang.';
              break;
            }

            const dayHint = parseDayOfMonthHint(textInput);
            const shouldRunEmailAnalytics =
              isEmailAnalyticsQuestion(textInput) ||
              isEmailDateOnlyQuestion(textInput) ||
              (dayHint && Boolean(pendingEmailContext?.lastBatch?.length));

            if (shouldRunEmailAnalytics) {
              const searchKeywordForAnalytics = routingData.extracted_data.search_keyword || pendingEmailContext?.searchKeyword || 'livin';
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
                  ? `📭 Saya tidak menemukan transaksi/email Livin pada tanggal <b>${dayHint}</b> di batch email terakhir.`
                  : `📊 Pada tanggal <b>${dayHint}</b>, terdeteksi <b>${total}</b> transaksi/email Livin di batch yang saya analisis.`;
              } else {
                domainReply = `📊 Dari batch email terakhir, saya menemukan <b>${total}</b> email transaksi Livin yang relevan.`;
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
              const googleWorkspace = require('../infrastructure/Google_Workspace');
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
        } else {
          domainReply = `❌ Aksi database tidak dikenali: ${escapeHtml(dbAction)}`;
        }
        break;
      }
    }

    // Send reply via Webhook Response Method (ZERO outbound needed)
    const finalReply = domainReply || routingData.reply_message;
    if (finalReply) {
      // Keep memory aligned with the ACTUAL final reply (domain execution output),
      // not only the router's draft reply_message.
      if (domainReply && domainReply !== routingData.reply_message) {
        await supabaseMemories.saveChatMemory('nexa', finalReply).catch(() => {});
      }
      console.log('[TELEGRAM] Replying with intent:', routingData.intent);
      conversationContext = {
        ...(conversationContext || {}),
        lastAssistantReply: finalReply,
        askedAt: Date.now()
      };
      // Pass skipMemory = true because AI_Router (or domainReply logic above) already saved it!
      await respondToTelegram(finalReply, true);
    }

  } catch (error) {
    console.error('[TELEGRAM] Error processing message:', error.message);
    await respondToTelegram(`⚠️ N.E.X.A mengalami gangguan internal:\n<code>${escapeHtml(error.message)}</code>\n\nSilakan cek log server di Hugging Face Space dashboard.`);
  } finally {
    clearTimeout(safetyTimer);
    // Ensure Telegram always gets a response to prevent retries
    if (!hasResponded) {
      hasResponded = true;
      res.status(200).send('OK');
    }
  }
});

// ============================================================
// TASKER WEBHOOK (Android → N.E.X.A Server)
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
// GMAIL WEBHOOK (Google Cloud Pub/Sub → N.E.X.A Server)
// ============================================================
router.post('/gmail', async (req, res) => {
  // Google Pub/Sub sends data in req.body.message
  if (!req.body || !req.body.message) {
    return res.status(400).send('Invalid Pub/Sub payload');
  }

  console.log('[GMAIL WEBHOOK] Received push notification from Pub/Sub');
  
  // Acknowledge the webhook immediately so Google doesn't retry
  res.status(200).send('OK');

  try {
    const financeEngine = require('../domain/Finance_Engine');
    // Instantly trigger polling logic without waiting for the 3-minute cron
    const count = await financeEngine.pollLivinEmails();
    if (count > 0) {
      console.log(`[GMAIL WEBHOOK] Instantly processed ${count} new Livin transactions.`);
    }
  } catch (err) {
    console.error('[GMAIL WEBHOOK] Error processing instant poll:', err.message);
  }
});

module.exports = router;
