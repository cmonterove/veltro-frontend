'use client'

import { useTranslations } from 'next-intl'
import { Bot, FileText, FileUp, Video } from 'lucide-react'
import type { DocSource } from '@/lib/database.types'
import { cn } from '@/lib/utils'

const ICONS = { manual: FileText, meeting: Video, claude: Bot, import: FileUp }

export function SourceBadge({ source, className }: { source: DocSource; className?: string }) {
  const t = useTranslations('docs.source')
  const Icon = ICONS[source]
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-full px-2 text-2xs font-medium',
        source === 'meeting' && 'bg-accent-soft text-accent-ink',
        source === 'claude' && 'bg-[color-mix(in_oklch,var(--ws-orange)_16%,transparent)] text-[color-mix(in_oklch,var(--ws-orange)_70%,var(--fg))]',
        source === 'import' && 'bg-info-soft text-info',
        source === 'manual' && 'bg-hover text-fg-muted',
        className,
      )}
    >
      <Icon className="size-3" />
      {t(source)}
    </span>
  )
}
