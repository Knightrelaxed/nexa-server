"use client"

import { X, Search } from "lucide-react"
import { formatIDR, ICON_MAP } from "@/lib/wallet-data"
import { cn } from "@/lib/utils"

const PAYMENT_METHOD_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  'QRIS':          { bg: 'bg-violet-100', text: 'text-violet-700', label: 'QRIS' },
  'Transfer bank': { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Transfer bank' },
  'Kartu Kredit':  { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Kartu Kredit' },
  'Tunai':         { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Tunai' },
}

interface TransactionDetailModalProps {
  transaction: any
  onClose: () => void
  onEdit?: () => void
  onDelete?: () => void
}

const TAILWIND_HEX_MAP: Record<string, string> = {
  rose: "#f43f5e", pink: "#ec4899", fuchsia: "#d946ef", purple: "#a855f7",
  violet: "#8b5cf6", indigo: "#6366f1", blue: "#3b82f6", sky: "#0ea5e9",
  cyan: "#06b6d4", teal: "#14b8a6", emerald: "#10b981", green: "#22c55e",
  lime: "#84cc16", yellow: "#eab308", amber: "#f59e0b", orange: "#f97316",
  red: "#ef4444", stone: "#78716c", neutral: "#737373", zinc: "#71717a",
  gray: "#6b7280", slate: "#64748b"
}

function getTailwindHex(twClass: string | null): string | null {
  if (!twClass) return null
  for (const color of Object.keys(TAILWIND_HEX_MAP)) {
    if (twClass.includes(color)) return TAILWIND_HEX_MAP[color]
  }
  return null
}

export function TransactionDetailModal({ transaction, onClose, onEdit, onDelete }: TransactionDetailModalProps) {
  if (!transaction) return null

  const isExpense = transaction.type === "expense"
  const isTransfer = transaction.type === "transfer"
  const Icon = ICON_MAP[transaction.category_icon_key || "more-horizontal"] ?? Search

  // Use category hex color for header; fallback to parsing tailwind color, then type-based color
  const fallbackColor = isTransfer ? "#3b82f6" : isExpense ? "#ef4444" : "#10b981"
  const headerColor = transaction.category_color_hex || getTailwindHex(transaction.category_icon_color) || fallbackColor

  // transaction_date is "YYYY-MM-DD", add T00:00:00 to avoid UTC offset shifting the day
  const dateLabel = transaction.transaction_date
    ? new Date(transaction.transaction_date + "T00:00:00").toLocaleDateString("id-ID", {
        weekday: 'long', day: "numeric", month: "long", year: "numeric"
      })
    : "-"
  // transaction_time is "HH:MM:SS", just slice first 5 chars
  const timeLabel = transaction.transaction_time
    ? String(transaction.transaction_time).slice(0, 5)
    : "--:--"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-[320px] sm:max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
        {/* Header - colored by category */}
        <div
          className="px-5 py-5 sm:px-6 sm:py-8 text-center relative"
          style={{ backgroundColor: headerColor }}
        >
          <button
            onClick={onClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 p-1.5 rounded-full hover:bg-black/10 text-white/80 hover:text-white transition-colors"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>

          <div className="flex justify-center mb-2.5 sm:mb-3">
            <div className="h-11 w-11 sm:h-14 sm:w-14 rounded-full bg-white flex items-center justify-center shadow-sm">
              <Icon className="h-5 w-5 sm:h-7 sm:w-7" style={{ color: headerColor }} />
            </div>
          </div>
          
          <h2 className="text-white/90 text-xs sm:text-sm font-medium mb-0.5 sm:mb-1">{transaction.category_name}</h2>
          <p className="text-white text-2xl sm:text-3xl font-bold tracking-tight">
            {isExpense ? "-" : isTransfer ? "" : "+"}{formatIDR(transaction.amount)}
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-4 sm:px-6 sm:py-6 flex flex-col gap-4 sm:gap-5">
          {/* Status badge & Date */}
          <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-slate-100">
            <span className="text-sm text-slate-500 font-medium">Status</span>
            <span className="px-2.5 py-0.5 sm:py-1 rounded-md bg-green-50 text-green-700 text-[11px] sm:text-xs font-semibold">Berhasil</span>
          </div>

          <div className="grid grid-cols-2 gap-y-3 sm:gap-y-4 text-sm">
            <div className="flex flex-col gap-1">
              <span className="text-slate-500">Tanggal</span>
              <span className="font-semibold text-slate-800">{dateLabel}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-slate-500">Waktu</span>
              <span className="font-semibold text-slate-800">{timeLabel}</span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-slate-500">Akun</span>
              <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#22d3ee] shrink-0" />
                {transaction.account_name}
              </span>
            </div>
            
            <div className="flex flex-col gap-1">
              <span className="text-slate-500">Metode Pembayaran</span>
              {transaction.payment_method ? (
                <span className={cn(
                  "inline-flex w-fit px-2 py-0.5 rounded text-[11px] font-semibold",
                  PAYMENT_METHOD_STYLE[transaction.payment_method]?.bg || "bg-slate-100",
                  PAYMENT_METHOD_STYLE[transaction.payment_method]?.text || "text-slate-700"
                )}>
                  {PAYMENT_METHOD_STYLE[transaction.payment_method]?.label || transaction.payment_method}
                </span>
              ) : (
                <span className="font-semibold text-slate-800">-</span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1 sm:gap-1.5 pt-3 sm:pt-4 border-t border-slate-100">
            <span className="text-slate-500 text-xs sm:text-sm">Deskripsi</span>
            <p className="font-medium text-slate-800 text-sm sm:text-[15px] leading-relaxed">
              {transaction.description || "-"}
            </p>
          </div>

          {(onEdit || onDelete) && (
            <div className="pt-1 sm:pt-2 flex gap-2 sm:gap-3">
              {onDelete && (
                <button 
                  onClick={onDelete}
                  className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm sm:text-base font-semibold transition-colors"
                >
                  Hapus
                </button>
              )}
              {onEdit && (
                <button 
                  onClick={onEdit}
                  className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm sm:text-base font-semibold transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
