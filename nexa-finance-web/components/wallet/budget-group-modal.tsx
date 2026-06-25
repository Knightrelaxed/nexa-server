"use client"

import React, { useState, useEffect, useMemo } from "react"
import { supabase } from "@/lib/supabase/client"
import { X, Target, Utensils, Bus, ShoppingBag, HeartPulse, Film, Book, Briefcase, Zap, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCategories } from "@/hooks/use-finance-data"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"

interface BudgetGroupModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  initialData?: any // Budget group + embedded budgets
}

const ICONS = [
  { id: "utensils", icon: Utensils, label: "Makan" },
  { id: "bus", icon: Bus, label: "Transport" },
  { id: "shopping-bag", icon: ShoppingBag, label: "Belanja" },
  { id: "film", icon: Film, label: "Hiburan" },
  { id: "heart-pulse", icon: HeartPulse, label: "Kesehatan" },
  { id: "book", icon: Book, label: "Pendidikan" },
  { id: "briefcase", icon: Briefcase, label: "Kerja" },
  { id: "zap", icon: Zap, label: "Listrik/Air" },
  { id: "default", icon: Target, label: "Lainnya" }
]

export function BudgetGroupModal({ open, onClose, onSuccess, initialData }: BudgetGroupModalProps) {
  const { categories } = useCategories()
  
  const [name, setName] = useState("")
  const [colorHex, setColorHex] = useState("#10b981")
  const [iconKey, setIconKey] = useState("default")
  const [selectedCats, setSelectedCats] = useState<string[]>([])
  
  const [dailyAmount, setDailyAmount] = useState("")
  const [weeklyAmount, setWeeklyAmount] = useState("")
  const [monthlyAmount, setMonthlyAmount] = useState("")
  
  const [loading, setLoading] = useState(false)

  // Filter out income and transfer categories for budget group
  const expenseCategories = useMemo(() => {
    return categories.filter(c => c.type === 'expense')
  }, [categories])

  useEffect(() => {
    if (open) {
      if (initialData) {
        setName(initialData.name || "")
        setColorHex(initialData.color || "#10b981")
        setIconKey(initialData.icon || "default")
        setSelectedCats(initialData.category_ids || [])
        
        const budgets = initialData.budgets || []
        setDailyAmount(budgets.find((b: any) => b.period === 'daily')?.amount?.toString() || "")
        setWeeklyAmount(budgets.find((b: any) => b.period === 'weekly')?.amount?.toString() || "")
        setMonthlyAmount(budgets.find((b: any) => b.period === 'monthly')?.amount?.toString() || "")
      } else {
        setName("")
        setColorHex("#10b981")
        setIconKey("default")
        setSelectedCats([])
        setDailyAmount("")
        setWeeklyAmount("")
        setMonthlyAmount("")
      }
    }
  }, [open, initialData])

  if (!open) return null

  const toggleCategory = (catId: string) => {
    setSelectedCats(prev => 
      prev.includes(catId) 
        ? prev.filter(id => id !== catId)
        : [...prev, catId]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error("Nama kelompok wajib diisi")
      return
    }

    setLoading(true)
    try {
      let groupId = initialData?.id

      // 1. Upsert Budget Group
      const groupPayload = {
        name: name.trim(),
        color: colorHex,
        icon: iconKey,
        category_ids: selectedCats,
        is_archived: false
      }

      if (groupId) {
        const { error } = await supabase.from('budget_groups').update(groupPayload).eq('id', groupId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('budget_groups').insert([groupPayload]).select('id').single()
        if (error) throw error
        groupId = data.id
      }

      // 2. Upsert Budgets for this group
      const budgetsToUpsert = []
      
      const periods = [
        { key: 'daily', val: dailyAmount },
        { key: 'weekly', val: weeklyAmount },
        { key: 'monthly', val: monthlyAmount }
      ]

      for (const p of periods) {
        if (p.val && !isNaN(parseFloat(p.val))) {
          budgetsToUpsert.push({
            budget_group_id: groupId,
            period: p.key,
            amount: parseFloat(p.val),
            is_active: true
          })
        }
      }

      // We need to delete existing budgets for this group first, then insert new ones 
      // (or rely on the ON CONFLICT upsert, but upsert might leave old ones behind if we empty the input)
      await supabase.from('budgets').delete().eq('budget_group_id', groupId)

      if (budgetsToUpsert.length > 0) {
        const { error: bdgError } = await supabase.from('budgets').insert(budgetsToUpsert)
        if (bdgError) throw bdgError
      }

      toast.success(`Kelompok "${name}" berhasil disimpan!`)
      onSuccess?.()
      onClose()
    } catch (err: any) {
      toast.error("Gagal menyimpan: " + err.message)
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
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-xl font-bold text-slate-800">{initialData ? "Edit Kelompok" : "Kelompok Baru"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <ScrollArea className="flex-1 px-6 py-5 overflow-y-auto">
          <form id="group-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Name & Color */}
            <div className="grid grid-cols-[1fr_120px] gap-4">
              <div>
                <label className="block text-sm font-semibold mb-1.5 text-slate-800">Nama Kelompok</label>
                <Input
                  placeholder="Contoh: Makan & Jajan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5 text-slate-800">Warna</label>
                <div className="relative flex items-center h-11 rounded-xl border border-slate-200 bg-white px-3 gap-2">
                  <div className="w-5 h-5 rounded-full shrink-0 overflow-hidden relative shadow-sm" style={{ backgroundColor: colorHex }}>
                    <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-150" />
                  </div>
                  <input type="text" value={colorHex} onChange={(e) => setColorHex(e.target.value)} className="w-full text-sm outline-none bg-transparent font-medium" maxLength={7} />
                </div>
              </div>
            </div>

            {/* Icon */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-slate-800">Ikon</label>
              <div className="flex flex-wrap gap-2">
                {ICONS.map((ic) => (
                  <button
                    key={ic.id}
                    type="button"
                    onClick={() => setIconKey(ic.id)}
                    className={cn(
                      "p-2 rounded-xl border transition-all",
                      iconKey === ic.id ? "bg-slate-800 border-slate-800 text-white shadow-md" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                    )}
                    title={ic.label}
                  >
                    <ic.icon className="h-5 w-5" />
                  </button>
                ))}
              </div>
            </div>

            {/* Category Multi-select */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-slate-800">
                Pilih Kategori <span className="text-muted-foreground font-normal ml-1">({selectedCats.length} terpilih)</span>
              </label>
              <div className="grid grid-cols-2 gap-2 border border-slate-200 rounded-xl p-3 bg-slate-50 max-h-48 overflow-y-auto">
                {expenseCategories.map(cat => (
                  <label key={cat.id} className={cn("flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors border",
                    selectedCats.includes(cat.id) ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-100 hover:border-slate-300"
                  )}>
                    <div className={cn("w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors",
                      selectedCats.includes(cat.id) ? "bg-emerald-500 text-white" : "border border-slate-300 bg-white"
                    )}>
                      {selectedCats.includes(cat.id) && <Check className="h-3.5 w-3.5" />}
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {cat.icon_key && <span className="text-base shrink-0">{/* Wait, in Nexa categories icons are text emojis? Need to check */}</span>}
                      <span className="text-sm font-medium text-slate-700 truncate">{cat.name}</span>
                    </div>
                  </label>
                ))}
                {expenseCategories.length === 0 && (
                  <p className="text-sm text-muted-foreground col-span-2 text-center py-4">Memuat kategori...</p>
                )}
              </div>
            </div>

            {/* Limit Nominal */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-slate-800">Batas Pengeluaran (Opsional)</label>
              <div className="grid grid-cols-3 gap-3">
                {/* Harian */}
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Harian</span>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                    <Input
                      type="number"
                      placeholder="0"
                      value={dailyAmount}
                      onChange={(e) => setDailyAmount(e.target.value)}
                      className="h-10 rounded-lg pl-7 text-sm font-medium"
                    />
                  </div>
                </div>
                {/* Mingguan */}
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Mingguan</span>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                    <Input
                      type="number"
                      placeholder="0"
                      value={weeklyAmount}
                      onChange={(e) => setWeeklyAmount(e.target.value)}
                      className="h-10 rounded-lg pl-7 text-sm font-medium"
                    />
                  </div>
                </div>
                {/* Bulanan */}
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Bulanan</span>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                    <Input
                      type="number"
                      placeholder="0"
                      value={monthlyAmount}
                      onChange={(e) => setMonthlyAmount(e.target.value)}
                      className="h-10 rounded-lg pl-7 text-sm font-medium"
                    />
                  </div>
                </div>
              </div>
            </div>

          </form>
        </ScrollArea>
        
        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0 gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading} className="text-slate-500">
            Batal
          </Button>
          <Button type="submit" form="group-form" disabled={loading} className="bg-emerald-500 hover:bg-emerald-600 rounded-xl px-6">
            {loading ? "Menyimpan..." : "Simpan Kelompok"}
          </Button>
        </div>
      </div>
    </div>
  )
}
