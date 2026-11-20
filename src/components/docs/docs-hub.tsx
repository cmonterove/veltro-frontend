'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { differenceInCalendarDays, formatDistanceToNowStrict, isToday } from 'date-fns'
import { CalendarDays, ChevronDown, FilePlus2, FileText, LayoutGrid, ListOrdered, Loader2, NotebookPen, Plus, Rows3, Search, Shapes, Target, UserPen, X } from 'lucide-react'
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
import { AI_ENABLED } from '@/lib/features'

/** Tipos de documento, como los agrupa la biblioteca de cada espacio. */
const ALL_KINDS = ['docs', 'meeting', 'claude'] as const
type Kind = (typeof ALL_KINDS)[number]
// sin la IA (lib/features), los docs de Claude van con los demás
const KINDS: readonly Kind[] = AI_ENABLED ? ALL_KINDS : ['docs', 'meeting']
const kindOf = (d: Pick<DocSummary, 'source'>): Kind => (d.source === 'meeting' ? 'meeting' : d.source === 'claude' && AI_ENABLED ? 'claude' : 'docs')

type DocFilters = { ws: string[]; kind: string[]; who: string[] }
type FilterKey = keyof DocFilters
const NO_FILTERS: DocFilters = { ws: [], kind: [], who: [] }
type GroupBy = 'date' | 'space'
const BUCKETS = ['today', 'week', 'month', 'older'] as const

/** El fondo del ícono de cada doc según de dónde salió (el acta de una reunión, en mandarina). */
const DOC_TILE: Record<string, string> = {
  manual: 'bg-fg/[0.05]',
  import: 'bg-fg/[0.05]',
  meeting: 'bg-warning-soft',
  claude: 'bg-accent-soft',
}

/**
 * Con qué empezar un documento: en blanco o con una estructura (se crea con ese markdown y el editor lo
 * convierte al abrirlo). El esquema que se muestra sale de los "## " del mismo texto.
 */
const STARTERS = [
  { id: 'blank', icon: FilePlus2, tone: 'bg-fg/[0.06] text-fg-muted' },
  { id: 'meeting', icon: NotebookPen, tone: 'bg-warning-soft text-mandarina-ink' },
  { id: 'proposal', icon: Target, tone: 'bg-accent-soft text-accent-ink' },
  { id: 'process', icon: ListOrdered, tone: 'bg-k-decision-soft text-k-decision' },
] as const
type Starter = (typeof STARTERS)[number]

/** Hasta cuántos documentos la pantalla todavía muestra las plantillas en grande (y no al costado). */
const FEW = 4

/**
 * Todos los documentos de todos los espacios en un lugar. Con pocos, la lista y debajo con qué empezar
 * el siguiente (en grande). Con más, lo último que se tocó como páginas para seguir donde quedaste, la
 * lista completa por fecha o por espacio, y las plantillas al costado.
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
  const newDoc = useNewDoc()
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
        return items.length ? [{ id: w.id, label: w.name, icon: <WorkspaceMark ws={w} size={16} />, items }] : []
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
  const canStart = newDoc.targets.length > 0
  // pocos documentos (y sin filtrar): las plantillas en grande, debajo de la lista
  const few = Boolean(docs) && !filtering && (docs?.length ?? 0) <= FEW
  const aside = canStart && Boolean(docs?.length) && !few

  return (
    <div className={cn('flex min-h-0 flex-col', embedded ? 'flex-1' : 'h-full')}>
      {embedded ? null : (
        <div className="shrink-0 border-b border-line px-4 pb-4 pt-6 sm:px-6">
          <div className="flex flex-wrap items-start gap-3">
            <div className="mr-auto min-w-0">
              <h1 className="text-lg font-semibold tracking-tight">{t('title')}</h1>
              <p className="truncate text-sm text-fg-muted">{docs ? t('subtitle', { count: docs.length, spaces }) : ' '}</p>
            </div>
            <NewDocButton />
          </div>
        </div>
      )}

      {/* buscar y filtrar: en blanco, con una línea fina debajo (como Archivos) */}
      <div role="search" aria-label={t('filters')} className="flex shrink-0 items-start gap-2 border-b border-line-soft px-4 py-3 sm:px-5">
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
          {filtering && docs ? <span className="whitespace-nowrap text-xs tabular-nums text-fg-subtle">{t('shownOf', { shown: list.length, count: docs.length })}</span> : null}
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
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="@container/docs min-h-0 min-w-0 flex-1 overflow-y-auto scrollbar-thin">
          {docsQuery.isError ? (
            <div className="p-6">
              <ErrorState onRetry={() => docsQuery.refetch()} />
            </div>
          ) : isLoading || !docs ? (
            <div className="flex flex-col gap-2 px-5 pt-5">
              <Skeleton className="mb-2 h-4 w-40 rounded-full" />
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 rounded-xl" />
              ))}
            </div>
          ) : docs.length === 0 && !canStart ? (
            <EmptyState icon={<FileText />} title={t('emptyTitle')} description={t('emptyBody')} />
          ) : list.length === 0 && filtering ? (
            <div className="px-5 py-8">
              <EmptyState
                icon={<Search />}
                tone="quiet"
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
            </div>
          ) : (
            <div className="flex min-h-full flex-col gap-6 px-3 pb-5 pt-4 sm:px-4">
              {/* lo último que se tocó, como páginas: para seguir donde quedaste */}
              {!filtering && !few ? (
                <section className="px-2">
                  <h2 className="mb-3 text-sm font-semibold text-fg">{t('resume')}</h2>
                  <div className="grid grid-cols-2 gap-3 @min-[46rem]/docs:grid-cols-3 @min-[64rem]/docs:grid-cols-4">
                    {list.slice(0, 4).map((d, i) => (
                      <PaperCard
                        key={d.id}
                        doc={d}
                        ws={wsMap.get(d.workspace_id)}
                        className={cn(i === 2 && '@max-[46rem]/docs:hidden', i === 3 && '@max-[64rem]/docs:hidden')}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {docs.length ? (
                <section>
                  <h2 className="mb-1 flex items-baseline gap-2 px-2 text-sm font-semibold text-fg">
                    {filtering ? t('results') : t('all')}
                    <span className="text-xs font-normal tabular-nums text-fg-subtle">{list.length}</span>
                  </h2>
                  {/* las columnas: qué es, dónde vive, cuándo se tocó y quién lo escribió */}
                  <div className="flex items-center gap-3 border-b border-line-soft px-3 pb-2 pt-2 text-2xs font-medium uppercase tracking-wide text-fg-subtle" aria-hidden>
                    <span className="w-8 shrink-0" />
                    <span className="min-w-0 flex-1">{t('columns.name')}</span>
                    {groupBy !== 'space' ? <span className="hidden w-36 shrink-0 @min-[40rem]/docs:block">{t('columns.space')}</span> : null}
                    <span className="hidden w-28 shrink-0 text-right @min-[30rem]/docs:block">{t('columns.edited')}</span>
                    <span className="w-6 shrink-0" />
                  </div>
                  {groups.map((g) => (
                    <div key={g.id}>
                      <h3 className="flex items-center gap-2 px-3 pb-1 pt-3 text-xs font-semibold text-fg-muted">
                        {g.icon}
                        <span className={cn(g.icon && 'text-fg')}>{g.label}</span>
                        <span className="rounded-full bg-fg/[0.06] px-1.5 text-2xs tabular-nums text-fg-muted">{g.items.length}</span>
                      </h3>
                      <ul className="flex flex-col">
                        {g.items.map((d) => (
                          <DocRow key={d.id} doc={d} ws={wsMap.get(d.workspace_id)} showSpace={groupBy !== 'space'} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              ) : null}

              {/* con pocos documentos, con qué empezar el siguiente ocupa el resto (no una caja vacía) */}
              {few && canStart ? (
                <section className="flex flex-1 flex-col px-2">
                  <h2 className="text-sm font-semibold text-fg">{docs.length ? t('start.title') : t('emptyTitle')}</h2>
                  <p className="mt-0.5 text-xs text-fg-muted">{docs.length ? t('start.hint') : t('start.firstHint')}</p>
                  <div className="mt-3 grid flex-1 auto-rows-fr grid-cols-1 gap-3 @min-[32rem]/docs:grid-cols-2 @min-[60rem]/docs:grid-cols-4">
                    {STARTERS.map((s) => (
                      <StarterTile key={s.id} starter={s} variant="grid" newDoc={newDoc} />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </div>

        {/* con muchos documentos, las plantillas quedan a mano al costado */}
        {aside ? (
          <aside className="hidden w-[18.5rem] shrink-0 flex-col gap-2 overflow-y-auto border-l border-line-soft bg-canvas/50 p-4 scrollbar-thin lg:flex" aria-label={t('start.title')}>
            <div className="px-1 pb-1">
              <h2 className="text-sm font-semibold text-fg">{t('start.title')}</h2>
              <p className="mt-0.5 text-xs text-fg-muted">{t('start.hint')}</p>
            </div>
            {STARTERS.map((s) => (
              <StarterTile key={s.id} starter={s} variant="aside" newDoc={newDoc} />
            ))}
          </aside>
        ) : null}
      </div>
    </div>
  )
}

/** Crear un doc (en blanco o con una estructura) en un espacio donde se puede escribir, y abrirlo. */
function useNewDoc() {
  const router = useRouter()
  const create = useCreateDoc()
  const { workspaces } = useApp()
  const targets = useMemo(() => workspaces.filter((w) => canEdit(w)), [workspaces])
  const [busy, setBusy] = useState<string | null>(null)
  const start = (w: WorkspaceWithRole, key: string, markdown?: string) => {
    setBusy(key)
    create.mutate(
      { workspace_id: w.id, title: '', source: 'manual', position: positionBetween(Date.now() / 1000, null), ...(markdown ? { import_markdown: markdown } : {}) },
      { onSuccess: (doc) => router.push(`/w/${w.slug}/docs/${doc.id}`), onError: () => setBusy(null) },
    )
  }
  return { targets, start, busy }
}
type NewDoc = ReturnType<typeof useNewDoc>

/**
 * Una plantilla. Al costado: qué es y sus secciones en pastillas. En grande: además, cómo queda la
 * página (sus títulos con líneas de texto). Con varios espacios pregunta dónde crearla.
 */
function StarterTile({ starter, variant, newDoc }: { starter: Starter; variant: 'aside' | 'grid'; newDoc: NewDoc }) {
  const t = useTranslations('docsHub')
  const body = starter.id === 'blank' ? '' : t(`start.${starter.id}.body`)
  const outline = body
    .split('\n')
    .filter((l) => l.startsWith('## '))
    .map((l) => l.slice(3).trim())
  const Icon = starter.icon
  const loading = newDoc.busy === starter.id
  const cls = cn(
    'group/tile flex flex-col rounded-2xl bg-panel text-left outline-none ring-1 ring-line-soft transition-[box-shadow,transform,--tw-ring-color] duration-200 ease-out',
    'hover:-translate-y-px hover:shadow-[0_10px_24px_-14px_oklch(0.3_0.09_312/0.35)] hover:ring-line focus-visible:ring-2 focus-visible:ring-accent-mid/40 disabled:pointer-events-none disabled:opacity-70',
    variant === 'aside' ? 'max-h-32 min-h-[4.5rem] flex-1 justify-center px-3.5 py-3' : 'min-h-[8.5rem] p-4',
  )
  const inner = (
    <>
      <span className="flex items-start gap-3">
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-xl', starter.tone)}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-fg">{t(`start.${starter.id}.name`)}</span>
          {/* al costado, en vez de la explicación, sus secciones en una línea */}
          <span className={cn('mt-0.5 block text-xs leading-relaxed text-fg-muted', variant === 'aside' ? 'line-clamp-2' : 'line-clamp-3')}>
            {variant === 'aside' && outline.length ? outline.join(' · ') : t(`start.${starter.id}.hint`)}
          </span>
        </span>
        <Plus className="size-4 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover/tile:opacity-100 group-focus-visible/tile:opacity-100" aria-hidden />
      </span>
      {variant === 'aside' ? null : (
        // la página en miniatura: sus títulos y unas líneas de texto (en blanco, solo líneas)
        <span className="mt-3.5 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-xl bg-canvas/70 px-3.5 py-3 ring-1 ring-line-soft [mask-image:linear-gradient(to_bottom,black_70%,transparent)]" aria-hidden>
          {(outline.length ? outline : [null, null, null]).map((h, i) => (
            <span key={i} className="flex flex-col gap-1.5">
              {h ? <span className="text-[11px] font-semibold leading-none text-fg">{h}</span> : null}
              <span className={cn('h-1.5 rounded-full bg-fg/[0.07]', i % 2 ? 'w-1/2' : 'w-3/4')} />
            </span>
          ))}
        </span>
      )}
    </>
  )
  if (newDoc.targets.length === 1) {
    return (
      <button type="button" className={cls} disabled={newDoc.busy !== null} onClick={() => newDoc.start(newDoc.targets[0], starter.id, body)}>
        {inner}
      </button>
    )
  }
  return (
    <Menu>
      <MenuTrigger render={<button type="button" className={cls} disabled={newDoc.busy !== null} />}>{inner}</MenuTrigger>
      <MenuContent align="start" className="w-60">
        <MenuLabel>{t('newIn')}</MenuLabel>
        {newDoc.targets.map((w) => (
          <MenuItem key={w.id} onClick={() => newDoc.start(w, starter.id, body)}>
            <WorkspaceMark ws={w} size={16} />
            <span className="truncate">{w.name}</span>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  )
}

/** "Seguir donde quedaste": el doc como una página (con el borde superior del color de su espacio). */
function PaperCard({ doc, ws, className }: { doc: DocSummary; ws?: WorkspaceWithRole; className?: string }) {
  const td = useTranslations('docs')
  const locale = useDateLocale()
  const author = useMemberMap().get(doc.created_by ?? '')
  return (
    <Link
      href={ws ? `/w/${ws.slug}/docs/${doc.id}` : '#'}
      className={cn('ws-' + (ws?.color ?? 'violet'), 'group/paper flex flex-col rounded-2xl bg-canvas/70 p-2.5 ring-1 ring-line-soft transition-colors hover:bg-canvas', className)}
    >
      <span className="relative block h-36 overflow-hidden rounded-xl border-t-[3px] bg-panel px-3.5 pt-3 shadow-[0_1px_2px_oklch(0.243_0.088_312.7/0.06)] ring-1 ring-line-soft transition-transform duration-200 ease-out [border-top-color:var(--ws-color)] group-hover/paper:-translate-y-0.5">
        <span className="flex items-center gap-1.5 text-2xs text-fg-subtle">
          <DocMark source={doc.source} className="size-3" />
          <span className="truncate">{td(`kicker.${doc.source}`)}</span>
        </span>
        <span className="mt-1.5 line-clamp-2 block text-[13px] font-semibold leading-snug text-fg">{doc.title || td('untitled')}</span>
        <span className="mt-1 line-clamp-4 block text-[11px] leading-[1.55] text-fg-muted">{excerptOf(doc.excerpt) || td('library.emptyDoc')}</span>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-panel" aria-hidden />
      </span>
      <span className="flex items-center gap-1.5 px-1 pt-2.5">
        {ws ? <WorkspaceMark ws={ws} size={14} /> : null}
        <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">
          {formatDistanceToNowStrict(new Date(doc.updated_at), { addSuffix: true, locale })}
        </span>
        {author ? <Avatar name={author.full_name} src={author.avatar_url} seed={author.id} size={18} /> : null}
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
      <Link href={ws ? `/w/${ws.slug}/docs/${doc.id}` : '#'} className="group/row flex h-14 items-center gap-3 rounded-xl px-3 transition-colors hover:bg-hover/60">
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', DOC_TILE[doc.source] ?? DOC_TILE.manual)}>
          <DocMark source={doc.source} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-fg">{doc.title || td('untitled')}</span>
          <span className="truncate text-xs text-fg-subtle">{sub || td('library.emptyDoc')}</span>
        </span>
        {showSpace ? (
          <span className="hidden w-36 shrink-0 items-center gap-1.5 text-xs text-fg-muted @min-[40rem]/docs:flex">
            {ws ? <WorkspaceMark ws={ws} size={16} /> : null}
            <span className="truncate">{ws?.name}</span>
          </span>
        ) : null}
        <span className="hidden w-28 shrink-0 text-right text-xs text-fg-subtle @min-[30rem]/docs:block">
          {formatDistanceToNowStrict(new Date(doc.updated_at), { addSuffix: true, locale })}
        </span>
        {author ? <Avatar name={author.full_name} src={author.avatar_url} seed={author.id} size={22} /> : <span className="size-[22px] shrink-0" />}
      </Link>
    </li>
  )
}

/** Con un solo espacio crea ahí; con varios, pregunta dónde. */
export function NewDocButton({ size }: { size?: 'sm' }) {
  const t = useTranslations('docsHub')
  const { targets, start, busy } = useNewDoc()
  if (!targets.length) return null
  if (targets.length === 1) {
    return (
      <Button variant="primary" size={size} onClick={() => start(targets[0], 'button')} loading={busy === 'button'}>
        <FilePlus2 />
        {t('newDoc')}
      </Button>
    )
  }
  return (
    <Menu>
      <MenuTrigger render={<Button variant="primary" size={size} loading={busy === 'button'} />}>
        <FilePlus2 />
        {t('newDoc')}
        <ChevronDown className="opacity-70" />
      </MenuTrigger>
      <MenuContent align="end" className="w-60">
        <MenuLabel>{t('newIn')}</MenuLabel>
        {targets.map((w) => (
          <MenuItem key={w.id} onClick={() => start(w, 'button')}>
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
