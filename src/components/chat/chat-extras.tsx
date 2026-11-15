'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { format, formatDistanceToNowStrict, isToday } from 'date-fns'
import { MessagesSquare, Pin, PinOff, Search, SmilePlus, X } from 'lucide-react'
import { useApp, useMemberMap } from '@/components/app/app-context'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip } from '@/components/ui/tooltip'
import { useChatMutations, useChatPins, useChatSearch } from '@/lib/queries/chats'
import { useDateLocale } from '@/lib/dates'
import type { ChatMessageRow } from '@/lib/database.types'
import { cn } from '@/lib/utils'

/** Las reacciones a mano: las de siempre en un chat de trabajo. */
export const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '🙏', '✅', '🔥', '💯', '🚀', '😮', '😢']

/** Elegir una reacción. */
export function ReactionPicker({ onPick, className, label }: { onPick: (emoji: string) => void; className?: string; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={label}>
        <PopoverTrigger aria-label={label} className={className}>
          <SmilePlus className="size-4" />
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" className="w-auto p-1.5">
        <div className="grid grid-cols-6 gap-0.5">
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onPick(e)
                setOpen(false)
              }}
              className="flex size-9 items-center justify-center rounded-md text-lg transition-transform hover:scale-110 hover:bg-hover"
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Las reacciones de un mensaje: un botón por emoji con cuántos; el mío marcado. Tocar pone o quita la mía. */
export function ReactionBar({ m }: { m: ChatMessageRow }) {
  const t = useTranslations('pasillo.extras')
  const { user } = useApp()
  const memberMap = useMemberMap()
  const { react } = useChatMutations()
  const list = m.reactions ?? []
  if (!list.length || m.deleted_at) return null
  const names = (ids: string[]) => ids.map((id) => (id === user.id ? t('you') : (memberMap.get(id)?.full_name.split(' ')[0] ?? '?'))).join(', ')
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {list.map((r) => {
        const mine = r.user_ids.includes(user.id)
        return (
          <Tooltip key={r.emoji} content={t('reactedBy', { names: names(r.user_ids), emoji: r.emoji })}>
            <button
              type="button"
              onClick={() => react.mutate({ message: m, emoji: r.emoji })}
              aria-pressed={mine}
              className={cn(
                'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums transition-colors',
                mine ? 'border-accent-mid/50 bg-accent-soft text-accent-ink' : 'border-line bg-panel text-fg-muted hover:border-line-strong',
              )}
            >
              <span className="text-sm leading-none">{r.emoji}</span>
              {r.user_ids.length}
            </button>
          </Tooltip>
        )
      })}
      <ReactionPicker
        label={t('react')}
        onPick={(emoji) => react.mutate({ message: m, emoji })}
        className="inline-flex size-6 items-center justify-center rounded-full border border-dashed border-line text-fg-subtle hover:border-line-strong hover:text-fg [&_svg]:size-3.5"
      />
    </div>
  )
}

/** Debajo de un mensaje con hilo: cuántas respuestas, quiénes y cuándo la última. Abre el hilo. */
export function ThreadSummary({ m, onOpen }: { m: ChatMessageRow; onOpen: () => void }) {
  const t = useTranslations('pasillo.extras')
  const locale = useDateLocale()
  const memberMap = useMemberMap()
  const r = m.replies
  if (!r?.count) return null
  const people = [...new Set(r.user_ids)].flatMap((id) => memberMap.get(id) ?? [])
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-1 inline-flex max-w-full items-center gap-2 rounded-lg border border-transparent px-1.5 py-1 text-xs hover:border-line hover:bg-panel"
    >
      {people.length ? <AvatarStack people={people} size={18} max={3} /> : <MessagesSquare className="size-3.5 text-accent" />}
      <span className="font-semibold text-accent-ink">{t('replies', { count: r.count })}</span>
      {r.last_at ? <span className="truncate text-fg-subtle">{t('lastReply', { when: formatDistanceToNowStrict(new Date(r.last_at), { addSuffix: true, locale }) })}</span> : null}
    </button>
  )
}

/** Buscar dentro del chat: los resultados abren el mensaje (o su hilo). */
export function ChatSearchBar({ chatId, onClose, onJump }: { chatId: string; onClose: () => void; onJump: (m: ChatMessageRow) => void }) {
  const t = useTranslations('pasillo.extras')
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const id = setTimeout(() => setTerm(q.trim()), 250)
    return () => clearTimeout(id)
  }, [q])
  useEffect(() => input.current?.focus(), [])
  const { data, isFetching } = useChatSearch(chatId, term)
  return (
    <div className="relative shrink-0 border-b border-line px-3 py-2 sm:px-5">
      <label className="relative flex items-center">
        <Search className="pointer-events-none absolute left-2.5 size-3.5 text-fg-subtle" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="h-9 w-full rounded-lg border border-line bg-panel pl-8 pr-16 text-sm outline-none placeholder:text-fg-subtle focus:border-accent-mid"
        />
        <span className="absolute right-9">{isFetching ? <Spinner className="size-3.5" /> : null}</span>
        <button type="button" onClick={onClose} aria-label={t('closeSearch')} className="absolute right-1.5 inline-flex size-6 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg">
          <X className="size-4" />
        </button>
      </label>
      {term.length >= 2 && data ? (
        <div className="absolute inset-x-3 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-xl border border-line bg-panel p-1 shadow-popover scrollbar-thin sm:inset-x-5">
          {data.length ? (
            data.map((m) => <ResultRow key={m.id} m={m} term={term} onClick={() => onJump(m)} />)
          ) : (
            <p className="px-3 py-3 text-sm text-fg-muted">{t('noResults', { q: term })}</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function ResultRow({ m, term, onClick }: { m: ChatMessageRow; term: string; onClick: () => void }) {
  const t = useTranslations('pasillo.extras')
  const locale = useDateLocale()
  const { user } = useApp()
  const memberMap = useMemberMap()
  const author = memberMap.get(m.user_id ?? '')
  const at = new Date(m.created_at)
  return (
    <button type="button" onClick={onClick} className="flex w-full gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-hover">
      <Avatar name={author?.full_name} src={author?.avatar_url} seed={m.user_id ?? m.id} size={24} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2 text-xs">
          <span className="font-semibold text-fg first-letter:uppercase">{m.user_id === user.id ? t('you') : (author?.full_name ?? '?')}</span>
          <span className="text-fg-subtle">{isToday(at) ? format(at, 'HH:mm') : format(at, 'd MMM', { locale })}</span>
          {m.thread_id ? <span className="text-fg-subtle">· {t('inThread')}</span> : null}
        </span>
        <span className="line-clamp-2 text-sm text-fg">
          <Highlight text={m.body} q={term} />
        </span>
      </span>
    </button>
  )
}

function Highlight({ text, q }: { text: string; q: string }) {
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'))
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <mark key={i} className="rounded-[3px] bg-highlight px-0.5 text-highlight-ink">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  )
}

/** Los fijados del chat, en la cabecera: con cuántos hay; abre la lista y lleva al mensaje. */
export function PinsButton({ chatId, onJump, className }: { chatId: string; onJump: (m: ChatMessageRow) => void; className?: string }) {
  const t = useTranslations('pasillo.extras')
  const locale = useDateLocale()
  const memberMap = useMemberMap()
  const { pin } = useChatMutations()
  const { data: pins = [] } = useChatPins(chatId)
  const [open, setOpen] = useState(false)
  if (!pins.length) return null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={t('pinned', { count: pins.length })}>
        <PopoverTrigger aria-label={t('pinned', { count: pins.length })} className={className}>
          <Pin className="size-4" />
          <span className="text-xs tabular-nums">{pins.length}</span>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" className="w-80 p-1">
        <p className="px-2.5 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">{t('pinnedTitle')}</p>
        <div className="max-h-80 overflow-y-auto scrollbar-thin">
          {pins.map((m) => {
            const author = memberMap.get(m.user_id ?? '')
            return (
              <div key={m.id} className="group/pin flex items-start gap-2 rounded-lg px-2.5 py-2 hover:bg-hover">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onJump(m)
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-baseline gap-2 text-xs">
                    <span className="font-semibold text-fg">{author?.full_name ?? '?'}</span>
                    <span className="text-fg-subtle">{format(new Date(m.created_at), 'd MMM', { locale })}</span>
                  </span>
                  <span className="line-clamp-3 text-sm text-fg">{m.body || t('card')}</span>
                </button>
                <Tooltip content={t('unpin')}>
                  <button
                    type="button"
                    onClick={() => pin.mutate({ message: m, on: false })}
                    aria-label={t('unpin')}
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-subtle opacity-0 hover:bg-panel hover:text-fg group-hover/pin:opacity-100"
                  >
                    <PinOff className="size-3.5" />
                  </button>
                </Tooltip>
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
