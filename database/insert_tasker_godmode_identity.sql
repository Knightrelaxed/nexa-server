-- ==============================================================================
-- N.E.X.A CORE IDENTITY - TASKER INTEGRATION & BRACKETED LOGS SYSTEM
-- Siap dijalankan langsung di Supabase SQL Editor
-- Setiap baris dirancang singkat, padat, dan menjelaskan sistem log kurung siku
-- ==============================================================================

INSERT INTO "public"."nexa_core_identity" ("content", "created_at") VALUES 
('[TASKER WEBHOOK] Log penanda saat server menerima HTTP POST di /webhook/tasker dari aplikasi Tasker di HP Samsung A33 5G Tuan Faqih.', NOW()),
('[PAYLOAD] Log penanda proses ekstraksi data JSON dari Tasker yang berisi nama aplikasi (app_name) dan durasi penggunaan (duration_minutes).', NOW()),
('[SESSION] Log penanda proses pemeriksaan atau pembuatan sesi pemantauan aplikasi yang disimpan di database Supabase.', NOW()),
('[GRACE PERIOD] Log penanda deteksi masa tunggu 3 menit setelah tombol Telegram Level 2 aktif. Jika masih aktif, eskalasi ditunda sementara.', NOW()),
('[STATE TRANSITION] Log penanda perhitungan kenaikan level eskalasi (prevLevel -> nextLevel) berdasar batas toleransi mood hari ini (max_level_cap).', NOW()),
('[EXECUTION] Log penanda pemicuan protokol eksekusi fisik, baik Level 2 dengan tombol Telegram maupun God Mode Level 3 dan Level 4.', NOW()),
('[GODMODE AI] Log penanda panggilan LLM/AI Router untuk meracik kalimat nasihat suara dinamis secara real-time sesuai tone (firm/strict/empathetic).', NOW()),
('[NTFY PUSH] Log penanda penembakan payload berformat COMMAND|SPOKEN_TEXT ke topik rahasia ntfy ponsel dengan latensi < 0.5 detik.', NOW()),
('[AUDIT LOG] Log penanda penyimpanan riwayat pelanggaran ke nexa_behavior_log di Supabase dan pengiriman laporan audit ke Telegram Tuan Faqih.', NOW()),
('[EKSEKUTOR TASKER HP] NEXA_Executor di HP membaca %evtprm3, memecah perintah via splitter |, membacakan suara AI via Say, dan mengeksekusi aksi fisik.', NOW()),
('[AKSI FISIK LEVEL 2] Jika menerima GO_HOME, Tasker membacakan nasihat AI, membunyikan alarm Beep 8000Hz, dan melempar layar ke Home Screen.', NOW()),
('[AKSI FISIK LEVEL 3] Jika menerima FORCE_STOP_APP, Tasker menutup paksa aplikasi (Kill App) dan mengubah layar One UI 6 menjadi Hitam Putih (Grayscale).', NOW()),
('[AKSI FISIK LEVEL 4] Jika menerima LOCK_SCREEN, Tasker menyalakan Mode Pesawat (putus internet) dan mengunci layar fisik ponsel (System Lock).', NOW()),
('[TOMBOL TELEGRAM LEVEL 2] Tombol [✅ Ini Riset Penting] mereset level ke 0, [⏰ +10 Menit] memberi perpanjangan waktu, [❌ Saya Menunda] memicu Level 3.', NOW());

-- ==============================================================================
-- PENTING: Sinkronisasi sequence ID setelah insert agar tidak bertabrakan
-- ==============================================================================
SELECT setval(
  pg_get_serial_sequence('"public"."nexa_core_identity"', 'id'),
  (SELECT MAX(id) FROM "public"."nexa_core_identity"),
  true
);
