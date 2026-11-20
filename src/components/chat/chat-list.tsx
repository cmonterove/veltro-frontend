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
import { useHydrated, useLocalStorage } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { ChatAvatar, useChatName, useChatPreview } from './chat-bits'
import { PeopleDialog } from './new-chat-dialog'

const FILTERS = ['all', 'unread', 'groups', 'direct'] as const
type Filter = (typeof FILTERS)[number]

/** Columna de conversaciones de Pasillo: las más recientes arriba, con lo no leído resaltado. */
export function ChatList({ activeId }: { activeId?: string }) {
  const t = useTranslations('pasillo')
  // hasta hidratar, el esqueleto (como en el servidor): si la lista llega antes de que esta parte se
  // hidrate, pintarla de una no coincidiría con el HTML del servidor
  const hydrated = useHydrated()
  const { data: chats, isPending } = useChats({ fast: true })
  const isLoading = !hydrated || isPending
  const { members, user } = useApp()
  const alone = !members.some((m) => m.id !== user.id)
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
  const unreadMessages = (chats ?? []).reduce((n, c) => n + c.unread, 0)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pb-3 pt-5 md:pb-2 md:pl-3 md:pr-3.5 md:pt-1">
        <div className="flex items-start gap-2 md:items-center">
          <div className="mr-auto min-w-0 md:flex md:items-baseline md:gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight md:text-[28px] md:font-bold md:leading-none md:tracking-[-0.035em]">{t('title')}</h1>
            <p className="text-xs text-fg-muted md:hidden">{t('tagline')}</p>
            {unreadMessages ? <span className="hidden text-[13px] font-semibold text-accent-ink md:inline">{t('unreadCount', { count: unreadMessages })}</span> : null}
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
            className="h-8 w-full rounded-lg border border-line bg-panel pl-8 pr-3 text-sm outline-none placeholder:text-fg-subtle hover:border-line-strong focus:border-accent-mid md:h-9 md:rounded-[12px] md:bg-hover"
          />
        </div>
        <div className="mt-2 flex gap-1 overflow-x-auto scrollbar-none md:mt-2.5" role="group" aria-label={t('filterLabel')}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn(
                'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors md:h-8 md:rounded-[10px] md:text-[13px]',
                // sobre el marco lo elegido es una pastilla perla con texto tinta
                filter === f ? 'bg-fg font-medium text-canvas md:text-tinta' : 'text-fg-muted hover:bg-hover hover:text-fg',
              )}
            >
              {t(`filters.${f}`)}
              {f === 'unread' && unreadChats ? (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-count px-1 text-[10.5px] font-semibold tabular-nums text-count-fg">{unreadChats}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-6 scrollbar-thin md:pl-2 md:pr-0 md:pt-1" aria-label={t('title')}>
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
            {chats?.length || alone ? null : (
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
      className={cn(
        'flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors md:mr-3 md:rounded-[16px] md:px-3',
        // en escritorio el elegido es crema (la hoja) y llega hasta el borde: se une al chat como una pestaña
        active
          ? cn(
              'bg-accent-soft md:on-sheet md:relative md:mr-0 md:rounded-r-none md:bg-canvas',
              // las esquinas de la unión, curvas hacia afuera (como la pestaña de una carpeta), en el color de la hoja
              'md:before:pointer-events-none md:before:absolute md:before:bottom-full md:before:right-0 md:before:size-4 md:before:bg-[radial-gradient(circle_at_0_0,transparent_15.5px,var(--canvas)_16px)]',
              'md:after:pointer-events-none md:after:absolute md:after:right-0 md:after:top-full md:after:size-4 md:after:bg-[radial-gradient(circle_at_0_100%,transparent_15.5px,var(--canvas)_16px)]',
            )
          : 'hover:bg-hover',
      )}
    >
      <ChatAvatar chat={chat} size={42} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-sm md:text-[14.5px]', chat.unread ? 'font-semibold text-fg' : 'font-medium text-fg')}>{chatName(chat)}</span>
          <span className={cn('shrink-0 font-mono text-[11px] tabular-nums', chat.unread ? 'font-semibold text-count' : 'text-fg-subtle')}>{when}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-xs md:text-[13px]', chat.unread ? 'font-medium text-fg' : 'text-fg-muted')}>
            {showAuthor ? <span className="text-fg-subtle">{author}: </span> : null}
            {what}
          </span>
          {chat.unread ? (
            <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-count px-1.5 text-[11px] font-semibold tabular-nums text-count-fg">{chat.unread}</span>
          ) : null}
        </span>
      </span>
    </Link>
  )
}
