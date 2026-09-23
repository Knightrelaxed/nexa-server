"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  LayoutDashboard, 
  Wallet, 
  Receipt, 
  Target, 
  TrendingUp 
} from "lucide-react"

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

  // Smoothly roll to new position if route changes externally (e.g. browser back/forward or in-page navigation)
  useEffect(() => {
    if (routeIndex !== -1 && routeIndex !== displayIndex) {
      setDisplayIndex(routeIndex)
      globalLastIndex = routeIndex
    } else if (routeIndex !== -1) {
      globalLastIndex = routeIndex
    }
  }, [routeIndex, displayIndex])

  // Instant optimistic response when user taps a tab
  const handleTabClick = (targetIndex: number) => {
    if (targetIndex === displayIndex) return
    setDisplayIndex(targetIndex)
    globalLastIndex = targetIndex
  }

  return (
    <nav 
      aria-label="Navigasi bawah mobile" 
      data-mobile-nav="true"
      suppressHydrationWarning
      className="mobile-only-nav hidden max-sm:block fixed bottom-0 left-0 right-0 z-40 select-none"
    >
      <div className="relative bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.07)] rounded-t-[28px] pb-[max(env(safe-area-inset-bottom),0.7rem)] pt-3 px-1">
        
        {/* Sliding Fluid Wave & Rolling Bubble Indicator (GPU Hardware-Accelerated) */}
        {displayIndex !== -1 && (
          <div 
            className="absolute top-0 left-0 w-1/5 pointer-events-none z-10"
            style={{ 
              transform: `translate3d(${displayIndex * 100}%, 0, 0)`,
              transition: 'transform 450ms cubic-bezier(0.16, 1, 0.3, 1)',
              willChange: 'transform',
            }}
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

            {/* The Rolling Emerald Marble / Sphere */}
            <div 
              className="absolute -top-7 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full border-[3.5px] border-white flex items-center justify-center overflow-hidden"
              style={{
                background: 'radial-gradient(circle at 35% 30%, #34d399 0%, #10b981 60%, #059669 100%)',
                boxShadow: '0 8px 24px -2px rgba(16, 185, 129, 0.45), 0 2px 6px rgba(0, 0, 0, 0.08)',
                transform: 'translateZ(0)',
                willChange: 'transform',
              }}
            >
              {/* Rolling Specular Highlight (physical rolling glint illusion) */}
              <div 
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{ 
                  transform: `rotate(${displayIndex * 120}deg)`,
                  transition: 'transform 450ms cubic-bezier(0.16, 1, 0.3, 1)',
                  willChange: 'transform',
                }}
              >
                <div className="absolute top-1.5 left-2 w-3.5 h-1.5 rounded-full bg-white/50 blur-[0.6px]" />
                <div className="absolute bottom-2 right-2.5 w-1.5 h-1.5 rounded-full bg-emerald-200/40 blur-[0.4px]" />
              </div>

              {/* Pre-rendered Active Icons with Silk-Smooth Cross-Fade */}
              {navItems.map((item, index) => {
                const Icon = item.icon
                const isCurrent = index === displayIndex
                return (
                  <div 
                    key={item.href}
                    className="absolute inset-0 flex items-center justify-center text-white"
                    style={{
                      opacity: isCurrent ? 1 : 0,
                      transform: isCurrent ? 'scale(1) translate3d(0, 0, 0)' : 'scale(0.55) translate3d(0, 4px, 0)',
                      transition: 'opacity 350ms cubic-bezier(0.16, 1, 0.3, 1), transform 350ms cubic-bezier(0.16, 1, 0.3, 1)',
                      pointerEvents: 'none',
                      willChange: 'opacity, transform',
                    }}
                  >
                    <Icon className="h-5 w-5 stroke-[2.5]" />
                  </div>
                )
              })}
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
                {/* Inactive Icon (Smoothly dissolves into the rising bubble) */}
                <div 
                  className="flex items-center justify-center mb-1"
                  style={{
                    opacity: isActive ? 0 : 1,
                    transform: isActive ? 'scale(0.6) translate3d(0, -6px, 0)' : 'scale(1) translate3d(0, 0, 0)',
                    transition: 'opacity 350ms cubic-bezier(0.16, 1, 0.3, 1), transform 350ms cubic-bezier(0.16, 1, 0.3, 1)',
                    color: '#94a3b8',
                    willChange: 'opacity, transform',
                  }}
                >
                  <Icon className="h-5 w-5 stroke-[1.8]" />
                </div>

                {/* Label Text */}
                <span
                  className="text-[10.5px] tracking-tight select-none"
                  style={{
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#0f172a' : '#64748b',
                    transform: isActive ? 'scale(1.05)' : 'scale(1)',
                    transition: 'color 300ms ease, transform 300ms ease, font-weight 300ms ease',
                  }}
                >
                  {item.label}
                </span>

                {/* Tiny Active Pill Indicator under label */}
                <span 
                  className="w-1.5 h-1 rounded-full bg-emerald-500 mt-0.5"
                  style={{
                    opacity: isActive ? 1 : 0,
                    transform: isActive ? 'scaleX(1)' : 'scaleX(0)',
                    transition: 'opacity 350ms ease, transform 350ms cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                />
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
