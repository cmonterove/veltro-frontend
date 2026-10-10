export const locales = ['es', 'en', 'pt', 'fr'] as const
export type AppLocale = (typeof locales)[number]

export const LOCALE_COOKIE = 'veltro-locale'

export const defaultLocale: AppLocale = (() => {
  const env = process.env.NEXT_PUBLIC_DEFAULT_LOCALE
  return locales.includes(env as AppLocale) ? (env as AppLocale) : 'es'
})()

export function isLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && locales.includes(value as AppLocale)
}

export const localeNames: Record<AppLocale, string> = {
  es: 'Español',
  en: 'English',
  pt: 'Português',
  fr: 'Français',
}
