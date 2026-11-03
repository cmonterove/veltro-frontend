'use server'

import { revalidatePath } from 'next/cache'
import { getLocale } from 'next-intl/server'
import { api } from '@/lib/api/server'
import { getAppContext } from '@/lib/session'
import type { ApiMeeting, ApiMeetingClose } from '@/lib/api/docs-reuniones'
import type { CalendarEvent } from '@/lib/types'
import { toErrorCode } from '@/lib/errors'

const fail = (e: unknown) => ({ ok: false as const, error: toErrorCode(e as { message?: string }) })

/**
 * Enlaza un evento de Google Calendar a un espacio y devuelve la reunión de Veltro.
 * La API lee el evento de Google (no se fía de lo que manda el navegador) y, si ya estaba
 * enlazado en ese espacio, devuelve la que existe.
 */
export async function openMeeting(input: {
  event: CalendarEvent
  workspaceId: string
}): Promise<{ ok: true; meetingId: string } | { ok: false; error: string }> {
  try {
    const m = await api<ApiMeeting>(`/v1/workspaces/${input.workspaceId}/meetings`, {
      method: 'POST',
      body: { googleEventId: input.event.id, calendarId: input.event.calendarId || 'primary' },
    })
    return { ok: true, meetingId: m.id }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Cierra la reunión en la API: las acciones pasan a tareas, se escriben el resumen y el correo
 * de seguimiento, y el acta queda como doc en la memoria del espacio.
 */
export async function closeMeeting(
  meetingId: string,
): Promise<{ ok: true; tasksCreated: number; docId: string | null } | { ok: false; error: string }> {
  try {
    const res = await api<ApiMeetingClose>(`/v1/meetings/${meetingId}/close`, { method: 'POST', body: { locale: await getLocale() } })
    revalidatePath(`/m/${meetingId}`)
    return { ok: true, tasksCreated: res.tasksCreated, docId: res.docId }
  } catch (e) {
    return fail(e)
  }
}

export async function unlinkMeeting(meetingId: string) {
  try {
    await api(`/v1/meetings/${meetingId}`, { method: 'DELETE' })
    return { ok: true as const }
  } catch (e) {
    return fail(e)
  }
}

/** Compatibilidad: abre la reunión y devuelve su id (antes creaba el doc de notas). */
export async function openMeetingNotes(input: { event: CalendarEvent; workspaceId: string }) {
  const res = await openMeeting(input)
  if (!res.ok) return res
  const ctx = await getAppContext()
  const slug = ctx.status === 'ready' ? (ctx.ctx.workspaces.find((w) => w.id === input.workspaceId)?.slug ?? '') : ''
  return { ok: true as const, meetingId: res.meetingId, workspaceSlug: slug, docId: null as string | null }
}
