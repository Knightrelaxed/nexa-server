# 🤖 N.E.X.A — Neural Executive with Xenial Agent

> **⚠️ Catatan Penting / Disclaimer:**  
> **Repository ini adalah PROYEK PRIBADI (*Personal Project*)** yang dikembangkan khusus untuk kebutuhan produktivitas, tata kelola keuangan, dan automasi harian personal. Bukan produk komersial atau sistem publik.

---

## 📌 Sekilas Tentang N.E.X.A

**N.E.X.A** adalah sistem asisten AI otonom (*Personal Chief of Staff*) yang dirancang untuk membantu mengelola kehidupan digital dan finansial secara proaktif melalui integrasi chat (Telegram), aplikasi web, serta perangkat seluler.

Berbeda dari chatbot biasa yang pasif, N.E.X.A beroperasi di latar belakang (*background services & crons*) untuk memantau agenda harian, mencatat keuangan secara otomatis, dan memberikan rekomendasi cerdas.

---

## 🚀 Fitur & Kemampuan Utama

1. **💰 Tata Kelola Keuangan (Personal Finance Engine)**
   - **Sinkronisasi Bank Otomatis:** Membaca mutasi resmi multi-bank (Bank Mandiri & Bank Jago) via email notifikasi.
   - **Pencatatan Cepat & Alami:** Mendukung input percakapan via Telegram dengan ketahanan *typo* dan singkatan (QRIS, Direct Debit, Transfer, Tunai, Kartu Kredit).
   - **Split Transaction:** Pemisahan satu struk belanja ke berbagai kategori anggaran.
   - **Audit & Analitik:** Pemantauan arus kas, sisa anggaran, dan tren pengeluaran real-time.

2. **🗓️ Asisten Produktivitas & Agenda**
   - **Briefing Harian:** Notifikasi rangkuman agenda pagi dan pengingat jadwal Google Calendar.
   - **Memori Kontekstual Jangka Panjang:** Menyimpan preferensi dan catatan penting menggunakan Supabase PostgreSQL & Vector Embeddings.

3. **📱 Multi-Device Bridge**
   - Jembatan WebSocket real-time yang menghubungkan server dengan aplikasi pendamping di Android dan desktop.

---

## 🏗️ Struktur & Komponen Repository

Proyek ini terdiri dari dua komponen utama:

- **Backend / Core Engine (`/src`):**
  - Berjalan di Node.js dengan arsitektur modular (*domain-driven*).
  - Mengorkestrasikan LLM routing (Gemini, Groq), database Supabase, integrasi Telegram bot, dan cron job otonom.
- **Frontend Dashboard (`/nexa-finance-web`):**
  - Web dashboard berbasis Next.js (App Router), React, dan Tailwind CSS.
  - Berfungsi sebagai GUI untuk visualisasi portofolio akun, riwayat transaksi, dan manajemen anggaran.

---

## 🔒 Lisensi & Privasi

Proyek ini dikembangkan secara tertutup dan mandiri untuk penggunaan pribadi (*Personal Use Only*). Seluruh hak cipta dan konfigurasi data bersifat privat.
