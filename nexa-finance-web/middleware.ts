// NOTE: Next.js 16 uses "proxy" instead of "middleware".
// This file is intentionally named middleware.ts for compatibility with Next.js docs.
// If you see a deprecation warning, rename this file to proxy.ts.
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Public routes that don't require auth
const PUBLIC_ROUTES = ['/login']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public routes and static assets
  if (
    PUBLIC_ROUTES.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Single User Mode: No Auth Required
  // Allow all traffic
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.*|apple-icon.*|.*\\.png$|.*\\.svg$|.*\\.jpg$).*)',
  ],
}
