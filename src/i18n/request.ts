import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'
import { defaultLocale, locales, type Locale } from './routing'

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get('veltro-locale')?.value

  const headerStore = await headers()
  const acceptLang = headerStore.get('accept-language')?.split(',')[0]?.split('-')[0]

  const resolved =
    [cookieLocale, acceptLang, defaultLocale].find((l): l is Locale =>
      locales.includes(l as Locale)
    ) ?? defaultLocale

  const namespaces = [
    'common',
    'auth',
    'dashboard',
    'boards',
    'items',
    'columns',
    'settings',
    'errors',
  ] as const
  const messages: Record<string, unknown> = {}

  for (const ns of namespaces) {
    try {
      messages[ns] = (await import(`../messages/${resolved}/${ns}.json`)).default
    } catch {
      messages[ns] = (await import(`../messages/${defaultLocale}/${ns}.json`)).default
    }
  }

  return { locale: resolved, messages }
})
