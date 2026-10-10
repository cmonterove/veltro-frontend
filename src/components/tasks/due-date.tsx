'use client'

import { useTranslations } from 'next-intl'
import { format, parseISO } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { dueInfo, shortDate, useDateLocale } from '@/lib/dates'
import { cn } from '@/lib/utils'

export function useDueLabel() {
  const t = useTranslations('dates')
  const locale = useDateLocale()
  return (due: string) => {
    const { diff } = dueInfo(due)
    if (diff === 0) return t('today')
    if (diff === 1) return t('tomorrow')
    if (diff === -1) return t('yesterday')
    if (diff > 1 && diff < 7) return format(parseISO(due), 'EEEE', { locale })
    return shortDate(parseISO(due), locale)
  }
}

export function DueDate({ due, done, className, withIcon = true }: { due: string; done?: boolean; className?: string; withIcon?: boolean }) {
  const label = useDueLabel()
  const { tone } = dueInfo(due)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap text-xs',
        done ? 'text-fg-subtle' : tone === 'overdue' ? 'text-danger' : tone === 'today' ? 'text-warning' : 'text-fg-muted',
        className,
      )}
    >
      {withIcon ? <CalendarDays className="size-3.5" /> : null}
      <span className="first-letter:uppercase">{label(due)}</span>
    </span>
  )
}
