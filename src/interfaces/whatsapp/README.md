# N.E.X.A — Pintu 2: WhatsApp (Hexagonal Port & Adapter)

Directori ini berisi implementasi **Pintu 2 (WhatsApp Port)** menggunakan mesin `@whiskeysockets/baileys` yang berjalan di dalam arsitektur kesadaran tunggal N.E.X.A.

---

## 🏛️ Arsitektur & Peran Berkas

| Berkas | Fungsi / Peran |
| :--- | :--- |
| **`adapter.js`** | **Socket & Universal Converter**. Menjalankan koneksi WebSocket Baileys secara 24/7, menangani *reconnection logic*, mendengarkan event `messages.upsert`, memverifikasi keamanan pengirim dengan `whatsappIdentityLock`, dan menormalisasi pesan menjadi format standar (`UniversalMessage`) sebelum diserahkan ke `AIRouter`. |
| **`formatter.js`** | **Markdown Formatter Bridge**. Mengonversi sintaks Markdown standar N.E.X.A (seperti `**bold**`, `[label](link)`, `### heading`) ke format tanda baca resmi WhatsApp (`*bold*`, `_italic_`, `~strikethrough~`). |
| **`auth_storage.js`** | **Supabase Persistent Auth Storage**. Menggantikan penyimpanan berkas lokal (`useMultiFileAuthState`) dengan adaptor penyimpanan langsung ke tabel Supabase `nexa_wa_sessions`. Ini memastikan sesi QR login **tahan terhadap restart server atau redeploy** di Hugging Face Space / Vercel. |

---

## 🔒 Sistem Pengamanan & Kesadaran Tunggal

1. **Benteng Identitas (`whatsappIdentityLock`)**:
   Setiap pesan masuk diverifikasi oleh `src/utils/security.js -> whatsappIdentityLock(message)`. Hanya nomor/JID milik Tuan Faqih (`env.WHATSAPP_OWNER_JID` atau `env.WHATSAPP_OWNER_NUMBER`) yang diizinkan memicu proses AI. 100% nomor asing atau grup tak dikenal langsung ditolak di gerbang adapter.

2. **Unified Consciousness via Kolom `platform`**:
   Saat menyimpan atau menarik memori ke Supabase (`nexa_chat_memories`), adapter ini mengirimkan parameter `platform = 'whatsapp'`. Otak N.E.X.A (`Inference_Engine` dan `Contextual Retrieval`) otomatis menggabungkan riwayat obrolan dari Telegram (`platform = 'telegram'`) dan WhatsApp sehingga tidak terjadi amnesia lintas aplikasi.

---

## 📅 Jadwal Eksekusi & Pemasangan Baileys (Fase 3 & 4)
Folder ini disiapkan pada **Fase 2** sebagai kerangka arsitektur yang 100% matang dan terstandarisasi. Pemasangan *package* `@whiskeysockets/baileys` serta aktivasi socket akan dijalankan pada **Fase 3 & 4** begitu nomor sekunder siap dihubungkan melalui coupling QR Code.
