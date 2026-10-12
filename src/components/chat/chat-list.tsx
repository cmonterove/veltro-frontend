'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { format, isToday, isYesterday, differenceInCalendarDays } from 'date-fns'
import { MessageCirclePlus, MessageSquare, Search, Users } from 'lucide-react'
import { useApp, useMemberMap } from '@/components/app/app-context'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useChats, type ChatSummary } from '@/lib/queries/chats'
import { useDateLocale } from '@/lib/dates'
import { useLocalStorage } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { ChatAvatar, useChatName, useChatPreview } from './chat-bits'
import { PeopleDialog } from './new-chat-dialog'

const FILTERS = ['all', 'unread', 'groups', 'direct'] as const
type Filter = (typeof FILTERS)[number]

/** Columna de conversaciones de Pasillo: las más recientes arriba, con lo no leído resaltado. */
export function ChatList({ activeId }: { activeId?: string }) {
  const t = useTranslations('pasillo')
  const { data: chats, isLoading } = useChats({ fast: true })
  const chatName = useChatName()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useLocalStorage<Filter>('veltro:chat-filter', 'all')
  const [dialog, setDialog] = useState<'direct' | 'group' | null>(null)

  const needle = q.trim().toLowerCase()
  const list = (chats ?? []).filter(
    (c) =>
      (filter === 'all' || (filter === 'unread' && c.unread > 0) || (filter === 'groups' && c.kind === 'group') || (filter === 'direct' && c.kind === 'direct')) &&
      (!needle || chatName(c).toLowerCase().includes(needle) || (c.last?.body ?? '').toLowerCase().includes(needle)),
  )
  const unreadChats = (chats ?? []).filter((c) => c.unread > 0).length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pb-3 pt-5">
        <div className="flex items-start gap-2">
          <div className="mr-auto min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">{t('title')}</h1>
            <p className="text-xs text-fg-muted">{t('tagline')}</p>
          </div>
          <Menu>
            <MenuTrigger render={<Button variant="primary" size="sm" />}>
              <MessageCirclePlus />
              {t('new')}
            </MenuTrigger>
            <MenuContent align="end" className="w-56">
              <MenuItem onClick={() => setDialog('direct')}>
                <MessageSquare />
                {t('newDirect')}
              </MenuItem>
              <MenuItem onClick={() => setDialog('group')}>
                <Users />
                {t('newGroup')}
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
        <div className="relative mt-3 flex items-center">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-fg-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQ('')}
            placeholder={t('search')}
            className="h-8 w-full rounded-lg border border-line bg-panel pl-8 pr-3 text-sm outline-none placeholder:text-fg-subtle hover:border-line-strong focus:border-accent-mid"
          />
        </div>
        <div className="mt-2 flex gap-1 overflow-x-auto scrollbar-none" role="group" aria-label={t('filterLabel')}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn(
                'inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs transition-colors',
                filter === f ? 'bg-fg font-medium text-canvas' : 'text-fg-muted hover:bg-hover hover:text-fg',
              )}
            >
              {t(`filters.${f}`)}
              {f === 'unread' && unreadChats ? <span className="tabular-nums opacity-70">{unreadChats}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-6 scrollbar-thin" aria-label={t('title')}>
        {isLoading ? (
          <div className="flex flex-col gap-2 px-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : list.length ? (
          list.map((c) => <ChatItem key={c.id} chat={c} active={c.id === activeId} />)
        ) : (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-fg-muted">{chats?.length ? t('noMatches') : t('empty')}</p>
            {chats?.length ? null : (
              <Button size="sm" className="mt-3" onClick={() => setDialog('direct')}>
                <MessageCirclePlus />
                {t('newDirect')}
              </Button>
            )}
          </div>
        )}
      </nav>

      <PeopleDialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)} mode={dialog ?? 'direct'} />
    </div>
  )
}

function ChatItem({ chat, active }: { chat: ChatSummary; active: boolean }) {
  const t = useTranslations('pasillo')
  const locale = useDateLocale()
  const { user } = useApp()
  const memberMap = useMemberMap()
  const chatName = useChatName()
  const preview = useChatPreview()
  const last = chat.last
  const at = new Date(last?.created_at ?? chat.created_at)
  const when = isToday(at) ? format(at, 'HH:mm') : isYesterday(at) ? t('yesterday') : differenceInCalendarDays(new Date(), at) < 7 ? format(at, 'EEE', { locale }) : format(at, 'd MMM', { locale })

  // la vista previa: quién y qué (texto o lo compartido)
  const author = last?.user_id === user.id ? t('you') : memberMap.get(last?.user_id ?? '')?.full_name.split(' ')[0]
  const what = preview(last)
  const showAuthor = last && last.kind !== 'system' && (chat.kind === 'group' || last.user_id === user.id)

  return (
    <Link
      href={`/chat/${chat.id}`}
      aria-current={active ? 'page' : undefined}
      className={cn('flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors', active ? 'bg-accent-soft' : 'hover:bg-hover')}
    >
      <ChatAvatar chat={chat} size={40} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-sm', chat.unread ? 'font-semibold text-fg' : 'font-medium text-fg')}>{chatName(chat)}</span>
          <span className={cn('shrink-0 text-2xs tabular-nums', chat.unread ? 'font-semibold text-accent-ink' : 'text-fg-subtle')}>{when}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-xs', chat.unread ? 'text-fg' : 'text-fg-muted')}>
            {showAuthor ? <span className="text-fg-subtle">{author}: </span> : null}
            {what}
          </span>
          {chat.unread ? (
            <span className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent px-1 text-2xs font-semibold tabular-nums text-accent-fg">{chat.unread}</span>
          ) : null}
        </span>
      </span>
    </Link>
  )
}
