'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowRight, CheckCheck, NotebookPen, Play } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useApp, useWorkspaceMap, canEdit } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '@/components/ui/menu'
import { openMeeting } from '@/app/actions/meetings'
import { calendarKeys } from '@/lib/queries/calendar'
import type { CalendarEvent } from '@/lib/types'

type Stage = 'prepare' | 'enter' | 'close' | 'review'

function stageOf(event: CalendarEvent, phase: 'prep' | 'live' | 'closed' | null): Stage {
  if (phase === 'closed') return 'review'
  const now = Date.now()
  const start = new Date(event.start).getTime()
  const end = new Date(event.end).getTime()
  if (now >= end) return 'close'
  if (now >= start - 10 * 60_000 || phase === 'live') return 'enter'
  return 'prepare'
}

const ICONS = { prepare: NotebookPen, enter: Play, close: CheckCheck, review: ArrowRight }

/** Entra a la sala de la reunión (Ciclo). Si el evento no está enlazado, pide el espacio. */
export function NotesButton({
  event,
  size = 'xs',
  workspaceId,
}: {
  event: CalendarEvent
  size?: 'xs' | 'sm'
  /** forzar el espacio (desde la página de un espacio) */
  workspaceId?: string
}) {
  const t = useTranslations('meetings.stage')
  const tm = useTranslations('meetings')
  const router = useRouter()
  const qc = useQueryClient()
  const { workspaces } = useApp()
  const wsMap = useWorkspaceMap()
  const [pending, start] = useTransition()
  const editable = workspaces.filter((w) => canEdit(w) && (!workspaceId || w.id === workspaceId))

  const linked = event.links.find((l) => wsMap.has(l.workspaceId) && (!workspaceId || l.workspaceId === workspaceId))
  const stage = stageOf(event, linked?.phase ?? null)
  const Icon = ICONS[stage]

  if (linked) {
    return (
      <Button
        variant={stage === 'enter' ? 'primary' : 'secondary'}
        size={size}
        className="shrink-0"
        onClick={() => router.push(`/m/${linked.meetingId}`)}
      >
        <Icon />
        {t(stage)}
      </Button>
    )
  }

  const run = (wsId: string) =>
    start(async () => {
      const res = await openMeeting({ event, workspaceId: wsId })
      if (!res.ok) {
        toast.error(tm('notesError'))
        return
      }
      qc.invalidateQueries({ queryKey: calendarKeys.all })
      router.push(`/m/${res.meetingId}`)
    })

  if (editable.length === 0) return null
  if (editable.length === 1) {
    return (
      <Button variant="secondary" size={size} loading={pending} onClick={() => run(editable[0].id)} className="shrink-0">
        {pending ? null : <Icon />}
        {t(stage)}
      </Button>
    )
  }

  return (
    <Menu>
      <MenuTrigger render={<Button variant="secondary" size={size} loading={pending} className="shrink-0" />}>
        {pending ? null : <Icon />}
        {t(stage)}
      </MenuTrigger>
      <MenuContent align="end">
        <MenuLabel>{tm('chooseWorkspace')}</MenuLabel>
        {editable.map((w) => (
          <MenuItem key={w.id} onClick={() => run(w.id)}>
            <WorkspaceMark ws={w} size={16} />
            {w.name}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  )
}

export function WorkspaceLinkChips({ event }: { event: CalendarEvent }) {
  const wsMap = useWorkspaceMap()
  const linked = event.links.map((l) => wsMap.get(l.workspaceId)).filter(Boolean)
  if (!linked.length) return null
  return (
    <span className="flex items-center gap-1">
      {linked.map((w) => (
        <Link key={w!.id} href={`/w/${w!.slug}/meetings`} title={w!.name}>
          <WorkspaceMark ws={w!} size={14} />
        </Link>
      ))}
    </span>
  )
}
