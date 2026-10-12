// Veltro IA: entiende preguntas frecuentes (bloqueos, vencidas, hoy, lo de una persona, resumen de la
// semana) y, si no reconoce la intención, busca en reuniones, decisiones, tareas y docs.
// Determinista, sin red: la misma interfaz la podrá cumplir el proveedor de Claude.

import { differenceInCalendarDays, parseISO, subDays } from 'date-fns'
import type { MeetingItemRow, MeetingRow, TaskRow } from '@/lib/database.types'
import { answerQuestion, type AnswerRef } from './index'
import { isAssignedTo } from '@/lib/assignees'

type T = (key: string, values?: Record<string, string | number>) => string

export type VeltroAnswer = {
  text: string
  refs: AnswerRef[]
  /** tareas a mostrar como lista dentro de la respuesta */
  taskIds: string[]
  /** preguntas para seguir la conversación */
  followUps: string[]
  intent: 'blocked' | 'overdue' | 'today' | 'person' | 'week' | 'search'
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const INTENTS: [VeltroAnswer['intent'], RegExp][] = [
  ['week', /\b(semana|week|semaine|resum|summar)/],
  ['blocked', /\b(bloqu|block|stuck|trabad|frenad)/],
  ['overdue', /\b(vencid|atrasad|overdue|retard|late)/],
  ['today', /\b(hoy|today|hoje|aujourd)/],
]

export function askVeltro(input: {
  question: string
  tasks: (TaskRow & { ref: string; href: string })[]
  decisions: (MeetingItemRow & { meetingTitle: string; href: string })[]
  docs: { id: string; title: string; content_text?: string; href: string }[]
  meetings: (Pick<MeetingRow, 'id' | 'title' | 'starts_at' | 'phase'> & { href: string })[]
  files?: { id: string; title: string; text: string; href: string }[]
  members: { id: string; full_name: string }[]
  t: T
  now?: Date
}): VeltroAnswer {
  // los mensajes con partes opcionales pueden dejar espacios dobles
  const t: T = (k, v) => input.t(k, v).replace(/\s+/g, ' ').trim()
  const now = input.now ?? new Date()
  const q = norm(input.question)
  // lo que va entre comillas es un título ("¿qué decidimos en «Resumen semanal»?"), no una intención
  const bare = q.replace(/«[^»]*»|"[^"]*"|“[^”]*”/g, ' ')
  const open = input.tasks.filter((x) => x.status !== 'done')
  const byDue = (a: TaskRow, b: TaskRow) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
  const ids = (list: TaskRow[]) => list.slice(0, 12).map((x) => x.id)
  const late = (x: TaskRow) => (x.due_date ? -differenceInCalendarDays(parseISO(x.due_date), now) : 0)

  const intent = INTENTS.find(([, re]) => re.test(bare))?.[0]

  // "¿Qué tiene Ana?" o "¿qué tiene Ana bloqueado?": una persona por su nombre o apellido acota las tareas
  const words = new Set(bare.split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2))
  const person = input.members.find((m) => norm(m.full_name).split(/\s+/).some((part) => part.length > 2 && words.has(part)))
  const who = person ? person.full_name.split(' ')[0] : 'none'
  const scoped = person ? open.filter((x) => isAssignedTo(x, person.id)) : open
  // las repreguntas siguen hablando de la misma persona
  const follow = (k: 'overdue' | 'blocked' | 'today' | 'week') =>
    person ? t(`intents.follow.person${k[0].toUpperCase()}${k.slice(1)}`, { name: who }) : t(`intents.follow.${k}`)

  if (intent === 'week') {
    const weekAgo = subDays(now, 7).toISOString()
    const done = input.tasks.filter((x) => x.status === 'done' && (x.completed_at ?? '') >= weekAgo && (!person || isAssignedTo(x, person.id)))
    const decisions = input.decisions.filter((d) => d.created_at >= weekAgo)
    const overdue = scoped.filter((x) => late(x) > 0)
    const blocked = scoped.filter((x) => x.status === 'blocked')
    const upcoming = input.meetings.filter((m) => m.starts_at > now.toISOString() && m.phase !== 'closed')
    return {
      intent,
      text: t('intents.week', { who, done: done.length, decisions: decisions.length, open: scoped.length, overdue: overdue.length, blocked: blocked.length, meetings: upcoming.length }),
      refs: decisions.slice(0, 4).map((d) => ({ kind: 'decision' as const, id: d.id, label: d.text, href: d.href })),
      taskIds: ids([...overdue, ...blocked.filter((x) => !overdue.includes(x))]),
      followUps: [follow('overdue'), follow('blocked'), follow('today')],
    }
  }

  if (intent === 'blocked') {
    const list = scoped.filter((x) => x.status === 'blocked').sort(byDue)
    return { intent, text: t('intents.blocked', { who, count: list.length }), refs: [], taskIds: ids(list), followUps: [follow('overdue'), follow('week')] }
  }

  if (intent === 'overdue') {
    const list = scoped.filter((x) => late(x) > 0).sort((a, b) => late(b) - late(a))
    return {
      intent,
      text: t('intents.overdue', { who, count: list.length, days: list[0] ? late(list[0]) : 0 }),
      refs: [],
      taskIds: ids(list),
      followUps: [follow('blocked'), follow('today')],
    }
  }

  if (intent === 'today') {
    const list = scoped.filter((x) => x.due_date && differenceInCalendarDays(parseISO(x.due_date), now) === 0).sort(byDue)
    return { intent, text: t('intents.today', { who, count: list.length }), refs: [], taskIds: ids(list), followUps: [follow('overdue'), follow('week')] }
  }

  if (person) {
    const list = [...scoped].sort(byDue)
    const blocked = list.filter((x) => x.status === 'blocked').length
    const overdue = list.filter((x) => late(x) > 0).length
    return {
      intent: 'person',
      text: t('intents.person', { name: who, count: list.length, blocked, overdue }),
      refs: [],
      taskIds: ids(list),
      followUps: [follow('overdue'), follow('blocked'), follow('week')],
    }
  }

  const res = answerQuestion({ question: input.question, tasks: input.tasks, decisions: input.decisions, docs: input.docs, meetings: input.meetings, files: input.files, t })
  return {
    intent: 'search',
    text: res.text,
    refs: res.refs.filter((r) => r.kind !== 'task'),
    taskIds: res.refs.filter((r) => r.kind === 'task').map((r) => r.id),
    followUps: [follow('week'), follow('blocked')],
  }
}
