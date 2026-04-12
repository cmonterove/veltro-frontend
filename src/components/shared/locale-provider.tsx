'use client'

import { updateUserLocale } from '@/app/(auth)/actions/locale'
import { locales, type Locale } from '@/i18n/routing'
import { useRouter } from 'next/navigation'
import {
  createContext,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from 'react'

interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  isPending: boolean
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  setLocale: () => {},
  isPending: false,
})

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode
  initialLocale: Locale
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function setLocale(newLocale: Locale) {
    if (!locales.includes(newLocale)) return
    setLocaleState(newLocale)

    startTransition(async () => {
      await updateUserLocale(newLocale)
      if (typeof window !== 'undefined') {
        localStorage.setItem('veltro-locale', newLocale)
      }
      router.refresh()
    })
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale, isPending }}>
      {children}
    </LocaleContext.Provider>
  )
}

export const useLocale = () => useContext(LocaleContext)
