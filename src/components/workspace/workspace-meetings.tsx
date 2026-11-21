'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { format, isPast } from 'date-fns'
import { CheckCheck } from 'lucide-react'
import { useWorkspaceMap } from '@/components/app/app-context'
import { WeekView } from '@/components/calendar/week-view'
import { useWorkspaceMeetings } from '@/lib/queries/meetings'
import { useDateLocale } from '@/lib/dates'
import { SpaceHeader } from './workspace-header'

/** Reuniones del espacio como calendario semanal, con las que faltan por cerrar arriba. */
export function WorkspaceMeetings({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('meetings')
  const locale = useDateLocale()
  const ws = useWorkspaceMap().get(workspaceId)!
  const { data: meetings } = useWorkspaceMeetings(workspaceId)
  const pending = (meetings ?? []).filter((m) => m.phase !== 'closed' && isPast(new Date(m.ends_at ?? m.starts_at)))

  return (
    // cabe en la pantalla (debajo de la cabecera del espacio): la semana se desplaza por dentro
    <div className="flex h-full min-h-[480px] flex-col">
      <div className="shrink-0 px-4 pt-4 sm:px-6">
        <SpaceHeader ws={ws} section="meetings" />
      </div>
      {pending.length ? (
        // un aviso dentro de la página, no otra franja de lado a lado
        <div className="mx-4 mt-3 flex shrink-0 flex-wrap items-center gap-2 rounded-xl bg-warning-soft/70 px-3 py-1.5 ring-1 ring-inset ring-mandarina/15 sm:mx-6">
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
