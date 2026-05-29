"use client"

import { useTheme } from "next-themes"
import { Moon, Sun, Monitor } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useEffect, useState } from "react"

export function SettingsPreferences() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Tampilan</CardTitle>
          <CardDescription>
            Sesuaikan tema aplikasi (Gelap/Terang) sesuai kenyamanan mata Anda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup 
            defaultValue={theme} 
            onValueChange={(val) => setTheme(val)}
            className="grid grid-cols-1 gap-4 sm:grid-cols-3"
          >
            <Label
              htmlFor="theme-light"
              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-emerald-500 [&:has([data-state=checked])]:bg-emerald-50"
            >
              <RadioGroupItem value="light" id="theme-light" className="sr-only" />
              <Sun className="mb-3 h-6 w-6" />
              <span className="font-semibold">Terang</span>
            </Label>
            
            <Label
              htmlFor="theme-dark"
              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-emerald-500 [&:has([data-state=checked])]:bg-emerald-50"
            >
              <RadioGroupItem value="dark" id="theme-dark" className="sr-only" />
              <Moon className="mb-3 h-6 w-6" />
              <span className="font-semibold">Gelap</span>
            </Label>
            
            <Label
              htmlFor="theme-system"
              className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-emerald-500 [&:has([data-state=checked])]:bg-emerald-50"
            >
              <RadioGroupItem value="system" id="theme-system" className="sr-only" />
              <Monitor className="mb-3 h-6 w-6" />
              <span className="font-semibold">Sistem</span>
            </Label>
          </RadioGroup>
        </CardContent>
      </Card>
    </div>
  )
}
