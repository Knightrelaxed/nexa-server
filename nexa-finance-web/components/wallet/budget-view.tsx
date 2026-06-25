"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatIDR, formatIDRCompact } from "@/lib/wallet-data"
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"
import { Plus, Edit2, Trash2, PiggyBank, Target, Utensils, Bus, ShoppingBag, HeartPulse, Film, Book, Briefcase, Zap, AlertTriangle, AlertCircle, Save } from "lucide-react"
import { PeriodSelector, defaultPeriod, type PeriodValue } from "./period-selector"
import { cn } from "@/lib/utils"

const ICON_MAP: Record<string, React.ElementType> = {
  utensils: Utensils, bus: Bus, "shopping-bag": ShoppingBag, film: Film,
  "heart-pulse": HeartPulse, book: Book, briefcase: Briefcase, zap: Zap,
  default: Target
}

interface BudgetGroup {
  id: string
  name: string
  color: string
  icon: string
  category_ids: string[]
}

interface Budget {
  id: string
  budget_group_id: string | null
  period: 'daily' | 'weekly' | 'monthly'
  amount: number
  is_active: boolean
}

export function BudgetView() {
  const [activeTab, setActiveTab] = useState<'visual' | 'config'>('visual')
  // Gunakan lazy initializer yang eksplisit untuk menghindari ambiguitas
  const [period, setPeriod] = useState<PeriodValue>(() => defaultPeriod())
  const [groups, setGroups] = useState<BudgetGroup[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [expenses, setExpenses] = useState<{ category_id: string, amount: number }[]>([])
  
  // State for config forms
  const [globalConfig, setGlobalConfig] = useState<Record<string, string>>({
    daily: '',
    weekly: '',
    monthly: ''
  })
  const [isSaving, setIsSaving] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    if (!isSupabaseConfigured) { setLoading(false); return; }
    
    const startStr = new Date(period.start.getTime() - period.start.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const endStr = new Date(period.end.getTime() - period.end.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

    const [grpResult, bdgResult, expResult] = await Promise.all([
      supabase.from('budget_groups').select('*').eq('is_archived', false),
      supabase.from('budgets').select('*').eq('is_active', true),
      supabase
        .from('transactions')
        .select('category_id, amount')
        .eq('type', 'expense')
        .gte('transaction_date', startStr)
        .lte('transaction_date', endStr)
    ])

    setGroups(grpResult.data || [])
    const fetchedBudgets = bdgResult.data || []
    setBudgets(fetchedBudgets)
    
    // Initialize config inputs
    setGlobalConfig({
      daily: fetchedBudgets.find(b => b.budget_group_id === null && b.period === 'daily')?.amount.toString() || '',
      weekly: fetchedBudgets.find(b => b.budget_group_id === null && b.period === 'weekly')?.amount.toString() || '',
      monthly: fetchedBudgets.find(b => b.budget_group_id === null && b.period === 'monthly')?.amount.toString() || ''
    })

    setExpenses(expResult.data || [])
    setLoading(false)
  }, [period.start.getTime(), period.end.getTime()])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Calculators
  const totalExpense = useMemo(() => expenses.reduce((sum, e) => sum + Number(e.amount), 0), [expenses])
  
  // Pilih period mode berdasarkan mode yang dipilih user di PeriodSelector (lebih akurat dari hitung hari)
  const activePeriodMode: 'daily' | 'weekly' | 'monthly' = useMemo(() => {
    const days = Math.max(Math.round((period.end.getTime() - period.start.getTime()) / 86400000) + 1, 1)
    if (days <= 1) return 'daily'
    if (days <= 7) return 'weekly'
    return 'monthly'
  }, [period.start, period.end])

  const globalBudget = useMemo(
    () => budgets.find(b => b.budget_group_id === null && b.period === activePeriodMode),
    [budgets, activePeriodMode]
  )

  const groupStats = useMemo(() => {
    return groups.map(g => {
      const budget = budgets.find(b => b.budget_group_id === g.id && b.period === activePeriodMode)
      const spent = expenses.filter(e => g.category_ids.includes(e.category_id)).reduce((s, e) => s + Number(e.amount), 0)
      return {
        ...g,
        budgetAmount: budget ? Number(budget.amount) : 0,
        spent,
        percentage: budget && Number(budget.amount) > 0 ? (spent / Number(budget.amount)) * 100 : 0
      }
    }).filter(g => g.budgetAmount > 0 || g.spent > 0)
  }, [groups, budgets, expenses, activePeriodMode])

  // Helpers
  const getStatusColor = (pct: number) => {
    if (pct >= 90) return '#ef4444' // red
    if (pct >= 70) return '#f59e0b' // yellow
    return '#10b981' // green
  }
  
  const getStatusBg = (pct: number) => {
    if (pct >= 90) return 'bg-red-500'
    if (pct >= 70) return 'bg-amber-500'
    return 'bg-emerald-500'
  }

  // Proteksi divide-by-zero: pastikan globalBudget.amount > 0 sebelum dibagi
  const globalPct = (globalBudget && globalBudget.amount > 0)
    ? (totalExpense / globalBudget.amount) * 100
    : 0
  const globalColor = getStatusColor(globalPct)

  const handleSaveGlobalConfig = async () => {
    setIsSaving(true)
    const toUpsert = []
    for (const p of ['daily', 'weekly', 'monthly']) {
      const amountStr = globalConfig[p]
      if (amountStr) {
        toUpsert.push({
          budget_group_id: null,
          period: p,
          amount: parseFloat(amountStr),
          is_active: true
        })
      }
    }
    
    if (toUpsert.length > 0) {
      const { error } = await supabase.from('budgets').upsert(toUpsert, { onConflict: 'budget_group_id, period' })
      if (!error) {
        alert("Jatah Global berhasil diperbarui!")
        await loadData()
      } else {
        alert("Gagal menyimpan: " + error.message)
      }
    }
    setIsSaving(false)
  }

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-5 pb-20">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <PeriodSelector value={period} onChange={setPeriod} />
        
        {/* Tabs */}
        <div className="flex bg-slate-100 rounded-full p-1 w-full sm:w-auto">
          <button 
            onClick={() => setActiveTab('visual')}
            className={cn("flex-1 sm:px-6 py-2 text-sm font-semibold rounded-full transition-all duration-300", 
              activeTab === 'visual' ? "bg-white shadow-sm text-emerald-600" : "text-slate-500 hover:text-slate-700")}
          >
            Visualisasi
          </button>
          <button 
            onClick={() => setActiveTab('config')}
            className={cn("flex-1 sm:px-6 py-2 text-sm font-semibold rounded-full transition-all duration-300", 
              activeTab === 'config' ? "bg-white shadow-sm text-emerald-600" : "text-slate-500 hover:text-slate-700")}
          >
            Konfigurasi
          </button>
        </div>
      </div>

      {activeTab === 'visual' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-4 sm:space-y-5">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="rounded-2xl border border-slate-200/60 bg-white p-5 flex flex-col justify-center">
              <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total Jatah {activePeriodMode === 'daily' ? 'Harian' : activePeriodMode === 'weekly' ? 'Mingguan' : 'Bulanan'}</p>
              {globalBudget ? (
                <>
                  <p className="text-2xl font-black tabular-nums text-slate-800">{formatIDR(globalBudget.amount)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Sisa: <span className="font-semibold text-slate-700">{formatIDR(globalBudget.amount - totalExpense)}</span></p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground italic">Belum diatur</p>
              )}
            </Card>
            <Card className="rounded-2xl border border-slate-200/60 bg-white p-5 flex flex-col justify-center">
              <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Pengeluaran Aktual</p>
              <p className={cn("text-2xl font-black tabular-nums", globalPct >= 100 ? "text-red-500" : "text-slate-800")}>{formatIDR(totalExpense)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {globalBudget ? `${globalPct.toFixed(1)}% terpakai` : 'Tidak ada batas'}
              </p>
            </Card>
            <Card className={cn("rounded-2xl border p-5 flex flex-col justify-center", 
              globalPct >= 90 ? "border-red-200 bg-red-50" : globalPct >= 70 ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50")}>
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-full", globalPct >= 90 ? "bg-red-200 text-red-600" : globalPct >= 70 ? "bg-amber-200 text-amber-600" : "bg-emerald-200 text-emerald-600")}>
                  {globalPct >= 90 ? <AlertTriangle className="h-6 w-6" /> : globalPct >= 70 ? <AlertCircle className="h-6 w-6" /> : <PiggyBank className="h-6 w-6" />}
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Status</p>
                  <p className={cn("text-lg font-bold", globalPct >= 90 ? "text-red-700" : globalPct >= 70 ? "text-amber-700" : "text-emerald-700")}>
                    {globalPct >= 100 ? 'Overbudget!' : globalPct >= 80 ? 'Hampir Habis' : 'Aman Terkendali'}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Main Visualizations */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Global Donut */}
            <Card className="rounded-2xl border border-slate-200/60 bg-white p-5 lg:col-span-1 flex flex-col items-center justify-center">
              <h3 className="text-sm font-bold w-full text-center mb-4">Pemakaian Global</h3>
              <div className="relative w-48 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { value: Math.min(globalPct, 100) },
                        { value: Math.max(100 - Math.min(globalPct, 100), 0) }
                      ]}
                      cx="50%" cy="50%"
                      innerRadius={65} outerRadius={80}
                      startAngle={90} endAngle={-270}
                      dataKey="value" stroke="none"
                    >
                      <Cell fill={globalColor} />
                      <Cell fill="#f1f5f9" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={cn("text-3xl font-black", globalPct >= 100 ? "text-red-500" : "text-slate-800")}>{Math.round(globalPct)}%</span>
                  {globalPct >= 100 && <span className="text-[10px] text-red-400 font-semibold">OVERBUDGET</span>}
                </div>
              </div>
            </Card>

            {/* Category Progress Bars */}
            <Card className="rounded-2xl border border-slate-200/60 bg-white p-5 lg:col-span-2">
              <h3 className="text-sm font-bold mb-4">Batas per Kelompok Kategori</h3>
              {groupStats.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <Target className="h-8 w-8 opacity-20" />
                  <p>Belum ada aktivitas atau jatah kategori yang diatur.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {groupStats.map(g => {
                    const Icon = ICON_MAP[g.icon] || ICON_MAP.default
                    return (
                      <div key={g.id} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="p-1.5 rounded-md text-white shadow-sm" style={{ backgroundColor: g.color }}>
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <span className="text-sm font-semibold">{g.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold">{formatIDRCompact(g.spent)}</span>
                            <span className="text-[11px] text-muted-foreground ml-1">/ {formatIDRCompact(g.budgetAmount)}</span>
                          </div>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all duration-500", getStatusBg(g.percentage))}
                            style={{ width: `${Math.min(100, g.percentage)}%` }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
                          <span>{Math.round(g.percentage)}%</span>
                          <span>Sisa: {formatIDRCompact(Math.max(g.budgetAmount - g.spent, 0))}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'config' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-4">
          <Card className="rounded-2xl border border-slate-200/60 bg-white p-5">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 text-emerald-500" /> Jatah Global
            </h3>
            <p className="text-sm text-muted-foreground mb-4">Atur batas total untuk seluruh pengeluaran Anda per periode.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['daily', 'weekly', 'monthly'].map(p => {
                const label = p === 'daily' ? 'Harian' : p === 'weekly' ? 'Mingguan' : 'Bulanan'
                return (
                  <div key={p} className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">Rp</span>
                        <input 
                          type="number" 
                          value={globalConfig[p]} 
                          onChange={(e) => setGlobalConfig(prev => ({ ...prev, [p]: e.target.value }))}
                          className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={handleSaveGlobalConfig} disabled={isSaving} className="rounded-full bg-emerald-500 hover:bg-emerald-600 gap-2">
                <Save className="h-4 w-4" /> {isSaving ? "Menyimpan..." : "Simpan Global"}
              </Button>
            </div>
          </Card>

          <h3 className="text-lg font-bold mt-8 mb-2">Kelompok Kategori</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groups.map(g => {
              const Icon = ICON_MAP[g.icon] || ICON_MAP.default
              return (
                <Card key={g.id} className="rounded-2xl border border-slate-200/60 bg-white p-4 flex flex-col gap-3 transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="p-2 rounded-lg text-white shadow-sm" style={{ backgroundColor: g.color }}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <h4 className="font-bold text-slate-800">{g.name}</h4>
                    </div>
                    <div className="flex items-center gap-1">
                      <button className="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-md transition-colors"><Edit2 className="h-4 w-4" /></button>
                      <button className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  
                  <div className="text-xs text-muted-foreground line-clamp-1 bg-slate-50 p-2 rounded-md border border-slate-100">
                    Termasuk: {g.category_ids.length} kategori terpilih
                  </div>

                  <div className="mt-auto pt-2 grid grid-cols-3 gap-2 text-center divide-x divide-slate-100 border-t border-slate-100">
                    {['daily', 'weekly', 'monthly'].map(p => {
                      const b = budgets.find(x => x.budget_group_id === g.id && x.period === p)
                      return (
                        <div key={p} className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase text-slate-400 font-semibold">{p.substring(0,1)}</span>
                          <span className="text-xs font-bold text-slate-700">{b ? formatIDRCompact(b.amount) : '-'}</span>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              )
            })}
            
            <button className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-500 transition-colors flex flex-col items-center justify-center p-8 gap-3 min-h-[160px]">
              <div className="h-10 w-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400">
                <Plus className="h-5 w-5" />
              </div>
              <span className="font-semibold text-sm">Buat Kelompok Baru</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
