'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowRight, MessagesSquare } from 'lucide-react'
import { useApp, useMemberMap } from '@/components/app/app-context'
import { ChatAvatar, useChatName } from '@/components/chat/chat-bits'
import { useChats } from '@/lib/queries/chats'

/**
 * Lo que te escribieron en Pasillo y todavía no leíste: una franja en Pulso con quién y qué, que
 * desaparece cuando estás al día.
 */
export function PasilloStrip() {
  const t = useTranslations('pulse.pasillo')
  const tp = useTranslations('pasillo')
  const { user } = useApp()
  const memberMap = useMemberMap()
  const chatName = useChatName()
  const { data: chats } = useChats()
  const unread = (chats ?? []).filter((c) => c.unread > 0)
  if (!unread.length) return null
  const total = unread.reduce((n, c) => n + c.unread, 0)
  return (
    <div className="flex items-center gap-3 overflow-hidden rounded-xl border border-line bg-panel px-3 py-2">
      <span className="flex shrink-0 items-center gap-2 text-sm font-medium text-fg">
        <MessagesSquare className="size-4 text-accent-mid" />
        {t('unread', { count: total })}
      </span>
      <span className="h-5 w-px shrink-0 bg-line" aria-hidden />
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none">
        {unread.slice(0, 3).map((c) => {
          const who = c.last?.user_id === user.id ? tp('you') : memberMap.get(c.last?.user_id ?? '')?.full_name.split(' ')[0]
          const last = c.last
          const what = !last
            ? ''
            : last.kind === 'meeting'
              ? tp('preview.meeting', { title: last.meta.invite?.title ?? '' })
              : last.kind === 'text' || last.body
                ? last.body
                : tp(`preview.${last.kind}`)
          return (
            <Link key={c.id} href={`/chat/${c.id}`} className="flex min-w-0 max-w-80 shrink-0 items-center gap-2 rounded-lg px-2 py-1 hover:bg-hover">
              <ChatAvatar chat={c} size={22} />
              <span className="min-w-0 truncate text-sm">
                <span className="font-medium text-fg">{chatName(c)}</span>
                <span className="text-fg-muted">
                  {' '}
                  · {c.kind === 'group' && who ? `${who}: ` : ''}
                  {what}
                </span>
              </span>
              <span className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent px-1 text-2xs font-semibold tabular-nums text-accent-fg">{c.unread}</span>
            </Link>
          )
        })}
      </div>
      <Link href="/chat" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg">
        {t('open')}
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  )
}
