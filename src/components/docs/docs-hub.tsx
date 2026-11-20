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

/** Hasta cuántos documentos se muestran todos como páginas; con más, las últimas páginas y la tabla. */
const SHELF = 8

/** Las páginas en columnas según el ancho (de 2 a 6); las plantillas usan las mismas para quedar alineadas. */
const SHEET_GRID = 'grid grid-cols-2 gap-x-5 gap-y-6 @min-[40rem]/docs:grid-cols-3 @min-[52rem]/docs:grid-cols-4 @min-[64rem]/docs:grid-cols-5 @min-[84rem]/docs:grid-cols-6'

/**
 * Todos los documentos de todos los espacios en un lugar, como la portada de un procesador de textos:
 * arriba una franja con las plantillas como hojas para empezar uno; debajo los documentos como páginas.
 * Con muchos, las últimas páginas (para seguir donde quedaste) y la tabla completa por fecha o espacio.
 * Buscando o filtrando, solo la tabla.
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
  const band = canStart && !filtering
  const shelf = !filtering && (docs?.length ?? 0) <= SHELF

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

      <div className="@container/docs min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {docsQuery.isError ? (
          <div className="p-6">
            <ErrorState onRetry={() => docsQuery.refetch()} />
          </div>
        ) : isLoading || !docs ? (
          <div className="flex flex-col gap-5 px-5 pt-5">
            <Skeleton className="h-32 rounded-2xl" />
            <div className={SHEET_GRID}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="aspect-[16/10] rounded-xl" />
              ))}
            </div>
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
          <>
            {/* con qué empezar: las plantillas como hojas, en una franja crema arriba */}
            {band ? (
              <section className="border-b border-line-soft bg-canvas/70 px-5 pb-4 pt-4" aria-label={t('start.title')}>
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-fg">
                  {t('start.title')}
                  <span className="text-xs font-normal text-fg-muted">{t('start.hint')}</span>
                </p>
                <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4 @min-[40rem]/docs:grid-cols-4 @min-[64rem]/docs:grid-cols-5 @min-[84rem]/docs:grid-cols-6">
                  {STARTERS.map((s) => (
                    <TemplateThumb key={s.id} starter={s} newDoc={newDoc} />
                  ))}
                </div>
              </section>
            ) : null}

            <div className="flex flex-col gap-7 px-5 pb-8 pt-5">
              {docs.length === 0 ? (
                <p className="text-sm text-fg-muted">{t('emptyBody')}</p>
              ) : shelf ? (
                // pocos: todos como páginas
                <section>
                  <h2 className="mb-3 flex items-baseline gap-2 text-sm font-semibold text-fg">
                    {t('yours')}
                    <span className="text-xs font-normal tabular-nums text-fg-subtle">{docs.length}</span>
                  </h2>
                  <div className={SHEET_GRID}>
                    {list.map((d) => (
                      <DocSheet key={d.id} doc={d} ws={wsMap.get(d.workspace_id)} />
                    ))}
                  </div>
                </section>
              ) : (
                <>
                  {/* muchos: las últimas como páginas (una fila, según el ancho) y la tabla completa */}
                  {!filtering ? (
                    <section>
                      <h2 className="mb-3 text-sm font-semibold text-fg">{t('resume')}</h2>
                      <div className={SHEET_GRID}>
                        {list.slice(0, 6).map((d, i) => (
                          <DocSheet
                            key={d.id}
                            doc={d}
                            ws={wsMap.get(d.workspace_id)}
                            className={cn(i >= 2 && '@max-[40rem]/docs:hidden', i >= 3 && '@max-[52rem]/docs:hidden', i >= 4 && '@max-[64rem]/docs:hidden', i >= 5 && '@max-[84rem]/docs:hidden')}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}
                    <section className="-mx-3">
                      <h2 className="mb-1 flex items-baseline gap-2 px-3 text-sm font-semibold text-fg">
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
                </>
              )}
            </div>
          </>
        )}
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
 * Una plantilla como hoja: la página en miniatura (sus títulos con líneas; la de en blanco, un +) y su
 * nombre debajo. Crea el doc y lo abre; con varios espacios pregunta dónde.
 */
function TemplateThumb({ starter, newDoc }: { starter: Starter; newDoc: NewDoc }) {
  const t = useTranslations('docsHub')
  const body = starter.id === 'blank' ? '' : t(`start.${starter.id}.body`)
  const outline = body
    .split('\n')
    .filter((l) => l.startsWith('## '))
    .map((l) => l.slice(3).trim())
  const Icon = starter.icon
  const loading = newDoc.busy === starter.id
  const cls = 'group/tpl flex min-w-0 flex-col text-left outline-none disabled:pointer-events-none disabled:opacity-70'
  const inner = (
    <>
      <span className="relative block h-20 overflow-hidden rounded-xl bg-panel px-3 pt-2.5 shadow-[0_1px_2px_oklch(0.243_0.088_312.7/0.06)] ring-1 ring-line-soft transition-[transform,box-shadow] duration-200 ease-out group-hover/tpl:-translate-y-0.5 group-hover/tpl:shadow-[0_12px_24px_-14px_oklch(0.3_0.09_312/0.4)] group-hover/tpl:ring-accent-mid/40 group-focus-visible/tpl:ring-2 group-focus-visible/tpl:ring-accent-mid/50">
        {starter.id === 'blank' ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-accent-ink transition-transform duration-200 ease-out group-hover/tpl:scale-110">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-5" />}
            </span>
          </span>
        ) : (
          <>
            <span className="flex flex-col gap-1.5 [mask-image:linear-gradient(to_bottom,black_60%,transparent)]" aria-hidden>
              {outline.map((h, i) => (
                <span key={h} className="flex flex-col gap-1">
                  <span className="text-[9px] font-semibold leading-none text-fg">{h}</span>
                  <span className={cn('h-1 rounded-full bg-fg/[0.08]', i % 2 ? 'w-1/2' : 'w-4/5')} />
                </span>
              ))}
            </span>
            <span className={cn('absolute bottom-2 right-2 flex size-6 items-center justify-center rounded-lg', starter.tone)}>
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
            </span>
          </>
        )}
      </span>
      <span className="mt-2 truncate px-0.5 text-[13px] font-medium text-fg">{t(`start.${starter.id}.name`)}</span>
    </>
  )
  if (newDoc.targets.length === 1) {
    return (
      <button type="button" className={cls} disabled={newDoc.busy !== null} onClick={() => newDoc.start(newDoc.targets[0], starter.id, body)} title={t(`start.${starter.id}.hint`)}>
        {inner}
      </button>
    )
  }
  return (
    <Menu>
      <MenuTrigger render={<button type="button" className={cls} disabled={newDoc.busy !== null} title={t(`start.${starter.id}.hint`)} />}>{inner}</MenuTrigger>
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

/** Un doc como página: su comienzo en miniatura y, debajo, el título y de dónde es. */
function DocSheet({ doc, ws, className }: { doc: DocSummary; ws?: WorkspaceWithRole; className?: string }) {
  const td = useTranslations('docs')
  const locale = useDateLocale()
  const author = useMemberMap().get(doc.created_by ?? '')
  const title = doc.title || td('untitled')
  return (
    <Link href={ws ? `/w/${ws.slug}/docs/${doc.id}` : '#'} className={cn('group/sheet flex min-w-0 flex-col outline-none', className)}>
      <span className="relative block aspect-[16/10] overflow-hidden rounded-xl bg-panel px-3.5 pt-3 shadow-[0_1px_2px_oklch(0.243_0.088_312.7/0.06)] ring-1 ring-line-soft transition-[transform,box-shadow] duration-200 ease-out group-hover/sheet:-translate-y-0.5 group-hover/sheet:shadow-[0_14px_28px_-16px_oklch(0.3_0.09_312/0.45)] group-focus-visible/sheet:ring-2 group-focus-visible/sheet:ring-accent-mid/50">
        <span className="block truncate text-[11px] font-semibold text-fg">{title}</span>
        <span className="mt-1 line-clamp-5 block text-[10px] leading-[1.55] text-fg-muted">{excerptOf(doc.excerpt) || td('library.emptyDoc')}</span>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-panel" aria-hidden />
      </span>
      <span className="mt-2.5 flex min-w-0 items-center gap-1.5 px-0.5">
        <DocMark source={doc.source} className="size-3.5" />
        <span className="truncate text-[13px] font-medium text-fg decoration-line-strong underline-offset-4 group-hover/sheet:underline">{title}</span>
      </span>
      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 px-0.5 text-xs text-fg-subtle">
        {ws ? <WorkspaceMark ws={ws} size={14} /> : null}
        <span className="min-w-0 truncate">{ws?.name}</span>
        <span aria-hidden>·</span>
        <span className="shrink-0">{formatDistanceToNowStrict(new Date(doc.updated_at), { addSuffix: true, locale })}</span>
        {author ? (
          <span className="ml-auto shrink-0">
            <Avatar name={author.full_name} src={author.avatar_url} seed={author.id} size={16} />
          </span>
        ) : null}
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
