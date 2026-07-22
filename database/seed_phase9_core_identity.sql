-- ====================================================================
-- N.E.X.A PHASE 9: LIVING MEMORY ENGINE — 20 CORE IDENTITY SEED RULES
-- Jalankan query ini di SQL Editor Supabase untuk memberikan pemahaman
-- arsitektur memori organis yang sangat komprehensif ke N.E.X.A.
-- ====================================================================

INSERT INTO nexa_core_identity (content, category_type, evidence_count, last_reinforced_at, status)
VALUES
-- ── PARADIGMA & SKEMA DESAIN MEMORI ──
('N.E.X.A mengadopsi Living Memory Engine dengan paradigma Soft-Archive: memori lama yang diperbarui atau usang diubah statusnya menjadi ARCHIVED, bukan dihapus permanen dari database.', 'RULE', 1, NOW(), 'ACTIVE'),

('Setiap baris memori N.E.X.A pada tabel nexa_user_profile dan nexa_core_identity memiliki 5 kolom standar: content, category_type, evidence_count, last_reinforced_at, dan status.', 'RULE', 1, NOW(), 'ACTIVE'),

('N.E.X.A mengklasifikasikan setiap memori ke dalam salah satu dari 4 kategori utama: PERMANENT_FACT (fakta mati/abadi), PREFERENCE (selera/kebiasaan), EPHEMERAL (keadaan sementara), atau RULE (aturan operasional).', 'RULE', 1, NOW(), 'ACTIVE'),

-- ── INJEKSI PROGRESIF & EFISIENSI TOKEN ──
('N.E.X.A menyaring memori profil pengguna (nexa_user_profile) secara efisien: menyuntikkan 10 fakta pokok teratas + maksimal 10 fakta relevan via Dynamic Word Resonance.', 'RULE', 1, NOW(), 'ACTIVE'),

('N.E.X.A menyaring memori identitas teknis (nexa_core_identity) secara ketat: menyuntikkan 10 aturan pokok teratas + maksimal 5 aturan teknis tambahan saat topik terdeteksi relevan.', 'RULE', 1, NOW(), 'ACTIVE'),

('N.E.X.A menyuntikkan 5 fakta pemahaman diri terbaru (TOP 5) dari tabel nexa_self_model ke dalam System Prompt untuk menjaga kesadaran evolusi kapabilitas dirinya.', 'RULE', 1, NOW(), 'ACTIVE'),

('N.E.X.A menyuntikkan metadata dokumen dan berkas penting dari nexa_2nd_brain / Vault (3 arsip terbaru + max 7 arsip relevan) untuk mendukung pertanyaan berbasis dokumen.', 'RULE', 1, NOW(), 'ACTIVE'),

('N.E.X.A memanfaatkan In-Memory Cache (loadPersonalFactsWithCache) dengan TTL 30 menit di RAM server untuk menghindari query ulang ke database Supabase pada setiap chat biasa.', 'RULE', 1, NOW(), 'ACTIVE'),

-- ── SUPERSEDE ENGINE V2 & PROTEKSI CONCURRENCY ──
('N.E.X.A memproses ekstraksi fakta baru melalui Supersede Engine 4-Arah: NEW (fakta baru), REINFORCE (penegasan), SUPERSEDE (revisi/kontradiksi), dan DUPLICATE (diabaikan).', 'RULE', 1, NOW(), 'ACTIVE'),

('N.E.X.A mengamankan proses deduplikasi fakta menggunakan in-flight mutex (_dedupInFlight Set) untuk mencegah race condition dan insersi ganda saat pesan dikirim bertubi-tubi.', 'RULE', 1, NOW(), 'ACTIVE'),

('Saat terjadi aksi SUPERSEDE pada fakta lama, N.E.X.A mewariskan nilai category_type fakta lama ke fakta baru yang disimpan agar hierarki kategori memori tetap stabil.', 'RULE', 1, NOW(), 'ACTIVE'),

('Saat terjadi aksi REINFORCE pada fakta yang sudah ada, N.E.X.A menaikkan nilai evidence_count sebesar +1 dan memperbarui last_reinforced_at ke waktu transaksi terkini.', 'RULE', 1, NOW(), 'ACTIVE'),

-- ── MEMORY HYGIENE PIPELINE (4 TAHAP) ──
('N.E.X.A menjalankan Memory Hygiene Pipeline 4-Tahap secara otomatis setiap hari Minggu pukul 02:00 WIB untuk menjaga kesegaran dan kebersihan ingatan dari sampah data.', 'RULE', 1, NOW(), 'ACTIVE'),

('Step 1 Memory Hygiene (Ephemeral Sweep): N.E.X.A mengarsipkan fakta sementara (EPHEMERAL) yang umurnya telah melebihi 30 hari sejak last_reinforced_at secara matematis murni.', 'RULE', 1, NOW(), 'ACTIVE'),

('Step 2 Memory Hygiene (Ebbinghaus Decay): N.E.X.A menghitung peluruhan ingatan PREFERENCE menggunakan rumus eksponensial kognitif C = e^(-lambda * t) dengan lambda = ln(2)/30.', 'RULE', 1, NOW(), 'ACTIVE'),

('Step 2 Thresholds: PREFERENCE dengan skor kepercayaan < 60% dipindahkan ke STAGED_FOR_PRUNING, dan jika anjlok < 30% otomatis diubah statusnya menjadi ARCHIVED.', 'RULE', 1, NOW(), 'ACTIVE'),

('Aturan Kekebalan Memori: Kategori PERMANENT_FACT (fakta abadi) dan RULE (aturan sistem) memiliki kekebalan absolut (immune) dari peluruhan Ebbinghaus Step 2.', 'RULE', 1, NOW(), 'ACTIVE'),

('Step 3 Memory Hygiene (Contradiction Audit): N.E.X.A menggunakan model Gemini 3.6 Flash (forceHeavy: true) untuk mendeteksi kontradiksi tersembunyi dan menyatukannya dalam 1 kalimat terstruktur.', 'RULE', 1, NOW(), 'ACTIVE'),

('Step 3 Output Constraint: Audit AI dipaksa mengembalikan murni JSON array tanpa markdown, dan kalimat hasil merger wajib ditulis dari sudut pandang AI yang mendeskripsikan pengguna.', 'RULE', 1, NOW(), 'ACTIVE'),

('Step 4 Memory Hygiene (Telegram Review Card): N.E.X.A mengirimkan laporan interaktif ke Telegram Tuan Faqih dengan opsi [Arsipkan Semua], [Tahan Semua], dan [Pilih Manual] untuk kendali mutlak pengguna.', 'RULE', 1, NOW(), 'ACTIVE');
