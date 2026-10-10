import { NextResponse, type NextRequest } from 'next/server'
import { getUser } from '@/lib/session'
import { getAccessToken, listCalendars } from '@/lib/google/calendar'
import { createAdminClient } from '@/lib/supabase/admin'
import { googleErrorResponse } from '../_shared'
import { DEMO } from '@/lib/demo/config'
import { listDemoCalendars, setDemoSelectedCalendars } from '@/lib/demo/calendar'

export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (DEMO) return NextResponse.json(listDemoCalendars())
  try {
    const { token, connection } = await getAccessToken(user.id)
    const calendars = await listCalendars(token)
    return NextResponse.json({ calendars, selected: connection.selected_calendar_ids })
  } catch (e) {
    return googleErrorResponse(e)
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { selected?: unknown } | null
  const selected = Array.isArray(body?.selected)
    ? body!.selected.filter((x): x is string => typeof x === 'string').slice(0, 30)
    : null
  if (!selected || selected.length === 0) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  if (DEMO) {
    setDemoSelectedCalendars(selected)
    return NextResponse.json({ ok: true, selected })
  }

  const { error } = await createAdminClient()
    .from('google_connections')
    .update({ selected_calendar_ids: selected })
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  return NextResponse.json({ ok: true, selected })
}
