// ============================================================
// N.E.X.A — WHATSAPP MARKDOWN FORMATTER BRIDGE
// Mengonversi format keluaran Markdown dari otak AI N.E.X.A
// ke format tanda baca resmi WhatsApp (@whiskeysockets/baileys)
//
// Referensi format WhatsApp:
//   *bold*          — tebal
//   _italic_        — miring
//   ~strikethrough~ — coret
//   ```code```      — kode monospasi
// ============================================================
'use strict';

/**
 * Mengubah teks Markdown standar (GitHub Flavored / Gemini output)
 * menjadi format yang didukung secara natif oleh WhatsApp.
 *
 * URUTAN KONVERSI PENTING:
 * Harus dijalankan berurutan agar tidak ada regex yang saling tumpang tindih.
 *
 * @param {string} text - Teks Markdown input dari N.E.X.A AI output
 * @returns {string} Teks berformat WhatsApp
 */
function formatNexaToWhatsApp(text) {
  if (typeof text !== 'string' || !text) return '';

  let out = text;

  // 1. Ekstrak Kode blok (``` ... ```) ke placeholder agar tidak terpengaruh konversi
  const codeBlocks = [];
  out = out.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__NEXA_CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // 2. Heading Markdown (# / ## / ### ) → *UPPERCASE BOLD*
  out = out.replace(/^#{1,6}\s+(.+)$/gm, (_, content) => `*${content.trim().toUpperCase()}*`);

  // 3. Strikethrough (~~teks~~) → ~teks~
  out = out.replace(/~~([^~\n]+)~~/g, '~$1~');

  // 4. Bold ganda (**teks** atau __teks__) → *teks*
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '*$1*');
  out = out.replace(/__([^_\n]+)__/g, '*$1*');

  // Catatan Italic: WhatsApp secara natif menggunakan _italic_.
  // Konversi *teks* menjadi _teks_ sangat rawan bertabrakan dengan hasil konversi Bold di atas.
  // Kompromi aman: Biarkan *teks* tunggal dirender sebagai Bold oleh WhatsApp (keterbacaan tetap terjaga).

  // 5. Markdown Links [Label](URL) → Label (URL)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

  // 6. Horizontal rules (--- / ***) → garis kosong
  out = out.replace(/^[-*]{3,}$/gm, '');

  // 7. Kembalikan kode blok dari placeholder
  out = out.replace(/__NEXA_CODE_BLOCK_(\d+)__/g, (_, index) => {
    const rawBlock = codeBlocks[index];
    // Bersihkan tag bahasa (misal: ```javascript) karena WA tidak mendukungnya
    return rawBlock.replace(/^```[\w-]*\n?/, '```\n');
  });

  return out.trim();
}

/**
 * Membersihkan dan menormalkan teks masuk dari WhatsApp sebelum dikirim ke AI Router.
 * Membuang simbol formatting WhatsApp agar teks bersih dan mudah diproses AI.
 * @param {string} text - Teks mentah dari pesan WhatsApp
 * @returns {string} Teks bersih
 */
function formatWhatsAppToNexa(text) {
  if (typeof text !== 'string' || !text) return '';

  let clean = text.trim();

  // Hapus formatting WhatsApp agar AI membaca pesan sebagaimana adanya
  clean = clean.replace(/\*([^*\n]+)\*/g, '$1');    // *bold* → bold
  clean = clean.replace(/_([^_\n]+)_/g, '$1');      // _italic_ → italic
  clean = clean.replace(/~([^~\n]+)~/g, '$1');      // ~strikethrough~ → strikethrough
  clean = clean.replace(/```([\s\S]*?)```/g, '$1'); // ```code``` → code

  return clean.trim();
}

module.exports = {
  formatNexaToWhatsApp,
  formatWhatsAppToNexa
};
