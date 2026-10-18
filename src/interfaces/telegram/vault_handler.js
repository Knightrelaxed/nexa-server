'use strict';
// ============================================================
// N.E.X.A — TELEGRAM VAULT HANDLER
// Multi-layer metadata extraction, Telegram document download,
// Google Drive Vault upload, and interactive confirmation loops
// (KONFIRM / EKSTRAK ULANG / EDIT).
// ============================================================

const fs = require('fs');
const env = require('../../config/env');
const visionEngine = require('../../core/Vision_Engine');
const supabaseMemories = require('../../infrastructure/Supabase_Memories');
const googleWorkspace = require('../../infrastructure/Google_Workspace');
const { downloadProxyToFile, downloadRelayB64ToFile, fetchProxyJSON } = require('../../utils/telegram_proxy');
const { buildProxyChain } = require('../../utils/telegram_network');

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

function _normalizeKey(raw) {
  return String(raw || '')
    .trim().toLowerCase()
    .replace(/[^a-z0-9\u00C0-\u024F\s]/g, ' ')
    .trim().replace(/\s+/g, '_')
    .replace(/_+/g, '_').replace(/^_|_$/g, '');
}

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

function _smartKVSweep(text) {
  const results = {};
  if (!text) return results;

  const UNIVERSAL_PATTERNS = {
    nik: /\b(\d{16})\b/,
    nomor_polisi: /\b([A-Z]{1,2}\s?\d{1,4}\s?[A-Z]{1,3})\b/,
    nomor_telepon: /(?:Tel|Telp|HP|Phone)?\.?\s*(\+?62[\d\s-]{9,14}|0[\d\s-]{9,12})/i,
    website: /(www\.[a-z0-9.-]+\.[a-z]{2,}|https?:\/\/[^\s]+)/i,
    email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,})/i,
    tanggal: /(\d{1,2}\s+(?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+\d{4})/i,
    nomor_npwp: /(\d{2}\.\d{3}\.\d{3}\.\d{1}-\d{3}\.\d{3})/,
  };

  const colonRx = /^([A-Za-z\s\/]{2,40})\s*:\s*(.+)$/gm;
  const nlRx = /^([A-Z][A-Za-z\s]{2,30})\n([^\n]{1,80})$/gm;
  const tabRx = /^([A-Za-z\s\/]{3,30})\s{2,}(.{1,80})$/gm;

  for (const rx of [colonRx, nlRx, tabRx]) {
    let m;
    while ((m = rx.exec(text)) !== null) {
      const k = _normalizeKey(m[1]);
      if (k && m[2] && !results[k]) results[k] = m[2].trim();
    }
  }

  for (const [field, regex] of Object.entries(UNIVERSAL_PATTERNS)) {
    const match = text.match(regex);
    if (match?.[1] && !results[field]) results[field] = match[1].trim();
  }

  return results;
}

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

async function extractVaultMetadataFromVision({ fileId, fileName, promptHint = '' }) {
  if (!fileId) {
    return { judul: fileName || '', source: 'VISION_UNAVAILABLE' };
  }

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
    promptHint,
    directJsonPrompt
  );

  let directParsed = {};
  try {
    directParsed = parseJsonObjectFromText(rawVisionOutput) || {};
  } catch (e) {
    console.warn('[VAULT] Failed to parse direct JSON from vision. Fallback to regex. Output:', rawVisionOutput.substring(0, 50));
  }

  let heuristic = {};
  if (Object.keys(directParsed).length < 3) {
    heuristic = _smartKVSweep(rawVisionOutput);
  }

  const merged = { ...heuristic, ...directParsed };
  const orphans = extractOrphanText(rawVisionOutput, merged);
  const combined = { ...merged, ...orphans };
  const normalized = normalizeVaultMetadata(combined, rawVisionOutput, fileName);

  const docCategory = normalized.kategori_gambar || 'UMUM';
  console.log(`[VAULT-DIRECT] Processed image as: ${docCategory}. Extracted ${Object.keys(normalized).length} fields.`);

  return {
    judul: fileName || '',
    ...normalized,
    source: 'VISION_DIRECT',
  };
}

/**
 * Handle confirmation loop for pending Vault context.
 */
async function handleVaultConfirmation(textInput, pendingVaultContext, respondToTelegram) {
  if (!pendingVaultContext || !textInput) {
    return { handled: false, updatedContext: pendingVaultContext };
  }

  const normalized = String(textInput).trim();
  const upper = normalized.toUpperCase();
  const ageMs = Date.now() - (pendingVaultContext.askedAt || 0);

  if (ageMs > 15 * 60 * 1000) {
    return { handled: false, updatedContext: null };
  }

  const escapeHtml = (str) => String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  if (upper === 'KONFIRM' || upper === 'CONFIRM') {
    await supabaseMemories.updateVaultItemById(pendingVaultContext.vaultRowId, {
      status: 'CONFIRMED',
      category: pendingVaultContext.category,
      metadata_json: pendingVaultContext.metadata,
      confirmed_at: new Date().toISOString()
    }).catch((e) => console.error('[VAULT] Confirm update failed:', e.message));

    await respondToTelegram('✅ Baik, Tuan. Metadata Vault dikonfirmasi dan disimpan.');
    return { handled: true, updatedContext: null };
  }

  if (upper === 'EKSTRAK ULANG' || upper === 'EXTRACT ULANG' || upper === 'ULANGI') {
    try {
      const reExtracted = await extractVaultMetadataFromVision({
        fileId: pendingVaultContext.telegramFileId,
        fileName: pendingVaultContext.fileName,
        promptHint: 'Ekstrak ulang metadata dokumen ini. Fokus pada key-value yang paling akurat, lengkap, dan tidak redundan.'
      });
      const updated = {
        ...pendingVaultContext,
        metadata: {
          ...(pendingVaultContext.metadata || {}),
          ...reExtracted,
          source: 'VISION_REEXTRACT'
        },
        askedAt: Date.now()
      };

      await respondToTelegram(
        `🧠 Ekstrak ulang selesai, Tuan. Ini draft metadata terbaru:\n` +
        `${escapeHtml(formatVaultMetadata(updated.metadata))}\n\n` +
        `Balas: <b>KONFIRM</b> / <b>EKSTRAK ULANG</b> / <b>EDIT key: value; key2: value2</b>`
      );
      return { handled: true, updatedContext: updated };
    } catch (e) {
      await respondToTelegram(`❌ Ekstrak ulang gagal: <code>${escapeHtml(e.message)}</code>`);
      return { handled: true, updatedContext: pendingVaultContext };
    }
  }

  const edits = parseVaultEditCommand(normalized);
  if (edits) {
    const updated = {
      ...pendingVaultContext,
      metadata: { ...(pendingVaultContext.metadata || {}), ...edits, source: 'USER_EDIT' },
      askedAt: Date.now()
    };
    if (edits.category) updated.category = String(edits.category).toUpperCase();

    await respondToTelegram(
      `✅ Dicatat, Tuan. Draft metadata sekarang:\n${escapeHtml(formatVaultMetadata(updated.metadata))}\n\n` +
      `Balas: <b>KONFIRM</b> / <b>EKSTRAK ULANG</b> / <b>EDIT key: value; key2: value2</b>`
    );
    return { handled: true, updatedContext: updated };
  }

  return { handled: false, updatedContext: pendingVaultContext };
}

/**
 * Handle new Vault media uploads from Telegram.
 */
async function handleVaultUpload(message, vaultTriggerText, { respondToTelegram }) {
  const isVaultTriggered = /(^|\s)(\/vault|arsip|arsipkan|vault)(\s|$)/i.test(vaultTriggerText);
  if (!isVaultTriggered || (!message.document && (!message.photo || message.photo.length === 0))) {
    return { handled: false };
  }

  const escapeHtml = (str) => String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

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

      let newContext = null;
      if (saved?.row?.id) {
        newContext = {
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

      return { handled: true, newContext };
    } finally {
      try { if (fs.existsSync(tmpFilePath)) fs.unlinkSync(tmpFilePath); } catch (_) { }
    }
  } catch (e) {
    console.error('[VAULT] Upload failed:', e.message);
    await respondToTelegram(`❌ Gagal menyimpan ke Vault: <code>${escapeHtml(e.message)}</code>`);
    return { handled: true };
  }
}

module.exports = {
  downloadTelegramFileToTemp,
  parseVaultEditCommand,
  formatVaultMetadata,
  looksNarrative,
  normalizeVaultMetadata,
  extractVaultMetadataFromVision,
  handleVaultConfirmation,
  handleVaultUpload
};
