// Asistente de Veltro: preparar agenda, resumir reuniones, redactar seguimiento
// y responder preguntas sobre los espacios.
//
// Esta implementación es determinista (reglas sobre los datos) para que funcione
// sin claves ni red. La interfaz es la misma que usará el proveedor de Claude
// (lib/assistant/claude.ts) cuando exista ANTHROPIC_API_KEY.

import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { MeetingItemRow, MeetingRow, TaskRow } from '@/lib/database.types'
import { assigneesOf, isAssignedTo } from '@/lib/assignees'

type T = (key: string, values?: Record<string, string | number>) => string

export type AgendaSuggestion = {
  text: string
  taskId: string | null
  reason: 'carry' | 'overdue' | 'blocked' | 'today' | 'progress'
}

const REASON_WEIGHT: Record<AgendaSuggestion['reason'], number> = { carry: 5, blocked: 4, overdue: 3, today: 2, progress: 1 }

/** Agenda sugerida: pendientes de la reunión anterior + tareas que necesitan a las personas convocadas. */
export function suggestAgenda(input: {
  tasks: TaskRow[]
  taskRef: (t: TaskRow) => string
  attendeeIds: string[]
  previousItems: MeetingItemRow[]
  existing: MeetingItemRow[]
  now?: Date
}): AgendaSuggestion[] {
  const now = input.now ?? new Date()
  const taken = new Set(input.existing.map((i) => i.task_id).filter(Boolean))
  const takenText = new Set(input.existing.map((i) => i.text.trim().toLowerCase()))
  const out: AgendaSuggestion[] = []

  for (const item of input.previousItems) {
    const open = (item.kind === 'action' && !item.task_id) || (item.kind === 'question' && !item.done)
    if (open && !takenText.has(item.text.trim().toLowerCase())) out.push({ text: item.text, taskId: null, reason: 'carry' })
  }

  const people = new Set(input.attendeeIds)
  for (const task of input.tasks) {
    if (task.status === 'done' || taken.has(task.id)) continue
    if (people.size && assigneesOf(task).length && !isAssignedTo(task, people)) continue
    const diff = task.due_date ? differenceInCalendarDays(parseISO(task.due_date), now) : null
    const reason: AgendaSuggestion['reason'] | null =
      task.status === 'blocked' ? 'blocked' : diff != null && diff < 0 ? 'overdue' : diff === 0 ? 'today' : task.status === 'in_progress' ? 'progress' : null
    if (reason) out.push({ text: `${input.taskRef(task)} ${task.title}`, taskId: task.id, reason })
  }

  return out.sort((a, b) => REASON_WEIGHT[b.reason] - REASON_WEIGHT[a.reason]).slice(0, 6)
}

const list = (items: string[], t: T) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${t('and')} ${items[items.length - 1]}`

/** Resumen de cierre a partir de lo capturado. */
export function summarizeMeeting(input: {
  meeting: Pick<MeetingRow, 'title'>
  items: MeetingItemRow[]
  nameOf: (userId: string | null) => string | null
  t: T
}): string {
  const { items, t } = input
  const decisions = items.filter((i) => i.kind === 'decision')
  const actions = items.filter((i) => i.kind === 'action')
  const questions = items.filter((i) => i.kind === 'question' && !i.done)
  const notes = items.filter((i) => i.kind === 'note')
  const parts: string[] = []

  if (decisions.length) parts.push(t('summary.decisions', { count: decisions.length, list: list(decisions.map((d) => d.text), t) }))
  if (actions.length) {
    const owners = [...new Set(actions.map((a) => input.nameOf(a.assignee_id)).filter(Boolean))] as string[]
    parts.push(
      owners.length
        ? t('summary.actionsOwners', { count: actions.length, owners: list(owners, t) })
        : t('summary.actions', { count: actions.length }),
    )
    const orphan = actions.filter((a) => !a.assignee_id).length
    if (orphan) parts.push(t('summary.orphan', { count: orphan }))
  }
  if (questions.length) parts.push(t('summary.questions', { count: questions.length }))
  if (!parts.length && notes.length) parts.push(notes[0].text)
  return parts.join(' ') || t('summary.empty')
}

/** Correo de seguimiento listo para enviar a los asistentes. */
export function followUpEmail(input: {
  meeting: Pick<MeetingRow, 'title'>
  items: MeetingItemRow[]
  nameOf: (userId: string | null) => string | null
  dateLabel: (date: string) => string
  taskRefOf: (taskId: string | null) => string | null
  t: T
}): string {
  const { items, t } = input
  const decisions = items.filter((i) => i.kind === 'decision')
  const actions = items.filter((i) => i.kind === 'action')
  const questions = items.filter((i) => i.kind === 'question' && !i.done)
  const lines = [t('email.greeting'), '', t('email.intro', { title: input.meeting.title }), '']
  if (decisions.length) {
    lines.push(t('email.decisions'))
    decisions.forEach((d) => lines.push(`- ${d.text}`))
    lines.push('')
  }
  if (actions.length) {
    lines.push(t('email.actions'))
    actions.forEach((a) => {
      const who = input.nameOf(a.assignee_id) ?? t('email.unassigned')
      const when = a.due_date ? `, ${input.dateLabel(a.due_date)}` : ''
      const ref = input.taskRefOf(a.task_id)
      lines.push(`- ${a.text} (${who}${when})${ref ? ` · ${ref}` : ''}`)
    })
    lines.push('')
  }
  if (questions.length) {
    lines.push(t('email.questions'))
    questions.forEach((q) => lines.push(`- ${q.text}`))
    lines.push('')
  }
  lines.push(t('email.closing'))
  return lines.join('\n')
}

export type AnswerRef = { kind: 'task' | 'decision' | 'doc' | 'meeting' | 'file'; id: string; label: string; href: string }

const STOP = new Set(
  'que qué quedo quedó con de del la las el los un una y o en a por para sobre cual cuál como cómo hay esta está what the a of with on for is are pending pendiente pendientes'.split(' '),
)

function tokens(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
}

/** Responde preguntas sobre los espacios buscando en tareas, decisiones, docs y reuniones. */
export function answerQuestion(input: {
  question: string
  tasks: (TaskRow & { ref: string; href: string })[]
  decisions: (MeetingItemRow & { meetingTitle: string; href: string })[]
  docs: { id: string; title: string; content_text?: string; href: string }[]
  meetings: (Pick<MeetingRow, 'id' | 'title'> & { href: string })[]
  /** archivos de la bóveda: título, nombre y etiquetas */
  files?: { id: string; title: string; text: string; href: string }[]
  t: T
}): { text: string; refs: AnswerRef[] } {
  const q = tokens(input.question)
  if (!q.length) return { text: input.t('ask.empty'), refs: [] }
  const score = (text: string) => {
    const words = new Set(tokens(text))
    return q.reduce((n, w) => n + (words.has(w) || [...words].some((x) => x.startsWith(w)) ? 1 : 0), 0)
  }

  const meetingHits = input.meetings.filter((m) => score(m.title) > 0)
  const meetingIds = new Set(meetingHits.map((m) => m.id))
  const openTasks = input.tasks
    .filter((t) => t.status !== 'done')
    .map((t) => ({ t, s: score(`${t.title} ${t.labels.join(' ')}`) + (t.meeting_id && meetingIds.has(t.meeting_id) ? 2 : 0) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)
  const decisions = input.decisions
    .map((d) => ({ d, s: score(`${d.text} ${d.meetingTitle}`) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
  const docs = input.docs
    .map((d) => ({ d, s: score(`${d.title} ${d.content_text ?? ''}`) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 2)

  const files = (input.files ?? [])
    .map((f) => ({ f, s: score(`${f.title} ${f.text}`) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)

  if (!openTasks.length && !decisions.length && !docs.length && !files.length) return { text: input.t('ask.nothing'), refs: [] }

  const parts: string[] = []
  if (openTasks.length) parts.push(input.t('ask.tasks', { count: openTasks.length, list: openTasks.map((x) => `${x.t.ref} ${x.t.title}`).join('; ') }))
  if (decisions.length) parts.push(input.t('ask.decisions', { list: decisions.map((x) => `«${x.d.text}»`).join(', ') }))
  if (!openTasks.length && docs.length) parts.push(input.t('ask.docs', { list: docs.map((x) => x.d.title).join(', ') }))
  if (files.length) parts.push(input.t('ask.files', { count: files.length, list: files.map((x) => x.f.title).join(', ') }))

  return {
    text: parts.join(' '),
    // Varias decisiones de la misma reunión apuntan al mismo lugar: una sola referencia por destino.
    refs: [
      ...openTasks.map((x) => ({ kind: 'task' as const, id: x.t.id, label: x.t.ref, href: x.t.href })),
      ...decisions.map((x) => ({ kind: 'decision' as const, id: x.d.id, label: x.d.meetingTitle, href: x.d.href })),
      ...docs.map((x) => ({ kind: 'doc' as const, id: x.d.id, label: x.d.title, href: x.d.href })),
      ...files.map((x) => ({ kind: 'file' as const, id: x.f.id, label: x.f.title, href: x.f.href })),
    ].filter((r, i, all) => all.findIndex((o) => o.kind === r.kind && (o.href ?? o.id) === (r.href ?? r.id) && o.label === r.label) === i),
  }
}
