import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAppContext } from '@/lib/session'
import { MeetingRoom } from '@/components/meeting/meeting-room'
import type { MeetingItemRow, MeetingRow } from '@/lib/database.types'

async function load(id: string) {
  const ctx = await requireAppContext()
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const supabase = await createClient()
  const { data: meeting } = await supabase.from('meetings').select('*').eq('id', id).maybeSingle()
  if (!meeting) notFound()
  if (!ctx.workspaces.some((w) => w.id === meeting.workspace_id)) {
    const { data: ws } = await supabase.from('workspaces').select('account_id').eq('id', meeting.workspace_id).maybeSingle()
    if (ws) redirect(`/auth/switch?account=${ws.account_id}&next=${encodeURIComponent(`/m/${id}`)}`)
    notFound()
  }
  const { data: items } = await supabase.from('meeting_items').select('*').eq('meeting_id', id).order('position')
  return { meeting: meeting as MeetingRow, items: (items ?? []) as MeetingItemRow[] }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const { meeting } = await load(id)
  return { title: meeting.title }
}

export default async function MeetingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const { id } = await params
  const { view } = await searchParams
  const { meeting, items } = await load(id)
  const initialView = view === 'prep' || view === 'live' || view === 'closed' ? view : undefined
  return <MeetingRoom initialMeeting={meeting} initialItems={items} initialView={initialView} />
}
