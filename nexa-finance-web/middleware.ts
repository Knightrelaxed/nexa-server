// NOTE: Next.js 16 uses "proxy" instead of "middleware".
// This file is intentionally named middleware.ts for compatibility with Next.js docs.
// If you see a deprecation warning, rename this file to proxy.ts.
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Public routes that don't require auth
const PUBLIC_ROUTES = ['/login']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow static assets, next internal routes, and api routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/icons') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname)
  const tokenVal = request.cookies.get('nexa-auth-token')?.value || ''
  // Reject static strings like "active" or empty tokens; require actual JWT token format
  const hasAuthToken = Boolean(tokenVal && tokenVal !== 'active' && tokenVal.length > 20)

  // Unauthenticated user attempting to access private route
  if (!hasAuthToken && !isPublicRoute) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated user attempting to access /login
  if (hasAuthToken && isPublicRoute) {
    const dashboardUrl = new URL('/dashboard', request.url)
    return NextResponse.redirect(dashboardUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.*|apple-icon.*|.*\\.png$|.*\\.svg$|.*\\.jpg$).*)',
  ],
}
