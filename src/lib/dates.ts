'use client'

import { useLocale } from 'next-intl'
import { enUS, es, fr, pt } from 'date-fns/locale'
import { differenceInCalendarDays, format, isSameYear, parseISO } from 'date-fns'

const LOCALES = { es, en: enUS, pt, fr }

export function useDateLocale() {
  const locale = useLocale() as keyof typeof LOCALES
  return LOCALES[locale] ?? es
}

export function toDateKey(d: Date) {
  return format(d, 'yyyy-MM-dd')
}

export function parseDateKey(key: string) {
  return parseISO(key)
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'later'

export function dueInfo(due: string, now = new Date()): { diff: number; tone: DueTone } {
  const diff = differenceInCalendarDays(parseISO(due), now)
  const tone: DueTone = diff < 0 ? 'overdue' : diff === 0 ? 'today' : diff <= 6 ? 'soon' : 'later'
  return { diff, tone }
}

export function shortDate(d: Date, locale: Locale) {
  return format(d, isSameYear(d, new Date()) ? 'd MMM' : 'd MMM yyyy', { locale })
}

type Locale = typeof es
