"use client"

import { useState } from "react"
import { useAuth } from "@/components/providers/supabase-provider"
import { ShieldCheck, LogOut, Mail, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export function SettingsAccountProfile() {
  const { userEmail, signOut } = useAuth()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    try {
      setLoggingOut(true)
      toast.info("Sedang keluar...")
      await signOut()
      toast.success("Berhasil keluar")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal keluar")
      setLoggingOut(false)
    }
  }

  return (
    <div className="mt-8 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100">
            <User className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-800 text-base">Akun Pengguna</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5" />
                Terautentikasi
              </span>
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              <span>{userEmail || "Memuat akun..."}</span>
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={handleLogout}
          disabled={loggingOut}
          className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 font-medium transition-colors shrink-0"
        >
          <LogOut className="h-4 w-4 mr-2" />
          {loggingOut ? "Memproses..." : "Keluar (Logout)"}
        </Button>
      </div>
    </div>
  )
}
