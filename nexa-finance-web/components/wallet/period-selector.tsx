"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

export type PeriodMode = "custom" | "week" | "month" | "year"

export interface PeriodValue {
  mode: PeriodMode
  start: Date
  end: Date
  label: string
}

interface PeriodSelectorProps {
  value: PeriodValue
  onChange: (period: PeriodValue) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function startOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff)
}
function endOfWeek(d: Date): Date {
  const s = startOfWeek(d)
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6)
}
function endOfMonth(y: number, m: number): Date { return new Date(y, m + 1, 0) }
function isSameDay(a: Date, b: Date): boolean {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
}

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"]
const MONTH_FULL  = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"]
const DAY_NAMES   = ["Sn","Sl","Rb","Km","Jm","Sb","Mg"]

function fmtLabel(mode: PeriodMode, start: Date, end: Date): string {
  if (mode === "month") return MONTH_FULL[start.getMonth()] + " " + start.getFullYear()
  if (mode === "year")  return start.getFullYear().toString()
  if (mode === "week")  return `${start.getDate()} – ${end.getDate()} ${MONTH_SHORT[end.getMonth()]} ${end.getFullYear()}`
  if (start.getTime() === new Date(1970,0,1).getTime()) return "Semua"
  const s = `${start.getDate()} ${MONTH_SHORT[start.getMonth()]}`
  const e = `${end.getDate()} ${MONTH_SHORT[end.getMonth()]} ${end.getFullYear()}`
  return isSameDay(start,end) ? `${s} ${start.getFullYear()}` : `${s} – ${e}`
}

export function makeMonthPeriod(y: number, m: number): PeriodValue {
  const start = new Date(y,m,1); const end = endOfMonth(y,m)
  return { mode:"month", start, end, label: fmtLabel("month",start,end) }
}
function makeWeekPeriod(d: Date): PeriodValue {
  const start = startOfWeek(d); const end = endOfWeek(d)
  return { mode:"week", start, end, label: fmtLabel("week",start,end) }
}
function makeYearPeriod(y: number): PeriodValue {
  const start = new Date(y,0,1); const end = new Date(y,11,31)
  return { mode:"year", start, end, label: fmtLabel("year",start,end) }
}
export function makeCustomPeriod(a: Date, b: Date): PeriodValue {
  const s = startOfDay(a < b ? a : b); const e = startOfDay(a < b ? b : a)
  return { mode:"custom", start:s, end:e, label: fmtLabel("custom",s,e) }
}
export function defaultPeriod(): PeriodValue {
  const now = new Date(); return makeMonthPeriod(now.getFullYear(), now.getMonth())
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const GREEN_DARK   = "#166534"
const GREEN_MID    = "#16a34a"
const GREEN_LIGHT  = "#bbf7d0"
const GREEN_BG     = "#dcfce7"
const ORANGE       = "#ea580c"
const GRAY_MUTED   = "#94a3b8"
const GRAY_OUTSIDE = "#cbd5e1"
const TEXT_DEFAULT = "#1e293b"

// ─── Main Component ───────────────────────────────────────────────────────────

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  const [isOpen,    setIsOpen]    = useState(false)
  const [activeTab, setActiveTab] = useState<PeriodMode>(value.mode)
  const [mounted,   setMounted]   = useState(false)

  const [calMonth,     setCalMonth]     = useState({ y: value.start.getFullYear(), m: value.start.getMonth() })
  const [monthTabYear, setMonthTabYear] = useState(value.start.getFullYear())
  const [decadeStart,  setDecadeStart]  = useState(Math.floor(value.start.getFullYear()/10)*10)

  const [rangeStart, setRangeStart] = useState<Date|null>(null)
  const [rangeHover, setRangeHover] = useState<Date|null>(null)
  const [weekHover,  setWeekHover]  = useState<Date|null>(null)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [popPos, setPopPos] = useState({ top:0, left:0, width:420 })

  useEffect(() => { setMounted(true) }, [])

  // ── Position ────────────────────────────────────────────────────────────────

  const calcPosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const maxW = typeof window !== 'undefined' ? window.innerWidth - 24 : 420
    const desiredW = (activeTab === "custom" || activeTab === "week") ? 420 : 360
    const w = Math.min(desiredW, maxW)
    let left = rect.left + rect.width / 2 - w / 2
    if (left < 12) left = 12
    if (left + w > window.innerWidth - 12) left = window.innerWidth - w - 12
    setPopPos({ top: rect.bottom + 8, left, width: w })
  }, [activeTab])

  function handleToggle() {
    if (!isOpen) { calcPosition(); setIsOpen(true) }
    else setIsOpen(false)
  }

  useEffect(() => {
    if (!isOpen) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (popoverRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setIsOpen(false)
    }
    function onScroll() { setIsOpen(false) }
    document.addEventListener("mousedown", onDown)
    window.addEventListener("scroll", onScroll, true)
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("scroll", onScroll, true) }
  }, [isOpen])

  // ── Tab switch ───────────────────────────────────────────────────────────────

  function switchTab(mode: PeriodMode) {
    setActiveTab(mode)
    setRangeStart(null); setRangeHover(null)
    const ref = value.start
    setCalMonth({ y: ref.getFullYear(), m: ref.getMonth() })
    setMonthTabYear(ref.getFullYear())
    setDecadeStart(Math.floor(ref.getFullYear()/10)*10)
    
    const maxW = typeof window !== 'undefined' ? window.innerWidth - 24 : 420
    const desiredW = (mode === "custom" || mode === "week") ? 420 : 360
    const newW = Math.min(desiredW, maxW)
    
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    let left = rect.left + rect.width/2 - newW/2
    if (left < 12) left = 12
    if (left + newW > window.innerWidth - 12) left = window.innerWidth - newW - 12
    setPopPos({ top: rect.bottom + 8, left, width: newW })
  }

  // ── Arrow nav ────────────────────────────────────────────────────────────────

  function handlePrev() {
    if (value.mode === "month") { const d = new Date(value.start.getFullYear(), value.start.getMonth()-1,1); onChange(makeMonthPeriod(d.getFullYear(), d.getMonth())) }
    else if (value.mode === "week") { const d = new Date(value.start); d.setDate(d.getDate()-7); onChange(makeWeekPeriod(d)); setCalMonth({y:d.getFullYear(),m:d.getMonth()}) }
    else if (value.mode === "year") { onChange(makeYearPeriod(value.start.getFullYear()-1)) }
    else if (value.mode === "custom") {
      const days = Math.round((value.end.getTime() - value.start.getTime()) / 86400000) + 1;
      const newStart = new Date(value.start); newStart.setDate(newStart.getDate() - days);
      const newEnd = new Date(value.end); newEnd.setDate(newEnd.getDate() - days);
      onChange(makeCustomPeriod(newStart, newEnd));
    }
  }
  function handleNext() {
    if (value.mode === "month") { const d = new Date(value.start.getFullYear(), value.start.getMonth()+1,1); onChange(makeMonthPeriod(d.getFullYear(), d.getMonth())) }
    else if (value.mode === "week") { const d = new Date(value.start); d.setDate(d.getDate()+7); onChange(makeWeekPeriod(d)); setCalMonth({y:d.getFullYear(),m:d.getMonth()}) }
    else if (value.mode === "year") { onChange(makeYearPeriod(value.start.getFullYear()+1)) }
    else if (value.mode === "custom") {
      const days = Math.round((value.end.getTime() - value.start.getTime()) / 86400000) + 1;
      const newStart = new Date(value.start); newStart.setDate(newStart.getDate() + days);
      const newEnd = new Date(value.end); newEnd.setDate(newEnd.getDate() + days);
      onChange(makeCustomPeriod(newStart, newEnd));
    }
  }

  // ── Calendar days ────────────────────────────────────────────────────────────

  const calDays = useMemo(() => {
    const {y,m} = calMonth
    const firstDow = new Date(y,m,1).getDay()
    const offset = firstDow === 0 ? 6 : firstDow - 1
    const days: Date[] = []
    for (let i = offset; i > 0; i--) days.push(new Date(y,m,1-i))
    const dim = new Date(y,m+1,0).getDate()
    for (let d = 1; d <= dim; d++) days.push(new Date(y,m,d))
    const trailing = (7 - (days.length % 7)) % 7
    for (let i = 1; i <= trailing; i++) days.push(new Date(y,m+1,i))
    return days
  }, [calMonth])

  const calRows = useMemo(() => {
    const rows: Date[][] = []
    for (let i = 0; i < calDays.length; i += 7) rows.push(calDays.slice(i,i+7))
    return rows
  }, [calDays])

  // ── Range helpers ─────────────────────────────────────────────────────────────

  function handleCustomClick(d: Date) {
    if (!rangeStart) { setRangeStart(startOfDay(d)) }
    else { onChange(makeCustomPeriod(rangeStart, d)); setRangeStart(null); setRangeHover(null); setIsOpen(false) }
  }

  function inRange(d: Date): boolean {
    const lo = rangeStart && rangeHover ? (rangeStart < rangeHover ? rangeStart : rangeHover) : value.start
    const hi = rangeStart && rangeHover ? (rangeStart < rangeHover ? rangeHover : rangeStart) : value.end
    return d >= lo && d <= hi
  }
  function isEdge(d: Date): boolean {
    if (rangeStart) return isSameDay(d, rangeStart)
    return isSameDay(d, value.start) || isSameDay(d, value.end)
  }
  function isRangeStart(d: Date): boolean {
    if (rangeStart) return isSameDay(d, rangeStart)
    return isSameDay(d, value.start)
  }
  function isRangeEnd(d: Date): boolean {
    if (rangeStart && rangeHover) return isSameDay(d, rangeStart < rangeHover ? rangeHover : rangeStart)
    return isSameDay(d, value.end)
  }

  function inSelWeek(d: Date): boolean {
    return value.mode === "week" && d >= value.start && d <= value.end
  }
  function inHovWeek(d: Date): boolean {
    if (!weekHover) return false
    return d >= startOfWeek(weekHover) && d <= endOfWeek(weekHover)
  }

  // ── Shortcut ─────────────────────────────────────────────────────────────────

  function applyShortcut(key: string) {
    const today = startOfDay(new Date())
    const off = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate()-n)
    const map: Record<string, PeriodValue> = {
      today: makeCustomPeriod(today, today),
      "7d":  makeCustomPeriod(off(6), today),
      "30d": makeCustomPeriod(off(29), today),
      "90d": makeCustomPeriod(off(89), today),
      "12m": makeCustomPeriod(off(364), today),
      week:  makeWeekPeriod(today),
      month: makeMonthPeriod(today.getFullYear(), today.getMonth()),
      year:  makeYearPeriod(today.getFullYear()),
      all:   { mode:"custom", start: new Date(1970,0,1), end: today, label:"Semua" },
    }
    if (map[key]) { onChange(map[key]); setRangeStart(null); setIsOpen(false) }
  }

  // ── Render: Calendar ─────────────────────────────────────────────────────────

  function renderCalendar(mode: "custom" | "week") {
    const maxCellSize = 52
    const calculatedCellSize = Math.floor((popPos.width - 32) / 7)
    const cellSize = Math.min(maxCellSize, Math.max(28, calculatedCellSize))
    const cellH    = 40   // px per cell height

    return (
      <div style={{ padding: "0 16px 8px" }}>
        {/* Month nav */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 4px 8px" }}>
          <button
            onClick={() => { const d = new Date(calMonth.y,calMonth.m-1,1); setCalMonth({y:d.getFullYear(),m:d.getMonth()}) }}
            style={{ width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",color:"#64748b" }}
            onMouseEnter={e=>(e.currentTarget.style.background="#f1f5f9")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
          ><ChevronLeft size={18}/></button>
          <span style={{ fontSize:16, fontWeight:700, color:TEXT_DEFAULT }}>{MONTH_FULL[calMonth.m]} {calMonth.y}</span>
          <button
            onClick={() => { const d = new Date(calMonth.y,calMonth.m+1,1); setCalMonth({y:d.getFullYear(),m:d.getMonth()}) }}
            style={{ width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",color:"#64748b" }}
            onMouseEnter={e=>(e.currentTarget.style.background="#f1f5f9")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
          ><ChevronRight size={18}/></button>
        </div>

        {/* Day headers */}
        <div style={{ display:"grid", gridTemplateColumns:`repeat(7, ${cellSize}px)`, justifyContent:"center" }}>
          {DAY_NAMES.map((n,i) => (
            <div key={n} style={{ width:cellSize, textAlign:"center", fontSize:12, fontWeight:600, color:GRAY_MUTED, paddingBottom:6 }}>{n}</div>
          ))}
        </div>

        {/* Rows */}
        {calRows.map((row, ri) => {
          const rowAnchor = row.find(d => d.getMonth() === calMonth.m) ?? row[0]
          const rowInSel  = mode === "week" && inSelWeek(rowAnchor)
          const rowInHov  = mode === "week" && inHovWeek(rowAnchor)

          return (
            <div
              key={ri}
              style={{
                display:"grid",
                gridTemplateColumns:`repeat(7, ${cellSize}px)`,
                justifyContent:"center",
                borderRadius: (rowInSel || rowInHov) ? 40 : 0,
                background: (rowInSel || rowInHov) ? GREEN_BG : "transparent",
                marginBottom: 2,
                cursor: mode === "week" ? "pointer" : "default",
              }}
              onMouseEnter={() => mode === "week" && setWeekHover(rowAnchor)}
              onMouseLeave={() => mode === "week" && setWeekHover(null)}
              onClick={() => { if (mode === "week") { onChange(makeWeekPeriod(rowAnchor)); setIsOpen(false) } }}
            >
              {row.map((d, di) => {
                const inMonth = d.getMonth() === calMonth.m
                const isSun   = d.getDay() === 0
                const isSat   = d.getDay() === 6
                const isToday = isSameDay(d, startOfDay(new Date()))

                if (mode === "custom") {
                  const inR  = inRange(d)
                  const edge = isEdge(d)
                  const rStart = isRangeStart(d)
                  const rEnd   = isRangeEnd(d)

                  // border style for range cells
                  const borderR = inR && !rEnd   ? `1px solid rgba(74,222,128,0.4)` : "none"
                  const borderL = inR && !rStart ? `1px solid rgba(74,222,128,0.4)` : "none"

                  return (
                    <button
                      key={di}
                      onClick={e => { e.stopPropagation(); handleCustomClick(d) }}
                      onMouseEnter={() => rangeStart && setRangeHover(d)}
                      style={{
                        width: cellSize, height: cellH,
                        border: "none",
                        borderRight: borderR,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:14, fontWeight: edge ? 700 : 400,
                        cursor:"pointer",
                        borderRadius: edge ? 40 : 0,
                        transition:"all 0.1s",
                        background: edge ? GREEN_DARK : inR ? GREEN_BG : "transparent",
                        color: edge ? "#fff" : !inMonth ? GRAY_OUTSIDE : (isSun||isSat) ? ORANGE : inR ? GREEN_DARK : TEXT_DEFAULT,
                        outline: isToday && !edge ? `2px solid ${GREEN_MID}` : "none",
                        outlineOffset: -2,
                      }}
                    >{d.getDate()}</button>
                  )
                }

                // WEEK mode
                const selW = inSelWeek(d)
                const hovW = inHovWeek(d)
                const wStart = selW && isSameDay(d, value.start)
                const wEnd   = selW && isSameDay(d, value.end)
                return (
                  <div
                    key={di}
                    style={{
                      width: cellSize, height: cellH,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:14,
                      fontWeight: (wStart||wEnd) ? 700 : 400,
                      color: !inMonth ? GRAY_OUTSIDE : (wStart||wEnd) ? "#fff" : (isSun||isSat) && !selW && !hovW ? ORANGE : selW||hovW ? GREEN_DARK : TEXT_DEFAULT,
                      background: wStart ? GREEN_DARK : wEnd ? GREEN_DARK : "transparent",
                      borderRadius: wStart ? "40px 0 0 40px" : wEnd ? "0 40px 40px 0" : 0,
                    }}
                  >{d.getDate()}</div>
                )
              })}
            </div>
          )
        })}
      </div>
    )
  }

  // ── Render: Shortcuts ─────────────────────────────────────────────────────────

  function renderShortcuts() {
    const row1 = [{key:"week",label:"Minggu ini"},{key:"month",label:"Bulan ini"},{key:"year",label:"Tahun ini"},{key:"today",label:"Hari ini"},{key:"7d",label:"7 hari"}]
    const row2 = [{key:"30d",label:"30 hari"},{key:"90d",label:"90 hari"},{key:"12m",label:"12 bulan"},{key:"all",label:"Semua"}]
    const btn: React.CSSProperties = {
      border:"1px solid #e2e8f0", borderRadius:999, padding:"5px 14px",
      fontSize:13, fontWeight:500, color:"#475569", background:"#fff",
      cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.15s",
    }
    return (
      <div style={{ borderTop:"1px solid #f1f5f9", padding:"10px 16px 12px", display:"flex", flexDirection:"column", gap:8 }}>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
          {row1.map(s => (
            <button key={s.key} style={btn} onClick={() => applyShortcut(s.key)}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=GREEN_BG;(e.currentTarget as HTMLElement).style.borderColor=GREEN_MID;(e.currentTarget as HTMLElement).style.color=GREEN_DARK}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="#fff";(e.currentTarget as HTMLElement).style.borderColor="#e2e8f0";(e.currentTarget as HTMLElement).style.color="#475569"}}
            >{s.label}</button>
          ))}
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
          {row2.map(s => (
            <button key={s.key} style={btn} onClick={() => applyShortcut(s.key)}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=GREEN_BG;(e.currentTarget as HTMLElement).style.borderColor=GREEN_MID;(e.currentTarget as HTMLElement).style.color=GREEN_DARK}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="#fff";(e.currentTarget as HTMLElement).style.borderColor="#e2e8f0";(e.currentTarget as HTMLElement).style.color="#475569"}}
            >{s.label}</button>
          ))}
        </div>
      </div>
    )
  }

  // ── Render: Month tab ─────────────────────────────────────────────────────────

  function renderMonthTab() {
    return (
      <div style={{ padding:"0 20px 20px" }}>
        {/* Year nav */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 4px 16px" }}>
          <button onClick={()=>setMonthTabYear(y=>y-1)} style={{ width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",color:"#64748b" }}
            onMouseEnter={e=>(e.currentTarget.style.background="#f1f5f9")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
          ><ChevronLeft size={18}/></button>
          <span style={{ fontSize:16, fontWeight:700, color:TEXT_DEFAULT }}>{monthTabYear}</span>
          <button onClick={()=>setMonthTabYear(y=>y+1)} style={{ width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",color:"#64748b" }}
            onMouseEnter={e=>(e.currentTarget.style.background="#f1f5f9")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
          ><ChevronRight size={18}/></button>
        </div>
        {/* 3x4 grid */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:8 }}>
          {MONTH_SHORT.map((name,mi) => {
            const sel = value.mode==="month" && value.start.getMonth()===mi && value.start.getFullYear()===monthTabYear
            return (
              <button
                key={name}
                onClick={() => { onChange(makeMonthPeriod(monthTabYear,mi)); setIsOpen(false) }}
                style={{ padding:"12px 0", borderRadius:12, border:"none", fontSize:15, fontWeight:600, cursor:"pointer",
                  background: sel ? GREEN_DARK : "transparent", color: sel ? "#fff" : "#475569",
                  transform: sel ? "scale(1.04)" : "scale(1)",
                  boxShadow: sel ? "0 4px 14px rgba(22,101,52,0.35)" : "none",
                  transition:"all 0.15s",
                }}
                onMouseEnter={e=>{ if(!sel){(e.currentTarget as HTMLElement).style.background=GREEN_BG} }}
                onMouseLeave={e=>{ if(!sel){(e.currentTarget as HTMLElement).style.background="transparent"} }}
              >{name}</button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Render: Year tab ──────────────────────────────────────────────────────────

  function renderYearTab() {
    const years = Array.from({length:10}, (_,i) => decadeStart+i)
    return (
      <div style={{ padding:"0 20px 20px" }}>
        {/* Decade nav */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 4px 16px" }}>
          <button onClick={()=>setDecadeStart(d=>d-10)} style={{ width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",color:"#64748b" }}
            onMouseEnter={e=>(e.currentTarget.style.background="#f1f5f9")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
          ><ChevronLeft size={18}/></button>
          <span style={{ fontSize:16, fontWeight:700, color:TEXT_DEFAULT }}>{decadeStart} – {decadeStart+9}</span>
          <button onClick={()=>setDecadeStart(d=>d+10)} style={{ width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",color:"#64748b" }}
            onMouseEnter={e=>(e.currentTarget.style.background="#f1f5f9")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}
          ><ChevronRight size={18}/></button>
        </div>
        {/* Year grid */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:8 }}>
          {years.map(yr => {
            const sel = value.mode==="year" && value.start.getFullYear()===yr
            return (
              <button
                key={yr}
                onClick={() => { onChange(makeYearPeriod(yr)); setIsOpen(false) }}
                style={{ padding:"12px 0", borderRadius:12, border:"none", fontSize:16, fontWeight:600, cursor:"pointer",
                  background: sel ? GREEN_DARK : "transparent", color: sel ? "#fff" : "#475569",
                  transform: sel ? "scale(1.04)" : "scale(1)",
                  boxShadow: sel ? "0 4px 14px rgba(22,101,52,0.35)" : "none",
                  transition:"all 0.15s",
                }}
                onMouseEnter={e=>{ if(!sel)(e.currentTarget as HTMLElement).style.background=GREEN_BG }}
                onMouseLeave={e=>{ if(!sel)(e.currentTarget as HTMLElement).style.background="transparent" }}
              >{yr}</button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Tab config ────────────────────────────────────────────────────────────────

  const TABS: {key: PeriodMode; label: string}[] = [
    { key:"custom", label:"Rentang kustom" },
    { key:"week",   label:"Minggu" },
    { key:"month",  label:"Bulan" },
    { key:"year",   label:"Tahun" },
  ]

  // ── Popover (portal) ──────────────────────────────────────────────────────────

  const popoverEl = (
    <div
      ref={popoverRef}
      style={{
        position:"fixed",
        top: popPos.top,
        left: popPos.left,
        width: popPos.width,
        zIndex: 999999,
        background:"#fff",
        borderRadius:16,
        border:"1px solid #e2e8f0",
        boxShadow:"0 24px 64px -12px rgba(0,0,0,0.22), 0 8px 24px -4px rgba(0,0,0,0.10)",
        overflow:"hidden",
      }}
      className="animate-in fade-in-0 zoom-in-95 duration-150 origin-top"
    >
      {/* Tab bar */}
      <div style={{ display:"flex", alignItems:"center", gap:4, padding:"10px 12px", borderBottom:"1px solid #f1f5f9", background:"#f8fafc" }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            style={{
              flex: t.key === "custom" ? 1.8 : 1,
              padding:"7px 4px",
              borderRadius:999,
              border:"none",
              fontSize:13,
              fontWeight:600,
              cursor:"pointer",
              transition:"all 0.15s",
              background: activeTab===t.key ? GREEN_DARK : "transparent",
              color: activeTab===t.key ? "#fff" : "#64748b",
              whiteSpace:"nowrap",
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* Body */}
      <div>
        {activeTab==="custom" && <>{renderCalendar("custom")}{renderShortcuts()}</>}
        {activeTab==="week"   && renderCalendar("week")}
        {activeTab==="month"  && renderMonthTab()}
        {activeTab==="year"   && renderYearTab()}
      </div>
    </div>
  )

  // ── Main render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ position:"relative", display:"flex", alignItems:"center", gap:4, userSelect:"none" }}>
      {/* Prev */}
      <button
        onClick={handlePrev}
        style={{ width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:10,border:"none",background:"transparent",cursor:"pointer",color:"#64748b",transition:"all 0.15s" }}
        onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="#f0fdf4";(e.currentTarget as HTMLElement).style.color=GREEN_DARK}}
        onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="transparent";(e.currentTarget as HTMLElement).style.color="#64748b"}}
      ><ChevronLeft size={18}/></button>

      {/* Trigger */}
      <button
        ref={triggerRef}
        onClick={handleToggle}
        style={{
          display:"flex", alignItems:"center", gap:8,
          padding:"8px 20px", borderRadius:12, border:`1px solid ${isOpen ? GREEN_MID : "#e2e8f0"}`,
          background:"#fff", cursor:"pointer", minWidth:190,
          justifyContent:"center", transition:"all 0.2s",
          boxShadow: isOpen ? `0 0 0 3px rgba(22,163,74,0.15)` : "0 1px 3px rgba(0,0,0,0.08)",
          color: isOpen ? GREEN_DARK : "#1e293b",
        }}
      >
        <span style={{ fontSize:14, fontWeight:600 }}>{value.label}</span>
        <ChevronDown size={14} style={{ opacity:0.5, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition:"transform 0.2s" }}/>
      </button>

      {/* Next */}
      <button
        onClick={handleNext}
        style={{ width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:10,border:"none",background:"transparent",cursor:"pointer",color:"#64748b",transition:"all 0.15s" }}
        onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="#f0fdf4";(e.currentTarget as HTMLElement).style.color=GREEN_DARK}}
        onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="transparent";(e.currentTarget as HTMLElement).style.color="#64748b"}}
      ><ChevronRight size={18}/></button>

      {isOpen && mounted && createPortal(popoverEl, document.body)}
    </div>
  )
}
