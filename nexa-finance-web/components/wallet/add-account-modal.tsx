"use client"

import { useState, useEffect } from "react"
import { createAccount, updateAccount } from "@/lib/supabase/mutations"
import { useAuth } from "@/components/providers/supabase-provider"
import { X, Wallet, Banknote, CreditCard, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface AddAccountModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  initialData?: any
}

const ACCOUNT_TYPES = [
  { value: "cash",     label: "Akun umum",       Icon: Wallet,      color: "bg-slate-100 text-slate-500" },
  { value: "bank",     label: "Rekening Bank",   Icon: Banknote,    color: "bg-sky-100 text-sky-600" },
  { value: "e-wallet", label: "Dompet Digital",  Icon: CreditCard,  color: "bg-purple-100 text-purple-600" },
] as const

const CURRENCIES = [
  { value: "IDR", label: "Rp IDR" },
  { value: "USD", label: "$ USD" },
  { value: "EUR", label: "€ EUR" },
]

export function AddAccountModal({ open, onClose, onSuccess, initialData }: AddAccountModalProps) {
  const { userId } = useAuth()
  const [name, setName]               = useState("")
  const [type, setType]               = useState<"bank" | "cash" | "e-wallet">("cash")
  const [colorHex, setColorHex]       = useState("#ffb300")
  const [initialBalance, setInitialBalance] = useState("0")
  const [currency, setCurrency]       = useState("IDR")
  const [excludeStats, setExcludeStats] = useState(false)
  const [loading, setLoading]         = useState(false)

  useEffect(() => {
    if (open) {
      if (initialData) {
        setName(initialData.name)
        setType(initialData.type as any)
        setColorHex(initialData.color || "#ffb300")
        setInitialBalance(initialData.initial_balance.toString())
        setCurrency(initialData.currency || "IDR")
        setExcludeStats(initialData.exclude_from_stats || false)
      } else {
        setName("")
        setType("cash")
        setColorHex("#ffb300")
        setInitialBalance("0")
        setCurrency("IDR")
        setExcludeStats(false)
      }
    }
  }, [open, initialData])

  if (!open) return null

  function formatAmount(val: string) {
    const digits = val.replace(/\D/g, "")
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) {
      toast.error("Silakan login terlebih dahulu")
      return
    }
    if (!name.trim()) { toast.error("Nama akun wajib diisi"); return }

    const balance = parseFloat(initialBalance.replace(/\./g, "") || "0")
    setLoading(true)
    try {
      const payload = {
        name: name.trim(),
        type,
        initial_balance: balance,
        currency,
        color: colorHex,
        exclude_from_stats: excludeStats,
      }

      if (initialData && initialData.id) {
        await updateAccount(initialData.id, payload)
        toast.success(`Akun "${name}" berhasil diperbarui! ✓`)
      } else {
        await createAccount(payload)
        toast.success(`Akun "${name}" berhasil ditambahkan! ✓`)
      }
      
      onSuccess?.()
      onClose()
    } catch (err) {
      toast.error("Gagal menyimpan akun")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Content */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="text-xl font-bold text-slate-800">{initialData ? "Edit Akun" : "Tambah Akun"}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 flex flex-col gap-5">
          {/* Row 1: Name & Color */}
          <div className="grid grid-cols-[1fr_120px] gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5 text-slate-800">
                Nama <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="Nama akun"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-11 rounded-xl border-slate-200 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5 text-slate-800">Warna</label>
              <div className="relative flex items-center h-11 rounded-xl border border-slate-200 bg-white px-3 gap-2 focus-within:ring-2 focus-within:ring-[#10b981]/20 focus-within:border-[#10b981]">
                <div 
                  className="w-5 h-5 rounded-full border border-black/10 shrink-0 cursor-pointer overflow-hidden relative"
                  style={{ backgroundColor: colorHex }}
                >
                  <input
                    type="color"
                    value={colorHex}
                    onChange={(e) => setColorHex(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-150"
                  />
                </div>
                <input 
                  type="text" 
                  value={colorHex} 
                  onChange={(e) => setColorHex(e.target.value)}
                  className="w-full text-sm outline-none bg-transparent"
                  maxLength={7}
                />
              </div>
            </div>
          </div>

          {/* Row 2: Account Type */}
          <div>
            <label className="block text-sm font-semibold mb-1.5 text-slate-800">Tipe akun</label>
            <Select value={type} onValueChange={(val: any) => setType(val)}>
              <SelectTrigger className="w-full h-11 rounded-xl border-slate-200">
                <SelectValue placeholder="Pilih tipe">
                  {(() => {
                    const selected = ACCOUNT_TYPES.find(t => t.value === type)
                    if (!selected) return null
                    const Icon = selected.Icon
                    return (
                      <div className="flex items-center gap-2.5">
                        <span className={cn("flex items-center justify-center rounded-lg w-7 h-7 shrink-0", selected.color)}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="font-medium text-slate-700">{selected.label}</span>
                      </div>
                    )
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[999]">
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <div className="flex items-center gap-2.5">
                      <span className={cn("flex items-center justify-center rounded-lg w-7 h-7 shrink-0", t.color)}>
                        <t.Icon className="h-4 w-4" />
                      </span>
                      <span className="font-medium text-slate-700">{t.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Row 3: Initial Balance & Currency */}
          <div className="grid grid-cols-[1fr_130px] gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5 text-slate-800">Jumlah Awal</label>
              <div className="flex relative">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(formatAmount(e.target.value))}
                  className="h-11 rounded-xl border-slate-200 tabular-nums pr-8"
                />
                <div className="absolute right-0 inset-y-0 flex flex-col border-l border-slate-200">
                  <button type="button" className="flex-1 px-2 text-slate-400 hover:bg-slate-50 rounded-tr-xl border-b border-slate-200" onClick={() => setInitialBalance(formatAmount(String(parseFloat(initialBalance.replace(/\./g, "") || "0") + 100000)))}>
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 5L5 1L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  <button type="button" className="flex-1 px-2 text-slate-400 hover:bg-slate-50 rounded-br-xl" onClick={() => setInitialBalance(formatAmount(String(Math.max(0, parseFloat(initialBalance.replace(/\./g, "") || "0") - 100000))))}>
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5 text-slate-800">Mata uang</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-full h-11 rounded-xl border-slate-200 font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[999]">
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <span className="text-slate-400 mr-2 text-xs">{c.label.split(' ')[0]}</span>
                      {c.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 4: Exclude from stats toggle */}
          <div className="flex items-center gap-3 mt-1">
            <Switch 
              checked={excludeStats} 
              onCheckedChange={setExcludeStats}
              id="exclude-stats"
            />
            <label htmlFor="exclude-stats" className="text-sm font-medium text-slate-700 cursor-pointer flex items-center gap-1.5">
              Kecualikan dari statistik
              <Info className="h-4 w-4 text-slate-400" />
            </label>
          </div>

          {/* Action Button */}
          <Button
            type="submit"
            disabled={loading || !name.trim()}
            className={cn(
              "w-full h-12 mt-2 rounded-xl font-semibold text-base transition-all duration-200",
              name.trim() 
                ? "bg-[#10b981] hover:bg-[#059669] text-white shadow-sm"
                : "bg-slate-100 text-slate-400"
            )}
          >
            {loading ? "Menyimpan..." : (initialData ? "Simpan Perubahan" : "Buat akun")}
          </Button>
        </form>
      </div>
    </div>
  )
}
