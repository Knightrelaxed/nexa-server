-- ====================================================================
-- N.E.X.A PHASE 10: AUTOMATED CRON ARCHITECTURE — 20 CORE IDENTITY SEEDS
-- Jalankan query ini di SQL Editor Supabase untuk mendaftarkan seluruh
-- 20 jadwal tugas otonom (cron jobs & background tasks) N.E.X.A ke
-- tabel nexa_core_identity.
-- ====================================================================

INSERT INTO nexa_core_identity (content, category_type, evidence_count, last_reinforced_at, status)
VALUES
-- ── DISIPLIN, OTOMATISASI KEUANGAN & WATCHDOG ──
('Cron Task 1: Discipline Auto-Escalation (* * * * *) berjalan setiap 1 menit untuk memeriksa sesi disiplin nexa_discipline_state yang pending_callback=true. Jika callback_expires_at terlampaui, otomatis mengeskalasi ke Level 3 (Surgical Force).', 'RULE', 1, NOW(), 'ACTIVE'),

('Cron Task 2: Finance Auto-Sync (*/3 * * * *) berjalan setiap 3 menit untuk memindai email notifikasi transaksi bank/e-wallet via Gmail API dan mengonversinya menjadi catatan keuangan Supabase.', 'RULE', 1, NOW(), 'ACTIVE'),

('Cron Task 3: Telegram Alert Watchdog berjalan secara interval 90 detik untuk memindai transaksi pending yang telegram_sent=false. Mengirim ulang alert yang gagal akibat gangguan TLS dan auto-save jika berumur >5 menit.', 'RULE', 1, NOW(), 'ACTIVE'),

('Cron Task 4: Event Proximity Alert (*/10 * * * *) berjalan setiap 10 menit untuk memindai Google Calendar. Mengirimkan pengingat proaktif jika ada agenda Tuan Faqih dalam 15–30 menit ke depan.', 'RULE', 1, NOW(), 'ACTIVE'),

-- ── RUTINITAS PROAKTIF HARIAN & PERINGATAN TUGAS ──
('Cron Task 5: The Midnight Check-in (0 1 * * *) berjalan setiap pukul 01:00 WIB untuk mengecek kesehatan sistem di tengah malam dan menyapa Tuan jika masih terdeteksi aktif di luar jam tidur.', 'RULE', 1, NOW(), 'ACTIVE'),

('Cron Task 6: The Diplomat Morning Briefing (30 5 * * *) berjalan setiap pukul 05:30 WIB untuk menyajikan ringkasan eksekutif pagi: cuaca, agenda harian, kabar intelijen, dan kata pembuka hari.', 'RULE', 1, NOW(), 'ACTIVE'),

('Cron Task 7: Overdue Task Alert (0 7 * * *) berjalan setiap pukul 07:00 WIB untuk mengecek Google Tasks dan memberikan notifikasi peringatan mendesak jika terdapat tugas Tuan yang sudah terlambat.', 'RULE', 1, NOW(), 'ACTIVE'),

('Cron Task 8: Scholarship Radar (0 8 * * 0) berjalan setiap Minggu pukul 08:00 WIB sebagai radar pencarian otomatis peluang beasiswa dan riset diplomatik internasional.', 'RULE', 1, NOW(), 'ACTIVE'),

('Cron Task 9: Midday Pulse (0 12 * * *) berjalan setiap pukul 12:00 WIB untuk melakukan check-in siang proaktif: menanyakan progress tugas hari ini dan merangkum pengeluaran keuangan hingga siang.', 'RULE', 1, NOW(), 'ACTIVE'),

('Cron Task 10: Evening Debrief (0 17 * * *) berjalan setiap pukul 17:00 WIB untuk menyapa sore hari, menangkap pencapaian harian Tuan, dan mencatat poin penting sebelum berganti malam.', 'RULE', 1, NOW(), 'ACTIVE'),

('Cron Task 11: Evening Reflective Briefing (0 20 * * *) berjalan setiap pukul 20:00 WIB untuk mengirimkan pertanyaan refleksi malam hari dan mendampingi Tuan sebelum beristirahat.', 'RULE', 1, NOW(), 'ACTIVE'),

('Cron Task 12: Tomorrow Prep (0 21 * * 1-6) berjalan Senin-Sabtu pukul 21:00 WIB untuk menyajikan pratinjau agenda besok, deadline tugas kritis, serta rekomendasi prioritas Chief of Staff.', 'RULE', 1, NOW(), 'ACTIVE'),

-- ── PROSES KOGNITIF, MEMORI ORGANIS & REFLEKSI DIRI ──
('Cron Task 13: Memory Hygiene Pipeline (0 2 * * 0) berjalan setiap Minggu pukul 02:00 WIB untuk mengeksekusi 4-Tahap pembersihan ingatan (Sweep, Decay, Audit, Report) sebelum Weekly Inference dimulai.', 'RULE', 1, NOW(), 'ACTIVE'),

('Cron Task 14: Morning Cognitive Pass (15 8 * * *) berjalan setiap pukul 08:15 WIB mengeksekusi 3 alur: Tier-2 Soft Approve proposal identitas >48j, Intention friction check, dan Outcome check (30 hari).', 'RULE', 1, NOW(), 'ACTIVE'),

('Cron Task 15: Weekly Self-Reflection Pass (0 16 * * 0) berjalan setiap Minggu pukul 16:00 WIB untuk mengevaluasi koreksi, anjuran, dan keterbatasan N.E.X.A 7 hari terakhir demi memperbarui nexa_self_model.', 'RULE', 1, NOW(), 'ACTIVE'),

('Cron Task 16: Weekly Behavioral Summary (0 20 * * 0) berjalan setiap Minggu pukul 20:00 WIB untuk membaca tabel nexa_behavior_log dan menyajikan laporan ringkasan pola perilaku Tuan selama 7 hari.', 'RULE', 1, NOW(), 'ACTIVE'),

('Cron Task 17: Weekly Cognitive Sunday Pass (0 21 * * 0) berjalan Minggu pukul 21:00 WIB sebagai orkestrator utama: mengeksekusi Identity Inference, Personality Narrative, dan Causal Knowledge Graph.', 'RULE', 1, NOW(), 'ACTIVE'),

('Cron Task 18: Daily Evening Cognitive Pass (30 23 * * *) berjalan setiap pukul 23:30 WIB mengeksekusi Mood Time-Series 24j/7h dan Ebbinghaus Memory Decay pass pada identity_model.', 'RULE', 1, NOW(), 'ACTIVE'),

('Cron Task 19: Daily Memory Consolidation (59 23 * * *) berjalan setiap pukul 23:59 WIB dengan Anti-Duplikasi v2 untuk mengekstrak fakta permanen baru dari chat seharian ke profil Tuan.', 'RULE', 1, NOW(), 'ACTIVE'),

('Cron Task 20: Periodic Budget Recaps (59 23 Minggu & Akhir Bulan) berjalan pukul 23:59 WIB untuk menyajikan analisis evaluasi arus kas dan ringkasan anggaran berkala.', 'RULE', 1, NOW(), 'ACTIVE');
