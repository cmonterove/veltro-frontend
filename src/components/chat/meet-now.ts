'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { addMinutes } from 'date-fns'
import { toast } from 'sonner'
import { useApp, useMemberMap } from '@/components/app/app-context'
import { calendarKeys } from '@/lib/queries/calendar'
import { useChatMutations, type ChatSummary } from '@/lib/queries/chats'
import { DEMO } from '@/lib/demo/config'
import { track } from '@/lib/telemetry'
import type { MeetingInvite } from '@/lib/database.types'
import type { CalendarEvent } from '@/lib/types'
import { useChatName } from './chat-bits'

/** Lo que viaja en la tarjeta de invitación; quien invita ya va. */
export const inviteFrom = (e: Pick<CalendarEvent, 'title' | 'start' | 'end' | 'conferenceUrl' | 'id'>, userId: string): MeetingInvite => ({
  title: e.title,
  start: e.start,
  end: e.end,
  conferenceUrl: e.conferenceUrl,
  eventId: e.id,
  rsvp: { [userId]: 'yes' },
})

const MEET_MINUTES = 30

/**
 * Llamada de Meet al instante desde un chat: crea el evento (desde ahora, media hora) con su link,
 * invita a quienes están en el chat, lo avisa como tarjeta y abre Meet.
 */
export function useMeetNow(chat: ChatSummary) {
  const t = useTranslations('pasillo.meetNow')
  const { user, profile, google } = useApp()
  const memberMap = useMemberMap()
  const chatName = useChatName()
  const { send } = useChatMutations()
  const qc = useQueryClient()
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const start = async () => {
    if (pending) return
    if (!google) {
      toast(t('connect'), { action: { label: t('connectAction'), onClick: () => router.push('/settings/preferences#integrations') } })
      return
    }
    // la pestaña se abre dentro del clic para que el navegador no la bloquee; el link llega después.
    // En el demo el link es de mentira: no se abre nada.
    const tab = DEMO ? null : window.open('', '_blank')
    setPending(true)
    try {
      const others = chat.members.filter((m) => m.user_id !== user.id)
      const first = (id: string) => memberMap.get(id)?.full_name.split(' ')[0] ?? ''
      const title =
        chat.kind === 'group' || others.length !== 1
          ? t('titleGroup', { name: chatName(chat) })
          : t('titleDirect', { a: first(user.id), b: first(others[0].user_id) })
      const now = new Date()
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          start: now.toISOString(),
          end: addMinutes(now, MEET_MINUTES).toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || profile.timezone,
          attendees: others.flatMap((m) => memberMap.get(m.user_id)?.email ?? []),
          withMeet: true,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      const event = json.event as CalendarEvent
      qc.invalidateQueries({ queryKey: calendarKeys.all })
      send.mutate({ chatId: chat.id, kind: 'meeting', body: '', meta: { invite: inviteFrom(event, user.id) } })
      track('feature.chat_meet_now')

      const url = event.conferenceUrl
      if (tab && url) {
        tab.opener = null
        tab.location.href = url
      } else {
        tab?.close()
        toast.success(DEMO ? t('readyDemo') : t('ready'), url && !DEMO ? { action: { label: t('join'), onClick: () => window.open(url, '_blank', 'noopener,noreferrer') } } : undefined)
      }
    } catch {
      tab?.close()
      toast.error(t('error'))
    } finally {
      setPending(false)
    }
  }

  return { start, pending }
}
