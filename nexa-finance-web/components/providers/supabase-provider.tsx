"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client"
interface AuthContextValue {
  userId: string | null
  userEmail: string | null
  isConfigured: boolean
  isLoading: boolean
}

const AuthContext = createContext<AuthContextValue>({
  userId: null,
  userEmail: null,
  isConfigured: false,
  isLoading: true,
})

export function useAuth() {
  return useContext(AuthContext)
}

export function SupabaseProvider({ children }: { children: ReactNode }) {
  // Single User Mode - Auth is disabled
  return (
    <AuthContext.Provider value={{ userId: 'single-user', userEmail: 'user@nexa.app', isConfigured: isSupabaseConfigured, isLoading: false }}>
      {children}
    </AuthContext.Provider>
  )
}
