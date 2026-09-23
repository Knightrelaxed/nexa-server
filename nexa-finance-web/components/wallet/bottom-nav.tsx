"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  LayoutDashboard, 
  Wallet, 
  Receipt, 
  Target, 
  TrendingUp 
} from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/dashboard", label: "Dasbor", icon: LayoutDashboard },
  { href: "/accounts",  label: "Akun",   icon: Wallet },
  { href: "/records",   label: "Catatan", icon: Receipt },
  { href: "/budget",    label: "Anggaran", icon: Target },
  { href: "/analytics", label: "Analitik", icon: TrendingUp },
]

export function BottomNav() {
  const pathname = usePathname()

  // Tentukan index aktif (0 sampai 4). Jika di /settings atau luar tab, -1
  const activeIndex = navItems.findIndex(
    (item) => pathname === item.href || (pathname === "/" && item.href === "/dashboard")
  )

  const activeItem = activeIndex !== -1 ? navItems[activeIndex] : null
  const ActiveIcon = activeItem ? activeItem.icon : null

  return (
    <nav 
      aria-label="Navigasi bawah mobile" 
      className="sm:hidden fixed bottom-0 left-0 right-0 z-40 select-none"
    >
      <div className="relative bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.07)] rounded-t-[28px] pb-[max(env(safe-area-inset-bottom),0.7rem)] pt-3 px-1 transition-all duration-300">
        
        {/* Sliding Fluid Wave & Floating Bubble Indicator */}
        {activeIndex !== -1 && (
          <div 
            className="absolute top-0 left-0 w-1/5 pointer-events-none transition-transform duration-300 ease-out z-10"
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
          >
            {/* The Seamless Organic Wave rising from the white bar */}
            <div className="absolute -top-[15px] left-1/2 -translate-x-1/2 w-20 h-4">
              <svg 
                viewBox="0 0 80 16" 
                className="w-full h-full drop-shadow-[0_-3px_5px_rgba(0,0,0,0.03)]" 
                preserveAspectRatio="none"
              >
                {/* Smooth C1-continuous bezier wave */}
                <path 
                  d="M 0,16 C 18,16 22,1 40,1 C 58,1 62,16 80,16 Z" 
                  fill="white" 
                />
              </svg>
            </div>

            {/* The Floating Emerald Circle */}
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-500/35 border-[3px] border-white flex items-center justify-center transition-transform duration-300 scale-105">
              {ActiveIcon && (
                <ActiveIcon className="h-5 w-5 stroke-[2.5]" />
              )}
            </div>
          </div>
        )}

        {/* 5 Tab Navigation Items */}
        <div className="flex items-center justify-around relative h-12">
          {navItems.map((item, index) => {
            const isActive = index === activeIndex
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex flex-1 flex-col items-center justify-end relative h-full pb-1 focus:outline-none"
              >
                {/* Inactive Icon (Fades out when tab is active to let the floating bubble take over) */}
                <div 
                  className={cn(
                    "flex items-center justify-center transition-all duration-200 mb-1",
                    isActive ? "opacity-0 scale-75" : "opacity-100 scale-100 text-slate-400 group-hover:text-slate-600"
                  )}
                >
                  <Icon className="h-5 w-5 stroke-[1.8]" />
                </div>

                {/* Label Text */}
                <span
                  className={cn(
                    "text-[10.5px] tracking-tight transition-all duration-200 select-none",
                    isActive
                      ? "font-bold text-slate-900 drop-shadow-xs"
                      : "font-medium text-slate-500 group-hover:text-slate-700"
                  )}
                >
                  {item.label}
                </span>

                {/* Tiny Active Pill Indicator under label */}
                {isActive && (
                  <span className="w-1 h-1 rounded-full bg-emerald-500 mt-0.5" />
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
