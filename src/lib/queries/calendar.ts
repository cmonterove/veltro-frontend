'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api/client'
import { toCalendarEvent, toCalendars, type ApiCalendar, type ApiCalendarEvent, type NewCalendarEvent } from '@/lib/api/integraciones'
import type { CalendarEvent } from '@/lib/types'

// Google Calendar por la API (/v1/calendar/events, /v1/integrations/google/*): la API es la única
// dueña de la conexión y de los tokens de Google.

export class CalendarError extends Error {
  constructor(public code: string) {
    super(code)
  }
}

/** Los errores de la API como CalendarError con su código (google_not_connected, google_auth_revoked…). */
async function calendarCall<T>(p: Promise<T>) {
  try {
    return await p
  } catch (e) {
    throw new CalendarError(e instanceof ApiError ? e.code : 'google_error')
  }
}

export const calendarKeys = {
  all: ['calendar'] as const,
  range: (from: string, to: string) => ['calendar', 'events', from, to] as const,
  calendars: ['calendar', 'calendars'] as const,
}

export function useCalendarEvents(from: Date, to: Date, enabled = true) {
  const f = from.toISOString()
  const t = to.toISOString()
  return useQuery({
    queryKey: calendarKeys.range(f, t),
    enabled,
    staleTime: 60_000,
    retry: (count, error) => !(error instanceof CalendarError) && count < 1,
    queryFn: async () => {
      const { items } = await calendarCall(api<{ items: ApiCalendarEvent[] }>('/v1/calendar/events', { query: { from: f, to: t } }))
      return items.map(toCalendarEvent)
    },
  })
}

export function useCalendars(enabled = true) {
  return useQuery({
    queryKey: calendarKeys.calendars,
    enabled,
    retry: (count, error) => !(error instanceof CalendarError) && count < 1,
    queryFn: async () => toCalendars((await calendarCall(api<{ items: ApiCalendar[] }>('/v1/integrations/google/calendars'))).items),
  })
}

/** Elige qué calendarios se muestran (al menos uno). */
export function saveSelectedCalendars(ids: string[]) {
  return api<{ selectedCalendarIds: string[] }>('/v1/integrations/google/calendars', { method: 'PUT', body: { ids } })
}

/** Crea el evento en el calendario principal (Google envía las invitaciones) y, si se pide, con Meet. */
export async function createCalendarEvent(input: NewCalendarEvent): Promise<CalendarEvent> {
  const { event } = await api<{ event: ApiCalendarEvent }>('/v1/calendar/events', { method: 'POST', body: input })
  return toCalendarEvent(event)
}

/** Desconecta Google Calendar: la API revoca el permiso en Google y borra la conexión. */
export function disconnectGoogle() {
  return api<{ ok: true }>('/v1/integrations/google', { method: 'DELETE' })
}

export function useInvalidateCalendar() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: calendarKeys.all })
}
