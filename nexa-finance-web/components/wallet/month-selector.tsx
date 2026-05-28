"use client"

import { useMemo, useState, useEffect, useRef } from "react"
import { ChevronLeft, ChevronRight, ChevronDown, CalendarDays } from "lucide-react"
import { fetchOldestTransactionDate } from "@/lib/supabase/queries"
import { cn } from "@/lib/utils"

interface MonthSelectorProps {
  selectedMonth: Date
  onChange: (date: Date) => void
}

export function MonthSelector({ selectedMonth, onChange }: MonthSelectorProps) {
  const [oldestDate, setOldestDate] = useState<Date | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function loadOldest() {
      const date = await fetchOldestTransactionDate()
      // If no transactions found, keep null so arrows are not restricted
      setOldestDate(date)
    }
    loadOldest()
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Generate options from oldestDate up to current month
  const options = useMemo(() => {
    const opts: Date[] = []
    const now = new Date()
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const start = oldestDate
      ? new Date(oldestDate.getFullYear(), oldestDate.getMonth(), 1)
      : new Date(now.getFullYear(), now.getMonth(), 1)

    let d = new Date(currentMonth)
    while (d >= start) {
      opts.push(new Date(d))
      d.setMonth(d.getMonth() - 1)
    }

    if (opts.length === 0) opts.push(currentMonth)
    return opts
  }, [oldestDate])


  const minDate = oldestDate
    ? new Date(oldestDate.getFullYear(), oldestDate.getMonth(), 1)
    : null

  // Only restrict backwards nav if we actually know the oldest transaction date
  const isPastDisabled = minDate
    ? new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1) < minDate
    : false // No transactions yet → allow free backwards navigation

  const isFuture =
    new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1) > new Date()

  function handlePrev() {
    if (isPastDisabled) return
    onChange(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1))
  }

  function handleNext() {
    if (isFuture) return
    onChange(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1))
  }

  function selectMonth(date: Date) {
    onChange(date)
    setIsOpen(false)
  }

  const label = selectedMonth.toLocaleDateString("id-ID", { month: "long", year: "numeric" })

  // Group options by year for prettier display
  const grouped = useMemo(() => {
    const map: Record<number, Date[]> = {}
    for (const d of options) {
      const y = d.getFullYear()
      if (!map[y]) map[y] = []
      map[y].push(d)
    }
    return Object.entries(map).sort((a, b) => Number(b[0]) - Number(a[0]))
  }, [options])

  return (
    <div ref={containerRef} className="relative flex items-center gap-1">
      {/* Prev Button */}
      <button
        onClick={handlePrev}
        disabled={isPastDisabled}
        className={cn(
          "h-9 w-9 flex items-center justify-center rounded-xl transition-all duration-200",
          isPastDisabled
            ? "text-slate-300 cursor-not-allowed"
            : "text-slate-500 hover:text-[#10b981] hover:bg-[#10b981]/10 active:scale-95"
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Month Trigger Button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-200 min-w-[180px] justify-center",
          "bg-white shadow-sm hover:shadow-md",
          isOpen
            ? "border-[#10b981] ring-2 ring-[#10b981]/20 text-[#10b981]"
            : "border-slate-200 text-slate-700 hover:border-[#10b981]/50"
        )}
      >
        <CalendarDays className="h-4 w-4 shrink-0 opacity-60" />
        <span className="text-sm font-semibold capitalize">{label}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 opacity-50 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* Next Button */}
      <button
        onClick={handleNext}
        disabled={isFuture}
        className={cn(
          "h-9 w-9 flex items-center justify-center rounded-xl transition-all duration-200",
          isFuture
            ? "text-slate-300 cursor-not-allowed"
            : "text-slate-500 hover:text-[#10b981] hover:bg-[#10b981]/10 active:scale-95"
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-64 bg-white rounded-2xl shadow-[0_20px_60px_-10px_rgba(0,0,0,0.18),0_4px_20px_-4px_rgba(0,0,0,0.08)] border border-slate-100 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
          <div className="max-h-72 overflow-y-auto overscroll-contain">
            {grouped.map(([year, months]) => (
              <div key={year}>
                {/* Year header */}
                <div className="sticky top-0 px-4 py-2 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 z-10">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    {year}
                  </span>
                </div>
                {/* Month grid */}
                <div className="grid grid-cols-3 gap-1 p-2">
                  {months.map((date) => {
                    const isSelected =
                      date.getFullYear() === selectedMonth.getFullYear() &&
                      date.getMonth() === selectedMonth.getMonth()
                    const monthLabel = date.toLocaleDateString("id-ID", { month: "short" })
                    return (
                      <button
                        key={date.toISOString()}
                        onClick={() => selectMonth(date)}
                        className={cn(
                          "py-2 px-1 rounded-xl text-sm font-medium transition-all duration-150 capitalize",
                          isSelected
                            ? "bg-[#10b981] text-white shadow-sm shadow-[#10b981]/30 scale-105"
                            : "text-slate-600 hover:bg-[#10b981]/10 hover:text-[#10b981]"
                        )}
                      >
                        {monthLabel}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
