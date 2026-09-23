"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  LayoutDashboard, 
  Wallet, 
  ReceiptText, 
  Target, 
  TrendingUp 
} from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/dashboard", label: "Dasbor", icon: LayoutDashboard },
  { href: "/accounts",  label: "Akun",   icon: Wallet },
  { href: "/records",   label: "Catatan", icon: ReceiptText },
  { href: "/budget",    label: "Anggaran", icon: Target },
  { href: "/analytics", label: "Analitik", icon: TrendingUp },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav 
      aria-label="Navigasi bawah mobile" 
      className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200/90 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] pb-[max(env(safe-area-inset-bottom),0.6rem)] pt-1 px-1.5 transition-all duration-300"
    >
      <div className="flex items-center justify-around max-w-md mx-auto relative h-14">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (pathname === "/" && item.href === "/dashboard")
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-1 flex-col items-center justify-center relative h-full focus:outline-none select-none"
            >
              {/* Floating Bubble Icon */}
              <div
                className={cn(
                  "flex items-center justify-center rounded-full transition-all duration-300 ease-out",
                  isActive
                    ? "absolute -top-5 w-12 h-12 bg-emerald-500 text-white shadow-lg shadow-emerald-500/40 ring-4 ring-slate-200 -translate-y-1 scale-110"
                    : "w-8 h-8 text-slate-400 group-hover:text-slate-600 group-active:scale-95 translate-y-0"
                )}
              >
                <Icon 
                  className={cn(
                    "transition-all duration-300", 
                    isActive ? "h-5 w-5 stroke-[2.5]" : "h-5 w-5 stroke-[1.8]"
                  )} 
                />
              </div>

              {/* Label Text */}
              <span
                className={cn(
                  "text-[10px] sm:text-[11px] tracking-tight transition-all duration-300 mt-auto pb-0.5",
                  isActive
                    ? "font-black text-slate-900 drop-shadow-xs"
                    : "font-medium text-slate-500 group-hover:text-slate-700"
                )}
              >
                {item.label}
              </span>

              {/* Active Dot Indicator */}
              {isActive && (
                <span className="absolute bottom-0 w-1 h-1 rounded-full bg-emerald-500" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
