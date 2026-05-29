import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from 'sonner'
import { SupabaseProvider } from '@/components/providers/supabase-provider'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'NEXA Finance – Kelola Keuangan Anda',
  description: 'Aplikasi pengelolaan keuangan pribadi – lacak pengeluaran, anggaran, dan analisis keuangan cerdas.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'NEXA Finance',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/icon-192x192.png',
    shortcut: '/icons/icon-192x192.png',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'NEXA Finance',
    'msapplication-TileColor': '#10b981',
    'msapplication-tap-highlight': 'no',
    'format-detection': 'telephone=no',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#10b981' },
    { media: '(prefers-color-scheme: dark)', color: '#059669' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className="bg-background">
      <head>
        {/* PWA - Service Worker Registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .then(function(reg) { console.log('[NEXA SW] Registered:', reg.scope); })
                    .catch(function(err) { console.warn('[NEXA SW] Failed:', err); });
                });
              }
            `,
          }}
        />
      </head>
      <body className={`${geist.className} antialiased`}>
        <SupabaseProvider>
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </SupabaseProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
