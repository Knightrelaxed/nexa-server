"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useCategories, useAccounts } from "@/hooks/use-finance-data"
import { createTransaction, updateTransaction } from "@/lib/supabase/mutations"
import { useAuth } from "@/components/providers/supabase-provider"
import { X, Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ICON_MAP } from "@/lib/wallet-data"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface AddTransactionModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  initialData?: any
}

type TxType = "expense" | "income" | "transfer"

const PAYMENT_METHODS = ["QRIS", "Transfer bank", "Kartu Kredit", "Tunai"]
const PAYMENT_METHODS_WITH_EMPTY = ["", ...PAYMENT_METHODS]

export function AddTransactionModal({ open, onClose, onSuccess, initialData }: AddTransactionModalProps) {
  const { userId } = useAuth()
  const { categories } = useCategories()
  const { accounts, refetch: refetchAccounts } = useAccounts()

  // ── Lazy Initializers ──────────────────────────────────────────────────
  // Since this component is now fully remounted (via key prop) every time
  // initialData changes or the modal is reopened, we can safely initialize
  // state precisely once on mount. This avoids the "empty-then-filled"
  // render cycle that breaks Radix UI Select's internal display syncing.
  const [type, setType] = useState<TxType>(() => (initialData?.type as TxType) || "expense")
  const [amount, setAmount] = useState(() => initialData?.amount?.toString() || "")
  const [description, setDescription] = useState(() => initialData?.description || "")
  const [categoryId, setCategoryId] = useState(() => initialData?.category_id || "")
  const [accountId, setAccountId] = useState(() => initialData?.account_id || "")
  const [toAccountId, setToAccountId] = useState("")
  const [paymentMethod, setPaymentMethod] = useState(() => {
    const pm = initialData?.payment_method?.trim()
    return pm ? (PAYMENT_METHODS.find(m => m.toLowerCase() === pm.toLowerCase()) || pm) : "none"
  })
  const [date, setDate] = useState(() => initialData?.transaction_date || new Date().toISOString().slice(0, 10))
  const [time, setTime] = useState(() => {
    if (initialData?.transaction_time) {
      // Fix dot format from OCR (e.g. "20.42" -> "20:42")
      return String(initialData.transaction_time).slice(0, 5).replace('.', ':')
    }
    return new Date().toTimeString().slice(0, 5)
  })
  const [loading, setLoading] = useState(false)

  // ── Category & Account filtering ────────────────────────────────────────
  // Ensure edited category is always visible even if:
  // (a) categories are still loading (empty array), or
  // (b) category type differs from current type tab on first render
  const filteredCategories = useMemo(() => {
    const filtered = [...categories.filter(c => c.type === (type === "transfer" ? "expense" : type))]
    if (initialData?.category_id && !filtered.some(c => c.id === initialData.category_id)) {
      const existingCat = categories.find(c => c.id === initialData.category_id)
      filtered.push(existingCat || {
        id: initialData.category_id,
        name: initialData.category_name || "Kategori",
        type: (initialData.type === "transfer" ? "expense" : initialData.type) || "expense",
        group_name: initialData.category_group_name || "Terpilih",
        icon_key: initialData.category_icon_key || "wallet",
        icon_bg: initialData.category_icon_bg || "bg-slate-100",
        icon_color: initialData.category_icon_color || "text-slate-700",
        is_archived: false,
        user_id: userId || "",
        created_at: new Date().toISOString()
      })
    }
    return filtered
  }, [categories, type, initialData, userId])

  const groupedCategories = useMemo(() => {
    return filteredCategories.reduce<Record<string, typeof categories>>((acc, cat) => {
      const group = cat.group_name || (type === "income" ? "Pendapatan" : "Lainnya")
      if (!acc[group]) acc[group] = []
      acc[group].push(cat)
      return acc
    }, {})
  }, [filteredCategories, type])

  // Ensure edited account is always visible even if accounts are loading
  const displayAccounts = useMemo(() => {
    const list = [...accounts]
    if (initialData?.account_id && !list.some(a => a.id === initialData.account_id)) {
      const existingAcc = accounts.find(a => a.id === initialData.account_id)
      list.push(existingAcc || {
        id: initialData.account_id,
        name: initialData.account_name || "Akun",
        type: "bank",
        initial_balance: 0,
        currency: "IDR",
        color: "#3b82f6",
        icon_key: "wallet",
        is_archived: false,
        exclude_from_stats: false,
        created_at: new Date().toISOString(),
        balance: 0
      })
    }
    return list
  }, [accounts, initialData])

  // Auto-select first account for NEW transactions only
  useEffect(() => {
    if (accounts.length > 0 && !accountId && !initialData) setAccountId(accounts[0].id)
  }, [accounts, accountId, initialData])

  // Auto-select first category for NEW transactions when type changes (not edit)
  useEffect(() => {
    if (!initialData && !categoryId && filteredCategories.length > 0) {
      setCategoryId(filteredCategories[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, categories.length])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) { toast.error("Silakan login terlebih dahulu"); return }
    const numAmount = parseFloat(amount.replace(/\./g, "").replace(",", "."))
    if (isNaN(numAmount) || numAmount <= 0) { toast.error("Jumlah tidak valid"); return }
    if (!categoryId) { toast.error("Pilih kategori"); return }
    if (!accountId) { toast.error("Pilih akun"); return }

    setLoading(true)
    try {
      const payload = {
        account_id: accountId,
        category_id: categoryId,
        amount: numAmount,
        type: type === "transfer" ? "expense" : type,
        transaction_date: date,
        transaction_time: time,
        description: description || undefined,
        payment_method: type === "transfer" ? null : (paymentMethod === "none" ? null : (paymentMethod as import('@/lib/supabase/types').PaymentMethod)),
      }

      if (initialData && initialData.id) {
        await updateTransaction(initialData.id, payload)
        toast.success("Catatan berhasil diperbarui! ✓")
      } else {
        await createTransaction(payload)
        toast.success("Catatan berhasil ditambahkan! ✓")
      }
      
      await refetchAccounts()
      onSuccess?.()
      onClose()
      setAmount("")
      setDescription("")
      setDate(new Date().toISOString().slice(0, 10))
      setTime(new Date().toTimeString().slice(0, 5))
      setPaymentMethod("none")
    } catch (err) {
      toast.error("Gagal menyimpan catatan")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmitAndNew(e: React.MouseEvent) {
    e.preventDefault()
    if (!userId) { toast.error("Silakan login terlebih dahulu"); return }
    const numAmount = parseFloat(amount.replace(/\./g, "").replace(",", "."))
    if (isNaN(numAmount) || numAmount <= 0) { toast.error("Jumlah tidak valid"); return }
    if (!categoryId) { toast.error("Pilih kategori"); return }
    if (!accountId) { toast.error("Pilih akun"); return }

    setLoading(true)
    try {
      await createTransaction({
        account_id: accountId,
        category_id: categoryId,
        amount: numAmount,
        type: type === "transfer" ? "expense" : type,
        transaction_date: date,
        transaction_time: time,
        description: description || undefined,
        payment_method: type === "transfer" ? null : (paymentMethod === "none" ? null : (paymentMethod as import('@/lib/supabase/types').PaymentMethod)),
      })
      toast.success("Catatan tersimpan! Siap menambah lagi.")
      await refetchAccounts()
      onSuccess?.()
      setAmount("")
      setDescription("")
      setDate(new Date().toISOString().slice(0, 10))
      setTime(new Date().toTimeString().slice(0, 5))
    } catch (err) {
      toast.error("Gagal menyimpan catatan")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function formatAmount(val: string) {
    const digits = val.replace(/\D/g, "")
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  }

  const selectedCategory = categories.find(c => c.id === categoryId)

  function renderAccountOption(acc: typeof accounts[0], isTrigger = false) {
    const Icon = ICON_MAP[acc.icon_key] || ICON_MAP["wallet"]
    const sizeClasses = isTrigger ? "w-5 h-5" : "w-6 h-6"
    const iconClasses = isTrigger ? "h-3 w-3" : "h-3.5 w-3.5"
    
    return (
      <div className="flex items-center gap-2.5">
        <span 
          className={cn("flex items-center justify-center rounded-lg shrink-0", sizeClasses)}
          style={{ backgroundColor: acc.color || '#3b82f6', color: 'white' }}
        >
          <Icon className={iconClasses} />
        </span>
        <span className="truncate">{acc.name}</span>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">{initialData ? "Edit catatan" : "Tambah catatan"}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Two-column body */}
        <form onSubmit={handleSubmit} className="flex flex-col max-h-[85vh]">
          <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100 overflow-y-auto">

            {/* ── LEFT COLUMN ── */}
            <div className="flex-1 px-6 py-5 flex flex-col gap-4">

              {/* Type toggle */}
              <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-slate-50 p-0.5 gap-0.5">
                {(["expense", "income", "transfer"] as TxType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      "flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200",
                      type === t
                        ? t === "expense"
                          ? "bg-[#ef4444] text-white shadow-sm"
                          : t === "income"
                            ? "bg-[#10b981] text-white shadow-sm"
                            : "bg-[#3b82f6] text-white shadow-sm"
                        : "bg-transparent text-slate-500 hover:text-slate-700"
                    )}
                  >
                    {t === "expense" ? "Pengeluaran" : t === "income" ? "Pemasukan" : "Transfer"}
                  </button>
                ))}
              </div>

              {/* ── TRANSFER MODE ── */}
              {type === "transfer" ? (
                <>
                  {/* Dari akun → Ke akun */}
                  <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Dari akun</label>
                      <Select value={accountId} onValueChange={setAccountId}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Pilih akun">
                            {displayAccounts.find(a => a.id === accountId) && renderAccountOption(displayAccounts.find(a => a.id === accountId)!, true)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="z-[999]">
                          {displayAccounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id}>
                              {renderAccountOption(acc)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-center pb-1">
                      <span className="text-slate-400 text-lg font-light">→</span>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Ke akun</label>
                      <Select value={toAccountId} onValueChange={setToAccountId}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Pilih akun">
                            {accounts.find(a => a.id === toAccountId) && renderAccountOption(accounts.find(a => a.id === toAccountId)!, true)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="z-[999]">
                          {accounts.filter(a => a.id !== accountId).map((acc) => (
                            <SelectItem key={acc.id} value={acc.id}>
                              {renderAccountOption(acc)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Dual Amount */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Jumlah <span className="text-red-500">*</span>
                      </label>
                      <div className="flex gap-1.5">
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="0"
                          value={amount}
                          onChange={(e) => setAmount(formatAmount(e.target.value))}
                          required
                          className="flex-1 h-10 text-sm font-semibold tabular-nums rounded-xl border-slate-200"
                        />
                        <div className="flex items-center justify-center px-2.5 h-10 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-500 shrink-0">
                          IDR
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1.5">Jumlah</label>
                      <div className="flex gap-1.5">
                        <div className="flex-1 h-10 rounded-xl border border-slate-100 bg-slate-50/80" />
                        <div className="flex items-center justify-center px-2.5 h-10 rounded-xl border border-slate-100 bg-slate-50 text-xs font-medium text-slate-300 shrink-0">
                          IDR
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Amount */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Jumlah <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                       <Input
                         type="text"
                         inputMode="numeric"
                         placeholder="0"
                         value={amount}
                         onChange={(e) => setAmount(formatAmount(e.target.value))}
                         required
                         className={cn(
                           "flex-1 h-10 text-base font-semibold tabular-nums rounded-xl border-slate-200",
                           type === "expense" && amount ? "text-[#ef4444]" : ""
                         )}
                       />
                      <div className="flex items-center justify-center px-4 h-10 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-500 shrink-0">
                        IDR
                      </div>
                    </div>
                  </div>

                  {/* Account */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Account</label>
                    <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih akun">
                        {displayAccounts.find(a => a.id === accountId) && renderAccountOption(displayAccounts.find(a => a.id === accountId)!, true)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="z-[999]">
                      {displayAccounts.length === 0 ? (
                        <div className="p-4 text-sm text-center text-slate-400">— Belum ada akun —</div>
                      ) : (
                        displayAccounts.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>
                            {renderAccountOption(acc)}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Kategori <span className="text-red-500">*</span>
                    </label>
                    <Select value={categoryId} onValueChange={setCategoryId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pilih kategori">
                          {selectedCategory && (() => {
                            const Icon = ICON_MAP[selectedCategory.icon_key]
                            return (
                              <div className="flex items-center gap-2">
                                {Icon && (
                                  <span className={cn("flex items-center justify-center rounded-lg w-5 h-5 shrink-0", selectedCategory.icon_bg, selectedCategory.icon_color)}>
                                    <Icon className="h-3 w-3" />
                                  </span>
                                )}
                                <span>{selectedCategory.name}</span>
                              </div>
                            )
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent position="popper" side="bottom" sideOffset={4} avoidCollisions={false} className="max-h-[280px] w-[var(--radix-select-trigger-width)] z-[999]">
                        {filteredCategories.length === 0 ? (
                          <div className="p-4 text-sm text-center text-slate-400">— Belum ada kategori —</div>
                        ) : (
                          Object.entries(groupedCategories).map(([groupName, cats]) => (
                            <SelectGroup key={groupName}>
                              <SelectLabel>{groupName}</SelectLabel>
                              {cats.map((cat) => {
                                const ItemIcon = ICON_MAP[cat.icon_key]
                                return (
                                  <SelectItem key={cat.id} value={cat.id}>
                                    <div className="flex items-center gap-2.5">
                                      {ItemIcon && (
                                        <span className={cn("flex items-center justify-center rounded-lg w-6 h-6 shrink-0", cat.icon_bg, cat.icon_color)}>
                                          <ItemIcon className="h-3.5 w-3.5" />
                                        </span>
                                      )}
                                      <span className="truncate">{cat.name}</span>
                                    </div>
                                  </SelectItem>
                                )
                              })}
                            </SelectGroup>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Date & Time combined */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Tanggal &amp; Waktu</label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="flex-1 h-10 text-sm rounded-xl border-slate-200"
                  />
                  <Input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-36 sm:w-40 h-10 text-sm rounded-xl border-slate-200"
                  />
                </div>
              </div>

            </div>

            {/* ── RIGHT COLUMN ── */}
            <div className="w-full md:w-72 px-6 py-5 flex flex-col gap-4 bg-slate-50/50">
              <h3 className="text-base font-semibold text-slate-800">Detail lainnya</h3>

              {/* Notes / Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Deskripsi</label>
                <textarea
                  rows={3}
                  placeholder="Masukkan deskripsi transaksi"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/20 transition-all resize-none"
                />
              </div>

              {/* Payment method */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Metode Pembayaran</label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Tidak ada / Kosong" />
                  </SelectTrigger>
                  <SelectContent className="z-[999]">
                    <SelectItem value="none"><span className="text-muted-foreground italic">Tidak ada</span></SelectItem>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                    {paymentMethod && paymentMethod !== "none" && !PAYMENT_METHODS.includes(paymentMethod) && (
                      <SelectItem key={paymentMethod} value={paymentMethod}>{paymentMethod}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ── FOOTER / ACTIONS ── */}
          <div className="px-6 py-4 border-t border-slate-100 bg-white flex flex-col gap-2 shrink-0">
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-[#10b981] hover:bg-[#059669] active:bg-[#047857] text-white font-semibold text-sm transition-all duration-200 shadow-sm disabled:opacity-60"
            >
              {loading ? "Menyimpan..." : (initialData ? "Simpan" : "Tambah catatan")}
            </button>
            {initialData ? (
              <button
                type="button"
                disabled={loading}
                onClick={onClose}
                className="w-full h-10 rounded-xl border-2 border-slate-200 text-slate-500 hover:bg-slate-50 font-semibold text-sm transition-all duration-200 disabled:opacity-60"
              >
                Batal
              </button>
            ) : (
              <button
                type="button"
                disabled={loading}
                onClick={handleSubmitAndNew}
                className="w-full h-10 rounded-xl border-2 border-[#10b981] text-[#10b981] hover:bg-[#10b981]/5 font-semibold text-sm transition-all duration-200 disabled:opacity-60"
              >
                Tambah dan buat lagi
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
