'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, ChevronDown, Inbox, PenLine, Paperclip, Plus, Search, ShieldAlert, Star, Trash2, X } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useDateLocale } from '@/lib/dates'
import type { ApiMailbox, ApiMailThreadSummary } from '@/lib/api/correo'
import { useMailLabels, useMailThreads } from '@/lib/queries/mail'
import { cn } from '@/lib/utils'
import { errorCode, RECONNECT_CODES, useMailError } from './mail-errors'
import { MailReconnect } from './mail-connect'
import { MailConnectGuide } from './mail-connect-guide'
import { firstName, personName, shortWhen } from './mail-utils'

/** Las carpetas a la vista; Spam, Papelera y las etiquetas propias van en «Más» (Borradores queda en Gmail por ahora). */
const FOLDERS = ['INBOX', 'STARRED', 'SENT'] as const
const MORE = ['SPAM', 'TRASH'] as const

export type MailNav = (patch: Record<string, string | null>, push?: boolean) => void

/**
 * La lista, sobre el marco (como Pasillo): el título con lo sin leer y «Redactar», la cuenta (si hay
 * varias, se cambia aquí), la búsqueda (con la sintaxis de Gmail), las carpetas y, debajo, los hilos.
 * El abierto se une a la hoja como la pestaña de una carpeta.
 */
export function MailList({
  box,
  boxes,
  folder,
  q,
  activeId,
  hrefFor,
  go,
  onCompose,
}: {
  box: ApiMailbox
  boxes: ApiMailbox[]
  folder: string | null
  q: string
  activeId: string | null
  hrefFor: (threadId: string) => string
  go: MailNav
  onCompose: () => void
}) {
  const t = useTranslations('mail')
  const locale = useDateLocale()
  const mailError = useMailError()
  const labels = useMailLabels(box.id)
  const threads = useMailThreads(box.id, folder, q)
  const [search, setSearch] = useState(q)
  const [guide, setGuide] = useState(false)
  useEffect(() => setSearch(q), [q])

  const items = threads.data?.pages.flatMap((p) => p.items) ?? []
  const inboxUnread = labels.data?.system.find((f) => f.id === 'INBOX')?.unread ?? box.unread ?? 0
  const userLabels = labels.data?.labels ?? []
  const activeLabel = userLabels.find((l) => l.id === folder)
  const moreActive = folder === 'SPAM' || folder === 'TRASH' || Boolean(activeLabel)
  const code = threads.error ? errorCode(threads.error) : null

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="shrink-0 px-4 pb-3 pt-5 md:pb-2 md:pl-3 md:pr-3.5 md:pt-1">
        <div className="flex items-center gap-2">
          <div className="mr-auto min-w-0 md:flex md:items-baseline md:gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight md:text-[28px] md:font-bold md:leading-none md:tracking-[-0.035em]">{t('title')}</h1>
            {inboxUnread ? <span className="hidden text-[13px] font-semibold text-accent-ink md:inline">{t('unreadCount', { count: inboxUnread })}</span> : null}
          </div>
          <Button variant="primary" size="sm" onClick={onCompose}>
            <PenLine />
            {t('composeButton')}
          </Button>
        </div>

        {/* la cuenta: si hay varias, se cambia aquí; también se conecta otra */}
        <Menu>
          <MenuTrigger className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-xs text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid md:-ml-1">
            <span className="truncate">{box.email}</span>
            <ChevronDown className="size-3 shrink-0" />
          </MenuTrigger>
          <MenuContent align="start" className="w-72">
            {boxes.map((b) => (
              <MenuItem key={b.id} onClick={() => go({ b: b.id, h: null, q: null, f: null })}>
                <span className="min-w-0 flex-1 truncate">{b.email}</span>
                {b.unread ? <span className="shrink-0 text-xs tabular-nums text-fg-subtle">{b.unread}</span> : null}
                {b.id === box.id ? <Check className="!text-accent" /> : null}
              </MenuItem>
            ))}
            <MenuItem onClick={() => setGuide(true)}>
              <Plus />
              {t('connectAnother')}
            </MenuItem>
          </MenuContent>
        </Menu>
        <MailConnectGuide open={guide} onOpenChange={setGuide} />

        <form
          className="relative mt-2.5 flex items-center"
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            go({ q: search.trim() || null, f: search.trim() ? null : 'INBOX', h: null })
          }}
        >
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-fg-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && search) {
                setSearch('')
                if (q) go({ q: null, f: 'INBOX' })
              }
            }}
            placeholder={t('search')}
            aria-label={t('search')}
            className="h-8 w-full rounded-lg border border-line bg-panel pl-8 pr-8 text-sm outline-none placeholder:text-fg-subtle hover:border-line-strong focus:border-accent-mid md:h-9 md:rounded-[12px] md:bg-hover"
          />
          {q ? (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                go({ q: null, f: 'INBOX' })
              }}
              aria-label={t('clearSearch')}
              className="absolute right-2 rounded p-0.5 text-fg-subtle hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </form>

        <div className="mt-2 flex gap-1 overflow-x-auto scrollbar-none md:mt-2.5" role="group" aria-label={t('folders.label')}>
          {FOLDERS.map((f) => {
            const on = folder === f
            const unread = f === 'INBOX' ? inboxUnread : 0
            return (
              <button
                key={f}
                type="button"
                onClick={() => go({ f, q: null, h: null })}
                aria-pressed={on}
                className={cn(
                  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors md:h-8 md:rounded-[10px] md:text-[13px]',
                  on ? 'bg-fg font-medium text-canvas md:text-tinta' : 'text-fg-muted hover:bg-hover hover:text-fg',
                )}
              >
                {t(`folders.${f}`)}
                {unread ? (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-count px-1 text-[10.5px] font-semibold tabular-nums text-count-fg">{unread}</span>
                ) : null}
              </button>
            )
          })}
          {/* «Más»: Spam, Papelera y las etiquetas propias; con una elegida, la pastilla lleva su nombre */}
          <Menu>
            <MenuTrigger
              className={cn(
                'inline-flex h-7 min-w-0 shrink items-center gap-1 rounded-full px-2.5 text-xs outline-none transition-colors md:h-8 md:rounded-[10px] md:text-[13px]',
                moreActive ? 'bg-fg font-medium text-canvas md:text-tinta' : 'text-fg-muted hover:bg-hover hover:text-fg',
              )}
            >
              {activeLabel ? <span className="size-2 shrink-0 rounded-full" style={{ background: activeLabel.color?.background ?? 'currentColor' }} /> : null}
              <span className="truncate">{activeLabel?.name ?? (moreActive ? t(`folders.${folder}`) : t('folders.more'))}</span>
              <ChevronDown className="size-3 shrink-0" />
            </MenuTrigger>
            <MenuContent align="end" className="max-h-80 w-60 overflow-y-auto scrollbar-thin">
              {MORE.map((f) => (
                <MenuItem key={f} onClick={() => go({ f, q: null, h: null })}>
                  {f === 'SPAM' ? <ShieldAlert /> : <Trash2 />}
                  <span className="flex-1">{t(`folders.${f}`)}</span>
                  {folder === f ? <Check className="!text-accent" /> : null}
                </MenuItem>
              ))}
              {userLabels.length ? (
                <>
                  <MenuSeparator />
                  <MenuLabel>{t('folders.labels')}</MenuLabel>
                  {userLabels.map((l) => (
                    <MenuItem key={l.id} onClick={() => go({ f: l.id, q: null, h: null })}>
                      <span className="size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-fg/10" style={{ background: l.color?.background ?? 'var(--hover)' }} />
                      <span className="min-w-0 flex-1 truncate">{l.name}</span>
                      {l.unread ? <span className="shrink-0 text-xs tabular-nums text-fg-subtle">{l.unread}</span> : null}
                    </MenuItem>
                  ))}
                </>
              ) : null}
            </MenuContent>
          </Menu>
        </div>
        {q ? <p className="mt-2 truncate text-xs text-fg-muted">{t('resultsFor', { q })}</p> : null}
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-6 scrollbar-thin md:pl-2 md:pr-0 md:pt-1" aria-label={t('title')}>
        {threads.isLoading ? (
          <div className="flex flex-col gap-2 px-2">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="h-[68px]" />
            ))}
          </div>
        ) : code ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <p className="text-sm text-fg-muted">{mailError(threads.error)}</p>
            {RECONNECT_CODES.includes(code) ? <MailReconnect /> : null}
          </div>
        ) : !items.length ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <span className="flex size-10 items-center justify-center rounded-xl bg-hover text-fg-subtle">
              <Inbox className="size-5" />
            </span>
            <p className="text-sm text-fg-muted">{q ? t('noResults', { q }) : t('emptyFolder')}</p>
          </div>
        ) : (
          <>
            {items.map((th) => (
              <ThreadRow key={th.id} th={th} href={hrefFor(th.id)} active={th.id === activeId} sent={folder === 'SENT'} when={shortWhen(th.date, locale, t('yesterday'))} />
            ))}
            {threads.hasNextPage ? (
              <div className="px-2 pt-2 md:pr-3">
                <Button variant="ghost" size="sm" className="w-full" onClick={() => void threads.fetchNextPage()} loading={threads.isFetchingNextPage}>
                  {t('loadMore')}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </nav>
    </div>
  )
}

function ThreadRow({ th, href, active, sent, when }: { th: ApiMailThreadSummary; href: string; active: boolean; sent: boolean; when: string }) {
  const t = useTranslations('mail')
  // quién: en Enviados, a quién; si no, quienes escriben (con el nombre corto si son varios)
  const people = sent ? th.to : th.participants
  const lead = (sent ? th.to[0] : [...th.participants].reverse().find((p) => !p.me) ?? th.participants[0]) ?? { name: null, email: '?', me: false }
  const names = people.length > 1 ? people.map((p) => (p.me ? t('me') : firstName(p))).join(', ') : people[0] ? (people[0].me ? t('me') : personName(people[0])) : '—'

  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-colors md:mr-3 md:rounded-[16px] md:px-3',
        // el abierto es crema (la hoja) y llega hasta el borde: se une al hilo como una pestaña
        active
          ? cn(
              'bg-accent-soft md:on-sheet md:relative md:mr-0 md:rounded-r-none md:bg-canvas',
              'md:before:pointer-events-none md:before:absolute md:before:bottom-full md:before:right-0 md:before:size-4 md:before:bg-[radial-gradient(circle_at_0_0,transparent_15.5px,var(--canvas)_16px)]',
              'md:after:pointer-events-none md:after:absolute md:after:right-0 md:after:top-full md:after:size-4 md:after:bg-[radial-gradient(circle_at_0_100%,transparent_15.5px,var(--canvas)_16px)]',
            )
          : 'hover:bg-hover',
      )}
    >
      <Avatar name={personName(lead)} seed={lead.email} size={38} className="mt-0.5" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-sm md:text-[14px]', th.unread ? 'font-semibold text-fg' : 'font-medium text-fg')}>
            {sent ? `${t('toPrefix')} ` : ''}
            {names}
            {th.count > 1 ? <span className="ml-1 text-xs font-normal text-fg-subtle">{th.count}</span> : null}
          </span>
          <span className={cn('shrink-0 font-mono text-[11px] tabular-nums', th.unread ? 'font-semibold text-count' : 'text-fg-subtle')}>{when}</span>
        </span>
        <span className={cn('truncate text-[13px]', th.unread ? 'font-semibold text-fg' : 'text-fg')}>{th.subject || t('noSubject')}</span>
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{th.snippet}</span>
          {th.hasAttachments ? <Paperclip className="size-3 shrink-0 text-fg-subtle" aria-label={t('hasAttachments')} /> : null}
          {th.starred ? <Star className="size-3 shrink-0 fill-[oklch(0.8_0.15_85)] text-[oklch(0.72_0.15_75)]" aria-label={t('starred')} /> : null}
          {th.unread ? <span className="size-2 shrink-0 rounded-full bg-count" aria-label={t('unread')} /> : null}
        </span>
      </span>
    </Link>
  )
}
