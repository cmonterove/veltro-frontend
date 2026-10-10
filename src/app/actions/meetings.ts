'use server'

import { revalidatePath } from 'next/cache'
import { getLocale, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getAccessToken, getEvent } from '@/lib/google/calendar'
import type { CalendarEvent } from '@/lib/types'
import type { Json, MeetingItemRow, MeetingPhase } from '@/lib/database.types'
import { toErrorCode } from '@/lib/errors'
import { DEMO } from '@/lib/demo/config'
import { followUpEmail, summarizeMeeting } from '@/lib/assistant'
import { taskRef } from '@/lib/utils'

function phaseFor(start: string, end: string): MeetingPhase {
  const now = Date.now()
  return now >= new Date(start).getTime() - 5 * 60_000 && now < new Date(end).getTime() + 60 * 60_000 ? 'live' : 'prep'
}

/**
 * Enlaza un evento de Google Calendar a un espacio y devuelve la reunión de Veltro.
 * Si ya existe (mismo evento y espacio) la reutiliza.
 */
export async function openMeeting(input: {
  event: CalendarEvent
  workspaceId: string
}): Promise<{ ok: true; meetingId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  let event = input.event
  if (!DEMO) {
    try {
      const { token } = await getAccessToken(user.id)
      event = { ...(await getEvent(token, input.event.calendarId, input.event.id)), links: [] }
    } catch {
      // sin conexión a Google: usamos los datos del cliente
    }
  }

  const { data: existing } = await supabase
    .from('meetings')
    .select('id')
    .eq('workspace_id', input.workspaceId)
    .eq('google_event_id', event.id)
    .maybeSingle()
  if (existing) return { ok: true, meetingId: existing.id }

  const { data: meeting, error } = await supabase
    .from('meetings')
    .insert({
      workspace_id: input.workspaceId,
      google_event_id: event.id,
      google_calendar_id: event.calendarId,
      series_key: event.seriesKey,
      title: event.title,
      starts_at: new Date(event.start).toISOString(),
      ends_at: new Date(event.end).toISOString(),
      attendees: event.attendees,
      location: event.location,
      conference_url: event.conferenceUrl,
      html_link: event.htmlLink,
      phase: phaseFor(event.start, event.end),
    })
    .select('id')
    .single()
  if (error || !meeting) return { ok: false, error: toErrorCode(error) }
  return { ok: true, meetingId: meeting.id }
}

/**
 * Cierra la reunión: convierte acciones en tareas, escribe el resumen y el
 * correo de seguimiento, y deja el registro como doc en la memoria del espacio.
 */
export async function closeMeeting(
  meetingId: string,
): Promise<{ ok: true; tasksCreated: number; docId: string | null } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const { data: meeting } = await supabase.from('meetings').select('*').eq('id', meetingId).single()
  if (!meeting) return { ok: false, error: 'forbidden' }
  const [{ data: ws }, { data: itemRows }] = await Promise.all([
    supabase.from('workspaces').select('id, key, slug, account_id').eq('id', meeting.workspace_id).single(),
    supabase.from('meeting_items').select('*').eq('meeting_id', meetingId).order('position'),
  ])
  if (!ws) return { ok: false, error: 'forbidden' }
  let items = (itemRows ?? []) as MeetingItemRow[]

  // 1. acciones → tareas
  const pending = items.filter((i) => i.kind === 'action' && !i.task_id && i.text.trim())
  let tasksCreated = 0
  if (pending.length) {
    const base = Date.now() / 1000
    const { data: tasks, error } = await supabase
      .from('tasks')
      .insert(
        pending.map((i, n) => ({
          workspace_id: ws.id,
          title: i.text.trim().slice(0, 500),
          assignee_id: i.assignee_id,
          due_date: i.due_date,
          meeting_id: meetingId,
          status: 'todo' as const,
          position: base + n,
        })),
      )
      .select('id, number')
    if (error) return { ok: false, error: toErrorCode(error) }
    tasksCreated = tasks?.length ?? 0
    await Promise.all(
      (tasks ?? []).map((task, n) => supabase.from('meeting_items').update({ task_id: task.id }).eq('id', pending[n].id)),
    )
    const byItem = new Map(pending.map((i, n) => [i.id, tasks?.[n]?.id ?? null]))
    items = items.map((i) => (byItem.has(i.id) ? { ...i, task_id: byItem.get(i.id) ?? null } : i))
  }

  // 2. nombres y refs para el texto
  const ids = [...new Set(items.map((i) => i.assignee_id).filter(Boolean))] as string[]
  const taskIds = items.map((i) => i.task_id).filter(Boolean) as string[]
  const [{ data: people }, { data: refs }] = await Promise.all([
    ids.length ? supabase.from('profiles').select('id, full_name').in('id', ids) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    taskIds.length ? supabase.from('tasks').select('id, number').in('id', taskIds) : Promise.resolve({ data: [] as { id: string; number: number }[] }),
  ])
  const nameOf = (id: string | null) => (id ? (people ?? []).find((p) => p.id === id)?.full_name ?? null : null)
  const refOf = (id: string | null) => {
    const r = id ? (refs ?? []).find((x) => x.id === id) : null
    return r ? taskRef(ws.key, r.number) : null
  }

  const [t, locale] = await Promise.all([getTranslations('assistant'), getLocale()])
  const tt = (key: string, values?: Record<string, string | number>) => t(key, values)
  const dateLabel = (d: string) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${d}T12:00:00`))

  const summary = summarizeMeeting({ meeting, items, nameOf, t: tt })
  const followUp = followUpEmail({ meeting, items, nameOf, dateLabel, taskRefOf: refOf, t: tt })

  // 3. registro en la memoria (doc de la reunión)
  const text = (s: string, bold = false) => ({ type: 'text', text: s, styles: bold ? { bold: true } : {} })
  const section = (title: string, kind: MeetingItemRow['kind'], render: (i: MeetingItemRow) => unknown) => {
    const list = items.filter((i) => i.kind === kind && i.text.trim())
    return list.length ? [{ type: 'heading', props: { level: 2 }, content: [text(title)] }, ...list.map(render)] : []
  }
  const blocks = [
    { type: 'paragraph', content: [text(`${t('record.summary')}: `, true), text(summary)] },
    ...section(t('record.decisions'), 'decision', (i) => ({ type: 'bulletListItem', content: [text(i.text)] })),
    ...section(t('record.actions'), 'action', (i) => ({
      type: 'checkListItem',
      props: { checked: false },
      content: [text(i.text), ...(refOf(i.task_id) ? [text(` · ${refOf(i.task_id)}`, true)] : []), ...(nameOf(i.assignee_id) ? [text(` · ${nameOf(i.assignee_id)}`)] : [])],
    })),
    ...section(t('record.questions'), 'question', (i) => ({ type: 'bulletListItem', content: [text(i.text)] })),
    ...section(t('record.notes'), 'note', (i) => ({ type: 'paragraph', content: [text(i.text)] })),
  ]

  const { data: existingDoc } = await supabase
    .from('docs')
    .select('id')
    .eq('meeting_id', meetingId)
    .eq('source', 'meeting')
    .is('archived_at', null)
    .limit(1)
    .maybeSingle()

  let docId = existingDoc?.id ?? null
  if (!docId) {
    const { data: doc } = await supabase
      .from('docs')
      .insert({
        workspace_id: ws.id,
        title: meeting.title,
        source: 'meeting',
        meeting_id: meetingId,
        content: blocks as unknown as Json,
        content_text: [summary, ...items.map((i) => i.text)].join('\n').slice(0, 100_000),
        position: Date.now() / 1000,
      })
      .select('id')
      .single()
    docId = doc?.id ?? null
  }

  // 4. la reunión queda cerrada
  const { error: closeErr } = await supabase
    .from('meetings')
    .update({ phase: 'closed', summary, follow_up: followUp, closed_at: new Date().toISOString() })
    .eq('id', meetingId)
  if (closeErr) return { ok: false, error: toErrorCode(closeErr) }

  revalidatePath(`/m/${meetingId}`)
  return { ok: true, tasksCreated, docId }
}

export async function unlinkMeeting(meetingId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('meetings').delete().eq('id', meetingId)
  return error ? { ok: false as const, error: toErrorCode(error) } : { ok: true as const }
}

/** Compatibilidad: abre la reunión y devuelve su id (antes creaba el doc de notas). */
export async function openMeetingNotes(input: { event: CalendarEvent; workspaceId: string }) {
  const res = await openMeeting(input)
  if (!res.ok) return res
  const { data: ws } = await (await createClient()).from('workspaces').select('slug').eq('id', input.workspaceId).single()
  return { ok: true as const, meetingId: res.meetingId, workspaceSlug: ws?.slug ?? '', docId: null as string | null }
}
