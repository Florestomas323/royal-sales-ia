import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/lib/firebase/auth-context'
import './globals.css'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://royal-sales-ia.vercel.app'),
  title: {
    default: 'Royal Sales IA — Marketing & Sales OS',
    template: '%s · Royal Sales IA',
  },
  description:
    'The AI operating system for high-performance marketing and sales teams. Campaigns, leads, pipeline, attribution and intelligence in one command center.',
  applicationName: 'Royal Sales IA',
  generator: 'v0.app',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Royal Sales IA',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    type: 'website',
    siteName: 'Royal Sales IA',
    title: 'Royal Sales IA — Marketing & Sales OS',
    description:
      'El sistema operativo con IA para equipos de marketing y ventas de alto rendimiento. Campañas, leads, pipeline y atribución en un solo command center.',
    images: [
      {
        url: '/royal-sales-og.png',
        width: 1024,
        height: 1024,
        alt: 'Royal Sales IA — Marketing & Sales OS',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Royal Sales IA — Marketing & Sales OS',
    description:
      'El sistema operativo con IA para equipos de marketing y ventas de alto rendimiento.',
    images: ['/royal-sales-og.png'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbfd' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0e14' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} bg-background`}
    >
      <body className="font-sans antialiased">
        <AuthProvider>
          <TooltipProvider delay={200}>{children}</TooltipProvider>
        </AuthProvider>
        <Toaster position="top-right" />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
