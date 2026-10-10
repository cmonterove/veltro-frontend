import 'server-only'
import { addMinutes } from 'date-fns'
import type { CalendarEvent } from '@/lib/types'
import { store, persist } from './engine'
import { DEMO_CALENDARS, demoEventsBetween, PEOPLE } from './calendar-gen'

export function listDemoCalendars() {
  const conn = store().tables.google_connections[0]
  return { calendars: DEMO_CALENDARS, selected: (conn?.selected_calendar_ids as string[]) ?? ['primary'] }
}

export function setDemoSelectedCalendars(selected: string[]) {
  const conn = store().tables.google_connections[0]
  if (conn) conn.selected_calendar_ids = selected
  persist()
}

export function listDemoEvents(from: Date, to: Date) {
  const s = store()
  const { selected } = listDemoCalendars()
  if (!s.tables.google_connections.length) return null
  return demoEventsBetween(from, to, new Date(s.anchor), s.events).filter((e) => selected.includes(e.calendarId))
}

export function createDemoEvent(input: { title: string; start: string; end: string; attendees: string[]; withMeet: boolean; description?: string }) {
  const id = `nuevo_${crypto.randomUUID().slice(0, 8)}`
  const event: CalendarEvent = {
    id,
    calendarId: 'primary',
    title: input.title,
    start: new Date(input.start).toISOString(),
    end: new Date(input.end ?? addMinutes(new Date(input.start), 30)).toISOString(),
    allDay: false,
    location: null,
    description: input.description ?? null,
    conferenceUrl: input.withMeet ? `https://meet.google.com/new-${id.slice(-3)}-demo` : null,
    htmlLink: null,
    attendees: [
      { email: PEOPLE.cesar.email, name: PEOPLE.cesar.name, responseStatus: 'accepted', self: true, organizer: true },
      ...input.attendees.map((email) => ({ email, name: null, responseStatus: 'needsAction', self: false, organizer: false })),
    ],
    color: null,
    status: 'confirmed',
    seriesKey: null,
    links: [],
  }
  store().events.push(event)
  persist()
  return event
}

export function connectDemoGoogle(connected: boolean) {
  const s = store()
  if (connected && !s.tables.google_connections.length) {
    const now = new Date().toISOString()
    s.tables.google_connections.push({
      user_id: s.tables.accounts[0]?.owner_id,
      google_email: PEOPLE.cesar.email,
      refresh_token: 'demo',
      access_token: null,
      access_token_expires_at: null,
      scopes: [],
      selected_calendar_ids: ['primary', 'team'],
      created_at: now,
      updated_at: now,
    })
  }
  if (!connected) s.tables.google_connections = []
  persist()
}
