/**
 * Google Calendar y búsqueda (⌘K): formas de la API (veltro-backend) y su paso a
 * lo que ya usan las pantallas. Sirve en servidor y navegador (sin next/headers).
 */

import type { CalendarEvent } from '@/lib/types'

// ---------- Google Calendar ----------

export type ApiGoogleStatus = {
  configured: boolean
  connected: boolean
  email: string | null
  selectedCalendarIds: string[]
  connectedAt: string | null
}

export type ApiCalendar = { id: string; name: string; primary: boolean; color: string | null; canWrite: boolean; selected: boolean }

export type ApiCalendarEvent = Omit<CalendarEvent, 'links'> & {
  links: { meetingId: string; workspaceId: string; phase: 'prep' | 'live' | 'closed'; docId: string | null }[]
}

/** Lo que devuelve POST /v1/integrations/google/connect: a dónde ir y el secreto que se queda en el navegador. */
export type ApiGoogleConnect = { url: string; binding: string; expiresIn: number }

export type NewCalendarEvent = {
  title: string
  start: string
  end: string
  timeZone: string
  attendees: string[]
  withMeet: boolean
  description?: string
  calendarId?: string
}

/**
 * La API manda los eventos de día completo a medianoche UTC (`…T00:00:00Z`); la web los trata como
 * fecha local (sin zona), así que se quita la Z para que no caigan el día anterior.
 */
export function toCalendarEvent(e: ApiCalendarEvent): CalendarEvent {
  const local = (v: string) => (e.allDay ? v.replace(/Z$/, '') : v)
  return { ...e, start: local(e.start), end: local(e.end), links: e.links.map((l) => ({ meetingId: l.meetingId, workspaceId: l.workspaceId, docId: l.docId, phase: l.phase })) }
}

/** Calendarios en la forma de antes: la lista y cuáles se muestran. */
export function toCalendars(items: ApiCalendar[]) {
  return {
    calendars: items.map(({ id, name, primary, color, canWrite }) => ({ id, name, primary, color, canWrite })),
    selected: items.filter((c) => c.selected).map((c) => c.id),
  }
}

/**
 * Motivo de `?google=` al volver de conectar (los textos están en settings.integrations.errors).
 * Los códigos de la API llegan con prefijo `google_`; los demás (invalid_state, state_used…) tal cual.
 */
export function googleReason(code: string) {
  const c = code.replace(/^google_/, '')
  return c === 'missing_scopes' ? 'missing_scope' : c
}

// ---------- Búsqueda (⌘K) ----------

export type ApiSearchResults = {
  tasks: { id: string; ref: string; title: string; status: string; workspaceId: string }[]
  docs: { id: string; title: string; excerpt: string | null; source: string; workspaceId: string }[]
  meetings: { id: string; title: string; startsAt: string; phase: string; workspaceId: string }[]
  decisions: { id: string; text: string; meetingId: string; meetingTitle: string; workspaceId: string }[]
  attachments: { id: string; name: string; kind: string; mimeType: string | null; workspaceId: string }[]
}

/** Número de la tarea a partir de su referencia (`PRO-12` → 12). */
export function refNumber(ref: string) {
  return Number(ref.slice(ref.lastIndexOf('-') + 1))
}
