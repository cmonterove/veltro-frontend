'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Fragment, useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Check, ChevronDown, Inbox, Info, KeyRound, Mails, MessagesSquare, PenLine, Paperclip, Plus, Search, Send, ShieldAlert, Star, Tag, Trash2, Users, X, type LucideIcon } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Menu, MenuCheckboxItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useDateLocale } from '@/lib/dates'
import { MAIL_CATEGORIES, type ApiMailbox, type ApiMailThreadSummary, type MailCategory } from '@/lib/api/correo'
import { useMailLabels, useMailThreads } from '@/lib/queries/mail'
import { cn } from '@/lib/utils'
import { errorCode, RECONNECT_CODES, useMailError } from './mail-errors'
import { MailReconnect, MicrosoftMark } from './mail-connect'
import { MailConnectGuide } from './mail-connect-guide'
import { setInboxTabs, unreadOf, useInboxTabsOf } from './inbox-tabs'
import { firstName, personName, shortWhen } from './mail-utils'

/** Las carpetas del menú: las de siempre y, tras una raya, Spam y Papelera (Borradores queda en Gmail por ahora). */
const FOLDERS = ['INBOX', 'STARRED', 'SENT'] as const
const MORE = ['SPAM', 'TRASH'] as const
const FOLDER_ICON: Record<(typeof FOLDERS)[number] | (typeof MORE)[number], LucideIcon> = { INBOX: Inbox, STARRED: Star, SENT: Send, SPAM: ShieldAlert, TRASH: Trash2 }

/** Los íconos de las pestañas de Recibidos, como los de Gmail. */
const CATEGORY_ICON: Record<MailCategory, LucideIcon> = { primary: Inbox, promotions: Tag, social: Users, updates: Info, forums: MessagesSquare }

/**
 * Los dos botones de arriba de la lista (la carpeta y la categoría), cada uno con su menú. Se reparten
 * el ancho de la columna y tienen el alto y el redondeo de la búsqueda, para que se lean como un bloque.
 */
const PICKER =
  'flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-3 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid md:h-9 md:rounded-[12px]'

export type MailNav = (patch: Record<string, string | null>, push?: boolean) => void

/**
 * La lista, sobre el marco (como Pasillo): el título con lo sin leer y «Redactar», la cuenta (si hay
 * varias, se cambia aquí), la búsqueda (con la sintaxis de Gmail), las carpetas y, debajo, los hilos.
 * Si la cuenta usa pestañas (como en Gmail), Recibidos se parte en Principal, Promociones, Social,
 * Notificaciones y Foros, y lo sin leer que se cuenta es el de Principal. El abierto se une a la hoja
 * como la pestaña de una carpeta.
 */
export function MailList({
  box,
  boxes,
  folder,
  category,
  tabs,
  q,
  activeId,
  hrefFor,
  go,
  onCompose,
}: {
  box: ApiMailbox
  boxes: ApiMailbox[]
  folder: string | null
  /** la pestaña de Recibidos que se mira (null: sin pestañas, otra carpeta o buscando) */
  category: MailCategory | null
  /** si la cuenta usa pestañas en Recibidos */
  tabs: boolean
  q: string
  activeId: string | null
  hrefFor: (threadId: string) => string
  go: MailNav
  onCompose: () => void
}) {
  const t = useTranslations('mail')
  const format = useFormatter()
  const locale = useDateLocale()
  const mailError = useMailError()
  const labels = useMailLabels(box.id)
  const threads = useMailThreads(box.id, folder, q, category)
  const tabsOf = useInboxTabsOf(boxes)
  const router = useRouter()
  const [search, setSearch] = useState(q)
  const [guide, setGuide] = useState(false)
  useEffect(() => setSearch(q), [q])

  const items = threads.data?.pages.flatMap((p) => p.items) ?? []
  // con pestañas, lo sin leer de Recibidos es el de Principal (como en Gmail)
  const inboxAll = labels.data?.system.find((f) => f.id === 'INBOX')?.unread ?? box.unread ?? 0
  const primaryUnread = labels.data?.categories.find((c) => c.id === 'primary')?.unread ?? box.unreadPrimary
  const inboxUnread = tabs ? (primaryUnread ?? inboxAll) : inboxAll
  // las pestañas que la cuenta tiene (Principal siempre; mientras cargan, las cuatro de siempre: Foros
  // casi nadie lo usa y aparecería un momento para irse)
  const categories = MAIL_CATEGORIES.filter(
    (c) => c === 'primary' || c === category || (labels.data ? (labels.data.categories.find((x) => x.id === c)?.total ?? 0) > 0 : c !== 'forums'),
  )
  const userLabels = labels.data?.labels ?? []
  const activeLabel = userLabels.find((l) => l.id === folder)
  // el botón de la carpeta: su ícono y su nombre (buscando, «Todo el correo»; una etiqueta, la suya)
  const folderKey = [...FOLDERS, ...MORE].find((f) => f === folder) ?? null
  const FolderIcon = folderKey ? FOLDER_ICON[folderKey] : folder ? Tag : Mails
  const folderName = activeLabel?.name ?? (folderKey ? t(`folders.${folderKey}`) : folder ? t('folders.labels') : t('folders.all'))
  const CategoryIcon = category ? CATEGORY_ICON[category] : Inbox
  // las cifras de los menús, cortas: «5,1 mil» en vez de «5107»
  const short = (n: number) => format.number(n, n >= 1000 ? { notation: 'compact', maximumFractionDigits: 1 } : {})
  const code = threads.error ? errorCode(threads.error) : null

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="shrink-0 px-4 pb-3 pt-5 md:pb-0 md:pl-3 md:pr-3.5 md:pt-1">
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
            {boxes.map((b, i) => {
              const unread = unreadOf(b, tabsOf(i))
              return (
                <MenuItem key={b.id} onClick={() => go({ b: b.id, h: null, q: null, f: null, cat: null })}>
                  <span className="min-w-0 flex-1 truncate">{b.email}</span>
                  {unread ? <span className="shrink-0 text-xs tabular-nums text-fg-subtle">{format.number(unread)}</span> : null}
                  {b.id === box.id ? <Check className="!text-accent" /> : null}
                </MenuItem>
              )
            })}
            <MenuItem onClick={() => setGuide(true)}>
              <Plus />
              {t('connectAnother')}
            </MenuItem>
            <MenuItem disabled>
              <MicrosoftMark className="size-3.5" />
              <span className="flex-1">{t('connectOutlook')}</span>
              <span className="rounded-full bg-hover px-1.5 py-px text-[10.5px] font-medium text-fg-subtle">{t('connect.soon')}</span>
            </MenuItem>
            <MenuItem onClick={() => router.push('/settings/preferences#integrations')}>
              <KeyRound />
              {t('googlePermissions')}
            </MenuItem>
            <MenuSeparator />
            {/* Recibidos con pestañas o todo junto: Gmail no avisa cómo lo tiene cada uno, se elige aquí */}
            <MenuCheckboxItem
              checked={tabs}
              onCheckedChange={(on) => {
                setInboxTabs(box, on)
                go({ cat: null, h: null })
              }}
            >
              <Inbox />
              <span className="min-w-0 flex-1">
                <span className="block">{t('tabsToggle')}</span>
                <span className="block text-2xs text-fg-subtle">{t('tabsToggleHint')}</span>
              </span>
            </MenuCheckboxItem>
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

        {/* Dos botones en una fila: la carpeta (Recibidos, Destacados, Enviados, Spam, Papelera y las
            etiquetas) y, en Recibidos con pestañas, la categoría (Principal, Promociones…). Lo sin leer
            va dentro de cada menú y abreviado: Promociones o Notificaciones llegan a miles. */}
        <div className="mt-2 flex min-w-0 items-center gap-2 md:mt-2.5">
          <Menu>
            <MenuTrigger aria-label={t('folders.label')} className={cn(PICKER, 'bg-fg text-canvas data-[popup-open]:opacity-90 md:text-tinta')}>
              {activeLabel ? (
                <span className="size-2 shrink-0 rounded-full ring-1 ring-inset ring-black/10" style={{ background: activeLabel.color?.background ?? 'currentColor' }} />
              ) : (
                <FolderIcon className="size-3.5 shrink-0" />
              )}
              <span className="truncate">{folderName}</span>
              <ChevronDown className="ml-auto size-3.5 shrink-0 opacity-60" />
            </MenuTrigger>
            <MenuContent align="start" className="max-h-96 w-60 overflow-y-auto scrollbar-thin">
              {[...FOLDERS, ...MORE].map((f, i) => {
                const Icon = FOLDER_ICON[f]
                const unread = f === 'INBOX' ? inboxUnread : f === 'SPAM' ? (labels.data?.system.find((x) => x.id === 'SPAM')?.unread ?? 0) : 0
                return (
                  <Fragment key={f}>
                    {i === FOLDERS.length ? <MenuSeparator /> : null}
                    <MenuItem onClick={() => go({ f, q: null, h: null, cat: null })}>
                      <Icon />
                      <span className="flex-1">{t(`folders.${f}`)}</span>
                      {unread ? <span className="text-xs tabular-nums text-fg-subtle">{short(unread)}</span> : null}
                      {folder === f ? <Check className="!text-accent" /> : null}
                    </MenuItem>
                  </Fragment>
                )
              })}
              {userLabels.length ? (
                <>
                  <MenuSeparator />
                  <MenuLabel>{t('folders.labels')}</MenuLabel>
                  {userLabels.map((l) => (
                    <MenuItem key={l.id} onClick={() => go({ f: l.id, q: null, h: null, cat: null })}>
                      <span className="size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-fg/10" style={{ background: l.color?.background ?? 'var(--hover)' }} />
                      <span className="min-w-0 flex-1 truncate">{l.name}</span>
                      {l.unread ? <span className="shrink-0 text-xs tabular-nums text-fg-subtle">{short(l.unread)}</span> : null}
                      {folder === l.id ? <Check className="!text-accent" /> : null}
                    </MenuItem>
                  ))}
                </>
              ) : null}
            </MenuContent>
          </Menu>
          {category ? (
            <Menu>
              <MenuTrigger aria-label={t('categories.label')} className={cn(PICKER, 'bg-hover text-fg hover:bg-active data-[popup-open]:bg-active')}>
                <CategoryIcon className="size-3.5 shrink-0 text-accent-ink" />
                <span className="truncate">{t(`categories.${category}`)}</span>
                <ChevronDown className="ml-auto size-3.5 shrink-0 opacity-60" />
              </MenuTrigger>
              <MenuContent align="start" className="w-60">
                {categories.map((c) => {
                  const Icon = CATEGORY_ICON[c]
                  const unread = c === 'primary' ? inboxUnread : (labels.data?.categories.find((x) => x.id === c)?.unread ?? 0)
                  return (
                    <MenuItem key={c} onClick={() => go({ cat: c === 'primary' ? null : c, h: null })}>
                      <Icon />
                      <span className="flex-1">{t(`categories.${c}`)}</span>
                      {unread ? <span className="text-xs tabular-nums text-fg-subtle">{short(unread)}</span> : null}
                      {category === c ? <Check className="!text-accent" /> : null}
                    </MenuItem>
                  )
                })}
              </MenuContent>
            </Menu>
          ) : null}
        </div>
        {q ? <p className="mt-2 truncate text-xs text-fg-muted">{t('resultsFor', { q })}</p> : null}
      </div>

      {/* arriba, lo justo para la esquina curva del abierto (16 px): si es el primero, no queda cortada */}
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-6 scrollbar-thin md:pl-2 md:pr-0 md:pt-4" aria-label={t('title')}>
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
