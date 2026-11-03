'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowRight, Lightbulb } from 'lucide-react'
import { useMemberMap } from '@/components/app/app-context'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { DEMO } from '@/lib/demo/config'
import { useSupportPending, type PendingItem } from '@/lib/queries/support'
import { firstName } from '@/lib/support'
import { cn } from '@/lib/utils'
import { CountBadge, REQUEST_TONE, StatusPill, SupportIcon, TICKET_TONE, VeltroTile, useAgo } from './support-bits'
import { useSupportDialogs } from './support-dialogs'

/**
 * Soporte en Pulso, siempre a mano: reportar un problema o pedir una mejora sin salir de Pulso, y
 * lo que espera por mí (una respuesta sin leer, un ticket que me llegó, novedades de un pedido).
 */
export function SupportPulse() {
  const t = useTranslations('support')
  const { openTicket, openRequest, dialogs } = useSupportDialogs()
  const { data } = useSupportPending()
  if (DEMO) return null
  const items = data?.items ?? []
  return (
    <section aria-label={t('title')} className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-panel px-3 py-2">
      <Link href="/support" className="flex shrink-0 items-center gap-2 rounded-md text-sm font-medium text-fg hover:text-accent-ink">
        <SupportIcon className="size-4 text-accent-mid" aria-hidden />
        {t('title')}
        <CountBadge count={data?.count ?? 0} />
      </Link>
      <span className="hidden h-5 w-px shrink-0 bg-line sm:block" aria-hidden />
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-1 overflow-x-auto scrollbar-none">
        {items.length ? (
          items.slice(0, 2).map((p) => <PendingRow key={`${p.kind}-${p.ticket?.id ?? p.request?.id}`} p={p} />)
        ) : (
          <span className="truncate px-1 text-sm text-fg-muted">{data ? t('pulse.allClear') : ' '}</span>
        )}
        {items.length > 2 ? (
          <Link href="/support" className="inline-flex shrink-0 items-center gap-1 px-2 text-xs font-medium text-fg-muted hover:text-fg">
            {t('pulse.more', { count: items.length - 2 })}
            <ArrowRight className="size-3.5" />
          </Link>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="ghost" onClick={openTicket} className="text-fg">
          <SupportIcon className="text-accent-mid" />
          {t('report')}
        </Button>
        <Button size="sm" variant="ghost" onClick={openRequest} className="text-fg">
          <Lightbulb className="text-success" />
          {t('improve')}
        </Button>
      </div>
      {dialogs}
    </section>
  )
}

function PendingRow({ p }: { p: PendingItem }) {
  const t = useTranslations('support')
  const ago = useAgo()
  const memberMap = useMemberMap()
  let href: string
  let title: string
  let sub: string
  let pill: { label: string; tone: string }
  let leading: React.ReactNode
  if (p.kind === 'request' && p.request) {
    const r = p.request
    href = `/support/requests/${r.id}`
    title = r.title
    sub = t('pulse.request', { code: r.code })
    pill = { label: t(`requestStatus.${r.status}`), tone: REQUEST_TONE[r.status] }
    leading = <VeltroTile size={22} />
  } else if (p.ticket) {
    const x = p.ticket
    const last = x.lastMessage
    href = `/support/tickets/${x.id}`
    title = x.title
    pill = { label: t(`status.${x.status}`), tone: TICKET_TONE[x.status] }
    if (p.kind === 'reply') {
      sub = t('pulse.replied', { when: ago(last?.createdAt ?? x.lastMessageAt) })
      const author = last?.authorId ? memberMap.get(last.authorId) : undefined
      leading = last?.authorKind === 'veltro' || !last?.authorId ? <VeltroTile size={22} /> : <Avatar name={author?.full_name} src={author?.avatar_url} seed={last.authorId} size={22} />
    } else {
      const who = firstName(x.creator?.fullName) || t('someone')
      sub = x.status === 'open' && !p.unread ? t('pulse.incoming', { name: who, code: x.code }) : t('pulse.wrote', { name: who, when: ago(last?.createdAt ?? x.lastMessageAt) })
      leading = <Avatar name={x.creator?.fullName} src={x.creator?.avatarUrl} seed={x.createdBy} size={22} />
    }
  } else {
    return null
  }
  return (
    <Link href={href} className="flex min-w-0 max-w-[34rem] shrink items-center gap-2 rounded-lg px-2 py-1 hover:bg-hover">
      {leading}
      <span className={cn('min-w-0 truncate text-sm text-fg', p.unread ? 'font-semibold' : 'font-medium')}>{title}</span>
      <span className="shrink-0 text-sm text-fg-muted">· {sub}</span>
      <StatusPill label={pill.label} tone={pill.tone} />
    </Link>
  )
}
