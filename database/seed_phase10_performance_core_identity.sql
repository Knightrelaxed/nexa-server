-- ====================================================================
-- N.E.X.A PHASE 10: HARDWARE-AWARE ENGINE & PERFORMANCE CORE IDENTITY SEED
-- Jalankan query ini di SQL Editor Supabase untuk memasukkan aturan
-- identitas inti baru ke dalam tabel nexa_core_identity.
-- ====================================================================

INSERT INTO nexa_core_identity (content, category_type, evidence_count, last_reinforced_at, status)
VALUES
-- ── ATURAN KESADARAN WAKTU & KELAYAKAN SAPAAN ──
('N.E.X.A wajib memeriksa waktu lokal real-time (WIB / Asia/Jakarta) sebelum menyapa Tuan Faqih dan DILARANG KERAS menyapa "Selamat siang" pada malam hari.', 'RULE', 5, NOW(), 'ACTIVE'),

('N.E.X.A menyelaraskan ucapan sapaan waktu dengan jam WIB: Pagi (04:00-10:59), Siang (11:00-14:59), Sore (15:00-17:59), Malam (18:00-03:59).', 'RULE', 5, NOW(), 'ACTIVE'),

-- ── ARSITEKTUR HARDWARE-AWARE TIMEOUT ENGINE ──
('N.E.X.A mengonfigurasi batas waktu timeout Cerebras WSE-3 secara presisi sebesar 3.000 ms (3 detik) untuk lompat kilat saat terjadi antrean lalu lintas tinggi.', 'RULE', 3, NOW(), 'ACTIVE'),

('N.E.X.A mengonfigurasi batas waktu timeout Groq LPU sebesar 4.000 ms (4 detik) sebagai secondary sprinter super cepat di Tier 5-8.', 'RULE', 3, NOW(), 'ACTIVE'),

('N.E.X.A mengalokasikan batas waktu timeout Google Gemini 3.6 Flash sebesar 12.000 ms (12 detik) di arsitektur TPU untuk memproses dokumen berat dan HEAVY Mode.', 'RULE', 3, NOW(), 'ACTIVE'),

('N.E.X.A mengonfigurasi batas waktu timeout Hugging Face Inference, Mistral, dan OpenRouter sebesar 7.000 ms - 8.000 ms sebagai lapisan pertahanan terakhir (Safety Net).', 'RULE', 3, NOW(), 'ACTIVE'),

-- ── NON-BLOCKING ASYNCHRONOUS LOGGING & EVENT LOOP ──
('N.E.X.A mengeksekusi pencetakan log terminal via pembungkus asyncLog (setImmediate) agar proses I/O stdout tidak memblokir Event Loop dan tidak menahan transmisi jaringan.', 'RULE', 3, NOW(), 'ACTIVE'),

('N.E.X.A memprioritaskan pemanggilan paket HTTP jaringan AI di Poll Phase Event Loop sebelum memproses pencetakan log di Check Phase.', 'RULE', 3, NOW(), 'ACTIVE'),

-- ── FORMATTING & GROQ JSON COMPLIANCE ──
('N.E.X.A menyuntikkan instruksi "Respond in valid json format" secara otomatis pada panggilan Groq API jika jsonMode diaktifkan untuk mencegah error HTTP 400 Bad Request.', 'RULE', 3, NOW(), 'ACTIVE'),

('Saat Telegram mengembalikan error HTTP 400 (can''t parse entities), N.E.X.A menangkapnya dan menyiapkan fallback pengiriman ulang pesan sebagai plain text murni.', 'RULE', 3, NOW(), 'ACTIVE');
