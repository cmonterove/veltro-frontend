'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { CalendarEvent } from '@/lib/types'

export class CalendarError extends Error {
  constructor(public code: string) {
    super(code)
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
      const res = await fetch(`/api/calendar/events?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`)
      const json = await res.json()
      if (!res.ok) throw new CalendarError(json.error ?? 'google_error')
      return json.events as CalendarEvent[]
    },
  })
}

export function useCalendars(enabled = true) {
  return useQuery({
    queryKey: calendarKeys.calendars,
    enabled,
    queryFn: async () => {
      const res = await fetch('/api/calendar/calendars')
      const json = await res.json()
      if (!res.ok) throw new CalendarError(json.error ?? 'google_error')
      return json as {
        calendars: { id: string; name: string; primary: boolean; color: string | null; canWrite: boolean }[]
        selected: string[]
      }
    },
  })
}

export function useInvalidateCalendar() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: calendarKeys.all })
}
