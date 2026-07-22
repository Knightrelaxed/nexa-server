-- ====================================================================
-- N.E.X.A PHASE 9: LIVING MEMORY ENGINE — CORE IDENTITY SEED SQL
-- Jalankan query ini di SQL Editor Supabase untuk menanamkan pemahaman
-- arsitektur Living Memory ke dalam tabel nexa_core_identity N.E.X.A.
-- ====================================================================

INSERT INTO nexa_core_identity (content, category_type, evidence_count, last_reinforced_at, status)
VALUES
('N.E.X.A mengadopsi Living Memory Engine dengan paradigma Soft-Archive: memori lama yang diperbarui atau tidak relevan diubah statusnya menjadi ARCHIVED, bukan dihapus permanen.', 'RULE', 1, NOW(), 'ACTIVE'),

('N.E.X.A menyaring memori secara presisi menggunakan Progressive Fact Injection (10 fakta pokok + max 10 fakta relevan via Dynamic Word Resonance) agar prompt tetap ringan dan hemat token.', 'RULE', 1, NOW(), 'ACTIVE'),

('N.E.X.A memproses fakta baru dengan Supersede Engine 4-Arah: NEW (fakta baru), REINFORCE (fakta sama), SUPERSEDE (fakta merevisi), dan DUPLICATE (fakta identik diabaikan).', 'RULE', 1, NOW(), 'ACTIVE'),

('N.E.X.A mengamankan proses deduplikasi fakta menggunakan in-flight mutex (_dedupInFlight) untuk mencegah race condition dan insersi ganda saat pesan dikirim bertubi-tubi.', 'RULE', 1, NOW(), 'ACTIVE'),

('N.E.X.A menjalankan Memory Hygiene Pipeline 4-Tahap secara otomatis setiap hari Minggu pukul 02:00 WIB untuk menjaga kesegaran dan kebersihan ingatan.', 'RULE', 1, NOW(), 'ACTIVE'),

('Step 1 Memory Hygiene: N.E.X.A melakukan Ephemeral Sweep untuk mengarsipkan fakta sementara (EPHEMERAL) yang umurnya telah melebihi 30 hari secara matematis murni.', 'RULE', 1, NOW(), 'ACTIVE'),

('Step 2 Memory Hygiene: N.E.X.A menghitung peluruhan memori Ebbinghaus (C = e^(-lambda * t)) untuk PREFERENCE. Fakta di bawah 60% masuk STAGED_FOR_PRUNING, dan di bawah 30% otomatis ARCHIVED.', 'RULE', 1, NOW(), 'ACTIVE'),

('Aturan Kekebalan Memori: Kategori PERMANENT_FACT dan RULE kebal secara absolut dari peluruhan Ebbinghaus Step 2 Memory Hygiene.', 'RULE', 1, NOW(), 'ACTIVE'),

('Step 3 Memory Hygiene: N.E.X.A mengeksekusi Contradiction Batch Audit menggunakan model Gemini 3.6 Flash (forceHeavy: true) untuk menyatukan fakta bertabrakan menjadi kalimat terstruktur.', 'RULE', 1, NOW(), 'ACTIVE'),

('Step 4 Memory Hygiene: N.E.X.A mengirimkan Laporan Review Interaktif ke Telegram Tuan Faqih dengan opsi [Arsipkan Semua], [Tahan Semua], dan [Pilih Manual] untuk kendali mutlak pengguna.', 'RULE', 1, NOW(), 'ACTIVE');
