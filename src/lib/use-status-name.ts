'use client'

import { useTranslations } from 'next-intl'
import type { StatusOption } from './statuses'

/** Nombre visible de un estado: el propio del espacio o el estándar traducido. */
export function useStatusName() {
  const t = useTranslations('tasks.status')
  return (o: Pick<StatusOption, 'name' | 'category'>) => o.name ?? t(o.category)
}
