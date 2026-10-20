'use strict';

require('dotenv').config();
const { supabase } = require('../src/infrastructure/Supabase_Memories');
const {
  callAI,
  deduplicateAndSaveFact,
  deduplicateAndSaveSelfFact,
  invalidatePersonalFactsCache
} = require('../src/core/AI_Router');

const REFUSAL_REGEX = /maaf|transkrip|percakapan|kosong|sepertinya|tidak ada|tidak ditemukan|tidak terdapat|tidak ada instruksi|tidak ada aturan|berdasarkan transkrip/i;
const DIRECTIVE_KEYWORDS_RE = /\b(harus|wajib|dilarang|jangan|aturan|mulai sekarang|mulai dari sekarang|ingat ya|catat ya|peraturan)\b/i;

function parseLearnedFacts(rawOutput) {
  if (!rawOutput) return [];
  const cleanStr = String(rawOutput || '').trim().replace(/^```json|```$/gi, '').trim();
  if (!cleanStr || cleanStr.length < 5 || cleanStr === '[]' || cleanStr.toLowerCase() === 'none') return [];
  if (REFUSAL_REGEX.test(cleanStr) && !cleanStr.startsWith('[')) return [];

  try {
    const firstBracket = cleanStr.indexOf('[');
    const lastBracket  = cleanStr.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      const parsed = JSON.parse(cleanStr.substring(firstBracket, lastBracket + 1));
      if (Array.isArray(parsed)) {
        return parsed
          .map(s => String(s || '').trim().replace(/^[-*•0-9.)\s]+/, ''))
          .filter(s => s.length > 5 && !REFUSAL_REGEX.test(s));
      }
    }
  } catch (_) {}

  if (cleanStr.includes('\n')) {
    const chunks = cleanStr.includes('\n\n')
      ? cleanStr.split(/\n\s*\n/)
      : cleanStr.split('\n');
    return chunks
      .map(l => l.replace(/^[-*•0-9.)\s]+/, '').trim())
      .filter(l => l.length > 8 && !REFUSAL_REGEX.test(l) && !l.startsWith('[') && !l.startsWith('{'));
  }

  if (cleanStr.length > 8 && !REFUSAL_REGEX.test(cleanStr)) {
    return [cleanStr];
  }

  return [];
}

async function run() {
  console.log('[REPROCESS-10421] Mengambil rekaman panggilan ID 10421 dari Supabase...');
  const { data, error } = await supabase
    .from('nexa_chat_memories')
    .select('id, content, created_at')
    .eq('id', 10421)
    .single();

  if (error || !data) {
    console.error('[REPROCESS-10421] Gagal mengambil rekaman panggilan:', error ? error.message : 'Data tidak ditemukan');
    process.exit(1);
  }

  const rawContent = data.content.replace(/^\[ARSIP PANGGILAN SUARA LIVE NEXA — \d+ DETIK\]\n/, '');
  console.log(`[REPROCESS-10421] Panjang transkrip mentah: ${rawContent.length} karakter.`);

  // STAGE 1: Deterministic Strip + AI Alignment
  console.log('[REPROCESS-10421] Menjalankan Tahap 1: Penyelarasan Transkrip & Denoising (>70% Confidence)...');
  const cleanedRaw = rawContent.replace(/[\u00BF\u00A1]/g, '').trim();

  const alignmentPrompt = `Berikut adalah transkrip mentah dari rekaman panggilan suara real-time antara Tuan Faqih (pengguna) dan N.E.X.A (asisten AI).
Karena suara Tuan Faqih ditangkap melalui modul speech-to-text otomatis (ASR), terkadang ada salah dengar fonetik, kata janggal, atau karakter asing (seperti huruf Mandarin, Korea, atau fonem aneh) akibat derau mikrofon.

${cleanedRaw.slice(0, 18000)}

TUGAS ANDA:
Luruskan dan bersihkan transkrip di atas agar menjadi transkrip percakapan yang wajar dan akurat.

ATURAN ANTI-HALUSINASI KETAT (CONFIDENCE > 70%):
1. HANYA perbaiki salah dengar ucapan Tuan Faqih jika konteks dari jawaban N.E.X.A atau kalimat di sekitarnya membuktikan dengan keyakinan tinggi (>70%) apa kata aslinya.
   Contoh: Tuan Faqih berkata "house" dan N.E.X.A menjawab "Wah, kalau haus minum air", maka perbaiki kata Tuan Faqih menjadi "haus".
2. JANGAN PERNAH mengarang informasi, nama, angka, atau topik baru yang tidak ada pada kalimat asli.
3. Jika ada baris yang murni derau karakter asing non-Indonesia (seperti karakter Mandarin/Korea acak yang tidak berhubungan dengan isi obrolan), tandai baris tersebut dengan "[derau suara diabaikan]" atau hapus baris derau tersebut.
4. Jika Tuan Faqih sedang membahas bahasa tertentu (misal huruf Arab), pertahankan teks tersebut apa adanya.
5. Jika ragu atau tidak yakin 70%, BIARKAN kalimat apa adanya, jangan ditebak-tebak.
6. Pertahankan seluruh jawaban N.E.X.A apa adanya.

Keluarkan HANYA transkrip hasil perbaikan dengan format:
Tuan Faqih: [teks]
N.E.X.A: [teks]`;

  const alignedOutput = await callAI(alignmentPrompt);
  const conversationText = (alignedOutput && alignedOutput.length > 50) ? alignedOutput.trim() : cleanedRaw;
  console.log(`[REPROCESS-10421] Transkrip selaras berhasil dibentuk (${conversationText.length} karakter).`);

  // STAGE 2: Fact Extraction
  console.log('[REPROCESS-10421] Menjalankan Tahap 2A: Ekstraksi USER_PROFILE (Fakta Tuan Faqih)...');
  const userFactsPrompt = `Berikut adalah transkrip percakapan telepon suara antara Tuan Faqih dan N.E.X.A:

${conversationText}

TUGAS: Ekstrak fakta-fakta baru atau perubahan status tentang TUAN FAQIH (si manusia pengguna) dari percakapan di atas.
Fokus pada: kebiasaan baru, preferensi, kondisi kesehatan, status proyek/skripsi/esai, perubahan hidup, informasi personal.
ABAIKAN hal-hal yang sudah umum diketahui atau tidak mengandung informasi baru.

Balas HANYA dengan JSON array string. Contoh:
["Tuan Faqih sekarang rutin olahraga lari pagi", "Tuan Faqih sedang mengerjakan skripsi bab 3"]
Jika tidak ada fakta baru, balas dengan: []`;

  const userFactsRaw = await callAI(userFactsPrompt);
  const userFacts = parseLearnedFacts(userFactsRaw);

  if (userFacts.length > 0) {
    console.log(`[REPROCESS-10421] ${userFacts.length} fakta profil terdeteksi. Menyimpan ke nexa_user_profile...`);
    for (const fact of userFacts) {
      if (typeof fact === 'string' && fact.trim().length > 5) {
        console.log(` - Menyimpan: "${fact.trim()}"`);
        await deduplicateAndSaveFact(fact.trim(), 'USER_PROFILE').catch(e => console.warn('Gagal simpan:', e.message));
      }
    }
    invalidatePersonalFactsCache();
  } else {
    console.log('[REPROCESS-10421] Tidak ada fakta profil baru.');
  }

  // STAGE 2B: Core Identity Extraction
  console.log('[REPROCESS-10421] Menjalankan Tahap 2B: Ekstraksi CORE_IDENTITY (Aturan Perilaku N.E.X.A)...');
  const hasDirective = DIRECTIVE_KEYWORDS_RE.test(rawContent) || DIRECTIVE_KEYWORDS_RE.test(conversationText);

  if (hasDirective) {
    const coreIdPrompt = `Berikut adalah transkrip percakapan telepon suara:

${conversationText}

TUGAS: Ekstrak instruksi, koreksi, atau aturan baru yang Tuan Faqih berikan kepada N.E.X.A (sistem AI) dalam percakapan ini.
Fokus pada: cara N.E.X.A harus berperilaku, format respons, batasan, kemampuan yang disebutkan, atau koreksi atas respons N.E.X.A.
ABAIKAN percakapan biasa yang tidak berisi instruksi untuk N.E.X.A.
ABAIKAN jika instruksi berasal dari konteks yang ambigu atau tidak jelas.

Balas HANYA dengan JSON array string. Contoh:
["Saat di telepon, N.E.X.A harus berbicara lebih singkat", "N.E.X.A sudah bisa mencatat keuangan via suara telepon"]
Jika tidak ada, balas dengan: []`;

    const coreIdRaw = await callAI(coreIdPrompt);
    const coreIds = parseLearnedFacts(coreIdRaw);

    const validCoreIds = coreIds.filter(fact =>
      DIRECTIVE_KEYWORDS_RE.test(fact) || /\b(N\.?E\.?X\.?A|nexa)\b/i.test(fact)
    );

    if (validCoreIds.length > 0) {
      console.log(`[REPROCESS-10421] ${validCoreIds.length} aturan identitas tervalidasi. Menyimpan ke nexa_core_identity...`);
      for (const fact of validCoreIds) {
        if (typeof fact === 'string' && fact.trim().length > 5) {
          console.log(` - Menyimpan: "${fact.trim()}"`);
          await deduplicateAndSaveFact(fact.trim(), 'CORE_IDENTITY').catch(e => console.warn('Gagal simpan:', e.message));
        }
      }
    } else {
      console.log('[REPROCESS-10421] Tidak ada aturan identitas yang lolos validasi.');
    }
  } else {
    console.log('[REPROCESS-10421] Tidak ditemukan kata kunci direktif.');
  }

  // STAGE 2C: Self-Model Reflection
  console.log('[REPROCESS-10421] Menjalankan Tahap 2C: Ekstraksi Refleksi Diri (COMMUNICATION_STYLE)...');
  const selfModelPrompt = `Berikut adalah transkrip percakapan telepon suara antara Tuan Faqih dan N.E.X.A:

${conversationText.slice(0, 2000)}

TUGAS: Apakah ada observasi tentang cara N.E.X.A berkomunikasi atau bekerja dalam panggilan suara ini yang perlu dicatat sebagai refleksi diri?
Fokus pada: keberhasilan eksekusi, hambatan yang ditemui, pola komunikasi suara, atau area yang perlu diperbaiki.

Balas HANYA dengan 1 kalimat refleksi diri N.E.X.A (atau balas "NONE" jika tidak ada yang signifikan).
Contoh: "N.E.X.A berhasil mendampingi diskusi esai penulisan Bahasa Arab Tuan Faqih dengan respon alami."`;

  try {
    const selfReflection = await callAI(selfModelPrompt);
    const cleanReflection = String(selfReflection || '').trim().replace(/^```json|```$/gi, '').trim();
    if (cleanReflection && cleanReflection !== 'NONE' && !cleanReflection.toLowerCase().includes('tidak ada') && cleanReflection.length > 10) {
      console.log(` - Menyimpan refleksi: "${cleanReflection}"`);
      await deduplicateAndSaveSelfFact(
        cleanReflection,
        'COMMUNICATION_STYLE',
        'PASSIVE_LEARNING',
        'Retroactive reprocessing call ID 10421 — 986s'
      ).catch(() => {});
    }
  } catch (e) {
    console.warn('[REPROCESS-10421] Gagal refleksi:', e.message);
  }

  console.log('[REPROCESS-10421] Selesai. Seluruh fakta dan aturan panggilan 16 menit berhasil dipulihkan.');
}

run().catch(err => {
  console.error('[REPROCESS-10421] Fatal error:', err);
  process.exit(1);
});
