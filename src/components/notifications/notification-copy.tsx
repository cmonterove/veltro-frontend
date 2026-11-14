'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { format, parseISO, type Locale } from 'date-fns'
import type { AppNotification } from '@/lib/queries/notifications'
import { useDateLocale } from '@/lib/dates'

/** Lo que dice un aviso, en texto plano (avisos del escritorio y toasts): título y detalle. */
export function useNotificationCopy() {
  const t = useTranslations('notifications')
  const locale = useDateLocale()
  return useCallback(
    (n: AppNotification) => {
      const title = t.markup(`kinds.${n.kind}`, { ...vars(n, t, locale), b: (c) => c })
      const excerpt = n.comment?.excerpt ?? n.message?.excerpt ?? ''
      const body = [n.task ? `${n.task.ref} · ${n.task.title}` : '', n.request ? `${n.request.code} · ${n.request.title}` : '', excerpt ? `“${excerpt}”` : '']
        .filter(Boolean)
        .join('\n')
      return { title, body }
    },
    [t, locale],
  )
}

/** Las variables de cada tipo de aviso (quién, en qué chat, cuántos comentarios). */
export function vars(n: AppNotification, t: (k: 'someone' | 'directChat' | 'noDate') => string, locale?: Locale) {
  const to = typeof n.data?.to === 'string' ? n.data.to : null
  return {
    actor: n.actor?.fullName ?? t('someone'),
    chat: n.chat ? (n.chat.kind === 'group' ? (n.chat.name ?? '') : t('directChat')) : '',
    count: n.count,
    // la fecha nueva (cambió la entrega); sin fecha, «sin fecha»
    date: n.kind === 'task_due_changed' ? (to ? format(parseISO(to), 'EEE d MMM', { locale }) : t('noDate')) : '',
    // la que se terminó y la liberó
    ref: typeof n.data?.byRef === 'string' ? n.data.byRef : '',
    // solicitudes: el departamento y el estado nuevo (la traducción del estado la pone quien llama)
    department: n.request?.department ?? '',
    status: typeof n.data?.to === 'string' && n.kind === 'request_status' ? n.data.to : '',
    forwarded: n.data?.forwarded === true ? 'yes' : 'no',
    assigned: n.data?.assigned === true ? 'yes' : 'no',
    side: n.data?.side === 'requester' ? 'requester' : 'department',
  }
}
