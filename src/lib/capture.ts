// Parser de la captura rápida en reuniones.
//   "-> Ana cierra el presupuesto hoy"  → acción, fecha hoy
//   "<> Priorizar Farmatodo"            → decisión
//   "?? ¿Polar acepta compartir?"       → pregunta
// Las menciones @persona se resuelven en el componente (necesitan la lista de personas).

import { addDays, nextDay, type Day } from 'date-fns'
import { toDateKey } from './dates'
import type { MeetingItemKind } from './database.types'

const PREFIXES: [RegExp, MeetingItemKind][] = [
  [/^\s*(->|→|>>)\s*/, 'action'],
  [/^\s*(<>|◆|!!)\s*/, 'decision'],
  [/^\s*(\?\?)\s*/, 'question'],
]

export function detectKind(text: string): { kind: MeetingItemKind | null; rest: string } {
  for (const [re, kind] of PREFIXES) {
    const m = text.match(re)
    if (m) return { kind, rest: text.slice(m[0].length) }
  }
  return { kind: null, rest: text }
}

const WEEKDAYS: Record<string, Day> = {
  dom: 0, domingo: 0, sun: 0, sunday: 0, dim: 0, dimanche: 0,
  lun: 1, lunes: 1, mon: 1, monday: 1, seg: 1, segunda: 1, lundi: 1,
  mar: 2, martes: 2, tue: 2, tuesday: 2, ter: 2, terca: 2, mardi: 2,
  mie: 3, miercoles: 3, wed: 3, wednesday: 3, qua: 3, quarta: 3, mer: 3, mercredi: 3,
  jue: 4, jueves: 4, thu: 4, thursday: 4, qui: 4, quinta: 4, jeu: 4, jeudi: 4,
  vie: 5, viernes: 5, fri: 5, friday: 5, sex: 5, sexta: 5, ven: 5, vendredi: 5,
  sab: 6, sabado: 6, sat: 6, saturday: 6, sam: 6, samedi: 6,
}

const TODAY = new Set(['hoy', 'today', 'hoje', 'aujourdhui'])
const TOMORROW = new Set(['manana', 'tomorrow', 'amanha', 'demain'])

const norm = (w: string) =>
  w
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')

/** Busca una fecha relativa al final del texto ("hoy", "mañana", "vie") y la quita. */
export function extractDue(text: string, now = new Date()): { due: string | null; rest: string } {
  const words = text.trim().split(/\s+/)
  for (let i = words.length - 1; i >= Math.max(0, words.length - 2); i--) {
    const w = norm(words[i])
    let date: Date | null = null
    if (TODAY.has(w)) date = now
    else if (TOMORROW.has(w)) date = addDays(now, 1)
    else if (w in WEEKDAYS) date = nextDay(now, WEEKDAYS[w])
    if (date) {
      const rest = [...words.slice(0, i), ...words.slice(i + 1)].join(' ').trim()
      return { due: toDateKey(date), rest }
    }
  }
  return { due: null, rest: text.trim() }
}

/** Token @ activo junto al cursor (para sugerir personas). */
export function activeMention(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret)
  const m = before.match(/(?:^|\s)@([\p{L}]*)$/u)
  if (!m) return null
  return { query: m[1], start: caret - m[1].length - 1 }
}
