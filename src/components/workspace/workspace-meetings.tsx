'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { format, isPast } from 'date-fns'
import { CheckCheck } from 'lucide-react'
import { useWorkspaceMap } from '@/components/app/app-context'
import { WeekView } from '@/components/calendar/week-view'
import { useWorkspaceMeetings } from '@/lib/queries/meetings'
import { useDateLocale } from '@/lib/dates'

/** Reuniones del espacio como calendario semanal, con las que faltan por cerrar arriba. */
export function WorkspaceMeetings({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('meetings')
  const locale = useDateLocale()
  const ws = useWorkspaceMap().get(workspaceId)!
  const { data: meetings } = useWorkspaceMeetings(workspaceId)
  const pending = (meetings ?? []).filter((m) => m.phase !== 'closed' && isPast(new Date(m.ends_at ?? m.starts_at)))

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[560px] flex-col max-md:h-[calc(100dvh-10.5rem)]">
      {pending.length ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-warning-soft/60 px-4 py-2 sm:px-6">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-mandarina-ink">
            <CheckCheck className="size-3.5" />
            {t('pendingClose', { count: pending.length })}
          </span>
          {pending.map((m) => (
            <Link
              key={m.id}
              href={`/m/${m.id}`}
              className="inline-flex h-7 items-center gap-2 rounded-full border border-line bg-panel px-3 text-xs text-fg shadow-card hover:border-accent"
            >
              <span className="font-medium">{m.title}</span>
              <span className="text-fg-subtle first-letter:uppercase">{format(new Date(m.starts_at), 'EEE d MMM', { locale })}</span>
            </Link>
          ))}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <WeekView workspaceId={ws.id} />
      </div>
    </div>
  )
}
