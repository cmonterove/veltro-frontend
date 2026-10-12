// Lenguaje natural en la creación rápida de tareas:
//   "Enviar cotización a Polar @ana !alta viernes"
//     → título "Enviar cotización a Polar", responsable Ana, prioridad alta, vence el viernes.
// Las fechas se leen al final del texto (como en la captura de reuniones); @ y ! pueden ir en cualquier parte.

import { extractDue } from './capture'
import type { TaskPriority } from './database.types'

const norm = (w: string) =>
  w
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const PRIORITY_WORDS: Record<string, TaskPriority> = {
  urgente: 'urgent', urgent: 'urgent',
  alta: 'high', high: 'high', haute: 'high',
  media: 'medium', medium: 'medium', moyenne: 'medium', normal: 'medium',
  baja: 'low', low: 'low', baixa: 'low', basse: 'low',
}

// Conectores que quedan colgando al quitar la fecha ("para mañana", "el viernes", "by friday").
const TRAILING = /\s+(para el|para|el|antes del|antes de|for|by|on|pour|le|até|ate)$/i

export type QuickParse = {
  title: string
  due: string | null
  /** el primero de assigneeIds */
  assigneeId: string | null
  /** todas las personas mencionadas con @, en orden */
  assigneeIds: string[]
  priority: TaskPriority | null
  /** Texto reconocido de cada token, para mostrarlo como pista. */
  matched: { due?: string; assignee?: string; priority?: string }
}

export function parseQuickTask(
  text: string,
  members: { id: string; full_name: string }[],
  /** Campos que la persona fijó a mano: su token se deja como texto. */
  skip: { due?: boolean; assignee?: boolean; priority?: boolean } = {},
  now = new Date(),
): QuickParse {
  let rest = ` ${text} `
  const matched: QuickParse['matched'] = {}
  const assigneeIds: string[] = []
  let priority: TaskPriority | null = null

  // @persona (una o varias): coincide con el inicio del nombre o del apellido
  const mentions = skip.assignee ? [] : [...rest.matchAll(/\s@([\p{L}][\p{L}.\-]*)/gu)]
  const said: string[] = []
  for (const mention of mentions) {
    const q = norm(mention[1])
    const hits = members.filter((m) => norm(m.full_name).split(/\s+/).some((part) => part.startsWith(q)) || norm(m.full_name).replace(/\s+/g, '').startsWith(q))
    if (hits.length === 1) {
      if (!assigneeIds.includes(hits[0].id)) assigneeIds.push(hits[0].id)
      said.push(mention[0].trim())
      rest = rest.replace(mention[0], ' ')
    }
  }
  if (said.length) matched.assignee = said.join(' ')

  // !!! urgente, !! alta, o !palabra
  const bang = skip.priority ? null : rest.match(/\s(!{2,3})(?=\s)|\s!([\p{L}]+)(?=\s)/u)
  if (bang) {
    const p = bang[1] ? (bang[1].length === 3 ? 'urgent' : 'high') : PRIORITY_WORDS[norm(bang[2] ?? '')]
    if (p) {
      priority = p
      matched.priority = bang[0].trim()
      rest = rest.replace(bang[0], ' ')
    }
  }

  rest = rest.replace(/\s+/g, ' ').trim()
  const { due, rest: withoutDate } = skip.due ? { due: null, rest } : extractDue(rest, now)
  if (due) {
    matched.due = due
    rest = withoutDate.replace(TRAILING, '').trim()
  }

  return { title: rest, due, assigneeId: assigneeIds[0] ?? null, assigneeIds, priority, matched }
}
