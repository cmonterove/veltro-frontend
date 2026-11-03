import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import { api } from '@/lib/api/server'
import { ApiError } from '@/lib/api/shared'
import type { ApiWorkspace } from '@/lib/api/types'
import { toMeetingItemRow, toMeetingRow, type ApiMeetingDetail } from '@/lib/api/docs-reuniones'
import { requireAppContext } from '@/lib/session'
import { MeetingRoom } from '@/components/meeting/meeting-room'

// una sola llamada por petición (la usan generateMetadata y la página)
const load = cache(async (id: string) => {
  const ctx = await requireAppContext()
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const meeting = await api<ApiMeetingDetail>(`/v1/meetings/${id}`).catch((e) => {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) return null
    throw e
  })
  if (!meeting) notFound()
  if (!ctx.workspaces.some((w) => w.id === meeting.workspaceId)) {
    // de otra de mis cuentas: se cambia de cuenta y se vuelve acá
    const ws = await api<ApiWorkspace>(`/v1/workspaces/${meeting.workspaceId}`).catch(() => null)
    if (ws && ws.accountId !== ctx.account.id) redirect(`/auth/switch?account=${ws.accountId}&next=${encodeURIComponent(`/m/${id}`)}`)
    notFound()
  }
  return { meeting: toMeetingRow(meeting), items: meeting.items.map(toMeetingItemRow) }
})

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
