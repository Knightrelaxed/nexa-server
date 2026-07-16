-- ============================================================
-- N.E.X.A — FASE 2 MIGRATION (Supabase Schema Expansion)
-- 1. Penambahan kolom `platform` ke tabel `nexa_chat_memories`
-- 2. Pembuatan tabel `nexa_wa_sessions` untuk penyimpana sesi Pintu 2 WhatsApp
-- ============================================================

-- 1. Tambahkan kolom platform ke nexa_chat_memories (default 'telegram' untuk riwayat lama)
ALTER TABLE nexa_chat_memories 
ADD COLUMN IF NOT EXISTS platform VARCHAR(50) DEFAULT 'telegram';

-- Buat indeks agar pencarian dan filter berdasarkan platform & created_at super cepat
CREATE INDEX IF NOT EXISTS idx_nexa_chat_memories_platform 
ON nexa_chat_memories(platform, created_at DESC);


-- 2. Buat tabel nexa_wa_sessions untuk persistent Baileys auth storage (anti-logout saat restart)
CREATE TABLE IF NOT EXISTS nexa_wa_sessions (
    session_id VARCHAR(100) NOT NULL,
    key_name VARCHAR(255) NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id, key_name)
);

-- Buat indeks untuk session_id agar loading keys oleh socket Baileys instan (< 5ms)
CREATE INDEX IF NOT EXISTS idx_nexa_wa_sessions_session_id 
ON nexa_wa_sessions(session_id);
