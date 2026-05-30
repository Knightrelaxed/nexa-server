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
}

export function TransactionDetailModal({ transaction, onClose }: TransactionDetailModalProps) {
  if (!transaction) return null

  const isExpense = transaction.type === "expense"
  const isTransfer = transaction.type === "transfer"
  const Icon = ICON_MAP[transaction.category_icon_key || "more-horizontal"] ?? Search

  const dateLabel = new Date(transaction.transaction_time).toLocaleDateString("id-ID", { 
    weekday: 'long', day: "numeric", month: "long", year: "numeric" 
  })
  const timeLabel = transaction.transaction_time ? transaction.transaction_time.slice(11, 16) : "--:--"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
        {/* Header - Colored based on type */}
        <div className={cn(
          "px-6 py-8 text-center relative",
          isTransfer ? "bg-blue-500" : isExpense ? "bg-[#ef4444]" : "bg-[#10b981]"
        )}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-black/10 text-white/80 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex justify-center mb-3">
            <div className="h-14 w-14 rounded-full bg-white flex items-center justify-center shadow-sm">
              <Icon className={cn(
                "h-7 w-7",
                isTransfer ? "text-blue-500" : isExpense ? "text-[#ef4444]" : "text-[#10b981]"
              )} />
            </div>
          </div>
          
          <h2 className="text-white/90 text-sm font-medium mb-1">{transaction.category_name}</h2>
          <p className="text-white text-3xl font-bold tracking-tight">
            {isExpense ? "-" : isTransfer ? "" : "+"}{formatIDR(transaction.amount)}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-6 flex flex-col gap-5">
          {/* Status badge & Date */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <span className="text-sm text-slate-500 font-medium">Status</span>
            <span className="px-2.5 py-1 rounded-md bg-green-50 text-green-700 text-xs font-semibold">Berhasil</span>
          </div>

          <div className="grid grid-cols-2 gap-y-4 text-sm">
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

          <div className="flex flex-col gap-1.5 pt-4 border-t border-slate-100">
            <span className="text-slate-500 text-sm">Catatan</span>
            <p className="font-medium text-slate-800 text-[15px] leading-relaxed">
              {transaction.description || "-"}
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
