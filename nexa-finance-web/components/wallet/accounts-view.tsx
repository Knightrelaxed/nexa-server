"use client"

import { useState } from "react"
import { PiggyBank, Wallet, Banknote, Plus, Menu } from "lucide-react"
import { useAccounts } from "@/hooks/use-finance-data"
import { formatIDR } from "@/lib/wallet-data"
import { Button } from "@/components/ui/button"
import { AddAccountModal } from "./add-account-modal"
import { AccountDetailView } from "./account-detail-view"
import { cn } from "@/lib/utils"

const ACCOUNT_ICON: Record<string, React.ElementType> = {
  bank:       Banknote,
  cash:       Wallet,
  "e-wallet": PiggyBank,
}
const ACCOUNT_COLOR: Record<string, string> = {
  bank:       "bg-sky-100 text-sky-600",
  cash:       "bg-emerald-100 text-emerald-600",
  "e-wallet": "bg-purple-100 text-purple-600",
}
const ACCOUNT_LABEL: Record<string, string> = {
  bank:       "Rekening tabungan",
  cash:       "Tunai",
  "e-wallet": "Dompet digital",
}

export function AccountsView() {
  const [showArchived, setShowArchived] = useState(false)
  const [addOpen, setAddOpen]           = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const { accounts, loading, refetch } = useAccounts()
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)

  const visible = accounts.filter((a) => showArchived || !a.is_archived)

  if (selectedAccountId) {
    return (
      <AccountDetailView 
        accountId={selectedAccountId} 
        onBack={() => setSelectedAccountId(null)} 
      />
    )
  }

  return (
    <>
      <AddAccountModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={refetch}
      />

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 items-start">

        {/* Sidebar */}
        <aside className="w-full lg:w-[240px] shrink-0 bg-white rounded-xl shadow-sm border border-border p-6 flex flex-col gap-5 sticky top-[72px]">
          <div>
            <h1 className="text-[22px] font-bold">Akun</h1>
            {accounts.length > 0 && (
              <p className="text-sm text-muted-foreground mt-0.5">
                Total: <span className="font-semibold text-foreground">{formatIDR(totalBalance)}</span>
              </p>
            )}
          </div>

          <Button
            onClick={() => setAddOpen(true)}
            className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-semibold h-10 rounded-full gap-2"
          >
            <Plus className="h-4 w-4" />
            Tambah
          </Button>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div className="relative inline-block w-10 h-6 shrink-0">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              <div className="block w-10 h-6 bg-muted border border-border rounded-full peer-checked:bg-[#10b981] transition-colors" />
              <div className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4 shadow-sm" />
            </div>
            <span className="text-sm font-medium text-foreground/80">Tampilkan yang Diarsipkan</span>
          </label>
        </aside>

        {/* Main Content */}
        <div className="flex-1 w-full min-w-0">
          {loading ? (
            <div className="bg-white rounded-xl border border-border divide-y divide-border/50">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-4 p-5">
                  <div className="h-10 w-10 rounded-lg bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-32 bg-muted rounded animate-pulse" />
                    <div className="h-3 w-24 bg-muted rounded animate-pulse" />
                  </div>
                  <div className="h-3 w-24 bg-muted rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="bg-white rounded-xl border border-border p-12 text-center text-muted-foreground">
              <PiggyBank className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
              <p className="font-semibold">Belum ada akun</p>
              <p className="text-sm mt-1">Klik "+ Tambah" untuk menambahkan akun pertama Anda.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
              {visible.map((account) => {
                const Icon = ACCOUNT_ICON[account.type] ?? Wallet
                const colorClass = ACCOUNT_COLOR[account.type] ?? "bg-gray-100 text-gray-500"
                const label = ACCOUNT_LABEL[account.type] ?? account.type
                return (
                  <button
                    key={account.id}
                    onClick={() => setSelectedAccountId(account.id)}
                    className="w-full text-left flex flex-wrap sm:flex-nowrap items-center gap-4 p-4 sm:p-5 hover:bg-muted/30 transition-colors border-b border-border/50 last:border-0"
                  >
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-sm", colorClass)}>
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-4 items-center">
                      <h3 className="text-sm font-bold truncate">{account.name}</h3>
                      <p className="text-xs font-medium text-muted-foreground">{label}</p>
                    </div>

                    <div className="flex items-center justify-between w-full sm:w-auto gap-4 sm:ml-auto">
                      <p className={cn(
                        "text-sm font-semibold tabular-nums ml-14 sm:ml-0",
                        account.balance < 0 ? "text-red-600" : "text-foreground"
                      )}>
                        {formatIDR(account.balance)}
                      </p>
                      <div className="p-1 rounded text-muted-foreground shrink-0">
                        <Menu className="h-5 w-5" />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
