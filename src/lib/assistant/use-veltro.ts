'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { addDays, startOfDay, subDays } from 'date-fns'
import { useApp, useWorkspaceMap } from '@/components/app/app-context'
import { useTasks } from '@/lib/queries/tasks'
import { useMeetingsInRange, useWorkspaceItems } from '@/lib/queries/meetings'
import { useRecentDocs } from '@/lib/queries/docs'
import { taskRef } from '@/lib/utils'
import type { AttachmentRow, MeetingItemRow, MeetingRow, TaskRow } from '@/lib/database.types'
import { useVaultFiles } from '@/lib/queries/attachments'
import type { DocSummary, WorkspaceWithRole } from '@/lib/types'
import { askVeltro } from './intents'

/** Arma la entrada del asistente a partir de los datos ya cargados. */
export function buildVeltroInput(d: {
  tasks: TaskRow[]
  items: MeetingItemRow[]
  meetings: MeetingRow[]
  docs: DocSummary[]
  wsMap: Map<string, WorkspaceWithRole>
  members: { id: string; full_name: string }[]
  files?: AttachmentRow[]
}) {
  const meetingById = new Map(d.meetings.map((m) => [m.id, m]))
  return {
    tasks: d.tasks.map((x) => {
      const ws = d.wsMap.get(x.workspace_id)
      return { ...x, ref: ws ? taskRef(ws.key, x.number) : '', href: x.id }
    }),
    decisions: d.items
      .filter((i) => i.kind === 'decision')
      .map((i) => ({ ...i, meetingTitle: meetingById.get(i.meeting_id)?.title ?? '', href: `/m/${i.meeting_id}` })),
    docs: d.docs.map((x) => ({ id: x.id, title: x.title, href: `/w/${d.wsMap.get(x.workspace_id)?.slug}/docs/${x.id}` })),
    meetings: d.meetings.map((m) => ({ id: m.id, title: m.title, starts_at: m.starts_at, phase: m.phase, href: `/m/${m.id}` })),
    members: d.members,
    files: (d.files ?? []).map((f) => ({ id: f.id, title: f.title?.trim() || f.name, text: `${f.name} ${f.labels.join(' ')}`, href: `/vault?file=${f.id}` })),
  }
}

/** Datos y función para preguntarle a Veltro desde cualquier vista. */
export function useVeltro() {
  const ta = useTranslations('assistant')
  const { workspaces, observedWorkspaces, members } = useApp()
  const wsMap = useWorkspaceMap()
  const wsIds = useMemo(() => workspaces.map((w) => w.id), [workspaces])
  const taskWsIds = useMemo(() => [...wsIds, ...observedWorkspaces.map((w) => w.id)], [wsIds, observedWorkspaces])
  const from = useMemo(() => subDays(startOfDay(new Date()), 45), [])
  const to = useMemo(() => addDays(startOfDay(new Date()), 14), [])
  const { data: tasks } = useTasks({ kind: 'workspaces', workspaceIds: taskWsIds })
  const { data: items } = useWorkspaceItems(wsIds)
  const { data: meetings } = useMeetingsInRange(wsIds, from, to)
  const { data: docs } = useRecentDocs(wsIds, 60)
  const { data: files } = useVaultFiles()

  const input = useMemo(
    () => buildVeltroInput({ tasks: tasks ?? [], items: items ?? [], meetings: meetings ?? [], docs: docs ?? [], wsMap, members, files }),
    [tasks, items, meetings, docs, wsMap, members, files],
  )
  const ready = Boolean(tasks && items && meetings && docs)
  const ask = (question: string) => askVeltro({ question, ...input, t: (k, v) => ta(k, v) })
  return { ask, ready, tasks: tasks ?? [], meetings: meetings ?? [], docs: docs ?? [] }
}
