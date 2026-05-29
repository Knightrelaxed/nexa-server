"use client"

import * as React from "react"
import { Moon, Sun, Monitor } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ThemeToggle({ showText = false }: { showText?: boolean }) {
  const { setTheme, theme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button variant="outline" size={showText ? "default" : "icon"} className={showText ? "w-full justify-start gap-3 rounded-xl bg-white/50" : "h-9 w-9 sm:h-10 sm:w-10 rounded-full shrink-0"}>
        <Sun className="h-[1.2rem] w-[1.2rem] opacity-0" />
        {showText && <span>Tema</span>}
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={showText ? "default" : "icon"} className={showText ? "w-full justify-start gap-3 rounded-xl bg-white/50 backdrop-blur-sm border-border/50 hover:bg-slate-100 dark:bg-slate-900/50 dark:border-slate-800 dark:hover:bg-slate-800 transition-all duration-300" : "h-9 w-9 sm:h-10 sm:w-10 rounded-full shrink-0 bg-white/50 backdrop-blur-sm border-border/50 hover:bg-slate-100 dark:bg-slate-900/50 dark:border-slate-800 dark:hover:bg-slate-800 transition-all duration-300"}>
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-amber-500" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-indigo-400" />
          {showText ? <span>Tema</span> : <span className="sr-only">Pilih Tema</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={showText ? "center" : "end"} className="z-[100] min-w-[150px]">
        <DropdownMenuItem onClick={() => setTheme("light")} className="cursor-pointer gap-2">
          <Sun className="h-4 w-4 text-amber-500" />
          <span>Terang</span>
          {theme === 'light' && <span className="ml-auto text-emerald-500 text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")} className="cursor-pointer gap-2">
          <Moon className="h-4 w-4 text-indigo-400" />
          <span>Gelap</span>
          {theme === 'dark' && <span className="ml-auto text-emerald-500 text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")} className="cursor-pointer gap-2">
          <Monitor className="h-4 w-4 text-slate-500" />
          <span>Sistem</span>
          {theme === 'system' && <span className="ml-auto text-emerald-500 text-xs">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
