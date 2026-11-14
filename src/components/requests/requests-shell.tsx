'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { CountBadge, useAgo } from '@/components/support/support-bits'
import { useLocalStorage } from '@/lib/hooks'
import { isClosed, useRequestSummary, useRequests, type DeptRequest, type RequestBox } from '@/lib/queries/requests'
import { cn } from '@/lib/utils'
import { DeptMark, KIND_ICON, REQUEST_TONE, RequestStatusIcon, RequestsIcon } from './request-bits'
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
    <div className="flex h-full min-h-0">
      <aside className={cn('min-h-0 w-full shrink-0 border-line lg:flex lg:w-[380px] lg:border-r', activeId ? 'hidden' : 'flex')}>
        <RequestList activeId={activeId} />
      </aside>
      <main className={cn('min-h-0 min-w-0 flex-1', activeId ? 'flex' : 'hidden lg:flex')}>{children}</main>
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
  const { data: summary } = useRequestSummary()
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
      <div className="shrink-0 px-4 pb-2 pt-5">
        <div className="flex items-start gap-2">
          <div className="mr-auto min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">{t('title')}</h1>
            <p className="text-xs text-fg-muted">{t('subtitle')}</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus />
            {t('new')}
          </Button>
        </div>

        {tabs.length > 1 ? (
          <div role="tablist" aria-label={t('title')} className="mt-4 flex gap-0.5 rounded-lg bg-sidebar p-0.5">
            {tabs.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={box === x.id}
                onClick={() => setBox(x.id)}
                className={cn(
                  'inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs transition-colors',
                  box === x.id ? 'bg-panel font-medium text-fg shadow-card' : 'text-fg-muted hover:text-fg',
                )}
              >
                <span className="truncate">{x.label}</span>
                <CountBadge count={x.count} />
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-3 flex items-center gap-1.5">
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
export function RequestsWelcome() {
  const t = useTranslations('requests')
  const [creating, setCreating] = useState(false)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
        <RequestsIcon className="size-7" />
      </span>
      <div>
        <p className="text-base font-semibold text-fg">{t('welcomeTitle')}</p>
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-fg-muted">{t('welcomeBody')}</p>
      </div>
      <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
        <Plus />
        {t('new')}
      </Button>
      <NewRequestDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}
