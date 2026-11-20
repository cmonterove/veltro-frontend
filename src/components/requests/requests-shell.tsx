'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, ChevronDown, ListChecks, Plus, Search, X } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { CountBadge, useAgo } from '@/components/support/support-bits'
import { useHydrated, useLocalStorage } from '@/lib/hooks'
import { isClosed, useRequestSummary, useRequests, type DeptRequest, type RequestBox } from '@/lib/queries/requests'
import { cn } from '@/lib/utils'
import { CARD } from '@/components/ui/surface'
import { DeptMark, KIND_ICON, REQUEST_TONE, RequestStatusIcon } from './request-bits'
import { NewRequestDialog } from './new-request-dialog'

type State = 'open' | 'closed' | 'all'

/**
 * Solicitudes: la lista queda fija a la izquierda y a la derecha va la abierta (en el celular, una
 * u otra). «Me llegan» es la bandeja de mis departamentos (los admins ven la de todos); «Las mías»,
 * lo que pedí yo.
 */
export function RequestsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const activeId = pathname.match(/^\/requests\/([^/]+)/)?.[1]
  return (
    <div className="flex h-full min-h-0 gap-4 px-4 pb-4 pt-4 sm:px-6">
      <aside className={cn(CARD, 'min-h-0 w-full shrink-0 overflow-hidden lg:flex lg:w-[380px]', activeId ? 'hidden' : 'flex')}>
        <RequestList activeId={activeId} />
      </aside>
      {/* la abierta va en su tarjeta; sin abierta, el tablero o el ejemplo arman la suya */}
      <main className={cn('min-h-0 min-w-0 flex-1', activeId ? cn(CARD, 'flex overflow-hidden') : 'hidden lg:flex')}>{children}</main>
    </div>
  )
}

/** ¿Atiende solicitudes? (es de algún departamento o es admin). */
export function useHandlesRequests() {
  const { data } = useRequestSummary()
  return Boolean(data && (data.handlesAll || data.myDepartments.length > 0))
}

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

function RequestList({ activeId }: { activeId?: string }) {
  const t = useTranslations('requests')
  const { departments } = useApp()
  // el resumen puede llegar antes de hidratar (lo pidió la barra lateral): hasta entonces se dibuja
  // como en el servidor, sin datos, y así las pestañas no desajustan la hidratación
  const hydrated = useHydrated()
  const { data } = useRequestSummary()
  const summary = hydrated ? data : undefined
  const handles = Boolean(summary && (summary.handlesAll || summary.myDepartments.length > 0))
  const [stored, setBox] = useLocalStorage<RequestBox | null>('veltro:requests-box', null)
  // quien atiende abre en su bandeja; quien no, en lo que pidió
  const box: RequestBox = stored === 'inbox' && summary && !handles ? 'mine' : (stored ?? (handles ? 'inbox' : 'mine'))
  const [state, setState] = useLocalStorage<State>('veltro:requests-state', 'open')
  const [dept, setDept] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const q = useDebounced(query.trim())
  const [creating, setCreating] = useState(false)
  const list = useRequests(box, { state, departmentId: box === 'inbox' ? (dept ?? undefined) : undefined, q: q || undefined })
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data])

  // los departamentos que puedo filtrar en mi bandeja (todos si soy admin)
  const inboxDepts = useMemo(
    () => (summary?.handlesAll ? departments : departments.filter((d) => summary?.myDepartments.includes(d.id))),
    [summary, departments],
  )
  const counts = summary?.counts
  const tabs: { id: RequestBox; label: string; count: number }[] = [
    ...(handles ? [{ id: 'inbox' as const, label: t('tabs.inbox'), count: counts?.inboxNew ?? 0 }] : []),
    { id: 'mine', label: t('tabs.mine'), count: counts?.mineUnread ?? 0 },
  ]
  const current = departments.find((d) => d.id === dept)

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="on-frame day-surface shrink-0 px-4 pb-3.5 pt-4">
        <div className="flex items-start gap-2">
          <div className="mr-auto min-w-0">
            <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.02em]">{t('title')}</h1>
            <p className="mt-0.5 text-xs text-fg-muted">{t('subtitle')}</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus />
            {t('new')}
          </Button>
        </div>

        {tabs.length > 1 ? (
          <div role="tablist" aria-label={t('title')} className="mt-3.5 flex gap-0.5 rounded-xl bg-fg/[0.08] p-0.5">
            {tabs.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={box === x.id}
                onClick={() => setBox(x.id)}
                className={cn(
                  'inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-2 text-xs transition-colors duration-150',
                  box === x.id ? 'bg-fg/[0.16] font-semibold text-fg' : 'text-fg-muted hover:text-fg',
                )}
              >
                <span className="truncate">{x.label}</span>
                <CountBadge count={x.count} />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="shrink-0 px-4 pb-2 pt-3">
        <div className="flex items-center gap-1.5">
          <label className="relative flex min-w-0 flex-1 items-center">
            <Search className="pointer-events-none absolute left-2.5 size-3.5 text-fg-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
              placeholder={t('search')}
              aria-label={t('search')}
              className="h-8 w-full rounded-lg border border-line bg-panel pl-8 pr-7 text-sm outline-none transition-[border-color] placeholder:text-fg-subtle hover:border-line-strong focus:border-accent-mid"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} className="absolute right-1.5 inline-flex size-5 items-center justify-center rounded text-fg-subtle hover:text-fg" aria-label={t('clearSearch')}>
                <X className="size-3.5" />
              </button>
            ) : null}
          </label>
          {box === 'inbox' && inboxDepts.length > 1 ? (
            <Menu>
              <MenuTrigger
                className={cn(
                  'inline-flex h-8 max-w-36 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-xs outline-none transition-colors',
                  current ? 'border-accent-mid/40 bg-accent-soft text-accent-ink' : 'border-line text-fg-muted hover:bg-hover hover:text-fg',
                )}
              >
                {current ? <DeptMark name={current.name} size={16} /> : null}
                <span className="truncate">{current?.name ?? t('allDepartments')}</span>
                <ChevronDown className="size-3.5 shrink-0" />
              </MenuTrigger>
              <MenuContent align="end" className="w-56">
                <MenuLabel>{t('department')}</MenuLabel>
                <MenuItem onClick={() => setDept(null)}>
                  <span className="flex-1">{t('allDepartments')}</span>
                  {!dept ? <Check className="!text-fg" /> : null}
                </MenuItem>
                <MenuSeparator />
                {inboxDepts.map((d) => (
                  <MenuItem key={d.id} onClick={() => setDept(d.id)}>
                    <DeptMark name={d.name} size={18} />
                    <span className="flex-1 truncate">{d.name}</span>
                    {dept === d.id ? <Check className="!text-fg" /> : null}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          ) : null}
        </div>

        <div className="mt-2 flex gap-1" role="group" aria-label={t('stateLabel')}>
          {(['open', 'closed', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setState(s)}
              aria-pressed={state === s}
              className={cn(
                'inline-flex h-7 items-center rounded-full px-2.5 text-xs transition-colors',
                state === s ? 'bg-fg font-medium text-canvas' : 'text-fg-muted hover:bg-hover hover:text-fg',
              )}
            >
              {t(`state.${s}`)}
            </button>
          ))}
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-6 pt-1 scrollbar-thin" aria-label={t(`tabs.${box}`)}>
        {list.isError && !list.data ? (
          <ErrorState onRetry={() => list.refetch()} className="px-3" />
        ) : !list.data ? (
          <div className="flex flex-col gap-2 px-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[76px] rounded-xl" />
            ))}
          </div>
        ) : !items.length ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-fg">{q ? t('empty.search') : t(`empty.${box}`)}</p>
            <p className="mx-auto mt-1 max-w-64 text-xs leading-relaxed text-fg-muted">{q ? t('empty.searchHint') : t(`empty.${box}Hint`)}</p>
            {box === 'mine' && !q ? (
              <Button size="sm" className="mt-4" onClick={() => setCreating(true)}>
                <Plus />
                {t('new')}
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            {items.map((x) => (
              <RequestItem key={x.id} request={x} box={box} active={x.id === activeId} />
            ))}
            {list.hasNextPage ? (
              <div className="flex justify-center pt-3">
                <Button size="sm" variant="ghost" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
                  {t('loadMore')}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </nav>
      <NewRequestDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}

function RequestItem({ request: x, box, active }: { request: DeptRequest; box: RequestBox; active: boolean }) {
  const t = useTranslations('requests')
  const ago = useAgo()
  const Icon = KIND_ICON[x.kind]
  const closed = isClosed(x.status)
  return (
    <Link
      href={`/requests/${x.id}`}
      aria-current={active ? 'page' : undefined}
      className={cn('flex gap-3 rounded-xl px-2.5 py-2.5 transition-colors', active ? 'bg-accent-soft' : 'hover:bg-hover', closed && !active && 'opacity-75')}
    >
      <span className="relative size-9 shrink-0">
        <span className={cn('flex size-full items-center justify-center rounded-[10px]', REQUEST_TONE[x.status])}>
          <Icon className="size-4" aria-hidden />
        </span>
        {x.unread ? <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-accent ring-2 ring-panel" aria-hidden /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="font-mono text-2xs text-fg-subtle">{x.code}</span>
          <span className="min-w-0 flex-1 truncate text-2xs text-fg-subtle">{ago(x.lastActivityAt)}</span>
          <span className="flex shrink-0 items-center gap-1 text-2xs text-fg-muted">
            <RequestStatusIcon status={x.status} className="size-3" />
            {t(`status.${x.status}`)}
          </span>
        </span>
        <span className={cn('line-clamp-2 text-sm leading-snug text-fg', x.unread ? 'font-semibold' : 'font-medium')}>{x.title}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
          {box === 'inbox' ? (
            <>
              <Avatar name={x.requester.fullName} src={x.requester.avatarUrl} seed={x.requester.id} size={16} />
              <span className="min-w-0 truncate">
                {x.requester.fullName.split(' ')[0]}
                {x.requester.department ? ` · ${x.requester.department.name}` : ''}
              </span>
            </>
          ) : x.department ? (
            <>
              <DeptMark name={x.department.name} size={16} />
              <span className="min-w-0 truncate">{t('toDept', { name: x.department.name })}</span>
            </>
          ) : null}
          {x.tasks.total ? (
            <span className="shrink-0 tabular-nums text-fg-subtle">· {t('tasksDone', { done: x.tasks.done, total: x.tasks.total })}</span>
          ) : null}
          {x.urgent && !closed ? <span className="ml-auto inline-flex h-4 shrink-0 items-center rounded-full bg-danger-soft px-1.5 text-2xs font-semibold text-danger">{t('urgent')}</span> : null}
          {box === 'inbox' && !x.assignee && x.status === 'new' ? (
            <span className={cn('shrink-0 font-semibold text-mandarina-ink', !(x.urgent && !closed) && 'ml-auto')}>{t('unassigned')}</span>
          ) : null}
        </span>
      </span>
    </Link>
  )
}

/** Sin una abierta: qué es Solicitudes y cómo empezar. */
/** Las etapas de una solicitud abierta, en orden (resuelta y rechazada son el final). */
const PIPELINE = ['new', 'in_review', 'in_progress', 'delivered'] as const

/**
 * Lo que se ve sin una solicitud abierta. Si hay solicitudes abiertas: en qué etapa está cada una
 * (lo que le llegó a mi departamento o, si no atiendo, lo que pedí), como un tablero. Si no hay
 * ninguna: una solicitud de ejemplo recorriendo sus etapas, y pedirle algo a un departamento.
 */
export function RequestsWelcome() {
  const handles = useHandlesRequests()
  const box: RequestBox = handles ? 'inbox' : 'mine'
  const list = useRequests(box, { state: 'open' })
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data])
  if (!list.data) {
    return (
      <div className={cn(CARD, 'flex flex-1 gap-3 p-4')}>
        {PIPELINE.map((s) => (
          <Skeleton key={s} className="flex-1 rounded-2xl" />
        ))}
      </div>
    )
  }
  return items.length ? <Pipeline items={items} box={box} /> : <HowItWorks />
}

function Pipeline({ items, box }: { items: DeptRequest[]; box: RequestBox }) {
  const t = useTranslations('requests')
  const ago = useAgo()
  return (
    <section className={cn(CARD, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
      <header className="shrink-0 px-5 pb-3 pt-4">
        <h2 className="text-base font-semibold tracking-[-0.015em] text-fg">{t(`pipeline.${box}`)}</h2>
        <p className="text-xs text-fg-muted">{t('pipeline.hint', { count: items.length })}</p>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto px-4 pb-4 scrollbar-thin xl:grid-cols-4">
        {PIPELINE.map((status) => {
          const col = items.filter((x) => x.status === status)
          return (
            <section key={status} className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-canvas/80 ring-1 ring-line-soft">
              <header className={cn('flex h-11 shrink-0 items-center gap-2 px-3', REQUEST_TONE[status])}>
                <RequestStatusIcon status={status} className="size-4" />
                <span className="text-sm font-semibold">{t(`status.${status}`)}</span>
                <span className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-panel/70 px-1.5 text-[11px] font-semibold tabular-nums text-fg">{col.length}</span>
              </header>
              <ul className="flex flex-col gap-2 p-2">
                {col.slice(0, 6).map((r) => {
                  const who = box === 'inbox' ? (r.requester.department?.name ?? r.requester.fullName) : (r.department?.name ?? '')
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/requests/${r.id}`}
                        className="block rounded-xl bg-panel p-3 shadow-card ring-1 ring-line-soft transition-[box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:shadow-[0_8px_20px_-12px_oklch(0.3_0.09_312/0.35)] hover:ring-line"
                      >
                        <span className="flex items-center gap-1.5 text-2xs text-fg-subtle">
                          <span className="font-mono font-semibold">{r.code}</span>
                          {r.urgent ? <span className="rounded-sm bg-danger-soft px-1 font-semibold text-danger">{t('urgent')}</span> : null}
                          {r.unread ? <span className="ml-auto size-1.5 rounded-full bg-accent" /> : null}
                        </span>
                        <span className="mt-1 line-clamp-2 block text-sm font-medium leading-snug text-fg">{r.title}</span>
                        <span className="mt-2 flex items-center gap-1.5 text-xs text-fg-muted">
                          <DeptMark name={who} size={18} />
                          <span className="min-w-0 truncate">{who}</span>
                          <span className="ml-auto shrink-0 text-fg-subtle">{ago(r.lastActivityAt)}</span>
                        </span>
                      </Link>
                    </li>
                  )
                })}
                {col.length === 0 ? <li className="rounded-xl border border-dashed border-line-strong/70 px-3 py-5 text-center text-xs text-fg-subtle">{t('pipeline.emptyColumn')}</li> : null}
              </ul>
            </section>
          )
        })}
      </div>
    </section>
  )
}

function HowItWorks() {
  const t = useTranslations('requests')
  const { departments, members, user } = useApp()
  const [creating, setCreating] = useState<string | null>(null)
  // a quién se le puede pedir: los otros departamentos primero
  const myDept = members.find((m) => m.id === user.id)?.department_id ?? null
  const targets = [...departments].filter((d) => d.id !== myDept).sort((a, b) => a.name.localeCompare(b.name))
  const current = 2 // el ejemplo va «en curso»
  return (
    <section className={cn(CARD, 'flex min-h-0 flex-1 overflow-y-auto scrollbar-thin')}>
      <div className="m-auto w-full max-w-5xl px-8 py-10">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="min-w-0">
            <h2 className="text-[24px] font-semibold leading-tight tracking-[-0.025em] text-fg">{t('welcomeTitle')}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{t('welcomeBody')}</p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              {targets.slice(0, 4).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setCreating(d.id)}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-panel pl-1.5 pr-3.5 text-sm font-medium text-fg shadow-card ring-1 ring-line-soft transition-[box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:ring-accent-mid/50"
                >
                  <DeptMark name={d.name} size={24} className="rounded-full" />
                  {t('askToName', { name: d.name })}
                </button>
              ))}
              <Button variant="primary" size="md" onClick={() => setCreating('')}>
                <Plus />
                {t('new')}
              </Button>
            </div>
          </div>

          {/* una solicitud de ejemplo, en su etapa, flotando sobre la ciruela del marco */}
          <div className="on-frame day-surface rounded-[24px] p-6 shadow-[0_18px_40px_-24px_oklch(0.3_0.12_312/0.55)] sm:p-8" aria-hidden>
            <div className="on-sheet rounded-2xl bg-panel p-4 shadow-lift">
              <div className="flex items-center gap-2 text-2xs text-fg-subtle">
                <span className="font-mono font-semibold">SOL-0001</span>
                <span className="rounded-sm bg-hover px-1">{t('kind.access')}</span>
                <RequestStatusIcon status="in_progress" className="ml-auto size-4" />
              </div>
              <p className="mt-1.5 text-[15px] font-semibold text-fg">{t('example.title')}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-fg-muted">
                <DeptMark name={t('example.from')} size={18} />
                {t('example.from')}
                <span className="text-fg-subtle">→</span>
                <DeptMark name={t('example.to')} size={18} />
                {t('example.to')}
              </p>
              <ol className="mt-4 grid grid-cols-4 gap-1">
                {PIPELINE.map((st, i) => (
                  <li key={st} className="flex flex-col gap-1.5">
                    <span className={cn('h-1.5 rounded-full', i <= current ? (i === current ? 'bg-info' : 'bg-info/45') : 'bg-hover')} />
                    <span className={cn('text-2xs', i === current ? 'font-semibold text-fg' : 'text-fg-subtle')}>{t(`status.${st}`)}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-sidebar/60 px-2.5 py-2 text-xs text-fg-muted">
                <ListChecks className="size-3.5 shrink-0 text-st-progress" />
                {t('example.tasks')}
              </p>
            </div>
          </div>
        </div>

        {/* cómo avanza: las cuatro etapas y qué pasa en cada una */}
        <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PIPELINE.map((st, i) => (
            <li key={st} className="flex gap-3 rounded-2xl bg-canvas/70 p-4 ring-1 ring-line-soft">
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums', REQUEST_TONE[st])}>{i + 1}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-fg">{t(`status.${st}`)}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">{t(`stepHint.${st}`)}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <NewRequestDialog open={creating !== null} onOpenChange={(o) => !o && setCreating(null)} defaultDepartment={creating || undefined} />
    </section>
  )
}
