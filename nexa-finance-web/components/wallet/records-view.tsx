"use client"

import { useMemo, useState, useEffect } from "react"
import {
  Search, ChevronLeft, ChevronRight, Filter, ChevronDown,
  Settings2, Plus, X, SlidersHorizontal, RotateCcw,
  ListChecks, Pencil, Trash2, Copy, FileOutput, Scissors
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { formatIDR, ICON_MAP } from "@/lib/wallet-data"
import { useTransactions } from "@/hooks/use-finance-data"
import { deleteTransactions } from "@/lib/supabase/mutations"
import { toast } from "sonner"
import { PeriodSelector, defaultPeriod, type PeriodValue } from "./period-selector"
import type { PaymentMethod } from "@/lib/supabase/types"

const PAYMENT_METHOD_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  'QRIS':          { bg: 'bg-violet-100', text: 'text-violet-700', label: 'QRIS' },
  'Transfer bank': { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Transfer bank' },
  'Kartu Kredit':  { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Kartu Kredit' },
  'Tunai':         { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Tunai' },
}

function PaymentBadge({ method }: { method: PaymentMethod | null | undefined }) {
  if (!method) return null
  const style = PAYMENT_METHOD_STYLE[method]
  if (!style) return null
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}
import { FilterSidebar } from "./filter-sidebar"
import { AddTransactionModal } from "./add-transaction-modal"
import { TransactionDetailModal } from "./transaction-detail-modal"
import { cn } from "@/lib/utils"


/* ── Main Component ── */
export function RecordsView() {
  const [filtersState, setFiltersState] = useState<any>({})
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod)
  const [expandedSplitGroups, setExpandedSplitGroups] = useState<Set<string>>(new Set())

  const toggleSplitGroup = (groupId: string) => {
    setExpandedSplitGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const filters = useMemo(() => {
    const startDate = new Date(period.start.getTime() - period.start.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const endDate = new Date(period.end.getTime() - period.end.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    
    // Clean up "all" values and empty strings before passing to useTransactions
    const cleanFilters: any = {}
    Object.entries(filtersState).forEach(([k, v]) => {
      if (v !== "all" && v !== "") {
        cleanFilters[k] = v
      }
    })
    
    return { ...cleanFilters, startDate, endDate };
  }, [filtersState, period])

  const handleFilterChange = (key: string, value: any) => {
    setFiltersState((prev: any) => ({ ...prev, [key]: value }))
  }

  const handleResetFilters = () => {
    setFiltersState({})
  }


  const { loading, grouped, totalAmount, displayCount, refetch } = useTransactions(filters)

  const sortedGrouped = useMemo(() => {
    return Object.entries(grouped)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => {
        // Sort items within a day: newest time first, normalize dot/colon in time
        const sorted = [...items].sort((a, b) => {
          const ta = (a.transaction_time ?? '').replace('.', ':')
          const tb = (b.transaction_time ?? '').replace('.', ':')
          return tb.localeCompare(ta)
        })
        return [date, sorted] as [string, typeof items]
      })
  }, [grouped])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Reset selection when filters change
  useEffect(() => {
    setSelectedIds(new Set())
  }, [filters])

  const allRecordIds = useMemo(() => {
    return Object.values(grouped).flat().map(t => t.id)
  }, [grouped])

  const isAllSelected = allRecordIds.length > 0 && selectedIds.size === allRecordIds.length
  const isAnySelected = selectedIds.size > 0

  const toggleSelectAll = () => {
    if (isAllSelected || isAnySelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allRecordIds))
    }
  }

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editTx, setEditTx] = useState<any>(null)

  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [viewTx, setViewTx] = useState<any>(null)

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} })

  const confirmAction = (title: string, message: string, onConfirm: () => void, confirmText = "Hapus") => {
    setConfirmState({ isOpen: true, title, message, onConfirm, confirmText })
  }

  const handleEdit = () => {
    if (selectedIds.size !== 1) return
    const id = Array.from(selectedIds)[0]
    const tx = Object.values(grouped).flat().find(t => t.id === id)
    if (tx) {
      setEditTx(tx)
      setEditModalOpen(true)
    }
  }

  const handleDelete = async () => {
    if (selectedIds.size === 0) return
    confirmAction("Hapus Catatan", `Apakah Anda yakin ingin menghapus ${selectedIds.size} catatan secara permanen?`, async () => {
      try {
        await deleteTransactions(Array.from(selectedIds))
        toast.success("Catatan berhasil dihapus")
        setSelectedIds(new Set())
        refetch()
      } catch (err) {
        toast.error("Gagal menghapus catatan")
      }
    })
  }

  const handleDuplicate = async () => {
    if (selectedIds.size < 2) {
      toast.error("Pilih minimal 2 catatan untuk diatasi duplikasinya")
      return
    }

    // Ambil data transaksi yang dipilih
    const allTxs = Object.values(grouped).flat()
    const selectedTxs = allTxs.filter(t => selectedIds.has(t.id))
    
    if (selectedTxs.length < 2) return

    // Validasi apakah benar-benar identik
    const firstTx = selectedTxs[0]
    const isIdentical = selectedTxs.every(t => 
      t.account_id === firstTx.account_id &&
      t.category_id === firstTx.category_id &&
      t.amount === firstTx.amount &&
      t.type === firstTx.type &&
      t.transaction_date === firstTx.transaction_date &&
      t.transaction_time === firstTx.transaction_time &&
      t.description === firstTx.description
    )

    if (!isIdentical) {
      toast.error("Catatan yang dipilih tidak identik! Seluruh data sampai menitnya harus sama.")
      return
    }

    const ids = Array.from(selectedIds)
    const removeIds = ids.slice(1)
    confirmAction("Atasi Duplikasi", `1 catatan akan dipertahankan, ${removeIds.length} catatan duplikat akan dihapus. Lanjutkan?`, async () => {
      try {
        await deleteTransactions(removeIds)
        toast.success("Duplikasi berhasil diatasi")
        setSelectedIds(new Set())
        refetch()
      } catch (err) {
        toast.error("Gagal mengatasi duplikasi")
      }
    }, "Lanjutkan")
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 items-stretch lg:items-start w-full">

      {/* ── Mobile Filter Drawer ── */}
      {mobileFilterOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileFilterOpen(false)} />
          <aside className="relative ml-auto w-[290px] max-w-full h-full bg-white shadow-2xl overflow-y-auto p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Catatan</h2>
              <button onClick={() => setMobileFilterOpen(false)} className="p-1.5 rounded-full hover:bg-muted bg-muted/40">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <hr className="border-border -mx-4 px-4 mb-4" />
            <div className="flex-1 overflow-y-auto no-scrollbar -mx-4 px-4">
              <FilterSidebar title="Catatan" filters={filtersState} onFilterChange={handleFilterChange} onReset={handleResetFilters} isDrawer={true} />
            </div>
            <div className="mt-auto pt-4 border-t border-border">
              <Button className="w-full bg-[#10b981] hover:bg-[#059669] text-white h-10" onClick={() => setMobileFilterOpen(false)}>
                Terapkan
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Desktop Sidebar ── */}
      <div className="hidden lg:block shrink-0 w-[280px] sticky top-[80px] self-start h-[calc(100vh-100px)]">
        <FilterSidebar title="Catatan" filters={filtersState} onFilterChange={handleFilterChange} onReset={handleResetFilters} />
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3 w-full">

        {/* Mobile toolbar */}
        <div className="flex items-center gap-2 lg:hidden w-full">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Cari transaksi..." value={filtersState.search || ""} onChange={(e) => handleFilterChange("search", e.target.value)} className="pl-9 h-9" />
          </div>
          <Button variant="outline" className="h-9 gap-1.5 shrink-0" onClick={() => setMobileFilterOpen(true)}>
            <SlidersHorizontal className="h-4 w-4" />
            <span className="text-sm">Filter</span>
          </Button>
        </div>

        {/* Date Selector */}
        <div className="flex justify-center w-full">
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>

        {/* Transaction Card */}
        <Card className="rounded-2xl shadow-sm border border-slate-200/60 bg-white relative min-w-0">

          {/* Action Bar Container */}
          <div className="sticky top-16 sm:top-20 z-20 flex flex-col rounded-t-2xl bg-white shadow-sm ring-1 ring-slate-200/50 min-w-0">
            {/* Top Text */}
            <div className="px-4 pt-3 pb-1 bg-white rounded-t-2xl">
              <span className="text-[13px] font-bold text-slate-700">Ditemukan {displayCount} catatan</span>
            </div>
            {/* Action Bar */}
            <div className={cn(
              "flex flex-row items-center justify-between gap-2 px-4 py-2 border-b border-border/60 transition-colors min-w-0 w-full",
              isAnySelected ? "bg-[#fffbeb]" : "bg-white"
            )}>
              <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                <input 
                  type="checkbox" 
                  checked={isAnySelected}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300 w-4 h-4 accent-[#10b981]" 
                />
                <span className={cn("text-[12px] font-semibold hidden sm:inline", isAnySelected ? "text-foreground" : "text-muted-foreground")}>
                  {isAnySelected ? "Batal pilih semua" : "Pilih semua"}
                </span>
                <span className={cn("text-[12px] font-semibold sm:hidden", isAnySelected ? "text-foreground" : "text-muted-foreground")}>
                  {isAnySelected ? "Batal" : "Semua"}
                </span>
              </label>

              <div className="flex items-center flex-1 px-2 min-w-0">
                {/* Mobile Dropdown (hidden on sm+) */}
                <div className="flex sm:hidden flex-1 justify-start">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" disabled={!isAnySelected} className={cn(
                        "h-8 px-3.5 gap-1.5 rounded-full shadow-sm shrink-0 transition-all",
                        isAnySelected ? "bg-[#10b981] hover:bg-[#059669] text-white" : "bg-slate-100 text-slate-400 cursor-not-allowed hover:bg-slate-100"
                      )}>
                        <ListChecks className="h-4 w-4" />
                        <ChevronDown className="h-3 w-3 opacity-70" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48 rounded-xl p-1.5 border-slate-100 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)]">
                      <DropdownMenuItem onClick={handleEdit} disabled={selectedIds.size !== 1} className="gap-2.5 py-2 px-3 cursor-pointer rounded-lg text-[13px] font-semibold text-slate-700">
                        <Pencil className="h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toast.success("Fitur ekspor akan segera hadir")} className="gap-2.5 py-2 px-3 cursor-pointer rounded-lg text-[13px] font-semibold text-orange-500 hover:text-orange-600 hover:bg-orange-50 focus:text-orange-600 focus:bg-orange-50">
                        <FileOutput className="h-4 w-4" />
                        Ekspor
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleDelete} disabled={!isAnySelected} className="gap-2.5 py-2 px-3 cursor-pointer rounded-lg text-[13px] font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 focus:text-red-600 focus:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                        Hapus
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="my-1 mx-2 bg-slate-100" />
                      <DropdownMenuItem onClick={handleDuplicate} disabled={selectedIds.size < 2} className="gap-2.5 py-2 px-3 cursor-pointer rounded-lg text-[13px] font-semibold text-blue-500 hover:text-blue-600 hover:bg-blue-50 focus:text-blue-600 focus:bg-blue-50">
                        <Copy className="h-4 w-4" />
                        Atasi Duplikasi
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Desktop Inline Buttons (hidden on mobile, centered) */}
                <div className="hidden sm:flex items-center gap-1.5 flex-1 justify-center">
                  <Button onClick={handleEdit} size="sm" disabled={selectedIds.size !== 1} className={cn("h-7 px-3 text-[11px] font-semibold rounded-full shrink-0 transition-colors", selectedIds.size === 1 ? "bg-[#10b981] hover:bg-[#059669] text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-100")}>
                    Edit
                  </Button>
                  <Button onClick={() => toast.success("Fitur ekspor akan segera hadir")} size="sm" disabled={!isAnySelected} className={cn("h-7 px-3 text-[11px] font-semibold rounded-full shrink-0 transition-colors", isAnySelected ? "bg-[#f97316] hover:bg-[#ea580c] text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-100")}>
                    Ekspor
                  </Button>
                  <Button onClick={handleDelete} size="sm" disabled={!isAnySelected} className={cn("h-7 px-3 text-[11px] font-semibold rounded-full shrink-0 transition-colors", isAnySelected ? "bg-[#ef4444] hover:bg-[#dc2626] text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-100")}>
                    Hapus
                  </Button>
                  <Button onClick={handleDuplicate} size="sm" disabled={selectedIds.size < 2} className={cn("h-7 px-3 text-[11px] font-semibold rounded-full shrink-0 transition-colors", selectedIds.size >= 2 ? "bg-[#3b82f6] hover:bg-[#2563eb] text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-100")}>
                    Atasi Duplikasi
                  </Button>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-[13px] font-bold tabular-nums text-foreground">
                  {filters.type === 'expense' 
                    ? formatIDR(Math.abs(totalAmount)) 
                    : (totalAmount < 0 ? "-" : "") + formatIDR(Math.abs(totalAmount))}
                </p>
              </div>
            </div>
          </div>


          <CardContent className="p-0">
            {loading ? (
              <div className="p-10 text-center text-sm text-muted-foreground flex flex-col items-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#10b981] border-t-transparent mb-4" />
                Memuat catatan...
              </div>
            ) : sortedGrouped.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">Tidak ada transaksi ditemukan.</div>
            ) : (
              <div>
                {sortedGrouped.map(([date, items]) => {
                  const dayTotal = items.reduce((s, t) => {
                    if (t.type === "transfer") return s;
                    return s + (t.type === "income" ? t.amount : -t.amount);
                  }, 0)
                  const [y, m, d] = date.split('-');
                  const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
                  const dateLabel = dateObj.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

                  return (
                    <div key={date}>
                      {/* Date Header */}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-[#f8fafc]/95 backdrop-blur-sm border-y border-border/40 sticky top-[144px] sm:top-[160px] z-10 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                        <p className="text-[13px] font-bold">{dateLabel}</p>
                        <p className={cn("text-[13px] font-bold tabular-nums", dayTotal >= 0 ? "text-foreground" : "text-foreground")}>
                          {dayTotal >= 0 ? "" : "-"}{formatIDR(Math.abs(dayTotal))}
                        </p>
                      </div>

                      {/* Rows */}
                      {(() => {
                        const displayRows: Array<
                          | { kind: 'single'; tx: any }
                          | { kind: 'split_group'; groupId: string; items: any[]; totalAmount: number; firstTx: any }
                        > = []
                        const processedGroupIds = new Set<string>()

                        for (const t of items) {
                          if (t.split_group_id) {
                            if (!processedGroupIds.has(t.split_group_id)) {
                              processedGroupIds.add(t.split_group_id)
                              const groupItems = items.filter(x => x.split_group_id === t.split_group_id)
                              const totalAmount = groupItems.reduce((acc, curr) => acc + curr.amount, 0)
                              displayRows.push({
                                kind: 'split_group',
                                groupId: t.split_group_id,
                                items: groupItems,
                                totalAmount,
                                firstTx: t
                              })
                            }
                          } else {
                            displayRows.push({ kind: 'single', tx: t })
                          }
                        }

                        return displayRows.map((row) => {
                          if (row.kind === 'single') {
                            const t = row.tx
                            const isExpense = t.type === "expense"
                            const Icon = ICON_MAP[t.category_icon_key || "more-horizontal"] ?? Search

                            return (
                              <div 
                                key={t.id} 
                                onClick={() => { setViewTx(t); setViewModalOpen(true); }}
                                className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors group border-b border-border/20 last:border-0 cursor-pointer"
                              >
                                {/* Checkbox */}
                                <div onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(t.id)}
                                    onChange={() => toggleSelect(t.id)}
                                    className="rounded border-gray-300 w-4 h-4 accent-[#10b981] shrink-0"
                                  />
                                </div>

                                {/* Icon */}
                                <div className={cn(
                                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                                  t.category_icon_bg || (isExpense ? "bg-red-50" : "bg-green-50"),
                                  t.category_icon_color || (isExpense ? "text-red-500" : "text-[#10b981]")
                                )}>
                                  <Icon className="h-4 w-4" />
                                </div>

                                {/* Category + User */}
                                <div className="flex-1 sm:flex-none sm:w-[130px] min-w-0">
                                  <p className="text-[13px] font-semibold truncate">{t.category_name}</p>
                                  <p className="text-[11px] text-muted-foreground truncate">{t.account_name}</p>
                                </div>

                                {/* Account */}
                                <div className="hidden sm:flex items-center gap-1.5 w-[140px] shrink-0 min-w-0">
                                  <span className="w-2 h-2 rounded-full bg-[#22d3ee] shrink-0" />
                                  <span className="text-[12px] text-muted-foreground truncate">{t.account_name}</span>
                                </div>

                                {/* Description + Payment Method */}
                                <div className="hidden md:flex flex-col flex-1 min-w-0 gap-0.5">
                                  <span className="text-[12px] text-muted-foreground truncate">{t.description}</span>
                                  <PaymentBadge method={t.payment_method as PaymentMethod} />
                                </div>

                                {/* Amount + Time */}
                                <div className="ml-auto flex items-center gap-2 shrink-0">
                                  <div className="text-right">
                                    <p className={cn("text-[13px] font-bold tabular-nums", isExpense ? "text-[#ef4444]" : "text-[#10b981]")}>
                                      {isExpense ? "-" : "+"}Rp {t.amount.toLocaleString("id-ID")},00
                                    </p>
                                    <p className="text-[11px] text-muted-foreground flex items-center justify-end gap-0.5 mt-0.5">
                                      {t.transaction_time ? t.transaction_time.slice(0,5) : "12:00"} <span className="text-amber-400">⧖</span>
                                    </p>
                                  </div>
                                  <div className="w-5" />
                                </div>
                              </div>
                            )
                          } else {
                            // Split group parent + expandable sub-items
                            const { groupId, items: groupItems, totalAmount, firstTx } = row
                            const isExpanded = expandedSplitGroups.has(groupId)
                            const isExpense = firstTx.type === "expense"
                            const allSelected = groupItems.every(i => selectedIds.has(i.id))

                            return (
                              <div key={groupId} className="border-b border-border/20 last:border-0">
                                {/* Parent Row */}
                                <div
                                  onClick={() => toggleSplitGroup(groupId)}
                                  className="flex items-center gap-3 px-4 py-3 bg-indigo-50/30 hover:bg-indigo-50/60 transition-colors cursor-pointer select-none"
                                >
                                  {/* Checkbox for entire group */}
                                  <div onClick={(e) => {
                                    e.stopPropagation()
                                    const newSet = new Set(selectedIds)
                                    if (allSelected) {
                                      groupItems.forEach(i => newSet.delete(i.id))
                                    } else {
                                      groupItems.forEach(i => newSet.add(i.id))
                                    }
                                    setSelectedIds(newSet)
                                  }}>
                                    <input
                                      type="checkbox"
                                      checked={allSelected}
                                      onChange={() => {}}
                                      className="rounded border-gray-300 w-4 h-4 accent-[#10b981] shrink-0"
                                    />
                                  </div>

                                  {/* Icon */}
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                                    <Scissors className="h-4 w-4" />
                                  </div>

                                  {/* Title + Badge */}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-bold text-foreground truncate">
                                      {(() => {
                                        const names = groupItems.map(i => i.split_label || i.description).filter(Boolean)
                                        return names.length > 2 
                                          ? `${names.slice(0, 2).join(', ')} ... (+${names.length - 2} item)`
                                          : names.join(', ') || "Transaksi Split"
                                      })()}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700 shrink-0">
                                        ✂️ {groupItems.length} item
                                      </span>
                                      <p className="text-[11px] text-muted-foreground truncate">
                                        {firstTx.account_name}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Total Amount + Chevron */}
                                  <div className="ml-auto flex items-center gap-2 shrink-0">
                                    <div className="text-right">
                                      <p className={cn("text-[13px] font-bold tabular-nums", isExpense ? "text-[#ef4444]" : "text-[#10b981]")}>
                                        {isExpense ? "-" : "+"}Rp {totalAmount.toLocaleString("id-ID")},00
                                      </p>
                                      <p className="text-[11px] text-muted-foreground">
                                        {firstTx.transaction_time ? firstTx.transaction_time.slice(0,5) : "12:00"}
                                      </p>
                                    </div>
                                    <div className="w-5 flex justify-end text-muted-foreground">
                                      <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded ? "rotate-180" : "")} />
                                    </div>
                                  </div>
                                </div>

                                {/* Expanded Sub-items */}
                                {isExpanded && (
                                  <div className="bg-slate-50/80 divide-y divide-border/15 border-t border-indigo-100/60">
                                    {groupItems.map((sub) => {
                                      const SubIcon = ICON_MAP[sub.category_icon_key || "more-horizontal"] ?? Search
                                      return (
                                        <div
                                          key={sub.id}
                                          onClick={() => { setViewTx(sub); setViewModalOpen(true); }}
                                          className="flex items-center gap-3 pl-11 pr-4 py-2 hover:bg-muted/30 transition-colors cursor-pointer"
                                        >
                                          {/* Checkbox */}
                                          <div onClick={(e) => e.stopPropagation()}>
                                            <input
                                              type="checkbox"
                                              checked={selectedIds.has(sub.id)}
                                              onChange={() => toggleSelect(sub.id)}
                                              className="rounded border-gray-300 w-3.5 h-3.5 accent-[#10b981] shrink-0"
                                            />
                                          </div>

                                          {/* Sub Icon */}
                                          <div className={cn(
                                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                                            sub.category_icon_bg || "bg-red-50",
                                            sub.category_icon_color || "text-red-500"
                                          )}>
                                            <SubIcon className="h-3.5 w-3.5" />
                                          </div>

                                          {/* Sub Label & Category */}
                                          <div className="flex-1 min-w-0">
                                            <p className="text-[12px] font-semibold text-foreground truncate">
                                              {sub.split_label || sub.description}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground truncate">
                                              {sub.category_name}
                                            </p>
                                          </div>

                                          {/* Sub Amount */}
                                          <div className="ml-auto flex items-center gap-2 shrink-0">
                                            <div className="text-right">
                                              <p className="text-[12px] font-semibold tabular-nums text-[#ef4444]">
                                                -Rp {sub.amount.toLocaleString("id-ID")},00
                                              </p>
                                            </div>
                                            <div className="w-5" />
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )
                          }
                        })
                      })()}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AddTransactionModal 
        open={editModalOpen} 
        onClose={() => {
          setEditModalOpen(false)
          setEditTx(null)
        }}
        initialData={editTx}
        onSuccess={() => {
          setSelectedIds(new Set())
          setEditTx(null)
          refetch()
        }}
      />

      {/* ── Custom Confirm Modal ── */}
      {confirmState.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmState(prev => ({ ...prev, isOpen: false }))} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2">{confirmState.title}</h3>
            <p className="text-[13px] text-slate-500 mb-6">{confirmState.message}</p>
            <div className="flex gap-3 justify-end">
              <Button 
                variant="outline" 
                onClick={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
                className="rounded-xl font-semibold text-slate-600 border-slate-200 hover:bg-slate-50"
              >
                Batal
              </Button>
              <Button 
                onClick={() => {
                  setConfirmState(prev => ({ ...prev, isOpen: false }))
                  confirmState.onConfirm()
                }}
                className="rounded-xl font-semibold text-white bg-[#ef4444] hover:bg-[#dc2626]"
              >
                {confirmState.confirmText}
              </Button>
            </div>
          </div>
        </div>
      )}

      {viewModalOpen && viewTx && (
        <TransactionDetailModal
          transaction={viewTx}
          onClose={() => setViewModalOpen(false)}
          onEdit={() => {
            setViewModalOpen(false)
            setEditTx(viewTx)
            setEditModalOpen(true)
          }}
          onDelete={() => {
            setViewModalOpen(false)
            confirmAction("Hapus Transaksi", "Apakah Anda yakin ingin menghapus transaksi ini secara permanen?", async () => {
              try {
                await deleteTransactions([viewTx.id])
                toast.success("Transaksi berhasil dihapus")
                refetch()
              } catch (err) {
                toast.error("Gagal menghapus transaksi")
              }
            })
          }}
        />
      )}
    </div>
  )
}
