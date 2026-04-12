export const locales = ['en', 'es', 'pt', 'fr'] as const
export type Locale = (typeof locales)[number]

const raw = process.env.NEXT_PUBLIC_DEFAULT_LOCALE

export const defaultLocale: Locale =
  raw && locales.includes(raw as Locale) ? (raw as Locale) : 'en'
