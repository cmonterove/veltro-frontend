import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { Providers } from '@/components/app/providers'
import './globals.css'

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
  display: 'swap',
})

const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return {
    title: { default: 'Veltro', template: '%s · Veltro' },
    description: t('description'),
    applicationName: 'Veltro',
    // favicon.ico, icon.svg y apple-icon.png (kit de identidad) los publica Next desde src/app
    manifest: '/site.webmanifest',
  }
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#5B1F7A' }, // ciruela, como pide el kit
    { media: '(prefers-color-scheme: dark)', color: '#1C1024' }, // noche
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()

  return (
    <html lang={locale} suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
