// Generador determinístico de eventos "de Google Calendar" para el modo demo.
// Puro (sin estado): lo usan el seed (para enlazar reuniones) y /api/calendar/events.

import { addDays, addMinutes, format, isWeekend, startOfDay } from 'date-fns'
import type { CalendarEvent } from '@/lib/types'

export const PEOPLE = {
  cesar: { email: 'cesar@veltro.demo', name: 'Cesar Montero' },
  ana: { email: 'ana@veltro.demo', name: 'Ana Díaz' },
  pepito: { email: 'pepito@veltro.demo', name: 'Pepito Pérez' },
  lucia: { email: 'lucia@veltro.demo', name: 'Lucía Fernández' },
  diego: { email: 'diego@veltro.demo', name: 'Diego Ramírez' },
  maria: { email: 'maria.gonzalez@polar.example', name: 'María González' },
  jose: { email: 'jose.rojas@polar.example', name: 'José Rojas' },
} as const

type Person = (typeof PEOPLE)[keyof typeof PEOPLE]

export const DEMO_CALENDARS = [
  { id: 'primary', name: 'Cesar Montero', primary: true, color: '#33b679', canWrite: true },
  { id: 'team', name: 'Equipo Promoting', primary: false, color: '#4285f4', canWrite: true },
  { id: 'feriados', name: 'Feriados en Venezuela', primary: false, color: '#8e24aa', canWrite: false },
]

type Def = {
  slug: string
  title: string
  weekdays: number[] // 1 = lunes ... 5 = viernes
  start?: string
  minutes?: number
  allDay?: boolean
  meet: boolean
  calendarId: string
  location?: string
  description?: string
  attendees: Person[]
}

export const RECURRING: Def[] = [
  {
    slug: 'daily',
    title: 'Daily Promoting',
    weekdays: [1, 2, 3, 4, 5],
    start: '09:30',
    minutes: 15,
    meet: true,
    calendarId: 'team',
    description: 'Qué hice ayer, qué haré hoy, bloqueos.',
    attendees: [PEOPLE.cesar, PEOPLE.ana, PEOPLE.pepito],
  },
  {
    slug: 'plan-tm',
    title: 'Planificación semanal Trade Marketing',
    weekdays: [1],
    start: '11:00',
    minutes: 60,
    meet: true,
    calendarId: 'team',
    attendees: [PEOPLE.cesar, PEOPLE.lucia, PEOPLE.pepito],
  },
  {
    slug: 'polar',
    title: 'Revisión de campaña con Polar',
    weekdays: [2],
    start: '15:00',
    minutes: 60,
    meet: true,
    calendarId: 'primary',
    description: '<b>Agenda</b><br>1. Resultados de la activación<br>2. Exhibiciones en cadenas<br>3. Próximos pasos',
    attendees: [PEOPLE.cesar, PEOPLE.lucia, PEOPLE.maria, PEOPLE.jose],
  },
  {
    slug: 'one-on-one',
    title: '1:1 Ana y Cesar',
    weekdays: [3],
    start: '10:00',
    minutes: 30,
    meet: true,
    calendarId: 'primary',
    attendees: [PEOPLE.cesar, PEOPLE.ana],
  },
  {
    slug: 'demo-tech',
    title: 'Demo Tech Ve: dashboard de campañas',
    weekdays: [3],
    start: '16:00',
    minutes: 60,
    meet: true,
    calendarId: 'team',
    attendees: [PEOPLE.cesar, PEOPLE.diego, PEOPLE.ana],
  },
  {
    slug: 'proveedor',
    title: 'Almuerzo con proveedor de material POP',
    weekdays: [4],
    start: '12:30',
    minutes: 90,
    meet: false,
    calendarId: 'primary',
    location: 'Restaurante El Tinajero, Caracas',
    attendees: [PEOPLE.cesar],
  },
  {
    slug: 'kickoff-q4',
    title: 'Kickoff promociones Q4',
    weekdays: [4],
    start: '15:30',
    minutes: 60,
    meet: true,
    calendarId: 'team',
    attendees: [PEOPLE.cesar, PEOPLE.ana, PEOPLE.pepito, PEOPLE.lucia, PEOPLE.diego],
  },
  {
    slug: 'retro',
    title: 'Retro del sprint Tech Ve',
    weekdays: [5],
    start: '14:00',
    minutes: 45,
    meet: true,
    calendarId: 'team',
    attendees: [PEOPLE.cesar, PEOPLE.diego],
  },
  {
    slug: 'reportes',
    title: 'Entrega de reportes semanales',
    weekdays: [5],
    allDay: true,
    meet: false,
    calendarId: 'primary',
    attendees: [],
  },
]

const dayKey = (d: Date) => format(d, 'yyyyMMdd')

function attendees(list: Person[]) {
  return list.map((p, i) => ({
    email: p.email,
    name: p.name,
    responseStatus: 'accepted',
    self: p.email === PEOPLE.cesar.email,
    organizer: i === 0,
  }))
}

function meetUrl(seed: string) {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const a = 'abcdefghijkmnopqrstuvwxyz'
  const pick = (n: number) => Array.from({ length: n }, (_, i) => a[(h >> (i * 3)) % a.length]).join('')
  return `https://meet.google.com/${pick(3)}-${pick(4)}-${pick(3)}`
}

export function eventId(slug: string, day: Date) {
  return `${slug}_${dayKey(day)}`
}

export function buildEvent(def: Def, day: Date): CalendarEvent {
  const id = eventId(def.slug, day)
  let start: Date
  let end: Date
  if (def.allDay) {
    start = startOfDay(day)
    end = addDays(start, 1)
  } else {
    const [h, m] = def.start!.split(':').map(Number)
    start = new Date(day)
    start.setHours(h, m, 0, 0)
    end = addMinutes(start, def.minutes!)
  }
  return {
    id,
    calendarId: def.calendarId,
    title: def.title,
    start: def.allDay ? `${format(start, 'yyyy-MM-dd')}T00:00:00` : start.toISOString(),
    end: def.allDay ? `${format(end, 'yyyy-MM-dd')}T00:00:00` : end.toISOString(),
    allDay: Boolean(def.allDay),
    location: def.location ?? null,
    description: def.description ?? null,
    conferenceUrl: def.meet ? meetUrl(id) : null,
    htmlLink: null,
    attendees: attendees(def.attendees),
    color: null,
    status: 'confirmed',
    seriesKey: def.slug,
    links: [],
  }
}

/** Eventos del día en que se generó la demo, relativos a la hora: uno ya cerrado, uno en curso y dos próximos. */
export function anchorEvents(anchor: Date): CalendarEvent[] {
  const nextHour = new Date(anchor)
  nextHour.setMinutes(0, 0, 0)
  nextHour.setHours(nextHour.getHours() + 1)
  const mk = (slug: string, title: string, s: Date, minutes: number, people: Person[], calendarId = 'primary'): CalendarEvent => {
    const id = `${slug}_${dayKey(anchor)}`
    return {
      id,
      calendarId,
      title,
      start: s.toISOString(),
      end: addMinutes(s, minutes).toISOString(),
      allDay: false,
      location: null,
      description: null,
      conferenceUrl: meetUrl(id),
      htmlLink: null,
      attendees: attendees(people),
      color: null,
      status: 'confirmed',
      seriesKey: slug,
      links: [],
    }
  }
  return [
    mk('presupuesto-pop', 'Revisión de presupuesto POP', addMinutes(anchor, -150), 45, [PEOPLE.cesar, PEOPLE.ana]),
    mk('revision-pendientes', 'Revisión rápida de pendientes', addMinutes(anchor, -10), 45, [PEOPLE.cesar, PEOPLE.ana]),
    mk('sync-diego', 'Sync con Diego: integración de calendario', nextHour, 30, [PEOPLE.cesar, PEOPLE.diego], 'team'),
    mk('prep-polar', 'Preparar propuesta para Polar', addMinutes(nextHour, 120), 45, [PEOPLE.cesar, PEOPLE.lucia, PEOPLE.pepito], 'team'),
  ]
}

export function demoEventsBetween(from: Date, to: Date, anchor: Date, extra: CalendarEvent[] = []) {
  const out: CalendarEvent[] = []
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) {
    if (dayKey(d) === dayKey(anchor)) out.push(...anchorEvents(anchor))
    if (isWeekend(d)) continue
    const weekday = d.getDay()
    for (const def of RECURRING) if (def.weekdays.includes(weekday)) out.push(buildEvent(def, d))
  }
  out.push(...extra)
  return out
    .filter((e) => new Date(e.end) > from && new Date(e.start) < to)
    .sort((a, b) => a.start.localeCompare(b.start))
}

/** Última ocurrencia (terminada) de un evento recurrente antes de `anchor`. */
export function lastOccurrence(slug: string, anchor: Date) {
  const def = RECURRING.find((d) => d.slug === slug)!
  for (let i = 0; i < 14; i++) {
    const day = addDays(startOfDay(anchor), -i)
    if (isWeekend(day) || !def.weekdays.includes(day.getDay())) continue
    const ev = buildEvent(def, day)
    if (new Date(ev.end) <= anchor) return ev
  }
  return buildEvent(def, addDays(anchor, -7))
}

/** Próxima ocurrencia (aún no empezada) de un evento recurrente después de `anchor`. */
export function nextOccurrence(slug: string, anchor: Date) {
  const def = RECURRING.find((d) => d.slug === slug)!
  for (let i = 0; i < 14; i++) {
    const day = addDays(startOfDay(anchor), i)
    if (isWeekend(day) || !def.weekdays.includes(day.getDay())) continue
    const ev = buildEvent(def, day)
    if (new Date(ev.start) > anchor) return ev
  }
  return buildEvent(def, addDays(anchor, 7))
}
