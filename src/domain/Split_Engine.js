/**
 * Split_Engine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Engine pemecahan transaksi campuran (Split Transaction) untuk N.E.X.A Finance.
 *
 * Tanggung jawab:
 *  1. parseSplitFromText()  — Deteksi & parse rincian split dari teks/voice natural
 *  2. parseSplitFromImage() — Deteksi & parse item belanja dari foto struk via Vision
 *  3. executeSplit()        — Hapus transaksi induk, insert N baris split ke Supabase
 *  4. isSplitIntent()       — Cek apakah input mengandung pola multi-item (tanpa keyword wajib)
 *  5. formatSplitMessage()  — Format pesan konfirmasi split yang rapi untuk Telegram
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { randomUUID } = require('crypto');
const supabaseFinance = require('../infrastructure/Supabase_Finance');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS: Currency Parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse nominal dari string fleksibel: "5rb", "5.000", "5000", "5k", "lima ribu"
 * Returns number atau NaN jika gagal.
 */
function _parseCurrency(str) {
  if (!str) return NaN;
  const s = String(str).toLowerCase().trim();

  // Handle kata "ribu" / "rb" / "k"
  const ribuan = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:ribu|rb|k)$/);
  if (ribuan) return parseFloat(ribuan[1].replace(',', '.')) * 1000;

  // Handle "juta" / "jt"
  const jutaan = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:juta|jt)$/);
  if (jutaan) return parseFloat(jutaan[1].replace(',', '.')) * 1000000;

  // Handle angka biasa dengan titik/koma sebagai separator ribuan
  const clean = s.replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? NaN : n;
}

// ─────────────────────────────────────────────────────────────────────────────
// DETEKSI POLA SPLIT (Heuristic + NLP sederhana tanpa keyword wajib)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deteksi apakah teks mengandung pola multi-item yang perlu di-split.
 * Tidak memerlukan keyword "split" atau "pecah" — cukup pola natural.
 *
 * Pola yang dideteksi:
 *   - "beras 10rb dan sabun 5rb dan es krim 3rb"
 *   - "split: dapur 100rb, jajan 20rb"
 *   - "untuk beli nasi 10000 sama jajan 5000 dan sabun 9000"
 *   - "dapur 100, kecantikan 30, jajan 20"
 *
 * Returns: true jika terdeteksi sebagai pola split
 */
function isSplitIntent(text) {
  if (!text) return false;
  const s = text.toLowerCase().trim();

  // Hard-pass: keyword eksplisit split
  if (/\bsplit\b|\bpecah\b|\brincian\b/.test(s)) return true;

  // Pola: minimal 2 pasangan [item + nominal] dipisahkan koma / "dan" / "sama" / "&"
  // Regex: kata alfanumerik (item) diikuti angka/satuan (nominal) lalu pemisah
  const pairPattern = /\b[a-z\s]{2,30}\b\s+\d[\d.,]*\s*(?:ribu|rb|k|jt|juta|000)?\s*(?:[,&]|\bdan\b|\bsama\b|\bserta\b|\bdan\b)/gi;
  const matches = (s.match(pairPattern) || []);
  if (matches.length >= 2) return true;

  // Pola: "untuk X Nrb, Y Nrb, Z Nrb" (daftar koma dengan nominal)
  const commaList = s.match(/\d[\d.,]*\s*(?:ribu|rb|k|jt|juta)/gi) || [];
  if (commaList.length >= 2 && /[,&]|\bdan\b|\bsama\b/.test(s)) return true;

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSER TEKS / VOICE → SPLIT ITEMS (via AI)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse teks/voice natural menjadi array item split dengan kategori.
 *
 * @param {string} text        — Teks rincian dari user (e.g. "beras 100rb, jajan 20rb, sabun 30rb")
 * @param {number} totalNominal — Total nominal transaksi induk (dari email/user sebelumnya)
 * @param {string} storeName   — Nama toko/merchant (opsional, untuk konteks AI)
 * @returns {Promise<Array<{label: string, nominal: number, category: string}>>}
 */
async function parseSplitFromText(text, totalNominal = null, storeName = '') {
  const { callAI } = require('../core/AI_Router');
  const supabaseFinanceModule = require('../infrastructure/Supabase_Finance');

  // Ambil daftar kategori valid dari DB
  const categories = await supabaseFinanceModule.getCategoriesList();
  const validCatNames = categories.map(c => c.name).join('\n');

  const totalHint = totalNominal ? `Total transaksi induk adalah Rp${Number(totalNominal).toLocaleString('id-ID')}.` : '';
  const storeHint = storeName ? `Nama toko/merchant: "${storeName}".` : '';

  const prompt = `Kamu adalah sistem ekstraksi item belanja campuran untuk pencatatan keuangan.
${storeHint}
${totalHint}
User menyebutkan rincian pembelian berikut:
"${text}"

Tugasmu:
1. Identifikasi SETIAP item/kelompok pengeluaran beserta nominalnya.
2. Kategorikan setiap item ke kategori yang PALING TEPAT dari daftar berikut:
${validCatNames}

ATURAN PENTING:
- Jika ada sisa nominal yang tidak disebutkan user (total item < totalNominal), BUAT item tambahan "Sisa belanja" dengan kategori "Lainnya" senilai selisihnya.
- Jika total item > totalNominal, PROPORSIKAN (scale down) semua nominal agar total = totalNominal.
- Jika totalNominal tidak diketahui, gunakan total dari item-item yang disebutkan.
- Output HANYA JSON array, tanpa markdown, tanpa penjelasan.

Output format TEPAT:
[
  {"label": "nama item singkat", "nominal": 100000, "category": "Kategori Valid"},
  {"label": "nama item singkat", "nominal": 20000, "category": "Kategori Valid"}
]`;

  let rawOutput;
  try {
    rawOutput = await callAI(prompt, { maxTokens: 500 });
  } catch (e) {
    console.error('[SPLIT_ENGINE] AI call failed:', e.message);
    return [];
  }

  // Parse JSON dari output AI
  try {
    // Coba ekstrak JSON array dari output AI (mungkin ada teks sebelum/sesudah)
    const jsonMatch = rawOutput.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array found');
    const items = JSON.parse(jsonMatch[0]);

    // Validasi dan sanitasi
    const cleaned = items
      .filter(item => item && item.label && typeof item.nominal === 'number' && item.nominal > 0)
      .map(item => ({
        label: String(item.label).trim().substring(0, 100),
        nominal: Math.round(item.nominal),
        category: String(item.category || 'Lainnya').trim()
      }));

    return cleaned;
  } catch (e) {
    console.error('[SPLIT_ENGINE] JSON parse failed:', e.message, '| Raw:', rawOutput?.substring(0, 200));
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSER GAMBAR STRUK → SPLIT ITEMS (via Vision Engine)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse foto struk/nota menjadi array item split dengan kategori.
 *
 * @param {string} fileId       — Telegram file_id dari foto struk
 * @param {number} totalNominal — Total nominal transaksi induk
 * @returns {Promise<Array<{label: string, nominal: number, category: string}>>}
 */
async function parseSplitFromImage(fileId, totalNominal = null) {
  const visionEngine = require('../core/Vision_Engine');
  const supabaseFinanceModule = require('../infrastructure/Supabase_Finance');

  const categories = await supabaseFinanceModule.getCategoriesList();
  const validCatNames = categories.map(c => c.name).join(', ');

  const totalHint = totalNominal ? `Total transaksi: Rp${Number(totalNominal).toLocaleString('id-ID')}.` : '';

  const visionPrompt = `Ini adalah foto struk/nota belanja. ${totalHint}
Ekstrak SEMUA item/produk yang tertera beserta harganya.
Kategorikan ke salah satu: ${validCatNames}.
Output HANYA JSON array:
[{"label": "nama item", "nominal": 15000, "category": "Kategori Valid"}]
Jika bukan struk belanja, output: []`;

  try {
    const rawVision = await visionEngine.processTelegramImage(fileId, visionPrompt);

    // Coba parse JSON dari output Vision
    const jsonMatch = rawVision.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('[SPLIT_ENGINE] Vision output bukan JSON array. Fallback ke teks.');
      // Fallback: gunakan parseSplitFromText dengan teks vision sebagai input
      return await parseSplitFromText(rawVision, totalNominal, 'Struk Belanja');
    }

    const items = JSON.parse(jsonMatch[0]);
    return items
      .filter(item => item && item.label && typeof item.nominal === 'number' && item.nominal > 0)
      .map(item => ({
        label: String(item.label).trim().substring(0, 100),
        nominal: Math.round(item.nominal),
        category: String(item.category || 'Lainnya').trim()
      }));
  } catch (e) {
    console.error('[SPLIT_ENGINE] Vision parse failed:', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTOR: Simpan Split Items ke Supabase
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Eksekusi split: simpan N baris transaksi baru dengan split_group_id yang sama.
 * Jika existingTxId diberikan, hapus transaksi induk setelah insert berhasil.
 *
 * @param {Array}  items          — Array item dari parseSplitFromText/Image
 * @param {Object} baseTx         — Data transaksi induk (date, account, paymentMethod, type)
 * @param {string} [existingTxId] — UUID transaksi induk di Supabase (jika split dari existing)
 * @returns {Promise<{success: number, failed: number, splitGroupId: string}>}
 */
async function executeSplit(items, baseTx, existingTxId = null) {
  if (!items || items.length === 0) {
    return { success: 0, failed: 0, splitGroupId: null };
  }

  const splitGroupId = randomUUID();
  let successCount = 0;
  let failedCount = 0;

  console.log(`[SPLIT_ENGINE] Executing split: ${items.length} items, group=${splitGroupId}`);

  // Insert setiap item sebagai baris transaksi terpisah
  for (const item of items) {
    try {
      const result = await supabaseFinance.writeTransaction({
        txType: baseTx.type || 'EXPENSE',
        nominal: item.nominal,
        categoryName: item.category,
        accountName: baseTx.account,
        description: item.label,
        dateISO: baseTx.dateISO,
        timeHHMM: baseTx.timeHHMM || null,
        paymentMethod: baseTx.paymentMethod || null,
        splitGroupId,      // akan dipakai di writeTransaction
        splitLabel: item.label
      });

      if (result.status === 'SUCCESS') {
        successCount++;
        console.log(`[SPLIT_ENGINE] ✅ Saved item: "${item.label}" Rp${item.nominal.toLocaleString('id-ID')} → ${item.category}`);
      } else {
        failedCount++;
        console.warn(`[SPLIT_ENGINE] ❌ Failed to save item "${item.label}": ${result.reason}`);
      }
    } catch (e) {
      failedCount++;
      console.error(`[SPLIT_ENGINE] Error saving item "${item.label}":`, e.message);
    }
  }

  // Hapus transaksi induk jika split dari existing transaction
  if (existingTxId && successCount > 0) {
    try {
      const { data, error } = require('../infrastructure/Supabase_Finance')
        ._getClient()
        .from('transactions')
        .delete()
        .eq('id', existingTxId);

      if (!error) {
        console.log(`[SPLIT_ENGINE] ✅ Deleted parent transaction: ${existingTxId}`);
      } else {
        console.error(`[SPLIT_ENGINE] Failed to delete parent tx: ${error.message}`);
      }
    } catch (e) {
      console.error(`[SPLIT_ENGINE] Error deleting parent tx:`, e.message);
    }
  }

  return { success: successCount, failed: failedCount, splitGroupId };
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMATTER: Pesan Konfirmasi Split untuk Telegram
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format pesan konfirmasi split yang rapi untuk dikirim ke Telegram.
 *
 * @param {Array}  items       — Array item split yang sudah disimpan
 * @param {number} total       — Total nominal keseluruhan
 * @param {string} storeName   — Nama toko/merchant (opsional)
 * @param {number} successCount — Jumlah item yang berhasil disimpan
 * @returns {string} — Pesan HTML untuk Telegram
 */
function formatSplitMessage(items, total, storeName = '', successCount = null) {
  const storeLabel = storeName ? ` <b>${storeName}</b>` : '';
  const totalFmt = `Rp${Number(total).toLocaleString('id-ID')}`;
  const itemCount = items.length;
  const savedCount = successCount !== null ? successCount : itemCount;

  let lines = items.map((item, i) => {
    const nomFmt = `Rp${Number(item.nominal).toLocaleString('id-ID')}`;
    return `  ${i + 1}. <b>${item.category}</b> — ${nomFmt}\n      📝 ${item.label}`;
  }).join('\n');

  return `✂️ <b>TRANSAKSI SPLIT DICATAT</b>${storeLabel}\n` +
    `<b>Total:</b> ${totalFmt} | <b>Dipecah menjadi ${itemCount} kategori</b>\n\n` +
    `<b>Rincian Pengeluaran:</b>\n${lines}\n\n` +
    `<i>✅ ${savedCount} dari ${itemCount} item tersimpan di database.</i>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  isSplitIntent,
  parseSplitFromText,
  parseSplitFromImage,
  executeSplit,
  formatSplitMessage,
};
