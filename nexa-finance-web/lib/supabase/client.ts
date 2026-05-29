import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// Create client — if env vars are missing the client still initialises
// but all queries will fail gracefully (hooks return empty state).
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      // Gunakan localStorage agar sesi tetap ada walau tab ditutup/PWA di-restart
      persistSession: true,
      storageKey: 'nexa-finance-auth',
      // Auto-refresh token sebelum kedaluwarsa (penting untuk PWA)
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: {
        'x-application-name': 'nexa-finance-web',
      },
    },
    // Retry otomatis untuk koneksi yang unstable (di mobile/PWA)
    db: {
      schema: 'public',
    },
  }
)

export const isSupabaseConfigured =
  supabaseUrl.length > 0 && supabaseAnonKey.length > 0
