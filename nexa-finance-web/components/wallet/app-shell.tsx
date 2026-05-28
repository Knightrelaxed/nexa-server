"use client"

import { Topbar } from "./topbar"

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-200">
      <Topbar />
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        {children}
      </main>
      <style dangerouslySetInnerHTML={{__html: `
        /* Hide scrollbars globally for cleaner mobile look */
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        /* Smooth scrolling */
        html { scroll-behavior: smooth; }
        /* Better tap highlight */
        * { -webkit-tap-highlight-color: transparent; }
      `}} />
    </div>
  )
}
