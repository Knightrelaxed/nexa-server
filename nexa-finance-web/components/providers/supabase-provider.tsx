"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client"
import type { Session, User } from "@supabase/supabase-js"

interface AuthContextValue {
  userId: string | null
  userEmail: string | null
  user: User | null
  session: Session | null
  isConfigured: boolean
  isLoading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  userId: null,
  userEmail: null,
  user: null,
  session: null,
  isConfigured: false,
  isLoading: true,
  signOut: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

function setAuthCookie(active: boolean) {
  if (typeof document !== 'undefined') {
    if (active) {
      document.cookie = "nexa-auth-token=active; path=/; max-age=2592000; SameSite=Lax"
    } else {
      document.cookie = "nexa-auth-token=; path=/; max-age=0; SameSite=Lax"
    }
  }
}

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false)
      return
    }

    // 1. Initial session check
    supabase.auth.getSession().then(({ data: { session: initSession } }) => {
      setSession(initSession)
      setUser(initSession?.user ?? null)
      setAuthCookie(!!initSession)
      setIsLoading(false)
    })

    // 2. Auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
      setUser(currentSession?.user ?? null)
      setAuthCookie(!!currentSession)
      setIsLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // 3. Client route protection
  useEffect(() => {
    if (isLoading) return

    const isPublicRoute = pathname === '/login'

    if (!session && !isPublicRoute) {
      router.replace('/login')
    } else if (session && isPublicRoute) {
      router.replace('/dashboard')
    }
  }, [session, isLoading, pathname, router])

  const signOut = async () => {
    setIsLoading(true)
    await supabase.auth.signOut()
    setAuthCookie(false)
    setSession(null)
    setUser(null)
    setIsLoading(false)
    router.replace('/login')
  }

  // Show clean loading screen while verifying session to prevent unauthenticated content flash
  const isPublicRoute = pathname === '/login'
  if (isLoading && !isPublicRoute) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-sm font-medium text-slate-500">Memeriksa autentikasi...</p>
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider
      value={{
        userId: user?.id ?? null,
        userEmail: user?.email ?? null,
        user,
        session,
        isConfigured: isSupabaseConfigured,
        isLoading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
