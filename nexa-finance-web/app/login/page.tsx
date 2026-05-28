"use client"

import { useState } from "react"
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client"
import { Wallet, Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

export default function LoginPage() {
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!isSupabaseConfigured) {
      setError("Supabase belum dikonfigurasi. Isi .env.local terlebih dahulu.")
      return
    }
    setLoading(true)
    setError(null)
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password })
    if (authErr) {
      setError(authErr.message)
      setLoading(false)
    } else {
      toast.success("Berhasil masuk!")
      window.location.href = "/dashboard"
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#ecfdf5] via-white to-[#f0fdf4] flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#10b981] shadow-lg shadow-emerald-200 mb-4">
            <Wallet className="h-8 w-8 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Nexa Finance</h1>
          <p className="text-muted-foreground mt-1 text-sm">Kelola keuangan Anda dengan cerdas</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-100 border border-border p-8">
          <h2 className="text-xl font-bold mb-6 text-center">Masuk ke Akun</h2>

          {!isSupabaseConfigured && (
            <div className="mb-4 flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-amber-500" />
              <div>
                <p className="font-semibold">Supabase belum dikonfigurasi</p>
                <p className="mt-0.5 text-xs leading-relaxed">
                  Salin <code className="font-mono bg-amber-100 px-1 rounded">.env.local.example</code> menjadi{" "}
                  <code className="font-mono bg-amber-100 px-1 rounded">.env.local</code> dan isi
                  URL + Anon Key dari dasbor Supabase Anda.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="nama@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-9 h-11"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1.5">Kata Sandi</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-9 pr-10 h-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-[#10b981] hover:bg-[#059669] text-white font-semibold rounded-full mt-2"
            >
              {loading ? "Memproses..." : "Masuk"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Hubungi admin untuk membuat akun baru.
          </p>
        </div>
      </div>
    </div>
  )
}
