import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt, encrypt } from '@/lib/crypto'
import { refreshAccessToken } from './oauth'
import type { CalendarEvent } from '@/lib/types'

const API = 'https://www.googleapis.com/calendar/v3'

export class GoogleNotConnectedError extends Error {
  constructor() {
    super('google_not_connected')
  }
}

export class GoogleAuthRevokedError extends Error {
  constructor() {
    super('google_auth_revoked')
  }
}

/** Devuelve un access token válido para el usuario, refrescándolo si hace falta. */
export async function getAccessToken(userId: string) {
  const admin = createAdminClient()
  const { data: conn } = await admin.from('google_connections').select('*').eq('user_id', userId).maybeSingle()
  if (!conn) throw new GoogleNotConnectedError()

  const expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at).getTime() : 0
  if (conn.access_token && expiresAt - Date.now() > 60_000) {
    return { token: decrypt(conn.access_token), connection: conn }
  }

  try {
    const fresh = await refreshAccessToken(decrypt(conn.refresh_token))
    await admin
      .from('google_connections')
      .update({
        access_token: encrypt(fresh.access_token),
        access_token_expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
        ...(fresh.refresh_token ? { refresh_token: encrypt(fresh.refresh_token) } : {}),
      })
      .eq('user_id', userId)
    return { token: fresh.access_token, connection: conn }
  } catch (e) {
    if ((e as { code?: string }).code === 'invalid_grant') {
      await admin.from('google_connections').delete().eq('user_id', userId)
      throw new GoogleAuthRevokedError()
    }
    throw e
  }
}

async function gfetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  })
  if (res.status === 401) throw new GoogleAuthRevokedError()
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`google_api_${res.status}: ${body.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

type GCalendarListEntry = {
  id: string
  summary: string
  summaryOverride?: string
  primary?: boolean
  backgroundColor?: string
  accessRole: string
}

export async function listCalendars(token: string) {
  const data = await gfetch<{ items: GCalendarListEntry[] }>(token, '/users/me/calendarList?minAccessRole=reader&maxResults=100')
  return data.items.map((c) => ({
    id: c.primary ? 'primary' : c.id,
    name: c.summaryOverride ?? c.summary,
    primary: Boolean(c.primary),
    color: c.backgroundColor ?? null,
    canWrite: c.accessRole === 'owner' || c.accessRole === 'writer',
  }))
}

type GEvent = {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  hangoutLink?: string
  colorId?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  attendees?: { email: string; displayName?: string; responseStatus?: string; self?: boolean; organizer?: boolean; resource?: boolean }[]
  conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] }
  eventType?: string
  recurringEventId?: string
}

function normalize(e: GEvent, calendarId: string, color: string | null): CalendarEvent {
  const allDay = Boolean(e.start.date && !e.start.dateTime)
  const video = e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri
  return {
    id: e.id,
    calendarId,
    title: e.summary ?? '',
    start: e.start.dateTime ?? `${e.start.date}T00:00:00`,
    end: e.end.dateTime ?? `${e.end.date}T00:00:00`,
    allDay,
    location: e.location ?? null,
    description: e.description ?? null,
    conferenceUrl: e.hangoutLink ?? video ?? null,
    htmlLink: e.htmlLink ?? null,
    attendees: (e.attendees ?? [])
      .filter((a) => !a.resource)
      .map((a) => ({
        email: a.email,
        name: a.displayName ?? null,
        responseStatus: a.responseStatus ?? null,
        self: Boolean(a.self),
        organizer: Boolean(a.organizer),
      })),
    color,
    status: e.status ?? null,
    seriesKey: e.recurringEventId ?? null,
    links: [],
  }
}

export async function listEvents(token: string, calendarIds: string[], timeMin: string, timeMax: string) {
  const calendars = await listCalendars(token).catch(() => [])
  const colorOf = new Map(calendars.map((c) => [c.id, c.color]))

  const results = await Promise.all(
    calendarIds.map(async (calendarId) => {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
      })
      try {
        const data = await gfetch<{ items: GEvent[] }>(token, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`)
        return data.items
          .filter((e) => e.status !== 'cancelled' && e.eventType !== 'workingLocation')
          .filter((e) => !(e.attendees ?? []).some((a) => a.self && a.responseStatus === 'declined'))
          .map((e) => normalize(e, calendarId, colorOf.get(calendarId) ?? null))
      } catch (e) {
        if (e instanceof GoogleAuthRevokedError) throw e
        return []
      }
    }),
  )

  return results.flat().sort((a, b) => a.start.localeCompare(b.start))
}

export type NewEventInput = {
  calendarId?: string
  title: string
  description?: string
  start: string
  end: string
  timeZone: string
  attendees: string[]
  withMeet: boolean
}

export async function createEvent(token: string, input: NewEventInput) {
  const calendarId = input.calendarId ?? 'primary'
  const body = {
    summary: input.title,
    description: input.description,
    start: { dateTime: input.start, timeZone: input.timeZone },
    end: { dateTime: input.end, timeZone: input.timeZone },
    attendees: input.attendees.map((email) => ({ email })),
    ...(input.withMeet
      ? { conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } } }
      : {}),
  }
  const created = await gfetch<GEvent>(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
    { method: 'POST', body: JSON.stringify(body) },
  )
  return normalize(created, calendarId, null)
}

export async function getEvent(token: string, calendarId: string, eventId: string) {
  const e = await gfetch<GEvent>(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`)
  return normalize(e, calendarId, null)
}
