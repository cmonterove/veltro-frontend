'use client'

import { useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronRight, Lightbulb, Paperclip, Plus, ThumbsUp } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useLocalStorage } from '@/lib/hooks'
import { useMyDestination, useRequests, useSupportPending, useTicket, useTickets, type RequestSummary, type TicketBox, type TicketSummary } from '@/lib/queries/support'
import { REQUEST_STATUSES, REQUEST_STEPS, TICKET_STEPS, firstName, type RequestStatus, type TicketStatus } from '@/lib/support'
import { cn } from '@/lib/utils'
import { CATEGORY_ICON, CountBadge, PeopleOrVeltro, REQUEST_TONE, StatusPill, SupportIcon, TICKET_TONE, TicketStatusIcon, ToneTile, UrgentTag, VeltroTile, useAgo, useDestinationText } from './support-bits'
import { useSupportDialogs } from './support-dialogs'

type Tab = TicketBox | 'requests'
type Active = { kind: 'ticket' | 'request'; id: string } | null

/** ¿A esta persona le pueden llegar tickets? (los admins y el dueño, según el destino por rol). */
export function useCanReceive() {
  const { accountRole, account, user } = useApp()
  return accountRole !== 'member' || account.owner_id === user.id
}

/** Soporte: la lista queda fija a la izquierda y a la derecha va lo abierto. En el celular, una u otro. */
export function SupportShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const m = pathname.match(/^\/support\/(tickets|requests)\/([^/]+)/)
  const active: Active = m ? { kind: m[1] === 'tickets' ? 'ticket' : 'request', id: m[2] } : null
  return (
    <div className="flex h-full min-h-0">
      <aside className={cn('min-h-0 w-full shrink-0 border-line lg:flex lg:w-[372px] lg:border-r', active ? 'hidden' : 'flex')}>
        <SupportList active={active} />
      </aside>
      <main className={cn('min-h-0 min-w-0 flex-1', active ? 'flex' : 'hidden lg:flex')}>{children}</main>
    </div>
  )
}

function SupportList({ active }: { active: Active }) {
  const t = useTranslations('support')
  const canReceive = useCanReceive()
  const { openTicket, openRequest, dialogs } = useSupportDialogs()
  const [stored, setTab] = useLocalStorage<Tab>('veltro:support-tab', 'mine')
  // si a la persona no le llegan tickets, «Me llegan» no existe
  const tab: Tab = stored === 'incoming' && !canReceive ? 'mine' : stored
  const [filter, setFilter] = useLocalStorage<string>('veltro:support-filter', 'all')
  const pending = useSupportPending()
  const counts = pending.data?.counts

  // al abrir algo desde fuera (Pulso, un enlace) la lista se pone en su pestaña
  const { data: activeTicket } = useTicket(active?.kind === 'ticket' ? active.id : undefined)
  const synced = useRef<string | null>(null)
  useEffect(() => {
    if (!active || synced.current === active.id) return
    if (active.kind === 'request') {
      synced.current = active.id
      if (tab !== 'requests') setTab('requests')
    } else if (activeTicket) {
      synced.current = active.id
      const want: Tab = activeTicket.mine || !canReceive ? 'mine' : 'incoming'
      if (tab !== want) setTab(want)
    }
  }, [active, activeTicket, tab, setTab, canReceive])

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'mine', label: t('tabs.mine'), count: counts?.replies ?? 0 },
    ...(canReceive ? [{ id: 'incoming' as const, label: t('tabs.incoming'), count: counts?.incoming ?? 0 }] : []),
    { id: 'requests', label: t('tabs.requests'), count: counts?.requests ?? 0 },
  ]

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="shrink-0 px-4 pb-3 pt-5">
        <div className="flex items-start gap-2">
          <div className="mr-auto min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">{t('title')}</h1>
            <p className="text-xs text-fg-muted">{t('subtitle')}</p>
          </div>
          <Menu>
            <MenuTrigger render={<Button variant="primary" size="sm" />}>
              <Plus />
              {t('new')}
            </MenuTrigger>
            <MenuContent align="end" className="w-60">
              <MenuItem onClick={openTicket}>
                <SupportIcon />
                {t('report')}
              </MenuItem>
              <MenuItem onClick={openRequest}>
                <Lightbulb />
                {t('improve')}
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>

        <div role="tablist" aria-label={t('title')} className="mt-4 flex gap-0.5 rounded-lg bg-sidebar p-0.5">
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={tab === x.id}
              onClick={() => {
                setTab(x.id)
                setFilter('all')
              }}
              className={cn(
                'inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs transition-colors',
                tab === x.id ? 'bg-panel font-medium text-fg shadow-card' : 'text-fg-muted hover:text-fg',
              )}
            >
              <span className="truncate">{x.label}</span>
              <CountBadge count={x.count} />
            </button>
          ))}
        </div>
      </div>

      {tab === 'requests' ? (
        <RequestColumn activeId={active?.kind === 'request' ? active.id : undefined} filter={filter} onFilter={setFilter} onNew={openRequest} />
      ) : (
        <TicketColumn key={tab} box={tab} activeId={active?.kind === 'ticket' ? active.id : undefined} filter={filter} onFilter={setFilter} onNew={openTicket} />
      )}
      {dialogs}
    </div>
  )
}

/** Fila de filtros por estado: «Todos» y los estados que tienen algo (o el elegido). */
function StatusFilters<S extends string>({ statuses, counts, value, onChange, label }: { statuses: S[]; counts: Map<string, number>; value: string; onChange: (v: string) => void; label: (s: S) => string }) {
  const t = useTranslations('support')
  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  const shown = statuses.filter((s) => (counts.get(s) ?? 0) > 0 || s === value)
  return (
    <div className="flex shrink-0 gap-1 overflow-x-auto px-4 pb-2 scrollbar-none" role="group" aria-label={t('filterLabel')}>
      {[{ id: 'all', label: t('filters.all'), n: total }, ...shown.map((s) => ({ id: s as string, label: label(s), n: counts.get(s) ?? 0 }))].map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onChange(f.id)}
          aria-pressed={value === f.id}
          className={cn(
            'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors',
            value === f.id ? 'bg-fg font-medium text-canvas' : 'text-fg-muted hover:bg-hover hover:text-fg',
          )}
        >
          {f.label}
          <span className="tabular-nums opacity-60">{f.n}</span>
        </button>
      ))}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-2">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[68px] rounded-xl" />
      ))}
    </div>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-2.5 pb-1 pt-4 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">{children}</p>
}

function EmptyColumn({ title, hint, action }: { title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium text-fg">{title}</p>
      <p className="mx-auto mt-1 max-w-64 text-xs leading-relaxed text-fg-muted">{hint}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

// ---------------- tickets ----------------

function TicketColumn({ box, activeId, filter, onFilter, onNew }: { box: TicketBox; activeId?: string; filter: string; onFilter: (v: string) => void; onNew: () => void }) {
  const t = useTranslations('support')
  const q = useTickets(box)
  const all = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of all) m.set(x.status, (m.get(x.status) ?? 0) + 1)
    return m
  }, [all])
  const list = filter === 'all' ? all : all.filter((x) => x.status === filter)
  const open = list.filter((x) => x.status !== 'resolved')
  const closed = list.filter((x) => x.status === 'resolved')

  return (
    <>
      {all.length ? <StatusFilters<TicketStatus> statuses={TICKET_STEPS} counts={counts} value={filter} onChange={onFilter} label={(s) => t(`status.${s}`)} /> : null}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-6 scrollbar-thin" aria-label={t(`tabs.${box}`)}>
        {q.isError ? (
          <ErrorState onRetry={() => q.refetch()} className="px-3" />
        ) : q.isLoading ? (
          <ListSkeleton />
        ) : !all.length ? (
          box === 'mine' ? (
            <EmptyColumn
              title={t('empty.mine')}
              hint={t('empty.mineHint')}
              action={
                <Button size="sm" onClick={onNew}>
                  <SupportIcon />
                  {t('report')}
                </Button>
              }
            />
          ) : (
            <EmptyColumn title={t('empty.incoming')} hint={t('empty.incomingHint')} action={<Link href="/settings/support" className="text-xs font-medium text-accent-ink hover:underline">{t('empty.incomingAction')}</Link>} />
          )
        ) : !list.length ? (
          <EmptyColumn title={t('noMatches')} hint={t('noMatchesHint')} />
        ) : (
          <>
            {open.map((x) => (
              <TicketItem key={x.id} ticket={x} box={box} active={x.id === activeId} />
            ))}
            {closed.length ? (
              <>
                {open.length ? <GroupLabel>{t('resolvedGroup')}</GroupLabel> : null}
                {closed.map((x) => (
                  <TicketItem key={x.id} ticket={x} box={box} active={x.id === activeId} />
                ))}
              </>
            ) : null}
            {q.hasNextPage ? (
              <div className="flex justify-center pt-3">
                <Button size="sm" variant="ghost" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
                  {t('loadMore')}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </nav>
    </>
  )
}

function TicketItem({ ticket: x, box, active }: { ticket: TicketSummary; box: TicketBox; active: boolean }) {
  const t = useTranslations('support')
  const ago = useAgo()
  const who = box === 'incoming' ? t('fromLine', { name: firstName(x.creator?.fullName) || t('someone') }) : t('toLine', { to: t(`destination.${x.destination}`) })
  const urgent = x.urgent && x.status !== 'resolved'
  return (
    <Link
      href={`/support/tickets/${x.id}`}
      aria-current={active ? 'page' : undefined}
      className={cn('flex gap-3 rounded-xl px-2.5 py-2.5 transition-colors', active ? 'bg-accent-soft' : 'hover:bg-hover')}
    >
      <ToneTile icon={CATEGORY_ICON[x.category]} tone={TICKET_TONE[x.status]} unread={x.unread} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="font-mono text-2xs text-fg-subtle">{x.code}</span>
          <span className="min-w-0 flex-1 truncate text-2xs text-fg-subtle">{ago(x.lastMessageAt)}</span>
          <span className="flex shrink-0 items-center gap-1 text-2xs text-fg-muted">
            <TicketStatusIcon status={x.status} className="size-3" />
            {t(`status.${x.status}`)}
          </span>
        </span>
        <span className={cn('line-clamp-2 text-sm leading-snug text-fg', x.unread ? 'font-semibold' : 'font-medium')}>{x.title}</span>
        <span className="flex min-w-0 items-center gap-2 text-xs text-fg-muted">
          <span className="min-w-0 truncate">{who}</span>
          {x.filesCount ? (
            <span className="flex shrink-0 items-center gap-0.5 text-fg-subtle" aria-label={t('filesCount', { count: x.filesCount })}>
              <Paperclip className="size-3" aria-hidden />
              {x.filesCount}
            </span>
          ) : null}
          {urgent ? <UrgentTag className="h-4 px-1.5" /> : null}
          {x.unread ? <span className="ml-auto shrink-0 font-semibold text-accent-ink">{t('newReply')}</span> : null}
        </span>
      </span>
    </Link>
  )
}

// ---------------- requerimientos ----------------

function RequestColumn({ activeId, filter, onFilter, onNew }: { activeId?: string; filter: string; onFilter: (v: string) => void; onNew: () => void }) {
  const t = useTranslations('support')
  const q = useRequests()
  const all = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of all) m.set(x.status, (m.get(x.status) ?? 0) + 1)
    return m
  }, [all])
  const list = filter === 'all' ? all : all.filter((x) => x.status === filter)
  const isClosed = (r: RequestSummary) => r.status === 'done' || r.status === 'declined'
  const open = list.filter((r) => !isClosed(r))
  const closed = list.filter(isClosed)

  return (
    <>
      {all.length ? <StatusFilters<RequestStatus> statuses={REQUEST_STATUSES} counts={counts} value={filter} onChange={onFilter} label={(s) => t(`requestStatus.${s}`)} /> : null}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-6 scrollbar-thin" aria-label={t('tabs.requests')}>
        {q.isError ? (
          <ErrorState onRetry={() => q.refetch()} className="px-3" />
        ) : q.isLoading ? (
          <ListSkeleton />
        ) : !all.length ? (
          <EmptyColumn
            title={t('empty.requests')}
            hint={t('empty.requestsHint')}
            action={
              <Button size="sm" onClick={onNew}>
                <Lightbulb />
                {t('improve')}
              </Button>
            }
          />
        ) : !list.length ? (
          <EmptyColumn title={t('noMatches')} hint={t('noMatchesHint')} />
        ) : (
          <>
            {open.map((r) => (
              <RequestItem key={r.id} request={r} active={r.id === activeId} />
            ))}
            {closed.length ? (
              <>
                {open.length ? <GroupLabel>{t('closedRequests')}</GroupLabel> : null}
                {closed.map((r) => (
                  <RequestItem key={r.id} request={r} active={r.id === activeId} />
                ))}
              </>
            ) : null}
            {q.hasNextPage ? (
              <div className="flex justify-center pt-3">
                <Button size="sm" variant="ghost" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
                  {t('loadMore')}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </nav>
    </>
  )
}

/** Los cuatro pasos de un requerimiento como rayitas: las alcanzadas en color. */
export function StepBar({ status }: { status: RequestStatus }) {
  const reached = REQUEST_STEPS.indexOf(status)
  return (
    <span className="flex gap-0.5" aria-hidden>
      {REQUEST_STEPS.map((st, i) => (
        <span key={st} className={cn('h-1 w-3 rounded-full', status === 'declined' ? 'bg-line-strong' : reached >= i ? 'bg-accent-mid' : 'bg-line-strong')} />
      ))}
    </span>
  )
}

function RequestItem({ request: r, active }: { request: RequestSummary; active: boolean }) {
  const t = useTranslations('support')
  const ago = useAgo()
  return (
    <Link
      href={`/support/requests/${r.id}`}
      aria-current={active ? 'page' : undefined}
      className={cn('flex gap-3 rounded-xl px-2.5 py-2.5 transition-colors', active ? 'bg-accent-soft' : 'hover:bg-hover')}
    >
      <ToneTile icon={Lightbulb} tone={REQUEST_TONE[r.status]} unread={r.unread} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="font-mono text-2xs text-fg-subtle">{r.code}</span>
          <span className="min-w-0 flex-1 truncate text-2xs text-fg-subtle">{ago(r.lastUpdate?.createdAt ?? r.updatedAt)}</span>
          <StatusPill label={t(`requestStatus.${r.status}`)} tone={REQUEST_TONE[r.status]} />
        </span>
        <span className={cn('line-clamp-2 text-sm leading-snug text-fg', r.unread ? 'font-semibold' : 'font-medium')}>{r.title}</span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2.5 text-xs text-fg-muted">
          <StepBar status={r.status} />
          <span className={cn('flex shrink-0 items-center gap-1 tabular-nums', r.supportedByMe ? 'font-medium text-accent-ink' : 'text-fg-subtle')} aria-label={t('supports', { count: r.supportersCount })}>
            <ThumbsUp className="size-3" aria-hidden />
            {r.supportersCount}
          </span>
          <span className="min-w-0 truncate">{r.mine ? t('mineRequest') : t('theirRequest', { name: firstName(r.creator?.fullName) || t('someone') })}</span>
          {r.unread ? <span className="ml-auto shrink-0 font-semibold text-accent-ink">{t('news')}</span> : null}
        </span>
      </span>
    </Link>
  )
}

// ---------------- sin nada abierto ----------------

/** A la derecha, sin nada abierto: las dos acciones con a quién le llega cada una. */
export function SupportWelcome() {
  const t = useTranslations('support')
  const { openTicket, openRequest, dialogs } = useSupportDialogs()
  const destination = useMyDestination()
  const destinationText = useDestinationText()
  const d = destination.data
  const people = d && d.destination !== 'veltro' ? d.recipients : null
  const ticketTo = d ? t('arrives', { to: d.onlyYou ? t(`destination.${d.destination}`) : destinationText(d.destination, people) }) : ' '
  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-md">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
          <SupportIcon className="size-6" />
        </span>
        <h2 className="mt-4 text-xl font-semibold tracking-tight text-fg">{t('welcome.title')}</h2>
        <p className="mt-1 text-sm leading-relaxed text-fg-muted">{t('welcome.body')}</p>

        <div className="mt-6 divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-panel shadow-card">
          <button type="button" onClick={openTicket} className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-hover/60">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg">
              <SupportIcon className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-fg">{t('report')}</span>
              <span className="block truncate text-xs text-fg-muted">{ticketTo}</span>
            </span>
            {d ? <PeopleOrVeltro people={people} /> : null}
            <ChevronRight className="size-4 shrink-0 text-fg-subtle transition-transform duration-150 group-hover:translate-x-0.5" />
          </button>
          <button type="button" onClick={openRequest} className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-hover/60">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
              <Lightbulb className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-fg">{t('improve')}</span>
              <span className="block truncate text-xs text-fg-muted">{t('arrives', { to: t('to.veltro') })}</span>
            </span>
            <VeltroTile size={26} />
            <ChevronRight className="size-4 shrink-0 text-fg-subtle transition-transform duration-150 group-hover:translate-x-0.5" />
          </button>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-fg-subtle">{t('welcome.replies')}</p>
      </div>
      {dialogs}
    </div>
  )
}
