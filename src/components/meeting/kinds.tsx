'use client'

import { useTranslations } from 'next-intl'
import { ArrowRight, Diamond, HelpCircle, ListOrdered, StickyNote } from 'lucide-react'
import type { MeetingItemKind } from '@/lib/database.types'
import { cn } from '@/lib/utils'

export const KIND_STYLE: Record<MeetingItemKind, { chip: string; row: string; icon: typeof Diamond }> = {
  decision: { chip: 'bg-k-decision-soft text-k-decision', row: 'bg-k-decision-soft/60', icon: Diamond },
  action: { chip: 'bg-k-action-soft text-k-action', row: 'bg-k-action-soft/60', icon: ArrowRight },
  question: { chip: 'bg-k-question-soft text-k-question', row: 'bg-k-question-soft/60', icon: HelpCircle },
  note: { chip: 'bg-hover text-fg-muted', row: '', icon: StickyNote },
  agenda: { chip: 'bg-hover text-fg-muted', row: '', icon: ListOrdered },
}

export function KindChip({ kind, className }: { kind: MeetingItemKind; className?: string }) {
  const t = useTranslations('meeting.kind')
  const { chip, icon: Icon } = KIND_STYLE[kind]
  return (
    <span className={cn('inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-2xs font-semibold', chip, className)}>
      <Icon className="size-3" strokeWidth={2.4} />
      {t(kind)}
    </span>
  )
}
