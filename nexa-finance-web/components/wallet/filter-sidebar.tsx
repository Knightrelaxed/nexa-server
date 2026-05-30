"use client"

import { useState, useEffect } from "react"
import { Search, RotateCcw, SlidersHorizontal, ArrowUpDown, Wallet, Grid, Coins, FileText, ArrowLeftRight, CreditCard } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { useAccounts, useCategories, useTransactions } from "@/hooks/use-finance-data"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function FilterSelect({ label, value, options = [], icon, disabled, onValueChange }: { label: string; value?: string; options?: {value: string, label: string}[]; icon?: React.ReactNode; disabled?: boolean; onValueChange?: (value: string) => void }) {
  // Gunakan value pertama sebagai default jika tidak ada value
  const defaultValue = value || (options.length > 0 ? options[0].value : undefined);
  
  return (
    <div className="group">
      <label className="font-semibold mb-2 block text-[13px] text-slate-700 group-hover:text-slate-900 transition-colors">{label}</label>
      <div className="relative">
        {icon && (
          <div className="absolute z-10 left-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none text-slate-400 group-hover:text-[#10b981] transition-colors">
            {icon}
          </div>
        )}
        <Select disabled={disabled} value={defaultValue} onValueChange={onValueChange}>
          <SelectTrigger 
            className={cn(
              "w-full h-[42px] rounded-xl border border-slate-200/80 bg-white text-[13.5px] font-medium shadow-sm transition-all duration-300",
              "focus:border-[#10b981] focus:ring-4 focus:ring-[#10b981]/15 focus:ring-offset-0 outline-none",
              icon ? "pl-10" : "pl-4",
              disabled 
                ? "opacity-60 bg-slate-50 cursor-not-allowed" 
                : "text-slate-700 cursor-pointer hover:border-slate-300 hover:bg-slate-50 hover:shadow-md"
            )}
          >
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent side="bottom" avoidCollisions={false}>
            <SelectGroup>
              {options.length > 0 ? options.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              )) : (
                <SelectItem value={value || "empty"}>{value || "—"}</SelectItem>
              )}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

interface FilterSidebarProps {
  title: string
  filters: any
  onFilterChange: (key: string, value: any) => void
  onReset: () => void
  isDrawer?: boolean
}

export function FilterSidebar({ title, filters, onFilterChange, onReset, isDrawer }: FilterSidebarProps) {
  const { accounts } = useAccounts()
  const { categories } = useCategories()
  const { transactions } = useTransactions()
  
  const maxNominal = transactions.length > 0 ? Math.max(...transactions.map(t => t.amount), 100000000) : 100000000;
  
  // Local state for smooth slider dragging
  const [localRange, setLocalRange] = useState<[number, number] | null>(null)

  useEffect(() => {
    if (filters.minAmount === undefined && filters.maxAmount === undefined) {
      setLocalRange(null);
    }
  }, [filters.minAmount, filters.maxAmount]);

  // Sync local state when external filters reset
  const minVal = localRange ? localRange[0] : (filters.minAmount !== undefined ? filters.minAmount : 0);
  const maxVal = localRange ? localRange[1] : (filters.maxAmount !== undefined ? (filters.maxAmount === 'all' ? maxNominal : filters.maxAmount) : maxNominal);

  const handleRangeCommit = (vals: number[]) => {
    onFilterChange("minAmount", vals[0])
    if (vals[1] === maxNominal) {
      onFilterChange("maxAmount", "all")
    } else {
      onFilterChange("maxAmount", vals[1])
    }
  }

  const handleResetRange = () => {
    setLocalRange(null);
    onFilterChange("minAmount", undefined);
    onFilterChange("maxAmount", undefined);
  }

  const content = (
    <div className={cn("flex flex-col gap-4", isDrawer ? "h-full" : "h-full overflow-y-auto no-scrollbar pb-6 pr-1")}>
      
      {/* Header */}
      {!isDrawer && (
        <div className="flex items-center justify-between shrink-0">
          <h1 className="text-2xl font-bold">{title}</h1>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground bg-muted/40 hover:bg-muted">
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>
      )}
      {!isDrawer && <hr className="border-border shrink-0" />}

        {/* Filters Form */}
        <div className="flex flex-col gap-3.5">
          {/* Cari */}
          <div>
            <label className="font-semibold mb-1.5 block text-[13px]">Cari</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari"
                value={filters.search || ""}
                onChange={(e) => onFilterChange("search", e.target.value)}
                className="pl-9 h-9 text-[13px] bg-white"
              />
            </div>
          </div>

          <FilterSelect 
            label="Urutkan berdasarkan" 
            icon={<ArrowUpDown className="h-4 w-4" />}
            value={filters.sortBy || "waktu_terbaru"}
            onValueChange={(v) => onFilterChange("sortBy", v)}
            options={[{value: 'waktu_terbaru', label: 'Waktu (terbaru dulu)'}, {value: 'waktu_terlama', label: 'Waktu (terlama dulu)'}]} 
          />
          
          <FilterSelect 
            label="Akun" 
            icon={<Wallet className="h-4 w-4" />}
            value={filters.accountId || "all"}
            onValueChange={(v) => onFilterChange("accountId", v)}
            options={[{value: 'all', label: 'Semua akun'}, ...accounts.map(a => ({value: a.id, label: a.name}))]} 
          />
          
          <FilterSelect 
            label="Kategori" 
            icon={<Grid className="h-4 w-4" />}
            value={filters.categoryId || "all"}
            onValueChange={(v) => onFilterChange("categoryId", v)}
            options={[{value: 'all', label: 'Semua kategori'}, ...categories.map(c => ({value: c.id, label: c.name}))]} 
          />
          
          <FilterSelect 
            label="Mata uang" 
            icon={<Coins className="h-4 w-4" />}
            value={"all"}
            onValueChange={() => {}} // Not implemented since everything is IDR for now
            options={[{value: 'all', label: 'Semua Mata Uang'}, {value: 'IDR', label: 'IDR - Rupiah'}]} 
          />
          
          <FilterSelect 
            label="Jenis catatan" 
            icon={<FileText className="h-4 w-4" />}
            value={filters.type || "all"}
            onValueChange={(v) => onFilterChange("type", v)}
            options={[{value: 'all', label: 'Semua jenis catatan'}, {value: 'expense', label: 'Pengeluaran'}, {value: 'income', label: 'Pemasukan'}]} 
          />

          {/* Rentang Jumlah */}
          <div className="pt-2 pb-2 bg-slate-50/70 -mx-1 px-4 py-4 rounded-xl border border-slate-200/60 shadow-sm transition-all duration-300 hover:shadow-md hover:border-slate-300">
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-semibold text-[13px] flex items-center gap-1.5 text-slate-700">
                Rentang Jumlah 
                <RotateCcw className="h-3.5 w-3.5 text-emerald-600 hover:text-emerald-700 cursor-pointer transition-colors" onClick={handleResetRange} />
              </label>
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">IDR</span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-4">Jumlah absolut dalam mata uang referensi</p>
            
            <div className="px-2 pt-2 pb-1">
              <Slider
                min={0}
                max={maxNominal}
                step={50000}
                value={[minVal, maxVal]}
                onValueChange={(vals) => setLocalRange([vals[0], vals[1]])}
                onValueCommit={handleRangeCommit}
                className="my-2"
              />
            </div>
            
            <div className="flex items-center justify-between mt-1 mb-4 text-[12px] font-medium text-slate-500">
               <span>Rp {minVal.toLocaleString('id-ID')}</span>
               <span>Rp {maxVal.toLocaleString('id-ID')}</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input 
                  type="number" 
                  value={minVal}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setLocalRange([val, maxVal])
                  }}
                  onBlur={() => handleRangeCommit([minVal, maxVal])}
                  className="w-full h-9 px-3 py-2 border border-slate-200/80 rounded-lg bg-white text-[13px] font-medium shadow-sm transition-all focus:outline-none focus:border-[#10b981] focus:ring-1 focus:ring-[#10b981]"
                />
              </div>
              <span className="text-slate-400 font-bold">-</span>
              <div className="flex-1 relative">
                <input 
                  type="number" 
                  value={maxVal}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setLocalRange([minVal, val])
                  }}
                  onBlur={() => handleRangeCommit([minVal, maxVal])}
                  className="w-full h-9 px-3 py-2 border border-slate-200/80 rounded-lg bg-white text-[13px] font-medium shadow-sm transition-all focus:outline-none focus:border-[#10b981] focus:ring-1 focus:ring-[#10b981]"
                />
              </div>
            </div>
          </div>

          <FilterSelect 
            label="Transfer" 
            icon={<ArrowLeftRight className="h-4 w-4" />}
            value={filters.transferFilter || "include"}
            onValueChange={(v) => onFilterChange("transferFilter", v)}
            options={[{value: 'include', label: 'Sertakan transfer'}, {value: 'only', label: 'Hanya transfer'}, {value: 'exclude', label: 'Kecualikan transfer'}]} 
          />
          
          <FilterSelect 
            label="Metode pembayaran" 
            icon={<CreditCard className="h-4 w-4" />}
            value={filters.paymentMethod || "all"}
            onValueChange={(v) => onFilterChange("paymentMethod", v)}
            options={[
              {value: 'all', label: 'Semua Metode Pembayaran'}, 
              {value: 'QRIS', label: 'QRIS'}, 
              {value: 'Transfer bank', label: 'Transfer Bank'}, 
              {value: 'Kartu Kredit', label: 'Kartu Kredit'}, 
              {value: 'Tunai', label: 'Tunai'}
            ]} 
          />
        </div>

        {/* Reset button */}
      <Button onClick={onReset} variant="outline" className={cn("w-full h-11 border-[#10b981] text-[#10b981] hover:bg-[#10b981] hover:text-white rounded-xl gap-2 font-bold shadow-sm transition-all duration-300", !isDrawer && "mt-2")}>
        <RotateCcw className="h-3.5 w-3.5" />
        Atur Ulang Filter
      </Button>
    </div>
  )

  if (isDrawer) {
    return content
  }

  return (
    <aside className="w-full h-full rounded-2xl bg-white p-5 shadow-sm border border-slate-200/60 flex flex-col">
      {content}
    </aside>
  )
}
