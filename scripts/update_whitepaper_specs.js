const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../docs/NEXA_Whitepaper.md');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update Section 6.2 (Daily Memory Consolidation -> Dual-Tier Chrono-Episodic Memory Engine)
const oldSection62 = `### 6.2 *Daily Memory Consolidation* (Proses Belajar Saat Tidur)

Sistem otak biologis mengkonsolidasikan ingatan saat manusia tidur, begitu pula N.E.X.A. Setiap tengah malam, *cron job* mengeksekusi konsolidasi memori harian:

1. Sistem memanggil \`getTodayMemories()\` yang menggunakan presisi *Timezone* WIB: menghitung \`jakartaOffset\` (UTC+7) untuk menarik murni semua percakapan sejak pukul \`00:00:00 WIB\` hari ini.
2. Data percakapan dilemparkan ke AI, disandingkan dengan **Fakta Lama** dari \`nexa_user_profile\`.
3. Menggunakan instruksi *Anti-Duplication* yang ketat, AI mengekstrak hanya "fakta baru yang belum pernah diketahui sebelumnya".
4. Output JSON di-parse, ditambahkan ke memori permanen via \`insertDatabaseRow\`, lalu N.E.X.A membuat laporan singkat yang merefleksikan hal-hal baru yang dipelajarinya hari itu.`;

const newSection62 = `### 6.2 *Dual-Tier Chrono-Episodic Memory Engine* (\`Chrono_Consolidator.js\` & \`Episodic_Recall.js\`)

Sistem otak biologis manusia memiliki dua lapisan memori: ingatan kerja jangka pendek dan memori episodik jangka panjang. N.E.X.A mengimplementasikan **Dual-Tier Memory Retention Policy** yang inovatif:

1. **Tier 1 (Raw Buffer 0 hingga 90 Hari):**
   * Semua riwayat percakapan dalam 90 hari terakhir (3 bulan) disimpan secara mentah (*verbatim*) di tabel \`nexa_chat_memories\`. Ini menjamin akurasi konteks obrolan terkini tanpa kehilangan detail kata sedikit pun.
2. **Tier 2 (Chrono-Episodic Daily Narratives > 90 Hari):**
   * Setiap malam pukul 03:30 WIB, subsistem \`Chrono_Consolidator.js\` memindai data obrolan yang usianya telah melewati 90 hari.
   * Seluruh percakapan dalam satu hari penuh (00:00 hingga 23:59 WIB) disintesis oleh model AI menjadi **Catatan Narasi Biografis Harian** (\`nexa_daily_narratives\`) yang ditulis dari **sudut pandang orang pertama N.E.X.A ("Saya / N.E.X.A")**.
   * Narasi ini merangkum peristiwa penting, entitas bernama (*named entities*), dinamika suasana hati, jam tidur perkiraan, serta daftar *unresolved loops* (rencana menggantung).
   * Setelah integritas narasi terverifikasi, ribuan baris pesan mentah lama dibersihkan secara atomik dari database, menghemat ruang simpan hingga 90% tanpa amnesia faktual.
3. **Mesin Penjelajah Waktu Kognitif (\`Episodic_Recall.js\`):**
   * Memungkinkan N.E.X.A mengingat peristiwa lampau melalui dua cara:
     - **Pencarian Tanggal Eksplisit:** Misalnya *"Apa yang terjadi pada tanggal 17 Mei 2026?"* langsung memuat kronik narasi tanggal tersebut.
     - **Pencarian Topik Semantik (pgvector):** Menggunakan kalkulasi kedekatan vektor untuk mencari topik lampau (misalnya *"Kapan terakhir servis laptop dan di mana?"*).`;

content = content.replace(oldSection62, newSection62);

// 2. Update Section 6.6.3 (Intention & Decision Journaling)
const oldSection663 = `#### 3. *Intention & Decision Journaling Anti-Spam* (\`Intention_Engine.js\`)
Sistem melacak keselarasan antara niat yang diucapkan (*Stated Intention*) dengan tindakan nyata (*Revealed Action*). Untuk menjaga kenyamanan eksekutif, modul ini dilengkapi filter anti-spam berbasis *null-check pointer* (\`.is('outcome_received_at', null)\`), memastikan penagihan evaluasi keputusan hanya dikirimkan tepat **satu kali** saat jatuh tempo.`;

const newSection663 = `#### 3. *Smart Closed-Loop Intention Engine & Auto-Reconciliation* (\`Intention_Engine.js\`)
Sistem melacak keselarasan antara rencana yang diucapkan (*Stated Intention*) dengan realisasi tindakan nyata (*Revealed Action*) dengan tingkat presisi tinggi:
- **Pembersihan Teks Konteks (\`_cleanUserText\`):** Menghapus seluruh blok kutipan Telegram \`[KONTEKS_REFERENSI]\` sebelum evaluasi, menjamin perkataan N.E.X.A sendiri tidak pernah salah dianggap sebagai niat Tuan Faqih.
- **Blacklist Aktivitas Rutin Sesaat (\`EPHEMERAL_EXCLUSIONS\`):** Menolak 100% aktivitas berdurasi kurang dari 2 jam (makan, tidur, sholat, ngobrol, mandi, rebahan, jalan santai).
- **Whitelist Domain Substantif (\`SUBSTANTIVE_DOMAIN_REGEX\`):** Hanya melacak tujuan berbobot nyata (beasiswa, skripsi, MUN, karier, pembelian kendaraan, aset elektronik, pemeriksaan medis).
- **Penutupan Loop Otomatis (\`autoReconcileIntentions\`):** N.E.X.A secara alami mendengar obrolan Tuan. Jika di obrolan berikutnya Tuan menyebutkan bahwa tugas tersebut sudah terlaksana (misal *"Alhamdulillah kemarin udah daftar MUN"*), sistem otomatis mengubah status menjadi \`FULFILLED\` sehingga Tuan tidak akan pernah ditagih lagi.
- **Batas Ketat Anti-Spam (1 Pesan per Pagi):** Pada cron pagi jam 08:15 WIB, pengiriman dibatasi maksimal hanya **1 notifikasi kilas balik per hari** menggunakan bahasa santai, hangat, dan tanpa tanda em-dash.`;

content = content.replace(oldSection663, newSection663);

// 3. Update Section 8.3 (Environment Variables) - Dual Google Auth to Master OAuth 2.0
content = content.replace(
  '- **Dual Google Authentication**: Menggunakan JSON *Service Account* (`GOOGLE_PRIVATE_KEY`) untuk operasi Google Drive, namun menggunakan sistem kredensial manusia (OAuth2 `GMAIL_REFRESH_TOKEN` & `TASKS_REFRESH_TOKEN`) untuk mengakses *inbox* email dan daftar tugas Tuan Faqih secara mandiri.',
  '- **Unified Master Google OAuth 2.0**: Mengonsolidasikan seluruh 16 izin resmi Google API (Calendar, Tasks, Gmail, Drive Vault, Docs 2nd Brain, Sheets, Meet) di bawah satu klien Master OAuth 2.0 terpadu (`Google_Master_Client.js`), meniadakan sepenuhnya ketergantungan pada Service Account lama.'
);

// 4. Update Section 7.3.3
content = content.replace(
  '3. **Daily Memory Consolidation (23:59 WIB)**: Mengekstraksi obrolan harian untuk membangun Long-Term Memory (dibahas detail di Bab 6).',
  '3. **Chrono-Episodic Daily Consolidation & Memory Hygiene (03:30 WIB)**: Mengeksekusi penyulingan obrolan lampau (>90 hari) menjadi catatan narasi harian di `nexa_daily_narratives` serta membersihkan fakta usang dari memori (dibahas detail di Bab 6).'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Successfully updated NEXA_Whitepaper.md with Chrono-Episodic and Smart Intention specifications!');
