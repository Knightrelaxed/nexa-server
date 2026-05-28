"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Wallet,
  ChevronDown,
  Settings,
  HelpCircle,
  Target,
  PiggyBank,
  Repeat,
  CreditCard,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { accounts, formatIDRCompact } from "@/lib/wallet-data"
import { useState } from "react"

const accountColors: Record<string, string> = {
  "1": "bg-blue-500",
  "2": "bg-amber-500",
  "3": "bg-emerald-500",
  "4": "bg-sky-500",
  "5": "bg-purple-500",
}

export function Sidebar({
  open,
  onClose,
  collapsed,
  onToggleCollapsed,
}: {
  open: boolean
  onClose: () => void
  collapsed: boolean
  onToggleCollapsed: () => void
}) {
  const pathname = usePathname()
  const [showMore, setShowMore] = useState(false)
  const total = accounts.reduce((s, a) => s + a.balance, 0)

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          collapsed ? "lg:w-16" : "w-72 lg:w-72",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Brand */}
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary">
              <Wallet className="h-5 w-5 text-primary-foreground" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">Wallet</p>
                <p className="truncate text-[11px] text-muted-foreground">by BudgetBakers</p>
              </div>
            )}
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onClose}
            aria-label="Tutup menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Total balance */}
        {!collapsed && (
          <div className="border-b border-sidebar-border px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Total Saldo
            </p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-primary">
              {formatIDRCompact(total)}
            </p>
          </div>
        )}

        {/* Accounts list */}
        <div className="flex-1 overflow-y-auto">
          {!collapsed && (
            <div className="px-4 pt-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Akun
              </p>
            </div>
          )}
          <div className={cn("space-y-0.5", collapsed ? "px-2" : "px-2")}>
            {accounts.map((acc) => (
              <button
                key={acc.id}
                type="button"
                className={cn(
                  "group flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent",
                  collapsed && "justify-center",
                )}
                title={acc.name}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white",
                    accountColors[acc.id] ?? "bg-emerald-500",
                  )}
                >
                  <Wallet className="h-4 w-4" />
                </span>
                {!collapsed && (
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{acc.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{acc.type}</p>
                    </div>
                    <p className="shrink-0 text-xs font-semibold tabular-nums">
                      {formatIDRCompact(acc.balance)}
                    </p>
                  </div>
                )}
              </button>
            ))}
            {!collapsed && (
              <button
                type="button"
                className="mt-1 flex w-full items-center gap-2 rounded-md border border-dashed border-sidebar-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                Tambah Akun
              </button>
            )}
          </div>

          {/* Collapsible "Lainnya" section */}
          {!collapsed && (
            <div className="mt-6 px-2">
              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                Lainnya
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform", showMore && "rotate-180")}
                />
              </button>
              {showMore && (
                <div className="space-y-0.5">
                  {[
                    { label: "Anggaran", icon: PiggyBank, href: "#" },
                    { label: "Tujuan", icon: Target, href: "#" },
                    { label: "Berulang", icon: Repeat, href: "#" },
                    { label: "Kartu Kredit", icon: CreditCard, href: "#" },
                  ].map((item) => {
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        className="flex items-center gap-3 rounded-md px-2 py-2 text-sm text-foreground/80 transition-colors hover:bg-sidebar-accent"
                      >
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-sidebar-border p-3">
          <div className={cn("mb-2 flex items-center gap-2", collapsed && "flex-col")}>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent"
              aria-label="Bantuan"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent"
              aria-label="Pengaturan"
            >
              <Settings className="h-4 w-4" />
            </button>
            {!collapsed && (
              <div className="ml-auto flex items-center gap-2 rounded-md px-2 py-1.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  BS
                </div>
                <p className="text-xs font-medium">Budi S.</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="hidden w-full items-center justify-center rounded-md border border-sidebar-border py-1.5 text-muted-foreground hover:bg-sidebar-accent lg:flex"
            aria-label={collapsed ? "Perluas sidebar" : "Persempit sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Hide pathname linter */}
        <span className="hidden">{pathname}</span>
      </aside>
    </>
  )
}
