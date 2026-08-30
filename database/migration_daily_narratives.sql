-- ============================================================
-- [PHASE 11 / CHRONO-EPISODIC] DAILY NARRATIVES TABLE MIGRATION
-- ============================================================
-- Menyimpan konsolidasi naratif harian bersudut pandang N.E.X.A ("Saya")
-- untuk percakapan mentah (nexa_chat_memories) yang telah berusia > 90 hari.
-- Mencegah pembengkakan ukuran database Supabase (Zero Database Bloat)
-- dengan tetap menjaga 100% detail nama, angka, keputusan, dan mood.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.nexa_daily_narratives (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  narrative_date date NOT NULL UNIQUE,          -- Format: '2026-05-14'
  day_name character varying(15) NOT NULL,      -- e.g. 'Kamis', 'Senin'
  
  -- Narasi lengkap peristiwa hari itu (2-4 paragraf mendalam dari sudut pandang N.E.X.A)
  narrative text NOT NULL,
  
  -- Poin-poin spesifik (ACADEMIC, FINANCE, TECH_IDEA, PERSONAL_DECISION, INCIDENT, dll.)
  key_events jsonb DEFAULT '[]'::jsonb,
  
  -- Entitas bernama: { "people": [...], "places": [...], "projects": [...] }
  named_entities jsonb DEFAULT '{}'::jsonb,
  
  -- Hal/janji yang masih menggantung / belum selesai hari itu
  unresolved_loops jsonb DEFAULT '[]'::jsonb,
  
  -- Mood & kondisi dominan Tuan Faqih hari itu
  mood_state text DEFAULT 'NEUTRAL'::text,
  
  -- Estimasi waktu tidur / interaksi terakhir
  approx_sleep_time text,
  
  -- Jumlah chat mentah hari itu yang berhasil dikompresi
  total_chat_count integer DEFAULT 0,
  
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT nexa_daily_narratives_pkey PRIMARY KEY (id)
);

-- Indexing untuk query pencarian cepat berdasarkan tanggal & rentang waktu
CREATE INDEX IF NOT EXISTS idx_daily_narratives_date ON public.nexa_daily_narratives(narrative_date);
CREATE INDEX IF NOT EXISTS idx_daily_narratives_created_at ON public.nexa_daily_narratives(created_at);

-- Komentar dokumentasi tabel
COMMENT ON TABLE public.nexa_daily_narratives IS 'Konsolidasi memori biografis harian N.E.X.A untuk arsip jangka panjang (>90 hari)';
