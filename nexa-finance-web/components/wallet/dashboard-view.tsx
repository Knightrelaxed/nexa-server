"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import type { PaymentMethod } from "@/lib/supabase/types"
import { Card } from "@/components/ui/card"
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid,
  ComposedChart, Bar, Line, Legend, LineChart
} from "recharts"
import {
  Trash2, Plus, PiggyBank,
  Utensils, Bus, ShoppingBag, Film, Receipt, HeartPulse, Book,
  Briefcase, TrendingUp, Wifi, Wallet, MoreHorizontal, CreditCard,
  Wine, Coffee, Cake, Percent, Lock, Unlock, type LucideIcon,
} from "lucide-react"
import { formatIDR, formatIDRCompact } from "@/lib/wallet-data"
import { useAccounts, useDashboardData, usePeriodComparison } from "@/hooks/use-finance-data"
import { Button } from "@/components/ui/button"
import { PeriodSelector, defaultPeriod, type PeriodValue } from "./period-selector"
import { AddAccountModal } from "./add-account-modal"
import { cn } from "@/lib/utils"

const ICON_MAP: Record<string, LucideIcon> = {
  utensils: Utensils, bus: Bus, "shopping-bag": ShoppingBag, film: Film,
  receipt: Receipt, "heart-pulse": HeartPulse, book: Book, briefcase: Briefcase,
  "trending-up": TrendingUp, wifi: Wifi, wallet: Wallet, "more-horizontal": MoreHorizontal,
  "credit-card": CreditCard, wine: Wine, coffee: Coffee, cake: Cake, percent: Percent,
}

/* ── Six-dot drag handle icon ── */
function SixDots({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className={className}>
      <circle cx="4" cy="3" r="1.4" /><circle cx="10" cy="3" r="1.4" />
      <circle cx="4" cy="7" r="1.4" /><circle cx="10" cy="7" r="1.4" />
      <circle cx="4" cy="11" r="1.4" /><circle cx="10" cy="11" r="1.4" />
    </svg>
  )
}

/* ── Widget Header ── */
function WidgetHeader({
  title, subtitle, onGrab, isLocked
}: { title: string; subtitle?: string; onGrab?: (e: React.PointerEvent<HTMLDivElement>) => void; isLocked?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-border/60 px-4 py-3">
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[14px] font-bold">{title}</h3>
        {subtitle && <p className="truncate text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
        <div
          onPointerDown={isLocked ? undefined : onGrab}
          style={{ touchAction: "none" }}
          className={cn("rounded p-1 select-none transition-colors",
            isLocked ? "opacity-20 cursor-not-allowed" : "hover:bg-muted cursor-grab active:cursor-grabbing"
          )}
          title={isLocked ? "Buka kunci untuk memindahkan" : "Seret untuk memindahkan"}
        >
          <SixDots className={cn("transition-opacity", !isLocked && "opacity-50 hover:opacity-100")} />
        </div>
      </div>
    </div>
  )
}

/* ── Circular Speedometer Gauge ── */
function CircleGauge({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.max(0, Math.min(1, Math.abs(value) / (max || 1)))
  const startAngle = 140; const totalArc = 260
  const cx = 50; const cy = 48; const r = 38
  const pt = (deg: number) => {
    const rad = (deg * Math.PI) / 180
    return { x: (cx + r * Math.cos(rad)).toFixed(3), y: (cy + r * Math.sin(rad)).toFixed(3) }
  }
  const arcPath = (s: number, e: number) => {
    const p1 = pt(s); const p2 = pt(e); const large = (e - s) > 180 ? 1 : 0
    return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y}`
  }
  const segments = [{ start: 140, end: 226, color: "#ef4444" }, { start: 226, end: 314, color: "#f59e0b" }, { start: 314, end: 400, color: "#10b981" }]
  const needleAngle = startAngle + pct * totalArc
  const needleRad = (needleAngle * Math.PI) / 180
  const nx = (cx + (r - 8) * Math.cos(needleRad)).toFixed(3)
  const ny = (cy + (r - 8) * Math.sin(needleRad)).toFixed(3)
  return (
    <div className="flex flex-col items-center w-full">
      <svg viewBox="0 0 100 85" className="w-full max-w-[85px] sm:max-w-[110px] drop-shadow-sm">
        {segments.map((seg, i) => <path key={i} d={arcPath(seg.start, seg.end)} fill="none" stroke={seg.color} strokeWidth="11" strokeLinecap="butt" />)}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#334155" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill="#334155" />
      </svg>
      <div className="mt-0 text-center">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-[14px] sm:text-[16px] font-black tabular-nums leading-tight mt-0.5">{formatIDRCompact(value).replace('Rp', '').trim()}</p>
      </div>
    </div>
  )
}

/* ── Types ── */
type CardId = "dashboard" | "tren-saldo" | "struktur" | "perbandingan" | "arus-kas" | "catatan" | "sifat"
const DEFAULT_ORDER: CardId[] = ["dashboard", "tren-saldo", "struktur", "perbandingan", "arus-kas", "catatan", "sifat"]

interface DragState {
  id: CardId; ghostX: number; ghostY: number
  offsetX: number; offsetY: number; width: number; height: number
}

/* ── Main Dashboard ── */
export function DashboardView() {
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod)
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false)
  const [cardOrder, setCardOrder] = useState<CardId[]>(DEFAULT_ORDER)

  // Memuat urutan kartu dari localStorage saat komponen pertama kali dirender
  useEffect(() => {
    const saved = localStorage.getItem("nexa_dashboard_order_v2")
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          // Pastikan item valid dan tambahkan widget baru jika ada pembaruan versi
          const validOrder = parsed.filter(id => DEFAULT_ORDER.includes(id as CardId))
          const missing = DEFAULT_ORDER.filter(id => !validOrder.includes(id))
          setCardOrder([...validOrder, ...missing] as CardId[])
        }
      } catch (e) {
        console.error("Gagal memuat urutan dasbor", e)
      }
    }
  }, [])

  // Menyimpan urutan kartu ke localStorage setiap kali ada perubahan
  useEffect(() => {
    localStorage.setItem("nexa_dashboard_order_v2", JSON.stringify(cardOrder))
  }, [cardOrder])

  const [dragState, setDragState] = useState<DragState | null>(null)
  const [hoverCard, setHoverCard] = useState<CardId | null>(null)
  const [compTab, setCompTab] = useState<"arus" | "pengeluaran" | "pemasukan">("arus")
  const [isLayoutLocked, setIsLayoutLocked] = useState(true)

  const cardRefs = useRef<Partial<Record<CardId, HTMLDivElement | null>>>({})
  const dragStateRef = useRef<DragState | null>(null)
  const hoverCardRef = useRef<CardId | null>(null)

  const { accounts, loading: accountsLoading, refetch } = useAccounts()
  const {
    balanceTrend, totalBalance, totalIncome, totalExpense,
    cashFlow, recentTransactions, expenseByCategory, dailyCategoryExpenses, dailyNeedsWants, loading: dashLoading,
  } = useDashboardData(period)
  const { data: comparisonData, loading: comparisonLoading } = usePeriodComparison(period, compTab, accounts[0]?.id)

  const trendData = balanceTrend.map((b) => ({
    name: new Date(b.day).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
    saldo: b.running_balance,
  }))

  const dailyChartData = useMemo(() => balanceTrend.map((b) => ({
    day: new Date(b.day).getDate(),
    name: new Date(b.day).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
    Pemasukan: b.daily_income,
    Pengeluaran: -b.daily_expense, // Negative for downward bars
    'Arus kas': b.daily_income - b.daily_expense,
  })), [balanceTrend])

  const pieColors = ["#8b5cf6", "#ef4444", "#10b981", "#84cc16", "#3b82f6"]
  const maxAmount = Math.max(totalIncome, totalExpense, 1)

  /* ── Pointer-based Drag ── */
  function startDrag(id: CardId, e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    const card = cardRefs.current[id]
    if (!card) return
    const rect = card.getBoundingClientRect()
    const state: DragState = {
      id,
      ghostX: rect.left,
      ghostY: rect.top,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    }
    dragStateRef.current = state
    setDragState(state)
  }

  useEffect(() => {
    if (!dragState) return

    function findCardAt(x: number, y: number): CardId | null {
      for (const [id, ref] of Object.entries(cardRefs.current)) {
        if (!ref || id === dragStateRef.current?.id) continue
        const rect = ref.getBoundingClientRect()
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          return id as CardId
        }
      }
      return null
    }

    function onMove(e: PointerEvent) {
      const ds = dragStateRef.current
      if (!ds) return
      const next: DragState = {
        ...ds,
        ghostX: e.clientX - ds.offsetX,
        ghostY: e.clientY - ds.offsetY,
      }
      dragStateRef.current = next
      setDragState(next)

      const found = findCardAt(e.clientX, e.clientY)
      hoverCardRef.current = found
      setHoverCard(found)
    }

    function onUp() {
      const ds = dragStateRef.current
      const hc = hoverCardRef.current
      if (ds && hc && ds.id !== hc) {
        setCardOrder((prev) => {
          const next = [...prev]
          const fromIdx = next.indexOf(ds.id)
          const toIdx = next.indexOf(hc)
          next.splice(fromIdx, 1)
          next.splice(toIdx, 0, ds.id)
          return next
        })
      }
      dragStateRef.current = null
      hoverCardRef.current = null
      setDragState(null)
      setHoverCard(null)
    }

    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!dragState])

  /* ── Card Content Renderer ── */
  function renderCardContent(id: CardId) {
    switch (id) {
      case "dashboard": return (
        <>
          <WidgetHeader title="Dasbor" isLocked={isLayoutLocked} onGrab={(e) => startDrag("dashboard", e)} />
          <div className="flex-1 flex items-center justify-center">
            <div className="grid grid-cols-3 gap-1 sm:gap-2 px-1 sm:px-2 py-5 w-full justify-items-center">
              <CircleGauge value={totalBalance} max={Math.max(totalBalance * 1.5, 1_000_000)} label="SALDO" />
              <CircleGauge value={cashFlow} max={Math.max(Math.abs(cashFlow) * 1.5, 1_000_000)} label="ARUS KAS" />
              <CircleGauge value={totalExpense} max={Math.max(totalExpense * 1.5, 1_000_000)} label="PENGELUARAN" />
            </div>
          </div>
        </>
      )
      case "tren-saldo": return (
        <>
          <WidgetHeader title="Tren Saldo" isLocked={isLayoutLocked} onGrab={(e) => startDrag("tren-saldo", e)} />
          <div className="flex-1 flex flex-col justify-end">
            <div className="px-4 pt-3 pb-1 flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] text-muted-foreground">Bulan ini</p>
                <p className="text-lg font-bold tabular-nums">{formatIDR(totalBalance)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] text-muted-foreground">Pemasukan</p>
                <p className="text-[13px] font-bold text-[#10b981]">{formatIDR(totalIncome)}</p>
              </div>
            </div>
            <div className="h-[140px] px-1 pb-2 mt-auto">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 4, right: 6, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="saldoG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}jt`} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number) => formatIDR(v)} />
                  <Area type="monotone" dataKey="saldo" stroke="#3b82f6" strokeWidth={2} fill="url(#saldoG)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )
      case "struktur": {
        const hasData = expenseByCategory.length > 0;
        const displayPieData = hasData ? expenseByCategory : [{ category_name: 'Kosong', total: 1 }];
        const displayPieColors = hasData ? pieColors : ['#f1f5f9'];

        return (
          <>
            <WidgetHeader title="Struktur Pengeluaran" isLocked={isLayoutLocked} onGrab={(e) => startDrag("struktur", e)} />
            <div className="flex-1 flex flex-col gap-4 px-3 py-3">
              {/* Top: Pie Chart & List */}
              <div className="grid grid-cols-[130px_1fr] items-center gap-4">
                <div className="h-[130px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip 
                        formatter={(value: number) => formatIDR(value)}
                        contentStyle={{ fontSize: '11px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        itemStyle={{ color: '#334155', fontWeight: 600 }}
                      />
                      <Pie 
                        data={displayPieData} 
                        innerRadius={40} 
                        outerRadius={60} 
                        paddingAngle={3} 
                        dataKey="total" 
                        stroke="none"
                      >
                        {displayPieData.map((_, i) => <Cell key={i} fill={displayPieColors[i % displayPieColors.length]} className="hover:opacity-80 transition-opacity duration-200 cursor-pointer" />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] text-center text-slate-500 font-medium">Semua<br />kategori</span>
                  </div>
                </div>
                {!hasData ? (
                  <div className="text-[11px] text-muted-foreground flex items-center h-full">Belum ada pengeluaran bulan ini.</div>
                ) : (
                  <ul className="space-y-1.5 text-[11px]">
                    {expenseByCategory.slice(0, 5).map((c, i) => (
                      <li key={c.category_name} className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: pieColors[i % pieColors.length] }} />
                          <span className="truncate max-w-[80px]">{c.category_name}</span>
                        </div>
                        <span className="text-muted-foreground tabular-nums shrink-0">{formatIDRCompact(c.total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Bottom: Stacked Bar Chart */}
              <div className="flex-1 min-h-[160px] w-full pt-2 border-t border-border/50 relative">
                {!hasData && (
                   <div className="absolute inset-0 flex items-center justify-center z-10 text-xs text-muted-foreground">
                      Grafik tren akan muncul di sini.
                   </div>
                )}
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dailyCategoryExpenses} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={4} />
                    <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1_000).toFixed(0)}k`} />
                    <Tooltip 
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} 
                      formatter={(v: number) => formatIDR(v)} 
                      cursor={{ fill: '#f8fafc' }}
                    />
                    {hasData && expenseByCategory.map((cat, i) => (
                      <Bar key={cat.category_name} dataKey={cat.category_name} stackId="a" fill={pieColors[i % pieColors.length]} barSize={14} />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )
      }
      case "sifat": {
        const hasData = expenseByCategory.length > 0;
        return (
          <>
            <WidgetHeader title="Sifat Pengeluaran" isLocked={isLayoutLocked} onGrab={(e) => startDrag("sifat", e)} />
            <div className="flex-1 flex flex-col min-h-[270px] px-3 py-3 relative overflow-hidden">
              
              {/* Development Overlay */}
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/40 backdrop-blur-md">
                <div className="bg-slate-900 text-white text-[11px] font-bold px-4 py-2 rounded-full shadow-xl shadow-slate-900/20 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                  Masih Dalam Pengembangan
                </div>
              </div>

              {!hasData && (
                 <div className="absolute inset-0 flex items-center justify-center z-10 text-xs text-muted-foreground bg-white/50 backdrop-blur-[1px]">
                    Belum ada pengeluaran periode ini.
                 </div>
              )}
              <div className="flex items-center gap-2 mb-4 justify-center">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><span className="w-2 h-2 rounded-full bg-[#ef4444]"></span> Harus</span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><span className="w-2 h-2 rounded-full bg-[#f59e0b]"></span> Butuh</span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><span className="w-2 h-2 rounded-full bg-[#10b981]"></span> Ingin</span>
              </div>
              <div className="flex-1 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dailyNeedsWants} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={4} />
                    <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1_000).toFixed(0)}k`} />
                    <Tooltip 
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} 
                      formatter={(v: number) => formatIDR(v)} 
                      cursor={{ fill: '#f8fafc' }}
                    />
                    <Bar dataKey="harus" stackId="a" fill="#ef4444" barSize={14} />
                    <Bar dataKey="butuh" stackId="a" fill="#f59e0b" barSize={14} />
                    <Bar dataKey="ingin" stackId="a" fill="#10b981" barSize={14} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )
      }
      case "perbandingan": return (
        <>
          <WidgetHeader title="Perbandingan Periode" isLocked={isLayoutLocked} onGrab={(e) => startDrag("perbandingan", e)} />
          <div className="flex-1 flex flex-col px-3 pt-4 pb-2 min-h-[260px]">
            {/* Tabs */}
            <div className="flex bg-slate-100 rounded-lg p-1 mb-4">
              <button 
                onClick={() => setCompTab("arus")}
                className={cn("flex-1 py-1.5 text-sm font-semibold rounded-md transition-colors", compTab === "arus" ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700")}
              >
                Arus kas
              </button>
              <button 
                onClick={() => setCompTab("pengeluaran")}
                className={cn("flex-1 py-1.5 text-sm font-semibold rounded-md transition-colors", compTab === "pengeluaran" ? "bg-red-500 shadow-sm text-white" : "text-slate-500 hover:text-slate-700")}
              >
                Pengeluaran
              </button>
              <button 
                onClick={() => setCompTab("pemasukan")}
                className={cn("flex-1 py-1.5 text-sm font-semibold rounded-md transition-colors", compTab === "pemasukan" ? "bg-emerald-500 shadow-sm text-white" : "text-slate-500 hover:text-slate-700")}
              >
                Pemasukan
              </button>
            </div>

            {comparisonLoading ? (
              <div className="flex-1 flex items-center justify-center h-full">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-[#3b82f6]" />
              </div>
            ) : comparisonData.length === 0 ? (
              <div className="flex-1 flex items-center justify-center h-full text-sm text-muted-foreground">Tidak ada data periode ini.</div>
            ) : (
              <div className="flex-1 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={comparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="dayLabel" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval={4} dy={10} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1_000_000).toFixed(1).replace('.0', '')} jt`} />
                    <Tooltip 
                      contentStyle={{ fontSize: 12, borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} 
                      formatter={(v: number) => formatIDR(v)} 
                      cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: '15px' }} iconType="circle" />
                    <Line name="Periode Saat Ini" type="stepAfter" dataKey="current" stroke="#3b82f6" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: '#3b82f6' }} />
                    <Line name="Periode sama tahun lalu" type="stepAfter" dataKey="lastYear" stroke="#f97316" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: '#f97316' }} />
                    <Line name="Periode Sebelumnya" type="stepAfter" dataKey="previous" stroke="#ec4899" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: '#ec4899' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )
      case "arus-kas": return (
        <>
          <WidgetHeader title="Arus Kas" isLocked={isLayoutLocked} onGrab={(e) => startDrag("arus-kas", e)} />
          <div className="flex-1 flex flex-col justify-center px-4 pt-3 pb-4 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] text-muted-foreground">Arus Kas Periode Ini</p>
                <p className={cn("text-base font-bold tabular-nums", cashFlow >= 0 ? "text-[#10b981]" : "text-[#ef4444]")}>{formatIDR(cashFlow)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] text-muted-foreground">{formatIDR(totalIncome)} − {formatIDR(totalExpense)}</p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground font-medium">Pemasukan</span>
                <span className="font-bold text-[#10b981]">{formatIDR(totalIncome)}</span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#10b981] to-[#34d399] rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (totalIncome / maxAmount) * 100)}%` }} />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground font-medium">Pengeluaran</span>
                <span className="font-bold text-[#ef4444]">-{formatIDR(totalExpense)}</span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#ef4444] to-[#f87171] rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (totalExpense / maxAmount) * 100)}%` }} />
              </div>
            </div>
          </div>
        </>
      )
      case "catatan": return (
        <>
          <WidgetHeader title="Catatan Terakhir" isLocked={isLayoutLocked} onGrab={(e) => startDrag("catatan", e)} />
          <div className="flex-1 flex flex-col min-h-[200px]">
          {recentTransactions.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Belum ada catatan periode ini.</div>
          ) : (
            <ul className="divide-y divide-border/40">
              {recentTransactions.slice(0, 6).map((t) => {
                const Icon = ICON_MAP[t.category_icon_key || "more-horizontal"] ?? MoreHorizontal
                const isExpense = t.type === "expense"
                return (
                  <li key={t.id} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/20 transition-colors">
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", t.category_icon_bg || "bg-gray-100", t.category_icon_color || "text-gray-500")}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold">{t.category_name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <div className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#22d3ee] shrink-0" />
                          <span className="text-[10px] text-muted-foreground truncate">{t.account_name}</span>
                        </div>
                        {t.payment_method && (() => {
                          const pm = t.payment_method as PaymentMethod
                          const styles: Record<string, string> = {
                            'QRIS': 'bg-violet-100 text-violet-700',
                            'Transfer bank': 'bg-blue-100 text-blue-700',
                            'Kartu Kredit': 'bg-orange-100 text-orange-700',
                            'Tunai': 'bg-green-100 text-green-700',
                          }
                          const shortLabel: Record<string, string> = {
                            'QRIS': 'QRIS', 'Transfer bank': 'TF', 'Kartu Kredit': 'KK', 'Tunai': 'Tunai'
                          }
                          return (
                            <span className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold ${styles[pm] ?? ''}`}>
                              {shortLabel[pm] ?? pm}
                            </span>
                          )
                        })()}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn("text-[12px] font-bold tabular-nums", isExpense ? "text-[#ef4444]" : "text-[#10b981]")}>
                        {isExpense ? "-" : "+"}{formatIDR(t.amount)}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(t.transaction_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          </div>
        </>
      )
    }
  }

  if (accountsLoading || dashLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#10b981] border-t-transparent" />
      </div>
    )
  }

  const isWideCard = (id: CardId) => id === "struktur" || id === "sifat" || id === "perbandingan"

  return (
    <div className="space-y-4 sm:space-y-5">

      {/* ── Floating Ghost Card ── */}
      {dragState && (
        <div
          style={{
            position: "fixed",
            left: dragState.ghostX,
            top: dragState.ghostY,
            width: dragState.width,
            height: dragState.height,
            zIndex: 9999,
            pointerEvents: "none",
            transform: "rotate(2deg) scale(1.03)",
            boxShadow: "0 30px 80px -10px rgba(0,0,0,0.35), 0 10px 30px -5px rgba(0,0,0,0.2)",
            borderRadius: "16px",
            overflow: "hidden",
            opacity: 0.96,
          }}
        >
          <Card className="h-full rounded-2xl border border-slate-200/60 bg-white overflow-hidden">
            {renderCardContent(dragState.id)}
          </Card>
        </div>
      )}

      {/* ── Accounts Row ── */}
      <div className="flex items-stretch gap-3 overflow-x-auto pb-3 pt-1 -mx-3 px-3 sm:mx-0 sm:px-0 no-scrollbar">
        {accounts.map((acc, i) => (
          <div key={acc.id} className={cn(
            "flex min-w-[220px] items-center gap-3 rounded-2xl px-5 py-4 text-white shadow-md shrink-0",
            i % 2 === 0 ? "bg-gradient-to-r from-[#22d3ee] to-[#3b82f6]" : "bg-gradient-to-r from-[#10b981] to-[#059669]"
          )}>
            <PiggyBank className="h-7 w-7 shrink-0" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold truncate">{acc.name}</p>
              <p className="text-base font-bold truncate">{formatIDR(acc.balance)}</p>
            </div>
          </div>
        ))}
        <button
          onClick={() => setIsAddAccountOpen(true)}
          className="flex h-auto min-w-[140px] sm:min-w-[160px] items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors text-sm font-semibold shrink-0"
        >
          <Plus className="h-4 w-4 shrink-0" /> Tambah Akun
        </button>
      </div>

      {/* ── Date Selector Row ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <PeriodSelector value={period} onChange={setPeriod} />
        <Button 
          onClick={() => setIsLayoutLocked(!isLayoutLocked)}
          className={cn(
            "w-full sm:w-auto gap-2 rounded-full font-semibold text-sm text-white transition-colors",
            isLayoutLocked 
              ? "bg-red-500 hover:bg-red-600" 
              : "bg-[#10b981] hover:bg-[#059669]"
          )}
        >
          {isLayoutLocked ? <Lock className="h-4 w-4 shrink-0" /> : <Unlock className="h-4 w-4 shrink-0" />}
          <span>{isLayoutLocked ? "Letak Dikunci" : "Letak Terbuka"}</span>
        </Button>
      </div>

      {/* ── Widgets Grid ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cardOrder.map((id) => {
          const isDragging = dragState?.id === id
          const isDropTarget = hoverCard === id

          return (
            <div
              key={id}
              ref={(el) => { cardRefs.current[id] = el }}
              className={cn(
                isWideCard(id) ? "sm:col-span-2 lg:col-span-1" : "",
                "transition-all duration-200"
              )}
            >
              {isDragging ? (
                /* Placeholder slot while card is being dragged */
                <div
                  className={cn(
                    "rounded-2xl border-2 border-dashed transition-all duration-150",
                    isDropTarget
                      ? "border-[#10b981] bg-[#10b981]/5"
                      : "border-slate-200 bg-slate-50/50"
                  )}
                  style={{ minHeight: dragState.height }}
                />
              ) : (
                <Card
                  className={cn(
                    "rounded-2xl border border-slate-200/60 bg-white overflow-hidden transition-all duration-200 flex flex-col h-full",
                    isDropTarget
                      ? "ring-2 ring-[#10b981] ring-offset-2 shadow-lg scale-[1.01]"
                      : "shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] hover:shadow-md"
                  )}
                >
                  {renderCardContent(id)}
                </Card>
              )}
            </div>
          )
        })}
      </div>

      <AddAccountModal
        open={isAddAccountOpen}
        onClose={() => setIsAddAccountOpen(false)}
        onSuccess={refetch}
      />
    </div>
  )
}
