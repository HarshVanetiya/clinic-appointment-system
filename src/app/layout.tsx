import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono, Manrope } from 'next/font/google'
import { OfflineBanner } from '@/components/pwa/offline-banner'
import { RegisterServiceWorker } from '@/components/pwa/register-sw'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap', weight: ['500', '600', '700', '800'] })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap', weight: ['400', '500'] })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: { default: 'Northside Physio — Physiotherapy in Indiranagar, Bengaluru', template: '%s · Northside Physio' },
  description:
    'Book physiotherapy, sports massage, dry needling and clinical Pilates online in under a minute. Experienced therapists in Indiranagar, Bengaluru.',
  applicationName: 'Northside Physio',
  appleWebApp: { capable: true, title: 'Northside', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  openGraph: { type: 'website', locale: 'en_IN', siteName: 'Northside Physio' },
}

export const viewport: Viewport = {
  themeColor: '#2D6A4F',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-IN" className={`${inter.variable} ${manrope.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-green px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        {children}
        <OfflineBanner />
        <RegisterServiceWorker />
      </body>
    </html>
  )
}
