import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'
import { defaultLocale, isLocale, LOCALE_COOKIE } from './config'

// Prioridad: cookie (sincronizada con profiles.locale al iniciar sesión) → Accept-Language → env.
export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value
  const headerLocale = (await headers()).get('accept-language')?.split(',')[0]?.split('-')[0]

  const locale = [cookieLocale, headerLocale].find(isLocale) ?? defaultLocale

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
