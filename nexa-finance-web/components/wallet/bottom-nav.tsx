"use client"

import { useState, useEffect, useRef } from "react"
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

// Global module variable persists across client-side page transitions in browser memory
let globalLastIndex = -1

export function BottomNav() {
  const pathname = usePathname()

  // Target index based on current URL pathname
  const routeIndex = navItems.findIndex(
    (item) => pathname === item.href || (pathname === "/" && item.href === "/dashboard")
  )

  // Local state for optimistic and continuous rolling animation
  const [displayIndex, setDisplayIndex] = useState(() => {
    if (globalLastIndex !== -1) return globalLastIndex
    return routeIndex !== -1 ? routeIndex : 0
  })

  const [isRolling, setIsRolling] = useState(false)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [rotation, setRotation] = useState(0)
  const rollingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Smoothly roll to new position if route changes externally (e.g. browser back/forward or in-page navigation)
  useEffect(() => {
    if (routeIndex !== -1 && routeIndex !== displayIndex) {
      const dir: 1 | -1 = routeIndex > displayIndex ? 1 : -1
      setDirection(dir)
      setRotation((prev) => prev + dir * 360)
      setIsRolling(true)
      setDisplayIndex(routeIndex)
      globalLastIndex = routeIndex

      if (rollingTimeoutRef.current) clearTimeout(rollingTimeoutRef.current)
      rollingTimeoutRef.current = setTimeout(() => {
        setIsRolling(false)
      }, 550)
    } else if (routeIndex !== -1) {
      globalLastIndex = routeIndex
    }

    return () => {
      if (rollingTimeoutRef.current) clearTimeout(rollingTimeoutRef.current)
    }
  }, [routeIndex, displayIndex])

  // Instant optimistic response when user taps a tab
  const handleTabClick = (targetIndex: number) => {
    if (targetIndex === displayIndex) return
    const dir: 1 | -1 = targetIndex > displayIndex ? 1 : -1
    setDirection(dir)
    setRotation((prev) => prev + dir * 360)
    setIsRolling(true)
    setDisplayIndex(targetIndex)
    globalLastIndex = targetIndex

    if (rollingTimeoutRef.current) clearTimeout(rollingTimeoutRef.current)
    rollingTimeoutRef.current = setTimeout(() => {
      setIsRolling(false)
    }, 550)
  }

  const activeItem = displayIndex >= 0 && displayIndex < navItems.length ? navItems[displayIndex] : null
  const ActiveIcon = activeItem ? activeItem.icon : null

  return (
    <nav 
      aria-label="Navigasi bawah mobile" 
      data-mobile-nav="true"
      suppressHydrationWarning
      className="mobile-only-nav hidden max-sm:block fixed bottom-0 left-0 right-0 z-40 select-none"
    >
      <div className="relative bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.07)] rounded-t-[28px] pb-[max(env(safe-area-inset-bottom),0.7rem)] pt-3 px-1 transition-all duration-300">
        
        {/* Sliding Fluid Wave & Rolling Bubble Indicator */}
        {displayIndex !== -1 && (
          <div 
            className="absolute top-0 left-0 w-1/5 pointer-events-none z-10"
            style={{ 
              transform: `translateX(${displayIndex * 100}%)`,
              transition: 'transform 550ms cubic-bezier(0.34, 1.45, 0.55, 1)',
            }}
          >
            {/* The Seamless Organic Wave rising from the white bar */}
            <div 
              className="absolute -top-[15px] left-1/2 w-20 h-4"
              style={{
                transform: isRolling ? 'translateX(-50%) scaleX(1.1)' : 'translateX(-50%) scaleX(1)',
                transition: 'transform 550ms cubic-bezier(0.34, 1.45, 0.55, 1)',
              }}
            >
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

            {/* The Rolling Emerald Marble / Sphere */}
            <div 
              className="absolute -top-7 left-1/2 w-12 h-12 rounded-full border-[3.5px] border-white flex items-center justify-center shadow-[0_8px_20px_rgba(16,185,129,0.42)] overflow-hidden"
              style={{
                background: 'radial-gradient(circle at 35% 30%, #34d399 0%, #10b981 60%, #059669 100%)',
                transform: isRolling
                  ? `translateX(-50%) scaleX(1.12) scaleY(0.92) rotate(${direction * 12}deg)`
                  : 'translateX(-50%) scale(1.05) rotate(0deg)',
                transition: 'transform 550ms cubic-bezier(0.34, 1.45, 0.55, 1)',
              }}
            >
              {/* Rolling Specular Highlight (creates the physical roll illusion) */}
              <div 
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{ 
                  transform: `rotate(${rotation}deg)`,
                  transition: 'transform 550ms cubic-bezier(0.34, 1.45, 0.55, 1)',
                }}
              >
                <div className="absolute top-1.5 left-2 w-3.5 h-1.5 rounded-full bg-white/45 blur-[0.5px]" />
                <div className="absolute bottom-2 right-2.5 w-1.5 h-1.5 rounded-full bg-emerald-200/40 blur-[0.4px]" />
              </div>

              {/* Active Icon: pops in and stays upright */}
              <div 
                key={displayIndex}
                className="relative z-10 text-white flex items-center justify-center transition-all duration-300 animate-in zoom-in-75 fade-in"
              >
                {ActiveIcon && (
                  <ActiveIcon className="h-5 w-5 stroke-[2.5]" />
                )}
              </div>
            </div>
          </div>
        )}

        {/* 5 Tab Navigation Items */}
        <div className="flex items-center justify-around relative h-12">
          {navItems.map((item, index) => {
            const isActive = index === displayIndex
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => handleTabClick(index)}
                className="group flex flex-1 flex-col items-center justify-end relative h-full pb-1 focus:outline-none"
              >
                {/* Inactive Icon (Smoothly lifts and dissolves as the rolling ball approaches) */}
                <div 
                  className={cn(
                    "flex items-center justify-center transition-all duration-300 mb-1",
                    isActive 
                      ? "opacity-0 scale-50 -translate-y-2 pointer-events-none" 
                      : "opacity-100 scale-100 translate-y-0 text-slate-400 group-hover:text-slate-600"
                  )}
                >
                  <Icon className="h-5 w-5 stroke-[1.8]" />
                </div>

                {/* Label Text */}
                <span
                  className={cn(
                    "text-[10.5px] tracking-tight transition-all duration-300 select-none",
                    isActive
                      ? "font-bold text-slate-900 drop-shadow-xs"
                      : "font-medium text-slate-500 group-hover:text-slate-700"
                  )}
                >
                  {item.label}
                </span>

                {/* Tiny Active Pill Indicator under label */}
                <span 
                  className={cn(
                    "w-1 h-1 rounded-full bg-emerald-500 mt-0.5 transition-all duration-300",
                    isActive ? "opacity-100 scale-100" : "opacity-0 scale-0"
                  )}
                />
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
