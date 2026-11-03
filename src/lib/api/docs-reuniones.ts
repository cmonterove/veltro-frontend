/**
 * Docs y reuniones por la API (veltro-backend): las formas de sus respuestas (camelCase) y los
 * adaptadores a las filas que ya usan las pantallas (snake_case, `database.types.ts`).
 */

import type { DocRow, DocSource, Json, MeetingAttendee, MeetingItemKind, MeetingItemRow, MeetingPhase, MeetingRow } from '@/lib/database.types'
import type { DocSummary } from '@/lib/types'

// ---------- docs ----------

export type ApiDocBrief = {
  id: string
  workspaceId: string
  parentId: string | null
  title: string
  icon: string | null
  excerpt: string | null
  source: DocSource
  meetingId: string | null
  position: number
  createdBy: string | null
  updatedBy: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ApiDocInList = ApiDocBrief & { childrenCount: number }

export type ApiDoc = ApiDocBrief & {
  content: unknown
  importMarkdown: string | null
  workspace: { id: string; slug: string; role: 'admin' | 'editor' | 'viewer' }
  breadcrumbs: { id: string; title: string; icon: string | null }[]
  children: ApiDocBrief[]
  meeting: { id: string; title: string; startsAt: string } | null
}

export type ApiPage<T> = { items: T[]; nextCursor: string | null }

export function toDocSummary(d: ApiDocBrief): DocSummary {
  return {
    id: d.id,
    workspace_id: d.workspaceId,
    parent_id: d.parentId,
    title: d.title,
    icon: d.icon,
    position: d.position,
    source: d.source,
    meeting_id: d.meetingId,
    updated_at: d.updatedAt,
    created_at: d.createdAt,
    created_by: d.createdBy,
    excerpt: d.excerpt,
  }
}

export function toDocRow(d: ApiDoc): DocRow {
  return {
    ...toDocSummary(d),
    content: (Array.isArray(d.content) ? d.content : []) as Json,
    // la API no manda el texto plano completo (lo calcula ella al guardar)
    content_text: d.excerpt ?? '',
    import_markdown: d.importMarkdown,
    updated_by: d.updatedBy,
    archived_at: d.archivedAt,
  }
}

/** Lo que la web cambia de un doc (como fila) → cuerpo de PATCH /v1/docs/{id}. */
export type DocPatch = Partial<Pick<DocRow, 'title' | 'icon' | 'content' | 'content_text' | 'import_markdown' | 'parent_id' | 'position' | 'source'>>

export function docPatchBody(p: DocPatch) {
  const body: Record<string, unknown> = {}
  if (p.title !== undefined) body.title = p.title
  if (p.icon !== undefined) body.icon = p.icon
  // el texto plano lo saca la API de los bloques; guardar bloques descarta el markdown pendiente
  if (p.content !== undefined) body.content = p.content
  if (p.parent_id !== undefined) body.parentId = p.parent_id
  if (p.position !== undefined) body.position = p.position
  if (p.source === 'manual' || p.source === 'import') body.source = p.source
  return body
}

/** Lo que la web crea (como fila) → cuerpo de POST /v1/workspaces/{ws}/docs. */
export type DocCreate = Pick<DocRow, 'workspace_id'> & Partial<Pick<DocRow, 'title' | 'icon' | 'parent_id' | 'position' | 'import_markdown' | 'source' | 'meeting_id' | 'content'>>

export function docCreateBody(d: DocCreate) {
  const body: Record<string, unknown> = { title: (d.title ?? '').slice(0, 300) }
  if (d.icon) body.icon = d.icon
  if (d.parent_id) body.parentId = d.parent_id
  if (d.position !== undefined) body.position = d.position
  if (d.import_markdown) body.markdown = d.import_markdown
  else if (Array.isArray(d.content) && d.content.length) body.content = d.content
  // el acta de una reunión solo la escribe el cierre
  if (d.source && d.source !== 'meeting') body.source = d.source
  if (d.meeting_id) body.meetingId = d.meeting_id
  return body
}

// ---------- reuniones ----------

export type ApiMeeting = {
  id: string
  workspaceId: string
  googleEventId: string | null
  googleCalendarId: string | null
  title: string
  startsAt: string
  endsAt: string | null
  attendees: MeetingAttendee[]
  location: string | null
  conferenceUrl: string | null
  htmlLink: string | null
  seriesKey: string | null
  phase: MeetingPhase
  summary: string | null
  followUp: string | null
  closedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type ApiMeetingInList = ApiMeeting & {
  stats: { items: number; openActions: number; decisions: number; tasks: number; attachments: number }
  recordDocId: string | null
}

export type ApiMeetingItem = {
  id: string
  meetingId: string
  workspaceId: string
  kind: MeetingItemKind
  text: string
  assigneeId: string | null
  dueDate: string | null
  taskId: string | null
  done: boolean
  source: MeetingItemRow['source']
  position: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type ApiMeetingDetail = ApiMeeting & {
  workspace: { id: string; slug: string; key: string; role: 'admin' | 'editor' | 'viewer' }
  items: ApiMeetingItem[]
  recordDocId: string | null
  previous: { id: string; title: string; startsAt: string; phase: MeetingPhase } | null
  people: { id: string; email: string; fullName: string }[]
}

export type ApiMeetingClose = { meeting: ApiMeetingDetail; tasksCreated: number; docId: string; summary: string; followUp: string }

export type ApiAgendaSuggestion = { text: string; taskId: string | null; reason: 'carry' | 'overdue' | 'blocked' | 'today' | 'progress' }

export function toMeetingRow(m: ApiMeeting): MeetingRow {
  return {
    id: m.id,
    workspace_id: m.workspaceId,
    google_event_id: m.googleEventId,
    google_calendar_id: m.googleCalendarId,
    title: m.title,
    starts_at: m.startsAt,
    ends_at: m.endsAt,
    attendees: m.attendees ?? [],
    location: m.location,
    conference_url: m.conferenceUrl,
    html_link: m.htmlLink,
    created_by: m.createdBy,
    series_key: m.seriesKey,
    phase: m.phase,
    summary: m.summary,
    follow_up: m.followUp,
    closed_at: m.closedAt,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
  }
}

export function toMeetingItemRow(i: ApiMeetingItem): MeetingItemRow {
  return {
    id: i.id,
    meeting_id: i.meetingId,
    workspace_id: i.workspaceId,
    kind: i.kind,
    text: i.text,
    assignee_id: i.assigneeId,
    due_date: i.dueDate,
    task_id: i.taskId,
    done: i.done,
    source: i.source,
    position: i.position,
    created_by: i.createdBy,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
  }
}

/** Lo que la web cambia de un ítem (como fila) → cuerpo de POST/PATCH de lo capturado. */
export function itemBody(p: Partial<Pick<MeetingItemRow, 'kind' | 'text' | 'assignee_id' | 'due_date' | 'done' | 'position'>>) {
  const body: Record<string, unknown> = {}
  if (p.kind !== undefined) body.kind = p.kind
  if (p.text !== undefined) body.text = p.text
  if (p.assignee_id !== undefined) body.assigneeId = p.assignee_id
  if (p.due_date !== undefined) body.dueDate = p.due_date
  if (p.done !== undefined) body.done = p.done
  if (p.position !== undefined) body.position = p.position
  return body
}

/** Lo que la web cambia de una reunión (como fila) → cuerpo de PATCH /v1/meetings/{id}. Cerrar va aparte. */
export function meetingBody(p: Partial<MeetingRow>) {
  const body: Record<string, unknown> = {}
  if (p.title !== undefined) body.title = p.title
  if (p.starts_at !== undefined) body.startsAt = p.starts_at
  if (p.ends_at !== undefined) body.endsAt = p.ends_at
  if (p.location !== undefined) body.location = p.location
  if (p.conference_url !== undefined) body.conferenceUrl = p.conference_url
  if (p.attendees !== undefined) body.attendees = p.attendees.map((a) => ({ email: a.email, name: a.name ?? null }))
  if (p.phase === 'prep' || p.phase === 'live') body.phase = p.phase
  if (p.summary !== undefined) body.summary = p.summary
  if (p.follow_up !== undefined) body.followUp = p.follow_up
  return body
}

/** Junta las páginas de una lista con cursor (hasta `max` páginas). */
export async function allPages<T>(page: (cursor?: string) => Promise<ApiPage<T>>, max = 25) {
  const out: T[] = []
  let cursor: string | undefined
  for (let i = 0; i < max; i++) {
    const r = await page(cursor)
    out.push(...r.items)
    if (!r.nextCursor) break
    cursor = r.nextCursor
  }
  return out
}
