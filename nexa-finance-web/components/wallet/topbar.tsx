"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Wallet, Plus, LogOut, Server, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { AddTransactionModal } from "./add-transaction-modal"
import { cn } from "@/lib/utils"

const tabs = [
  { href: "/dashboard", label: "Dasbor" },
  { href: "/accounts",  label: "Akun" },
  { href: "/records",   label: "Catatan" },
  { href: "/analytics", label: "Analitik" },
  { href: "/settings",  label: "Pengaturan" },
]

export function Topbar() {
  const pathname = usePathname()
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border/40 bg-white/70 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto flex h-16 sm:h-20 w-full max-w-[1440px] items-center px-4 sm:px-6 lg:px-8">

          {/* Logo */}
          <Link href="/dashboard" className="group flex items-center gap-2 mr-2 sm:mr-8 shrink-0">
            <Image 
              src="/icons/icon-192x192.png" 
              alt="Nexa Finance Logo" 
              width={48} 
              height={48} 
              className="w-10 h-10 sm:w-12 sm:h-12 drop-shadow-md group-hover:scale-110 group-active:scale-95 transition-all duration-300 cursor-pointer"
            />
          </Link>

          {/* Tabs - Desktop Only */}
          <nav className="hidden sm:flex flex-1 min-w-0 items-center gap-1 sm:gap-4 overflow-x-auto no-scrollbar mask-fade-edges" aria-label="Navigasi utama">
            {tabs.map((tab) => {
              const active = pathname === tab.href || (pathname === "/" && tab.href === "/dashboard")
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-full px-3 py-1.5 sm:px-5 sm:py-2.5 text-[12px] sm:text-[14px] transition-all duration-300 whitespace-nowrap",
                    active
                      ? "bg-emerald-500 text-white font-semibold shadow-md shadow-emerald-500/30"
                      : "text-muted-foreground hover:bg-emerald-50 font-medium hover:text-emerald-600",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {tab.label}
                </Link>
              )
            })}
          </nav>

          {/* Right Actions */}
          <div className="ml-auto flex items-center gap-2 sm:gap-4 shrink-0">
            <Button
              onClick={() => setModalOpen(true)}
              className="group gap-1.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold w-9 h-9 p-0 sm:w-auto sm:px-4 sm:h-10 shadow-lg shadow-emerald-500/25 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 shrink-0 flex items-center justify-center"
            >
              <Plus className="h-5 w-5 sm:h-5 sm:w-5 group-hover:rotate-90 transition-transform duration-300" strokeWidth={3} />
              <span className="hidden sm:inline">Catatan Baru</span>
            </Button>

            {/* HuggingFace Server Logs Link */}
            <Link 
              href="https://huggingface.co/spaces/nexa-asistant/NEXA-Core-Server?logs=container" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-full border border-border bg-white hover:bg-slate-50 text-slate-500 hover:text-emerald-600 shadow-sm transition-all duration-300 shrink-0"
              title="Lihat Log Server"
            >
              <Server className="h-4 w-4 sm:h-4 sm:w-4" />
            </Link>

            {/* BRAND TEXT - HIDDEN ON MOBILE TO SAVE SPACE */}
            <div className="hidden sm:flex items-center pl-2 sm:pl-4 sm:border-l border-border/60 select-none cursor-default">
              <div className="flex items-center">
                <span className="text-[13px] sm:text-[15px] font-black tracking-[0.2em] text-slate-800 drop-shadow-sm">
                  NEXA
                </span>
                <span className="text-[13px] sm:text-[15px] font-semibold tracking-[0.2em] text-emerald-500 ml-1.5 drop-shadow-sm">
                  FINANCE
                </span>
              </div>
            </div>

            {/* Mobile Hamburger Menu */}
            <div className="sm:hidden flex items-center ml-1">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-slate-600 hover:text-emerald-600 hover:bg-emerald-50">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[280px] p-0 border-r-0 sm:hidden">
                  <SheetTitle className="sr-only">Navigasi Utama Mobile</SheetTitle>
                  <div className="flex flex-col h-full bg-slate-50">
                    <div className="flex h-16 items-center px-6 border-b border-border/40 bg-white">
                      <div className="flex items-center gap-2">
                        <Image 
                          src="/icons/icon-192x192.png" 
                          alt="Nexa" 
                          width={32} 
                          height={32} 
                          className="w-8 h-8 drop-shadow-sm"
                        />
                        <span className="font-black tracking-widest text-slate-800">NEXA<span className="text-emerald-500 ml-1">FINANCE</span></span>
                      </div>
                    </div>
                    <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                      {tabs.map((tab) => {
                        const active = pathname === tab.href || (pathname === "/" && tab.href === "/dashboard")
                        return (
                          <SheetTrigger asChild key={tab.href}>
                            <Link
                              href={tab.href}
                              className={cn(
                                "flex items-center rounded-xl px-4 py-3.5 text-[15px] font-medium transition-all duration-200",
                                active
                                  ? "bg-emerald-100/60 text-emerald-700 shadow-sm shadow-emerald-100"
                                  : "text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm"
                              )}
                            >
                              {tab.label}
                            </Link>
                          </SheetTrigger>
                        )
                      })}
                    </nav>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>

        <style dangerouslySetInnerHTML={{__html: `
          .no-scrollbar::-webkit-scrollbar { display: none; }
          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
          .mask-fade-edges { -webkit-mask-image: linear-gradient(to right, transparent, black 10px, black calc(100% - 20px), transparent); mask-image: linear-gradient(to right, transparent, black 10px, black calc(100% - 20px), transparent); }
        `}} />
      </header>

      <AddTransactionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  )
}
