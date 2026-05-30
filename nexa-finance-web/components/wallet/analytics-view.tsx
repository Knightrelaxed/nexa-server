"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
  LineChart,
  Line,
} from "recharts"
import { formatIDR, formatIDRCompact, ICON_MAP } from "@/lib/wallet-data"
import { useDashboardData, useTransactions } from "@/hooks/use-finance-data"
import { TrendingUp, TrendingDown, Activity } from "lucide-react"
import { FilterSidebar } from "./filter-sidebar"
import { PeriodSelector, defaultPeriod, type PeriodValue } from "./period-selector"
import { useState } from "react"

const COLORS = ["#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#eab308"]

export function AnalyticsView() {
  const [filtersState, setFiltersState] = useState<any>({})
  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod)
  
  const { monthlySummary, expenseByCategory, totalExpense, totalIncome, loading: dashLoading } = useDashboardData(period)

  // Get date range for transactions based on selected period
  const currentMonthFilters = useMemo(() => {
    const startDate = period.start.toISOString().slice(0, 10);
    const endDate = period.end.toISOString().slice(0, 10);
    
    const cleanFilters: any = {}
    Object.entries(filtersState).forEach(([k, v]) => {
      if (v !== "all" && v !== "") {
        cleanFilters[k] = v
      }
    })
    
    return { ...cleanFilters, startDate, endDate };
  }, [filtersState, period]);

  const handleFilterChange = (key: string, value: any) => {
    setFiltersState((prev: any) => ({ ...prev, [key]: value }))
  }

  const handleResetFilters = () => {
    setFiltersState({})
  }

  const { transactions, loading: txLoading } = useTransactions(currentMonthFilters)
  
  // Calculate aggregated data from filtered transactions
  const { filteredTotalIncome, filteredTotalExpense, filteredExpenseByCategory } = useMemo(() => {
    let income = 0;
    let expense = 0;
    const categoryMap: Record<string, { category_name: string; category_icon_key: string; total: number }> = {};
    
    for (const tx of transactions) {
      if (tx.type === 'income') income += tx.amount;
      if (tx.type === 'expense') {
        expense += tx.amount;
        if (!categoryMap[tx.category_id]) {
          categoryMap[tx.category_id] = {
            category_name: tx.category_name,
            category_icon_key: tx.category_icon_key,
            total: 0
          };
        }
        categoryMap[tx.category_id].total += tx.amount;
      }
    }
    
    return {
      filteredTotalIncome: income,
      filteredTotalExpense: expense,
      filteredExpenseByCategory: Object.values(categoryMap).sort((a, b) => b.total - a.total)
    };
  }, [transactions]);


  const byCategory = useMemo(() => {
    return filteredExpenseByCategory.map(c => ({
      name: c.category_name,
      icon: ICON_MAP[c.category_icon_key || "more-horizontal"],
      key: c.category_name,
      value: c.total
    }))
  }, [filteredExpenseByCategory])

  const today = new Date()
  const periodStart = period.start
  const daysInPeriod = Math.ceil((period.end.getTime() - period.start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  const daysPassed = daysInPeriod
  
  const savingsRate = filteredTotalIncome > 0 ? ((filteredTotalIncome - filteredTotalExpense) / filteredTotalIncome) * 100 : 0
  const avgDaily = filteredTotalExpense / Math.max(daysPassed, 1)

  const dailySpending = useMemo(() => {
    const map: Record<string, number> = {}
    transactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        map[t.transaction_date] = (map[t.transaction_date] || 0) + t.amount
      })
    
    const arr = [];
    const iter = new Date(period.start);
    iter.setHours(0,0,0,0);
    const endIter = new Date(period.end);
    endIter.setHours(0,0,0,0);
    
    let safetyCount = 0;
    while (iter <= endIter && safetyCount < 366) {
      const y = iter.getFullYear();
      const m = String(iter.getMonth() + 1).padStart(2, '0');
      const d = String(iter.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      
      const dayLabel = (endIter.getTime() - period.start.getTime()) > 35 * 86400000 
          ? new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(iter) + ' ' + y.toString().substring(2)
          : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(iter);

      arr.push({
        day: dayLabel,
        amount: map[dateStr] || 0,
      });
      
      iter.setDate(iter.getDate() + 1);
      safetyCount++;
    }
    return arr;
  }, [transactions, period])

  const chartMonthlyData = useMemo(() => {
    return monthlySummary.map(m => ({
      month: new Date(m.month + '-01').toLocaleDateString('id-ID', { month: 'short' }),
      Pemasukan: m.total_income,
      Pengeluaran: m.total_expense
    }))
  }, [monthlySummary])

  if (dashLoading || txLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#10b981] border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Sidebar Desktop */}
      <div className="hidden lg:block shrink-0 w-64">
        <div className="sticky top-24">
          <FilterSidebar title="Analitik" filters={filtersState} onFilterChange={handleFilterChange} onReset={handleResetFilters} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Header / Date Selector */}
        <div className="relative z-50 flex flex-wrap items-center justify-between gap-3 bg-white/70 backdrop-blur-sm px-4 py-3 rounded-2xl border border-border/50 shadow-sm">
          <h1 className="text-lg font-bold text-slate-800 leading-tight">Ringkasan Finansial</h1>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="group border-none shadow-md shadow-emerald-500/5 bg-gradient-to-br from-white to-emerald-50/50 hover:shadow-emerald-500/10 transition-all duration-300">
            <CardContent className="p-4 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-16 h-16 bg-emerald-100 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
              <p className="text-xs font-medium text-slate-500 relative z-10">Tingkat Tabungan</p>
              <p className="mt-2 text-2xl sm:text-3xl font-black text-emerald-500 relative z-10">{savingsRate.toFixed(1)}%</p>
              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-600 relative z-10">
                <TrendingUp className="h-3 w-3" /> Normal
              </p>
            </CardContent>
          </Card>

          <Card className="group border-none shadow-md shadow-orange-500/5 bg-gradient-to-br from-white to-orange-50/50 hover:shadow-orange-500/10 transition-all duration-300">
            <CardContent className="p-4 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-16 h-16 bg-orange-100 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
              <p className="text-xs font-medium text-slate-500 relative z-10">Rata-rata Harian</p>
              <p className="mt-2 text-2xl sm:text-3xl font-black text-slate-800 relative z-10">{formatIDRCompact(avgDaily)}</p>
              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-slate-500 relative z-10">
                <Activity className="h-3 w-3" /> Bulan ini
              </p>
            </CardContent>
          </Card>

          <Card className="group border-none shadow-md shadow-blue-500/5 bg-gradient-to-br from-white to-blue-50/50 hover:shadow-blue-500/10 transition-all duration-300">
            <CardContent className="p-4 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-16 h-16 bg-blue-100 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
              <p className="text-xs font-medium text-slate-500 relative z-10">Pengeluaran Terbesar</p>
              <div className="mt-2 flex items-center gap-1.5 relative z-10">
                {byCategory[0]?.icon &&
                  (() => {
                    const Icon = byCategory[0].icon
                    return <Icon className="h-5 w-5 shrink-0 text-blue-500" strokeWidth={2.5} />
                  })()}
                <p className="truncate text-xl sm:text-2xl font-black text-slate-800">
                  {byCategory[0]?.name.split(" ")[0] || "-"}
                </p>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-500 relative z-10">{formatIDRCompact(byCategory[0]?.value || 0)}</p>
            </CardContent>
          </Card>

          <Card className="group border-none shadow-md shadow-purple-500/5 bg-gradient-to-br from-white to-purple-50/50 hover:shadow-purple-500/10 transition-all duration-300">
            <CardContent className="p-4 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-16 h-16 bg-purple-100 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
              <p className="text-xs font-medium text-slate-500 relative z-10">Total Transaksi</p>
              <p className="mt-2 text-2xl sm:text-3xl font-black text-slate-800 relative z-10">{transactions.length}</p>
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-slate-500 relative z-10">
                <Activity className="h-3 w-3" /> {period.label}
              </p>
            </CardContent>
          </Card>
        </div>

      {/* Cashflow trend */}
      <Card className="border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="pb-4 bg-slate-50/50 border-b border-border/40">
          <CardTitle className="text-lg font-bold text-slate-800">Tren Arus Kas (6 Bulan)</CardTitle>
          <p className="text-xs font-medium text-slate-500">Perbandingan pemasukan dan pengeluaran</p>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="h-64 w-full sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartMonthlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} tick={{ fill: '#64748b' }} dy={10} />
                <YAxis
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#64748b' }}
                  tickFormatter={(v) => `${v / 1_000_000}jt`}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 12, fontSize: 13, border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}
                  formatter={(v: number) => formatIDR(v)}
                />
                <Legend wrapperStyle={{ fontSize: 13, paddingTop: '20px' }} iconType="circle" />
                <Area type="monotone" dataKey="Pemasukan" stroke="#10b981" strokeWidth={3} fill="url(#incomeGradient)" activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }} />
                <Area type="monotone" dataKey="Pengeluaran" stroke="#ef4444" strokeWidth={3} fill="url(#expenseGradient)" activeDot={{ r: 6, strokeWidth: 0, fill: '#ef4444' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Two column: pie + bar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-border/40 shadow-sm">
          <CardHeader className="pb-4 bg-slate-50/50 border-b border-border/40">
            <CardTitle className="text-lg font-bold text-slate-800">Distribusi Kategori</CardTitle>
            <p className="text-xs font-medium text-slate-500">Persentase pengeluaran bulan ini</p>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-6 sm:flex-row">
              <div className="h-56 w-full sm:w-1/2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie 
                      data={byCategory} 
                      dataKey="value" 
                      innerRadius={65} 
                      outerRadius={95} 
                      paddingAngle={3}
                      stroke="none"
                    >
                      {byCategory.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} className="hover:opacity-80 transition-opacity outline-none" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: 12, fontSize: 13, border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                      formatter={(v: number) => formatIDR(v)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full space-y-3 sm:w-1/2 max-h-56 overflow-y-auto pr-2 no-scrollbar">
                {byCategory.slice(0, 6).map((c, i) => {
                  const pct = filteredTotalExpense > 0 ? (c.value / filteredTotalExpense) * 100 : 0
                  return (
                    <li key={c.key} className="group flex flex-col gap-1.5 cursor-pointer">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="h-3 w-3 shrink-0 rounded-full shadow-sm" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="min-w-0 flex-1 truncate font-semibold text-slate-700 group-hover:text-emerald-600 transition-colors">{c.name}</span>
                        <span className="text-xs font-bold text-slate-900 tabular-nums">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40 shadow-sm">
          <CardHeader className="pb-4 bg-slate-50/50 border-b border-border/40">
            <CardTitle className="text-lg font-bold text-slate-800">Top Pengeluaran</CardTitle>
            <p className="text-xs font-medium text-slate-500">Nominal terbesar bulan ini</p>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-56 w-full sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCategory.slice(0, 6)} layout="vertical" margin={{ top: 5, right: 10, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis
                    type="number"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748b' }}
                    tickFormatter={(v) => `${v / 1000}rb`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    fontSize={12}
                    fontWeight={500}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#334155' }}
                    width={100}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, fontSize: 13, border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                    formatter={(v: number) => formatIDR(v)}
                    cursor={{ fill: '#f8fafc' }}
                  />
                  <Bar dataKey="value" fill="#10b981" radius={[0, 6, 6, 0]} barSize={24} className="hover:opacity-80 transition-opacity" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Kalender Pengeluaran Harian */}
      <Card className="border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="pb-4 bg-slate-50/50 border-b border-border/40">
          <CardTitle className="text-lg font-bold text-slate-800">Kalender Pengeluaran Harian</CardTitle>
          <p className="text-xs font-medium text-slate-500">Pola pengeluaran sepanjang bulan</p>
        </CardHeader>
        <CardContent className="pt-6 pb-4">
          <div className="h-56 w-full sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailySpending} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="day" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: '#64748b' }} interval={4} dy={10} />
                <YAxis
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#64748b' }}
                  tickFormatter={(v) => `${v / 1000}rb`}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 12, fontSize: 13, border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                  formatter={(v: number) => formatIDR(v)}
                  labelFormatter={(l) => `Tanggal ${l}`}
                  cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '5 5' }}
                />
                <Line
                  type="monotone"
                  dataKey="amount"
                  name="Nominal"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  dot={{ fill: "#3b82f6", r: 3, strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 7, strokeWidth: 0, fill: '#3b82f6' }}
                  animationDuration={1500}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      </div>
    </div>
  )
}
