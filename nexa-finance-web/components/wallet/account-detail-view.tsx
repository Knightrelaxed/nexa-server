"use client"

import { useState, useEffect, useMemo } from "react"
import { ChevronLeft, Wallet, Banknote, CreditCard, PiggyBank, Search, Scissors, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAccounts, useTransactions } from "@/hooks/use-finance-data"
import { formatIDR, ICON_MAP } from "@/lib/wallet-data"
import { fetchDailyBalanceTrend } from "@/lib/supabase/queries"
import { deleteTransactions } from "@/lib/supabase/mutations"
import { toast } from "sonner"
import { AddTransactionModal } from "./add-transaction-modal"
import { AddAccountModal } from "./add-account-modal"
import type { DailyBalanceTrendRow } from "@/lib/supabase/types"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"
import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

const ACCOUNT_ICON: Record<string, React.ElementType> = {
  bank:       Banknote,
  cash:       Wallet,
  "e-wallet": PiggyBank,
}

const ACCOUNT_LABEL: Record<string, string> = {
  bank:       "Rekening tabungan",
  cash:       "Tunai",
  "e-wallet": "Dompet digital",
}

interface AccountDetailViewProps {
  accountId: string
  onBack: () => void
}

export function AccountDetailView({ accountId, onBack }: AccountDetailViewProps) {
  const { accounts, deleteAccount, refetch: refetchAccounts } = useAccounts()
  const account = accounts.find((a) => a.id === accountId)
  
  const [activeTab, setActiveTab] = useState<"saldo" | "catatan">("saldo")
  const [trendData, setTrendData] = useState<DailyBalanceTrendRow[]>([])
  const [loadingTrend, setLoadingTrend] = useState(true)
  const [editAccountModalOpen, setEditAccountModalOpen] = useState(false)

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

  const handleDeleteAccount = async () => {
    if (!account) return
    confirmAction("Hapus Akun", `Apakah Anda yakin ingin menghapus akun "${account.name}"? Semua transaksi di dalamnya juga akan terhapus secara permanen.`, async () => {
      try {
        await deleteAccount(account.id)
        toast.success(`Akun "${account.name}" berhasil dihapus`)
        onBack()
      } catch (err) {
        toast.error("Gagal menghapus akun")
      }
    })
  }

  // Fetch transactions for this account
  const txFilters = useMemo(() => ({ accountId }), [accountId])
  const { loading: txLoading, grouped, totalAmount, totalCount, refetch } = useTransactions(txFilters)

  const sortedGrouped = useMemo(() => {
    return Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]))
  }, [grouped])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedSplitGroups, setExpandedSplitGroups] = useState<Set<string>>(new Set())

  const toggleSplitGroup = (groupId: string) => {
    setExpandedSplitGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const allRecordIds = useMemo(() => {
    return Object.values(grouped).flat().map(t => t.id)
  }, [grouped])

  // Reset selection when grouped data changes
  useEffect(() => {
    setSelectedIds(new Set())
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
  
  // Modal confirm states
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [confirmDuplicateOpen, setConfirmDuplicateOpen] = useState(false)

  const handleEdit = () => {
    if (selectedIds.size !== 1) return
    const id = Array.from(selectedIds)[0]
    const tx = Object.values(grouped).flat().find(t => t.id === id)
    if (tx) {
      setEditTx(tx)
      setEditModalOpen(true)
    }
  }

  const handleDeleteClick = () => {
    if (selectedIds.size === 0) return
    setConfirmDeleteOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (selectedIds.size === 0) return
    try {
      await deleteTransactions(Array.from(selectedIds))
      toast.success("Catatan berhasil dihapus")
      setSelectedIds(new Set())
      refetch()
    } catch (err) {
      toast.error("Gagal menghapus catatan")
    }
  }

  const handleDuplicateClick = () => {
    if (selectedIds.size < 2) {
      toast.error("Pilih minimal 2 catatan untuk diatasi duplikasinya")
      return
    }
    setConfirmDuplicateOpen(true)
  }

  const handleDuplicateConfirm = async () => {
    const ids = Array.from(selectedIds)
    const removeIds = ids.slice(1)
    try {
      await deleteTransactions(removeIds)
      toast.success("Duplikasi berhasil diatasi")
      setSelectedIds(new Set())
      refetch()
    } catch (err) {
      toast.error("Gagal mengatasi duplikasi")
    }
  }

  useEffect(() => {
    async function loadTrend() {
      if (!account) return
      setLoadingTrend(true)
      try {
        const end = new Date()
        const start = new Date()
        start.setDate(end.getDate() - 30)
        
        const endStr = end.toISOString().split('T')[0]
        const startStr = start.toISOString().split('T')[0]
        
        const data = await fetchDailyBalanceTrend(account.id, startStr, endStr)
        setTrendData(data)
      } catch (err) {
        console.error("Failed to load trend:", err)
      } finally {
        setLoadingTrend(false)
      }
    }
    loadTrend()
  }, [account])

  if (!account) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-border shadow-sm">
        <p className="text-muted-foreground mb-4">Akun tidak ditemukan.</p>
        <Button onClick={onBack} variant="outline">Kembali</Button>
      </div>
    )
  }

  const Icon = ACCOUNT_ICON[account.type] ?? Wallet
  const color = account.color || "#06b6d4"
  const label = ACCOUNT_LABEL[account.type] ?? account.type

  // Calculate percentage change (VS Periode Sebelumnya)
  let pctChange = 0
  if (trendData.length > 1) {
    const firstBalance = trendData[0].running_balance
    const lastBalance = trendData[trendData.length - 1].running_balance
    if (firstBalance !== 0) {
      pctChange = ((lastBalance - firstBalance) / firstBalance) * 100
    }
  }

  const formatYAxis = (val: number) => {
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1).replace('.0', '')} jt`
    if (val >= 1_000) return `${(val / 1_000).toFixed(1).replace('.0', '')} rb`
    return val.toString()
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between p-4 sm:p-6 border-b border-border/50">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-1.5 -ml-1.5 rounded-full hover:bg-muted text-foreground transition-colors"
          >
            <ChevronLeft className="h-6 w-6 stroke-[2.5]" />
          </button>
          <h2 className="text-[18px] sm:text-[20px] font-bold">Detail Akun</h2>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 mt-4 sm:mt-0 ml-auto">
          <Button onClick={() => setEditAccountModalOpen(true)} variant="outline" className="h-9 px-4 rounded-full text-blue-500 border-blue-200 hover:bg-blue-50 hover:text-blue-600">
            Edit
          </Button>
          <Button onClick={handleDeleteAccount} variant="outline" className="h-9 px-4 rounded-full text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600">
            Hapus
          </Button>
        </div>
      </div>

      {/* ── Identity ── */}
      <div className="p-4 sm:p-6 flex items-center gap-5">
        <div 
          className="flex h-[72px] w-[72px] sm:h-[84px] sm:w-[84px] shrink-0 items-center justify-center rounded-2xl shadow-sm"
          style={{ backgroundColor: color, color: "white" }}
        >
          <Icon className="h-10 w-10 sm:h-12 sm:w-12" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground font-medium mb-0.5">Nama</p>
          <h3 className="text-[16px] sm:text-[18px] font-bold text-slate-800 leading-tight mb-2">{account.name}</h3>
          <p className="text-sm text-muted-foreground font-medium mb-0.5">Tipe</p>
          <p className="text-[14px] font-semibold text-slate-800">{label}</p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-border/70 px-4 sm:px-6">
        <button
          onClick={() => setActiveTab("saldo")}
          className={cn(
            "pb-3 px-1 mr-6 text-sm font-bold border-b-2 transition-colors",
            activeTab === "saldo" ? "border-[#10b981] text-[#10b981]" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Saldo
        </button>
        <button
          onClick={() => setActiveTab("catatan")}
          className={cn(
            "pb-3 px-1 text-sm font-bold border-b-2 transition-colors",
            activeTab === "catatan" ? "border-[#10b981] text-[#10b981]" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Catatan
        </button>
      </div>

      {/* ── Tab Content: Saldo ── */}
      {activeTab === "saldo" && (
        <div className="p-4 sm:p-6 bg-slate-50/50">
          <div className="flex flex-wrap gap-x-12 gap-y-4 mb-8">
            <div>
              <p className="text-[13px] text-muted-foreground font-medium mb-1">Hari ini</p>
              <h3 className="text-[22px] sm:text-[24px] font-bold text-slate-700">
                <span className="text-[18px] font-semibold text-slate-400 mr-1">{account.currency || "Rp"}</span>
                {formatIDR(account.balance).replace("Rp ", "")}
              </h3>
            </div>
            <div>
              <p className="text-[13px] text-muted-foreground font-medium mb-2">VS Periode Sebelumnya</p>
              <div className="flex items-center gap-1.5">
                <div className={cn(
                  "flex items-center justify-center rounded-full w-5 h-5",
                  pctChange > 0 ? "bg-green-400" : pctChange < 0 ? "bg-red-400" : "bg-slate-300"
                )}>
                  <span className="h-0.5 w-2.5 bg-white rounded-full"></span>
                </div>
                <span className="text-[14px] font-bold text-slate-700">{pctChange > 0 ? "+" : ""}{pctChange.toFixed(0)}%</span>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="relative h-[250px] sm:h-[300px] w-full mt-4 -ml-4 sm:ml-0">
            {loadingTrend ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : trendData.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                Tidak ada data saldo
              </div>
            ) : (
              <>
                <div className="absolute right-0 top-0 flex items-center gap-1.5 z-10 text-xs font-semibold text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-[#3b82f6]"></span>
                  Saldo
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="day" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      tickFormatter={(val) => {
                        const d = new Date(val)
                        return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`
                      }}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      tickFormatter={formatYAxis}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip 
                      formatter={(val: number) => [formatIDR(val), "Saldo"]}
                      labelFormatter={(label) => new Date(label).toLocaleDateString('id-ID', { dateStyle: 'medium' })}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Area 
                      type="stepAfter"
                      dataKey="running_balance" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorBalance)" 
                      activeDot={{ r: 6, fill: "#3b82f6", stroke: "white", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Tab Content: Catatan ── */}
      {activeTab === "catatan" && (
        <div className="bg-slate-50/50">
          {/* Action Bar */}
          <div className={cn(
            "flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-border/60 transition-colors",
            isAnySelected ? "bg-[#fffbeb]" : "bg-white"
          )}>
            <div className="flex flex-col gap-1 shrink-0">
              <span className="text-[13px] font-bold">Ditemukan {totalCount} catatan</span>
              <label className="flex items-center gap-1.5 cursor-pointer w-fit">
                <input 
                  type="checkbox" 
                  checked={isAnySelected}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300 w-4 h-4 accent-[#10b981]" 
                />
                <span className={cn("text-[12px]", isAnySelected ? "text-foreground font-semibold" : "text-muted-foreground")}>
                  {isAnySelected ? "Batal pilih semua" : "Pilih semua"}
                </span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <Button onClick={handleEdit} size="sm" disabled={selectedIds.size !== 1} className={cn("h-7 px-3 text-[11px] font-semibold rounded-full transition-colors", selectedIds.size === 1 ? "bg-[#10b981] hover:bg-[#059669] text-white" : "bg-gray-100 text-gray-400 hover:bg-gray-100")}>
                Edit
              </Button>
              <Button onClick={handleDeleteClick} size="sm" disabled={!isAnySelected} className={cn("h-7 px-3 text-[11px] font-semibold rounded-full transition-colors", isAnySelected ? "bg-[#ef4444] hover:bg-[#dc2626] text-white" : "bg-gray-100 text-gray-400 hover:bg-gray-100")}>
                Hapus
              </Button>
              <Button onClick={handleDuplicateClick} size="sm" disabled={selectedIds.size < 2} className={cn("h-7 px-3 text-[11px] font-semibold rounded-full transition-colors", selectedIds.size >= 2 ? "bg-[#3b82f6] hover:bg-[#2563eb] text-white" : "bg-gray-100 text-gray-400 hover:bg-gray-100")}>
                Atasi Duplikasi
              </Button>
            </div>

            <div className="shrink-0 sm:text-right">
              <p className="text-[13px] font-bold tabular-nums text-foreground">
                {formatIDR(totalAmount)}
              </p>
            </div>
          </div>

          {/* Transaction List */}
          {txLoading ? (
            <div className="p-10 text-center text-sm text-muted-foreground flex flex-col items-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#10b981] border-t-transparent mb-4" />
              Memuat catatan...
            </div>
          ) : sortedGrouped.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Tidak ada transaksi ditemukan untuk akun ini.</div>
          ) : (
            <div>
              {sortedGrouped.map(([date, items]) => {
                const dayTotal = items.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0)
                const dateLabel = new Date(date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })

                return (
                  <div key={date}>
                    {/* Date Header */}
                    <div className="flex items-center justify-between px-4 py-2 bg-[#f8fafc] border-y border-border/40">
                      <p className="text-[13px] font-bold">{dateLabel}</p>
                      <p className="text-[13px] font-bold tabular-nums">
                        {dayTotal >= 0 ? "" : "-"}{formatIDR(Math.abs(dayTotal))}
                      </p>
                    </div>

                    {/* Rows — split-group-aware */}
                    {(() => {
                      const displayRows: Array<
                        | { kind: 'single'; tx: any }
                        | { kind: 'split_group'; groupId: string; groupItems: any[]; totalAmount: number; firstTx: any }
                      > = []
                      const processedGroupIds = new Set<string>()

                      for (const t of items) {
                        if (t.split_group_id) {
                          if (!processedGroupIds.has(t.split_group_id)) {
                            processedGroupIds.add(t.split_group_id)
                            const grpItems = items.filter(x => x.split_group_id === t.split_group_id)
                            const grpTotal = grpItems.reduce((acc, c) => acc + c.amount, 0)
                            displayRows.push({ kind: 'split_group', groupId: t.split_group_id, groupItems: grpItems, totalAmount: grpTotal, firstTx: t })
                          }
                        } else {
                          displayRows.push({ kind: 'single', tx: t })
                        }
                      }

                      return displayRows.map((row) => {
                        if (row.kind === 'single') {
                          const t = row.tx
                          const isExpense = t.type === "expense"
                          const TxIcon = ICON_MAP[t.category_icon_key || "more-horizontal"] ?? Search
                          return (
                            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors group border-b border-border/20 last:border-0">
                              <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)} className="rounded border-gray-300 w-4 h-4 accent-[#10b981] shrink-0" />
                              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", t.category_icon_bg || (isExpense ? "bg-red-50" : "bg-green-50"), t.category_icon_color || (isExpense ? "text-red-500" : "text-[#10b981]"))}>
                                <TxIcon className="h-4 w-4" />
                              </div>
                              <div className="w-[110px] sm:w-[130px] shrink-0 min-w-0">
                                <p className="text-[13px] font-semibold truncate">{t.category_name}</p>
                                {t.payment_method && <p className="text-[11px] text-muted-foreground">{t.payment_method.toUpperCase()}</p>}
                              </div>
                              <div className="hidden sm:flex items-center gap-1.5 w-[140px] shrink-0 min-w-0">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                <span className="text-[12px] text-muted-foreground truncate">{account.name}</span>
                              </div>
                              <div className="hidden md:block flex-1 min-w-0">
                                <span className="text-[12px] text-muted-foreground truncate block">{t.description}</span>
                              </div>
                              <div className="ml-auto text-right shrink-0">
                                <p className={cn("text-[13px] font-bold tabular-nums", isExpense ? "text-[#ef4444]" : "text-[#10b981]")}>
                                  {isExpense ? "-" : "+"}Rp {t.amount.toLocaleString("id-ID")},00
                                </p>
                                <p className="text-[11px] text-muted-foreground flex items-center justify-end gap-0.5 mt-0.5">
                                  {t.transaction_time ? t.transaction_time.slice(0,5) : "12:00"} <span className="text-amber-400">⧖</span>
                                </p>
                              </div>
                            </div>
                          )
                        } else {
                          // Split group: expandable parent row
                          const { groupId, groupItems, totalAmount: grpTotal, firstTx } = row
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
                                <div onClick={(e) => {
                                  e.stopPropagation()
                                  const newSet = new Set(selectedIds)
                                  if (allSelected) { groupItems.forEach(i => newSet.delete(i.id)) }
                                  else { groupItems.forEach(i => newSet.add(i.id)) }
                                  setSelectedIds(newSet)
                                }}>
                                  <input type="checkbox" checked={allSelected} onChange={() => {}} className="rounded border-gray-300 w-4 h-4 accent-[#10b981] shrink-0" />
                                </div>
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                                  <Scissors className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-[13px] font-bold text-foreground truncate">{firstTx.description || "Transaksi Split"}</p>
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700">
                                      ✂️ Split • {groupItems.length} item
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    {firstTx.account_name} • Klik untuk {isExpanded ? "tutup" : "lihat rincian"}
                                  </p>
                                </div>
                                <div className="ml-auto flex items-center gap-2 shrink-0">
                                  <div className="text-right">
                                    <p className={cn("text-[13px] font-bold tabular-nums", isExpense ? "text-[#ef4444]" : "text-[#10b981]")}>
                                      {isExpense ? "-" : "+"}Rp {grpTotal.toLocaleString("id-ID")},00
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                      {firstTx.transaction_time ? firstTx.transaction_time.slice(0,5) : "12:00"}
                                    </p>
                                  </div>
                                  <div className="p-1 text-muted-foreground">
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
                                      <div key={sub.id} className="flex items-center gap-3 pl-11 pr-4 py-2 hover:bg-muted/30 transition-colors">
                                        <div onClick={(e) => e.stopPropagation()}>
                                          <input type="checkbox" checked={selectedIds.has(sub.id)} onChange={() => toggleSelect(sub.id)} className="rounded border-gray-300 w-3.5 h-3.5 accent-[#10b981] shrink-0" />
                                        </div>
                                        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", sub.category_icon_bg || "bg-red-50", sub.category_icon_color || "text-red-500")}>
                                          <SubIcon className="h-3.5 w-3.5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-[12px] font-semibold text-foreground truncate">{sub.split_label || sub.description}</p>
                                          <p className="text-[11px] text-muted-foreground truncate">{sub.category_name}</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <p className="text-[12px] font-semibold tabular-nums text-[#ef4444]">-Rp {sub.amount.toLocaleString("id-ID")},00</p>
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
        </div>
      )}

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

      <AddAccountModal
        open={editAccountModalOpen}
        onClose={() => setEditAccountModalOpen(false)}
        initialData={account}
        onSuccess={() => refetchAccounts()}
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
      {/* Modals for Destructive Actions */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Catatan?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus permanen {selectedIds.size} catatan yang dipilih? Data yang dihapus tidak dapat dikembalikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-500 hover:bg-red-600">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDuplicateOpen} onOpenChange={setConfirmDuplicateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Atasi Duplikasi?</AlertDialogTitle>
            <AlertDialogDescription>
              1 catatan akan dipertahankan, dan {selectedIds.size - 1} catatan lainnya akan dihapus. Lanjutkan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDuplicateConfirm} className="bg-blue-500 hover:bg-blue-600">
              Atasi Duplikasi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
