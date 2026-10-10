import { NextResponse, type NextRequest } from 'next/server'
import { getUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createEvent, getAccessToken, listEvents } from '@/lib/google/calendar'
import type { CalendarEvent } from '@/lib/types'
import { googleErrorResponse } from '../_shared'
import { DEMO } from '@/lib/demo/config'
import { createDemoEvent, listDemoEvents } from '@/lib/demo/calendar'

const MAX_RANGE_MS = 1000 * 60 * 60 * 24 * 62

/** Agrega a cada evento las reuniones de Veltro enlazadas (respetando RLS). */
async function attachLinks(events: CalendarEvent[]) {
  if (events.length === 0) return events
  const supabase = await createClient()
  const ids = [...new Set(events.map((e) => e.id))]
  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, workspace_id, google_event_id, phase')
    .in('google_event_id', ids)
  if (!meetings?.length) return events

  const { data: docs } = await supabase
    .from('docs')
    .select('id, meeting_id')
    .in('meeting_id', meetings.map((m) => m.id))
    .eq('source', 'meeting')
    .is('archived_at', null)

  const docByMeeting = new Map((docs ?? []).map((d) => [d.meeting_id, d.id]))
  return events.map((e) => ({
    ...e,
    links: meetings
      .filter((m) => m.google_event_id === e.id)
      .map((m) => ({ meetingId: m.id, workspaceId: m.workspace_id, docId: docByMeeting.get(m.id) ?? null, phase: m.phase })),
  }))
}

export async function GET(request: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const from = request.nextUrl.searchParams.get('from')
  const to = request.nextUrl.searchParams.get('to')
  const start = from ? new Date(from) : null
  const end = to ? new Date(to) : null
  if (!start || !end || isNaN(+start) || isNaN(+end) || end <= start || +end - +start > MAX_RANGE_MS) {
    return NextResponse.json({ error: 'invalid_range' }, { status: 400 })
  }

  if (DEMO) {
    const events = listDemoEvents(start, end)
    if (!events) return NextResponse.json({ error: 'google_not_connected' }, { status: 409 })
    return NextResponse.json({ events: await attachLinks(events) })
  }

  try {
    const { token, connection } = await getAccessToken(user.id)
    const events = await listEvents(token, connection.selected_calendar_ids, start.toISOString(), end.toISOString())
    return NextResponse.json({ events: await attachLinks(events) })
  } catch (e) {
    return googleErrorResponse(e)
  }
}

export async function POST(request: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 300) : ''
  const start = typeof body?.start === 'string' ? body.start : ''
  const end = typeof body?.end === 'string' ? body.end : ''
  const timeZone = typeof body?.timeZone === 'string' ? body.timeZone : 'UTC'
  const attendees = Array.isArray(body?.attendees)
    ? body!.attendees.filter((a): a is string => typeof a === 'string' && /.+@.+\..+/.test(a)).slice(0, 50)
    : []
  if (!title || isNaN(Date.parse(start)) || isNaN(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }

  if (DEMO) {
    const event = createDemoEvent({ title, start, end, attendees, withMeet: body?.withMeet !== false })
    return NextResponse.json({ event })
  }

  try {
    const { token } = await getAccessToken(user.id)
    const event = await createEvent(token, {
      title,
      description: typeof body?.description === 'string' ? body.description.slice(0, 5000) : undefined,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      timeZone,
      attendees,
      withMeet: body?.withMeet !== false,
    })
    return NextResponse.json({ event })
  } catch (e) {
    return googleErrorResponse(e)
  }
}
