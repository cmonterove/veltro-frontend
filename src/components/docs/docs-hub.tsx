'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { differenceInCalendarDays, formatDistanceToNowStrict, isToday } from 'date-fns'
import { CalendarDays, ChevronDown, FilePlus2, FileText, LayoutGrid, Rows3, Search, Shapes, UserPen, X } from 'lucide-react'
import { canEdit, useApp, useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { DocMark, WorkspaceMark } from '@/components/app/marks'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { FilterFacet, type FilterOption } from '@/components/tasks/task-filters'
import { useCreateDoc, useDocsIn } from '@/lib/queries/docs'
import { useDateLocale } from '@/lib/dates'
import { useLocalStorage } from '@/lib/hooks'
import { cn, excerptOf, positionBetween } from '@/lib/utils'
import type { DocSummary, WorkspaceWithRole } from '@/lib/types'

/** Tipos de documento, como los agrupa la biblioteca de cada espacio. */
const KINDS = ['docs', 'meeting', 'claude'] as const
type Kind = (typeof KINDS)[number]
const kindOf = (d: Pick<DocSummary, 'source'>): Kind => (d.source === 'meeting' ? 'meeting' : d.source === 'claude' ? 'claude' : 'docs')

type DocFilters = { ws: string[]; kind: string[]; who: string[] }
type FilterKey = keyof DocFilters
const NO_FILTERS: DocFilters = { ws: [], kind: [], who: [] }
type GroupBy = 'date' | 'space'
const BUCKETS = ['today', 'week', 'month', 'older'] as const

/**
 * Todos los documentos de todos los espacios en un lugar: lo último que se tocó arriba, para seguir
 * donde quedaste, y debajo la lista completa por fecha o por espacio, con búsqueda y filtros.
 */
/** `embedded`: dentro de la Bóveda (pestaña Escritos), sin encabezado propio. */
export function DocsHub({ embedded = false }: { embedded?: boolean } = {}) {
  const t = useTranslations('docsHub')
  const td = useTranslations('docs')
  const { workspaces, observedWorkspaces, user } = useApp()
  const wsMap = useWorkspaceMap()
  const memberMap = useMemberMap()
  const all = useMemo(() => [...workspaces, ...observedWorkspaces], [workspaces, observedWorkspaces])
  const ids = useMemo(() => all.map((w) => w.id), [all])
  const docsQuery = useDocsIn(ids)
  // sin espacios no hay nada que pedir: vacío, no "cargando"
  const docs = ids.length ? docsQuery.data : []
  const isLoading = ids.length > 0 && docsQuery.isLoading
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useLocalStorage<DocFilters>('veltro:docs-filters', NO_FILTERS)
  const [groupBy, setGroupBy] = useLocalStorage<GroupBy>('veltro:docs-group', 'date')
  const q = query.trim().toLowerCase()

  const matches = (d: DocSummary, skip?: FilterKey) =>
    (!q || d.title.toLowerCase().includes(q) || (d.excerpt ?? '').toLowerCase().includes(q)) &&
    (skip === 'ws' || !filters.ws.length || filters.ws.includes(d.workspace_id)) &&
    (skip === 'kind' || !filters.kind.length || filters.kind.includes(kindOf(d))) &&
    (skip === 'who' || !filters.who.length || (d.created_by != null && filters.who.includes(d.created_by)))

  const list = (docs ?? []).filter((d) => matches(d))
  const filtering = q !== '' || filters.ws.length + filters.kind.length + filters.who.length > 0

  // cada opción cuenta con los demás filtros (y la búsqueda) aplicados
  const tally = (k: FilterKey, keyOf: (d: DocSummary) => string | null) => {
    const m = new Map<string, number>()
    for (const d of docs ?? []) {
      if (!matches(d, k)) continue
      const v = keyOf(d)
      if (v) m.set(v, (m.get(v) ?? 0) + 1)
    }
    return m
  }
  const wsCount = tally('ws', (d) => d.workspace_id)
  const kindCount = tally('kind', kindOf)
  const whoCount = tally('who', (d) => d.created_by)
  const wsOptions: FilterOption[] = all.map((w) => ({
    value: w.id,
    label: w.name,
    icon: <WorkspaceMark ws={w} size={16} />,
    count: wsCount.get(w.id) ?? 0,
  }))
  const kindOptions: FilterOption[] = KINDS.map((k) => ({
    value: k,
    label: td(`library.groups.${k}`),
    icon: <DocMark source={k === 'docs' ? 'manual' : k} />,
    count: kindCount.get(k) ?? 0,
  }))
  const authors = [...new Set([...(docs ?? []).flatMap((d) => (d.created_by ? [d.created_by] : [])), ...filters.who])]
  const whoOptions: FilterOption[] = authors
    .map((id) => {
      const m = memberMap.get(id)
      return {
        value: id,
        label: m?.full_name ?? '?',
        icon: <Avatar name={m?.full_name} src={m?.avatar_url} seed={id} size={18} />,
        count: whoCount.get(id) ?? 0,
      }
    })
    .sort((a, b) => Number(b.value === user.id) - Number(a.value === user.id) || a.label.localeCompare(b.label))
  const toggle = (k: FilterKey) => (v: string, on: boolean) =>
    setFilters((f) => ({
      ...f,
      [k]: on ? [...f[k].filter((x) => x !== v), v] : f[k].filter((x) => x !== v),
    }))
  const clear = (k: FilterKey) => () => setFilters((f) => ({ ...f, [k]: [] }))

  const groups = (() => {
    if (groupBy === 'space') {
      return all.flatMap((w) => {
        const items = list.filter((d) => d.workspace_id === w.id)
        return items.length
          ? [
              {
                id: w.id,
                label: w.name,
                icon: <WorkspaceMark ws={w} size={16} />,
                items,
              },
            ]
          : []
      })
    }
    const now = new Date()
    const bucket = (d: DocSummary) => {
      const at = new Date(d.updated_at)
      if (isToday(at)) return 'today'
      const days = differenceInCalendarDays(now, at)
      return days < 7 ? 'week' : days < 30 ? 'month' : 'older'
    }
    return BUCKETS.flatMap((b) => {
      const items = list.filter((d) => bucket(d) === b)
      return items.length ? [{ id: b, label: t(`buckets.${b}`), icon: null, items }] : []
    })
  })()

  const spaces = new Set((docs ?? []).map((d) => d.workspace_id)).size

  return (
    <div className={cn('flex min-h-0 flex-col', embedded ? 'flex-1' : 'h-full')}>
      {embedded ? null : (
        <div className="shrink-0 border-b border-line px-4 pb-4 pt-6 sm:px-6">
          <div className="flex flex-wrap items-start gap-3">
            <div className="mr-auto min-w-0">
              <h1 className="text-lg font-semibold tracking-tight">{t('title')}</h1>
              <p className="truncate text-sm text-fg-muted">{docs ? t('subtitle', { count: docs.length, spaces }) : ' '}</p>
            </div>
            <NewDocButton workspaces={workspaces.filter((w) => canEdit(w))} />
          </div>
        </div>
      )}

      <div role="search" aria-label={t('filters')} className="flex shrink-0 items-start gap-2 border-b border-line px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <SearchBox value={query} onChange={setQuery} placeholder={t('search')} clearLabel={t('clearSearch')} />
          <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden />
          {all.length > 1 ? <FilterFacet icon={<LayoutGrid />} label={t('space')} options={wsOptions} value={filters.ws} onToggle={toggle('ws')} onClear={clear('ws')} /> : null}
          <FilterFacet icon={<Shapes />} label={t('kind')} options={kindOptions} value={filters.kind} onToggle={toggle('kind')} onClear={clear('kind')} />
          <FilterFacet
            icon={<UserPen />}
            label={t('author')}
            options={whoOptions}
            value={filters.who}
            onToggle={toggle('who')}
            onClear={clear('who')}
            searchable={whoOptions.length > 7}
          />
          {filters.ws.length + filters.kind.length + filters.who.length ? (
            <button
              type="button"
              onClick={() => setFilters(NO_FILTERS)}
              className="inline-flex h-8 items-center rounded-lg px-2 text-sm text-fg-muted hover:bg-hover hover:text-fg"
            >
              {t('clearAll')}
            </button>
          ) : null}
        </div>
        <div className="flex h-8 shrink-0 items-center gap-2">
          {embedded ? <NewDocButton workspaces={workspaces.filter((w) => canEdit(w))} size="sm" /> : null}
          <Menu>
            <MenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/40 data-[popup-open]:bg-hover">
              <Rows3 className="size-3.5" />
              <span className="hidden md:inline">{t('groupBy')}</span>
              <span className="font-medium text-fg">{t(`groups.${groupBy}`)}</span>
              <ChevronDown className="size-3.5 opacity-50" />
            </MenuTrigger>
            <MenuContent align="end" className="w-48">
              <MenuRadioGroup value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                <MenuRadioItem value="date" closeOnClick>
                  <CalendarDays />
                  {t('groups.date')}
                </MenuRadioItem>
                <MenuRadioItem value="space" closeOnClick>
                  <LayoutGrid />
                  {t('groups.space')}
                </MenuRadioItem>
              </MenuRadioGroup>
            </MenuContent>
          </Menu>
          {filtering && docs ? <span className="whitespace-nowrap text-xs tabular-nums text-fg-subtle">{t('shownOf', { shown: list.length, count: docs.length })}</span> : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6">
          {docsQuery.isError ? (
            <ErrorState onRetry={() => docsQuery.refetch()} />
          ) : isLoading || !docs ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-44 rounded-xl" />
              ))}
            </div>
          ) : docs.length === 0 ? (
            <EmptyState icon={<FileText />} title={t('emptyTitle')} description={t('emptyBody')} action={<NewDocButton workspaces={workspaces.filter((w) => canEdit(w))} />} />
          ) : list.length === 0 ? (
            <EmptyState
              icon={<Search />}
              title={t('noMatches')}
              description={t('noMatchesHint')}
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setQuery('')
                    setFilters(NO_FILTERS)
                  }}
                >
                  {t('clearFilters')}
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-10">
              {!filtering ? (
                <section>
                  <h2 className="mb-3 text-sm font-semibold">{t('resume')}</h2>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {list.slice(0, 4).map((d) => (
                      <RecentCard key={d.id} doc={d} ws={wsMap.get(d.workspace_id)} />
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="flex flex-col gap-7">
                {!filtering ? <h2 className="-mb-4 text-sm font-semibold">{t('all')}</h2> : null}
                {groups.map((g) => (
                  <div key={g.id}>
                    <h3 className="mb-1 flex items-center gap-2 text-xs font-medium text-fg-subtle">
                      {g.icon}
                      <span className={cn(g.icon && 'text-sm font-semibold text-fg')}>{g.label}</span>
                      <span className="tabular-nums">{g.items.length}</span>
                    </h3>
                    <ul className="flex flex-col divide-y divide-line-soft">
                      {g.items.map((d) => (
                        <DocRow key={d.id} doc={d} ws={wsMap.get(d.workspace_id)} showSpace={groupBy !== 'space'} />
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Tarjeta de "Seguir donde quedaste": tiene el tono del espacio para reconocerla de un vistazo. */
function RecentCard({ doc, ws }: { doc: DocSummary; ws?: WorkspaceWithRole }) {
  const td = useTranslations('docs')
  const locale = useDateLocale()
  const author = useMemberMap().get(doc.created_by ?? '')
  return (
    <Link
      href={ws ? `/w/${ws.slug}/docs/${doc.id}` : '#'}
      className={cn(
        'ws-' + (ws?.color ?? 'violet'),
        'group/card flex h-44 flex-col rounded-xl border p-4 transition-[border-color,box-shadow,background-color] hover:shadow-card',
        '[background:color-mix(in_oklch,var(--ws-color)_5%,var(--panel))] [border-color:color-mix(in_oklch,var(--ws-color)_20%,var(--line))] hover:[border-color:color-mix(in_oklch,var(--ws-color)_45%,var(--line))]',
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-2xs font-medium text-fg-muted">
        {ws ? <WorkspaceMark ws={ws} size={14} /> : null}
        <span className="truncate">{ws?.name}</span>
        <span aria-hidden className="text-fg-subtle">
          ·
        </span>
        <DocMark source={doc.source} className="size-3" />
        <span className="truncate text-fg-subtle">{td(`kicker.${doc.source}`)}</span>
      </span>
      <span className="mt-2.5 line-clamp-2 text-[15px] font-semibold leading-snug text-fg group-hover/card:underline group-hover/card:decoration-line-strong group-hover/card:underline-offset-4">
        {doc.title || td('untitled')}
      </span>
      <span className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-fg-muted">{excerptOf(doc.excerpt) || td('library.emptyDoc')}</span>
      <span className="mt-auto flex items-center gap-2 pt-3">
        {author ? <Avatar name={author.full_name} src={author.avatar_url} seed={author.id} size={18} /> : null}
        <span className="truncate text-xs text-fg-subtle">
          {formatDistanceToNowStrict(new Date(doc.updated_at), {
            addSuffix: true,
            locale,
          })}
        </span>
      </span>
    </Link>
  )
}

function DocRow({ doc, ws, showSpace }: { doc: DocSummary; ws?: WorkspaceWithRole; showSpace: boolean }) {
  const td = useTranslations('docs')
  const locale = useDateLocale()
  const author = useMemberMap().get(doc.created_by ?? '')
  const sub = excerptOf(doc.excerpt, 110)
  return (
    <li>
      <Link href={ws ? `/w/${ws.slug}/docs/${doc.id}` : '#'} className="-mx-3 flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-hover/70">
        <DocMark source={doc.source} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-fg">{doc.title || td('untitled')}</span>
          {sub ? <span className="truncate text-xs text-fg-subtle">{sub}</span> : null}
        </span>
        {showSpace && ws ? (
          <span className="hidden max-w-40 shrink-0 items-center gap-1.5 rounded-md border border-line px-1.5 py-0.5 text-2xs text-fg-muted md:inline-flex">
            <WorkspaceMark ws={ws} size={14} />
            <span className="truncate">{ws.name}</span>
          </span>
        ) : null}
        <span className="hidden w-28 shrink-0 text-right text-xs text-fg-subtle sm:block">
          {formatDistanceToNowStrict(new Date(doc.updated_at), {
            addSuffix: true,
            locale,
          })}
        </span>
        {author ? <Avatar name={author.full_name} src={author.avatar_url} seed={author.id} size={20} /> : <span className="size-5 shrink-0" />}
      </Link>
    </li>
  )
}

/** Con un solo espacio crea ahí; con varios, pregunta dónde. */
function NewDocButton({ workspaces, size }: { workspaces: WorkspaceWithRole[]; size?: 'sm' }) {
  const t = useTranslations('docsHub')
  const router = useRouter()
  const create = useCreateDoc()
  if (!workspaces.length) return null
  const newIn = (w: WorkspaceWithRole) =>
    create.mutate({ workspace_id: w.id, title: '', source: 'manual', position: positionBetween(Date.now() / 1000, null) }, { onSuccess: (doc) => router.push(`/w/${w.slug}/docs/${doc.id}`) })
  if (workspaces.length === 1) {
    return (
      <Button variant="primary" size={size} onClick={() => newIn(workspaces[0])} loading={create.isPending}>
        <FilePlus2 />
        {t('newDoc')}
      </Button>
    )
  }
  return (
    <Menu>
      <MenuTrigger render={<Button variant="primary" size={size} loading={create.isPending} />}>
        <FilePlus2 />
        {t('newDoc')}
        <ChevronDown className="opacity-70" />
      </MenuTrigger>
      <MenuContent align="end" className="w-60">
        <MenuLabel>{t('newIn')}</MenuLabel>
        {workspaces.map((w) => (
          <MenuItem key={w.id} onClick={() => newIn(w)}>
            <WorkspaceMark ws={w} size={16} />
            <span className="truncate">{w.name}</span>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  )
}

function SearchBox({ value, onChange, placeholder, clearLabel }: { value: string; onChange: (v: string) => void; placeholder: string; clearLabel: string }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="relative flex w-full items-center sm:w-56">
      <Search className="pointer-events-none absolute left-2.5 size-3.5 text-fg-subtle" />
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && (value ? onChange('') : ref.current?.blur())}
        placeholder={placeholder}
        className="h-8 w-full rounded-lg border border-line bg-panel pl-8 pr-7 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-fg-subtle hover:border-line-strong focus:border-accent-mid focus:shadow-[0_0_0_3px_color-mix(in_oklch,var(--accent-mid)_14%,transparent)]"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange('')
            ref.current?.focus()
          }}
          className="absolute right-1.5 inline-flex size-5 items-center justify-center rounded text-fg-subtle hover:text-fg"
          aria-label={clearLabel}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}
