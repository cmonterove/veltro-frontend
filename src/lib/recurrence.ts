import { addDays, addMonths, getDate, getDaysInMonth, isWeekend, parseISO, setDate, startOfMonth } from 'date-fns'
import type { RecurrenceFreq, TaskRecurrence } from '@/lib/database.types'
import { toDateKey } from '@/lib/dates'

/**
 * Tareas que se repiten: la misma cuenta que hace la base (recurrence_next) para mostrar la
 * próxima fecha antes de que exista. Mensual y anual respetan el día del mes elegido: el 31 cae el
 * último día de los meses cortos.
 */
export function nextOccurrence(from: string, rule: TaskRecurrence): string {
  const n = rule.interval ?? 1
  const d = parseISO(from)
  switch (rule.freq) {
    case 'daily':
      return toDateKey(addDays(d, n))
    case 'weekdays': {
      let x = addDays(d, 1)
      while (isWeekend(x)) x = addDays(x, 1)
      return toDateKey(x)
    }
    case 'weekly':
      return toDateKey(addDays(d, 7 * n))
    case 'monthly':
    case 'yearly': {
      const first = addMonths(startOfMonth(d), rule.freq === 'monthly' ? n : 12 * n)
      return toDateKey(setDate(first, Math.min(rule.day ?? getDate(d), getDaysInMonth(first))))
    }
  }
}

/** La que nace al terminarla: si se terminó tarde, la fecha avanza hasta hoy o después. */
export function nextAfterDone(due: string | null, rule: TaskRecurrence, today = toDateKey(new Date())): string {
  let next = nextOccurrence(due ?? today, rule)
  for (let i = 0; next < today && i < 1000; i++) next = nextOccurrence(next, rule)
  return next
}

/** Las opciones del menú «Repetir» (las más usadas; cubren casi todo). */
export const RECURRENCE_PRESETS: { key: string; rule: TaskRecurrence }[] = [
  { key: 'daily', rule: { freq: 'daily', interval: 1 } },
  { key: 'weekdays', rule: { freq: 'weekdays', interval: 1 } },
  { key: 'weekly', rule: { freq: 'weekly', interval: 1 } },
  { key: 'biweekly', rule: { freq: 'weekly', interval: 2 } },
  { key: 'monthly', rule: { freq: 'monthly', interval: 1 } },
  { key: 'quarterly', rule: { freq: 'monthly', interval: 3 } },
  { key: 'yearly', rule: { freq: 'yearly', interval: 1 } },
]

/** La clave de traducción de una regla (tasks.recurrence.*), con su número si no es una opción fija. */
export function recurrenceKey(rule: TaskRecurrence): { key: string; count?: number } {
  const n = rule.interval ?? 1
  const preset = RECURRENCE_PRESETS.find((p) => p.rule.freq === rule.freq && (p.rule.interval ?? 1) === n)
  if (preset) return { key: preset.key }
  const unit: Record<RecurrenceFreq, string> = { daily: 'everyNDays', weekdays: 'weekdays', weekly: 'everyNWeeks', monthly: 'everyNMonths', yearly: 'everyNYears' }
  return { key: unit[rule.freq], count: n }
}

export const sameRule = (a: TaskRecurrence | null | undefined, b: TaskRecurrence | null | undefined) =>
  (a?.freq ?? null) === (b?.freq ?? null) && (a?.interval ?? 1) === (b?.interval ?? 1)
