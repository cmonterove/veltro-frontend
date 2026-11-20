'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { formatDistanceToNowStrict } from 'date-fns'
import { CircleCheck, FileText, LayoutGrid, Link2, List, MessagesSquare, Search, Shapes, Tag, Upload, UploadCloud, UserPen, Vault, Video, X } from 'lucide-react'
import { canEdit, useApp, useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip } from '@/components/ui/tooltip'
import { FilterFacet, type FilterOption } from '@/components/tasks/task-filters'
import { LabelChip } from '@/components/tasks/pickers'
import { formatBytes } from '@/components/attachments/attachments'
import { ShareToChatDialog, type ShareItem } from '@/components/chat/share-to-chat'
import { DocsHub, NewDocButton } from '@/components/docs/docs-hub'
import { useAttachment, useVaultPage, useVaultSummary, type VaultQuery } from '@/lib/queries/attachments'
import { useDocsIn } from '@/lib/queries/docs'
import { useTasks } from '@/lib/queries/tasks'
import { useDateLocale } from '@/lib/dates'
import { useLocalStorage } from '@/lib/hooks'
import { track } from '@/lib/telemetry'
import type { AttachmentRow } from '@/lib/database.types'
import { cn, taskRef } from '@/lib/utils'
import { CARD } from '@/components/ui/surface'
import { FullscreenExitButton } from '@/components/app/fullscreen'
import { FILE_KINDS, FilePreview, FileKindIcon, KIND_STYLE, fileKindOf, fileTitle } from './file-visual'
import { FileInspector } from './file-inspector'
import { UploadDialog, type UploadMode } from './upload-dialog'

type VaultFilters = { kind: string[]; ws: string[]; link: string[]; label: string[]; who: string[] }
type FilterKey = keyof VaultFilters
const NO_FILTERS: VaultFilters = { kind: [], ws: [], link: [], label: [], who: [] }
const NONE = 'none'
const LINKS = ['task', 'meeting', 'doc', NONE] as const

/** Cuántos quedan con una opción de un filtro (lo cuenta el servidor aplicando los demás filtros). */
const countIn = (facet: { value: string; count: number }[] | undefined) => {
  const m = new Map((facet ?? []).map((f) => [f.value, f.count]))
  return (v: string) => m.get(v) ?? 0
}

/** El color de cada tipo como relleno (la barra de la cabecera), el mismo de su ícono. */
const KIND_BG: Record<(typeof FILE_KINDS)[number], string> = {
  pdf: 'bg-danger',
  image: 'bg-accent',
  sheet: 'bg-success',
  slides: 'bg-mandarina',
  doc: 'bg-st-progress',
  link: 'bg-accent-mid',
  other: 'bg-fg-subtle',
}

/** Lo que se escribe en el buscador llega al servidor con una pequeña pausa (no en cada tecla). */
function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

/**
 * La bóveda: todos los archivos y links de la cuenta en un lugar. Cada uno puede tener título y
 * etiquetas y colgar de un espacio, una tarea o una reunión, pero no hace falta: lo que se sube aquí
 * queda suelto hasta que se vincule. La pestaña "Escritos" junta los documentos de los espacios.
 * Filtros, conteos y etiquetas los resuelve la API; la lista llega de a páginas.
 */
export function VaultView() {
  const t = useTranslations('vault')
  const tHub = useTranslations('docsHub')
  const pathname = usePathname()
  const params = useSearchParams()
  const tab = params.get('tab') === 'written' ? 'written' : 'files'
  const { workspaces, observedWorkspaces, user } = useApp()
  const wsMap = useWorkspaceMap()
  const memberMap = useMemberMap()
  const wsIds = useMemo(() => [...workspaces, ...observedWorkspaces].map((w) => w.id), [workspaces, observedWorkspaces])
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useLocalStorage<VaultFilters>('veltro:vault-filters', NO_FILTERS)
  const q = useDebounced(query.trim()).slice(0, 200)
  const serverFilters: VaultQuery = useMemo(
    () => ({ q: q || undefined, category: filters.kind, workspaceId: filters.ws, linkedTo: filters.link, label: filters.label, uploadedBy: filters.who }),
    [q, filters],
  )
  const page = useVaultPage(serverFilters)
  const { data: summary } = useVaultSummary(serverFilters)
  const { data: docs } = useDocsIn(wsIds)
  const { data: tasks } = useTasks({ kind: 'workspaces', workspaceIds: wsIds })
  const taskById = useMemo(() => new Map((tasks ?? []).map((x) => [x.id, x])), [tasks])
  const [view, setView] = useLocalStorage<'grid' | 'list'>('veltro:vault-view', 'grid')
  const [dragging, setDragging] = useState(false)
  const [sharing, setSharing] = useState<ShareItem | null>(null)
  const selectedId = params.get('file')

  // la URL lleva la pestaña y el archivo abierto (así un chat puede enlazar a un archivo)
  const setParam = (k: 'tab' | 'file', v: string | null) => {
    const next = new URLSearchParams(window.location.search)
    if (v) next.set(k, v)
    else next.delete(k)
    if (k === 'tab') next.delete('file')
    window.history.replaceState(null, '', `${pathname}${next.toString() ? `?${next}` : ''}`)
  }

  const shown = useMemo(() => page.data?.pages.flatMap((p) => p.items) ?? [], [page.data])
  // el abierto puede no estar en lo cargado (un link desde un chat, o filtrado): se pide aparte
  const { data: selected } = useAttachment(selectedId)
  const total = summary?.total.count ?? 0
  const loaded = Boolean(page.data && summary)
  const active = filters.kind.length + filters.ws.length + filters.link.length + filters.label.length + filters.who.length
  const filtering = active > 0 || q !== ''
  const labels = useMemo(() => (summary?.facets.label ?? []).map((l) => l.value).sort((a, b) => a.localeCompare(b)), [summary])

  const kindN = countIn(summary?.facets.category)
  const wsN = countIn(summary?.facets.workspace)
  const linkN = countIn(summary?.facets.linkedTo)
  const labelN = countIn(summary?.facets.label)
  const options: Record<FilterKey, FilterOption[]> = {
    kind: FILE_KINDS.map((k) => {
      const Icon = KIND_STYLE[k].icon
      return { value: k, label: t(`kinds.${k}`), icon: <Icon className={cn('size-4 shrink-0', KIND_STYLE[k].tone)} />, count: kindN(k) }
    }),
    ws: [
      { value: NONE, label: t('noSpace'), icon: <LayoutGrid className="size-4 shrink-0 text-fg-subtle" />, count: wsN(NONE) },
      ...wsIds.flatMap((id) => {
        const w = wsMap.get(id)
        return w ? [{ value: id, label: w.name, icon: <WorkspaceMark ws={w} size={16} />, count: wsN(id) }] : []
      }),
    ],
    link: LINKS.map((k) => ({
      value: k,
      label: t(`links.${k}`),
      icon:
        k === 'task' ? (
          <CircleCheck className="size-4 shrink-0 text-fg-muted" />
        ) : k === 'meeting' ? (
          <Video className="size-4 shrink-0 text-accent-mid" />
        ) : k === 'doc' ? (
          <FileText className="size-4 shrink-0 text-fg-muted" />
        ) : (
          <Shapes className="size-4 shrink-0 text-fg-subtle" />
        ),
      count: linkN(k),
    })),
    label: labels.map((l) => ({ value: l, label: l, icon: <span className="mx-[3px] size-2 shrink-0 rounded-full bg-fg-subtle" />, count: labelN(l) })),
    who: (summary?.facets.uploadedBy ?? [])
      .map((u) => {
        const m = memberMap.get(u.value)
        const name = m?.full_name ?? u.fullName ?? '?'
        return { value: u.value, label: name, icon: <Avatar name={name} src={m?.avatar_url ?? u.avatarUrl} seed={u.value} size={18} />, count: u.count }
      })
      .sort((a, b) => Number(b.value === user.id) - Number(a.value === user.id) || a.label.localeCompare(b.label)),
  }
  const toggle = (k: FilterKey) => (v: string, on: boolean) => setFilters((f) => ({ ...f, [k]: on ? [...f[k].filter((x) => x !== v), v] : f[k].filter((x) => x !== v) }))
  const clear = (k: FilterKey) => () => setFilters((f) => ({ ...f, [k]: [] }))

  // al llegar al final de lo cargado, la página siguiente
  const more = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = page
  useEffect(() => {
    const el = more.current
    if (!el || !hasNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) fetchNextPage()
      },
      { rootMargin: '400px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, shown.length])

  // lo que se sube va al espacio filtrado (si hay uno solo y se puede editar); si no, queda suelto
  const target = filters.ws.length === 1 && filters.ws[0] !== NONE && canEdit(wsMap.get(filters.ws[0])) ? filters.ws[0] : null
  // subir abre el formulario (título, etiquetas, vínculos); soltar archivos también, ya con ellos cargados
  const [uploading, setUploading] = useState<{ mode: UploadMode; files?: File[] } | null>(null)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-4 pb-4 pt-4 sm:px-6">
      <header className="flex shrink-0 flex-col gap-3 px-1">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">{t('title')}</h1>
            <p className="truncate text-[13px] text-fg-muted">
              {tab === 'written'
                ? docs
                  ? tHub('subtitle', { count: docs.length, spaces: new Set(docs.map((d) => d.workspace_id)).size })
                  : '\u00a0'
                : summary
                  ? t('subtitle', { count: total, size: formatBytes(summary.total.bytes) || '0 KB' })
                  : '\u00a0'}
            </p>
          </div>
          {/* de qué está hecha la bóveda: una barra por tipo (como el uso del disco) y su leyenda; cada tipo filtra */}
          {tab === 'files' && summary && total ? (
              <div className="min-w-[16rem] max-w-md flex-1">
                <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                  {FILE_KINDS.filter((k) => kindN(k)).map((k) => (
                    <span key={k} className={cn('h-full first:rounded-l-full last:rounded-r-full', KIND_BG[k])} style={{ flexGrow: kindN(k) }} />
                  ))}
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1">
                  {FILE_KINDS.filter((k) => kindN(k)).map((k) => (
                    <li key={k}>
                      <button
                        type="button"
                        onClick={() => toggle('kind')(k, !filters.kind.includes(k))}
                        aria-pressed={filters.kind.includes(k)}
                        className={cn('inline-flex items-center gap-1.5 rounded-sm text-xs transition-colors hover:text-fg', filters.kind.includes(k) ? 'font-medium text-fg' : 'text-fg-muted')}
                      >
                        <span className={cn('size-2 rounded-full', KIND_BG[k])} />
                        {t(`kinds.${k}`)}
                        <span className="tabular-nums text-fg-subtle">{kindN(k)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          <div className="ml-auto flex items-center gap-2">
            {tab === 'files' ? (
              <>
                <Button onClick={() => setUploading({ mode: 'link' })}>
                  <Link2 />
                  {t('addLink')}
                </Button>
                <Button variant="primary" onClick={() => setUploading({ mode: 'files' })}>
                  <Upload />
                  {t('upload')}
                </Button>
              </>
            ) : (
              <NewDocButton />
            )}
            <FullscreenExitButton />
          </div>
        </div>
        {/* Archivos y Escritos: un control segmentado, la activa en relieve (como en Tareas) */}
        <nav className="flex w-fit items-center gap-0.5 rounded-2xl bg-fg/[0.05] p-1" aria-label={t('title')}>
          {(['files', 'written'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setParam('tab', id === 'files' ? null : id)}
              aria-current={tab === id ? 'page' : undefined}
              className={cn(
                'inline-flex h-8 items-center gap-2 rounded-xl px-3 text-sm font-medium outline-none transition-[background-color,color,box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-accent-mid/40',
                tab === id ? 'bg-panel text-fg shadow-card' : 'text-fg-muted hover:text-fg',
              )}
            >
              {id === 'files' ? <Vault className={cn('size-4', tab === id ? 'text-accent' : 'text-fg-subtle')} /> : <FileText className={cn('size-4', tab === id ? 'text-accent' : 'text-fg-subtle')} />}
              {t(`tabs.${id}`)}
              <span className="text-xs tabular-nums text-fg-subtle">{id === 'files' ? (summary ? total : '') : (docs?.length ?? '')}</span>
            </button>
          ))}
        </nav>
      </header>

      {tab === 'written' ? (
        <section className={cn(CARD, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
          <DocsHub embedded />
        </section>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4">
        <section className={cn(CARD, 'flex min-w-0 flex-1 flex-col overflow-hidden')}>
          {/* buscar y filtrar: en blanco, con una línea fina debajo (la ciruela no va en todas las pantallas) */}
          <div role="search" aria-label={t('filters')} className="flex shrink-0 items-start gap-2 border-b border-line-soft px-4 py-3 sm:px-5">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              <div className="relative flex w-full items-center sm:w-52">
                <Search className="pointer-events-none absolute left-2.5 size-3.5 text-fg-subtle" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
                  placeholder={t('search')}
                  className="h-8 w-full rounded-lg border border-line bg-panel pl-8 pr-7 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-fg-subtle hover:border-line-strong focus:border-accent-mid focus:shadow-[0_0_0_3px_color-mix(in_oklch,var(--accent-mid)_14%,transparent)]"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-1.5 inline-flex size-5 items-center justify-center rounded text-fg-subtle hover:text-fg"
                    aria-label={t('clearSearch')}
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden />
              <FilterFacet icon={<Shapes />} label={t('kind')} options={options.kind} value={filters.kind} onToggle={toggle('kind')} onClear={clear('kind')} />
              <FilterFacet icon={<LayoutGrid />} label={t('space')} options={options.ws} value={filters.ws} onToggle={toggle('ws')} onClear={clear('ws')} />
              <FilterFacet icon={<Link2 />} label={t('linkedTo')} options={options.link} value={filters.link} onToggle={toggle('link')} onClear={clear('link')} />
              {labels.length ? (
                <FilterFacet
                  icon={<Tag />}
                  label={t('labels')}
                  options={options.label}
                  value={filters.label}
                  onToggle={toggle('label')}
                  onClear={clear('label')}
                  searchable={labels.length > 7}
                />
              ) : null}
              <FilterFacet icon={<UserPen />} label={t('uploader')} options={options.who} value={filters.who} onToggle={toggle('who')} onClear={clear('who')} />
              {active ? (
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
              {filtering && summary ? (
                <span className="whitespace-nowrap text-xs tabular-nums text-fg-subtle">{t('shownOf', { shown: summary.matching.count, count: total })}</span>
              ) : null}
              <div className="flex items-center rounded-lg bg-hover p-0.5" role="group" aria-label={t('viewLabel')}>
                {(['grid', 'list'] as const).map((v) => (
                  <Tooltip key={v} content={t(`views.${v}`)}>
                    <button
                      type="button"
                      onClick={() => setView(v)}
                      aria-pressed={view === v}
                      aria-label={t(`views.${v}`)}
                      className={cn(
                        'inline-flex size-7 items-center justify-center rounded-md transition-colors',
                        view === v ? 'bg-panel text-fg shadow-card' : 'text-fg-muted hover:text-fg',
                      )}
                    >
                      {v === 'grid' ? <LayoutGrid className="size-4" /> : <List className="size-4" />}
                    </button>
                  </Tooltip>
                ))}
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            <div
              className="@container relative flex min-w-0 flex-1 flex-col overflow-y-auto scrollbar-thin"
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes('Files')) return
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
              }}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                const dropped = Array.from(e.dataTransfer.files)
                if (dropped.length) setUploading({ mode: 'files', files: dropped })
              }}
            >
              <div className="flex flex-1 flex-col px-4 pb-6 pt-4 sm:px-5">
                {page.isError ? (
                  <ErrorState onRetry={() => page.refetch()} />
                ) : !loaded ? (
                  <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-4">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-52 rounded-xl" />
                    ))}
                  </div>
                ) : total === 0 ? (
                  // vacía: a la izquierda dónde soltar; a la derecha qué guardar aquí (cada idea abre la subida)
                  <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,1fr)]">
                    <button
                      type="button"
                      onClick={() => setUploading({ mode: 'files' })}
                      className={cn(
                        'group flex min-h-[18rem] w-full flex-col items-center justify-center gap-5 rounded-[20px] border-2 border-dashed px-6 py-8 text-center outline-none transition-colors focus-visible:border-accent-mid',
                        dragging ? 'border-accent-mid bg-accent-soft/50' : 'border-line-strong/80 bg-canvas/50 hover:border-accent-mid/60 hover:bg-accent-soft/25',
                      )}
                    >
                      <span className="flex items-end" aria-hidden>
                        {(['pdf', 'image', 'sheet', 'link'] as const).map((k, i) => {
                          const Icon = KIND_STYLE[k].icon
                          return (
                            <span
                              key={k}
                              className={cn(
                                '-mx-1.5 flex size-14 items-center justify-center rounded-2xl bg-panel shadow-card ring-1 ring-line-soft transition-transform duration-300 ease-[var(--ease-out-quart)]',
                                ['-rotate-12 translate-y-2 group-hover:-translate-x-1', '-rotate-3 group-hover:-translate-y-1', 'rotate-3 group-hover:-translate-y-1', 'rotate-12 translate-y-2 group-hover:translate-x-1'][i],
                              )}
                            >
                              <Icon className={cn('size-6', KIND_STYLE[k].tone)} />
                            </span>
                          )
                        })}
                      </span>
                      <span className="flex max-w-md flex-col gap-1.5">
                        <span className="text-lg font-semibold tracking-[-0.01em] text-fg">{t('emptyTitle')}</span>
                        <span className="text-sm leading-relaxed text-fg-muted">{t('emptyBody')}</span>
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg shadow-[0_6px_14px_-8px_var(--accent)] transition-colors group-hover:bg-accent-hover">
                        <Upload className="size-4" />
                        {t('dropHint')}
                      </span>
                    </button>

                    <div className="flex min-w-0 flex-col">
                      <p className="flex items-center gap-2 px-1 text-base font-semibold tracking-[-0.015em] text-fg">
                        <Shapes className="size-4 text-accent" aria-hidden />
                        {t('ideas.title')}
                      </p>
                      <ul className="mt-2 flex flex-1 flex-col gap-2">
                        {(['pdf', 'image', 'sheet', 'link'] as const).map((k) => {
                          const Icon = KIND_STYLE[k].icon
                          return (
                            <li key={k} className="flex-1">
                              <button
                                type="button"
                                onClick={() => setUploading({ mode: k === 'link' ? 'link' : 'files' })}
                                className="flex h-full min-h-16 w-full items-center gap-3 rounded-2xl bg-canvas/60 px-4 py-3 text-left ring-1 ring-line-soft transition-[background-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:bg-panel hover:shadow-card"
                              >
                                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-panel shadow-card ring-1 ring-line-soft">
                                  <Icon className={cn('size-5', KIND_STYLE[k].tone)} />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-semibold text-fg">{t(`ideas.${k}`)}</span>
                                  <span className="block text-xs text-fg-muted">{t(`ideas.${k}Hint`)}</span>
                                </span>
                                <span className="shrink-0 text-fg-subtle">{k === 'link' ? <Link2 className="size-4" /> : <Upload className="size-4" />}</span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  </div>
                ) : shown.length === 0 ? (
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
                ) : view === 'grid' ? (
                  <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-4 @7xl:grid-cols-5">
                    {shown.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setParam('file', a.id === selectedId ? null : a.id)}
                        aria-pressed={a.id === selectedId}
                        className={cn(
                          'group/tile flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-panel text-left outline-none transition-[border-color,box-shadow,transform] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-accent-mid/40',
                          a.id === selectedId
                            ? 'border-accent-mid shadow-card ring-2 ring-accent-mid/25'
                            : 'border-line-soft shadow-card hover:-translate-y-px hover:border-line hover:shadow-[0_8px_20px_-12px_oklch(0.3_0.09_312/0.35)]',
                        )}
                      >
                        <FilePreview a={a} className="aspect-[16/10] w-full border-b border-line" />
                        <span className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
                          <span className="line-clamp-2 text-sm font-medium leading-snug text-fg">{fileTitle(a)}</span>
                          {a.labels.length ? (
                            <span className="flex flex-wrap gap-1">
                              {a.labels.slice(0, 3).map((l) => (
                                <LabelChip key={l} label={l} />
                              ))}
                            </span>
                          ) : null}
                          <span className="mt-auto flex min-w-0 items-center gap-2 pt-1">
                            <LinkChips a={a} taskById={taskById} compact />
                            <Ago date={a.created_at} className="ml-auto shrink-0" />
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <ul className="flex flex-col divide-y divide-line-soft">
                    {shown.map((a) => {
                      const by = memberMap.get(a.uploaded_by ?? '')
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => setParam('file', a.id === selectedId ? null : a.id)}
                            aria-pressed={a.id === selectedId}
                            className={cn(
                              '-mx-3 flex w-[calc(100%+1.5rem)] items-center gap-3 rounded-lg px-3 py-2 text-left',
                              a.id === selectedId ? 'bg-accent-soft' : 'hover:bg-hover/70',
                            )}
                          >
                            <FileKindIcon a={a} className="size-5" />
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-sm font-medium text-fg">{fileTitle(a)}</span>
                              <span className="truncate text-xs text-fg-subtle">
                                {a.title ? a.name : a.kind === 'link' ? a.url : t(`kinds.${fileKindOf(a)}`)}
                                {a.size_bytes ? ` · ${formatBytes(a.size_bytes)}` : ''}
                              </span>
                            </span>
                            <span className="hidden max-w-56 shrink-0 gap-1 overflow-hidden @3xl:flex">
                              {a.labels.slice(0, 3).map((l) => (
                                <LabelChip key={l} label={l} />
                              ))}
                            </span>
                            <span className="hidden shrink-0 @2xl:flex">
                              <LinkChips a={a} taskById={taskById} />
                            </span>
                            {by ? <Avatar name={by.full_name} src={by.avatar_url} seed={by.id} size={20} /> : <span className="size-5 shrink-0" />}
                            <Ago date={a.created_at} className="hidden w-24 shrink-0 text-right sm:block" />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {/* al acercarse, se pide la página siguiente */}
                {loaded && hasNextPage ? (
                  <div ref={more} className="flex justify-center py-6">
                    {isFetchingNextPage ? <Spinner className="size-4 text-fg-subtle" /> : null}
                  </div>
                ) : null}
              </div>

              {dragging ? (
                <div className="pointer-events-none absolute inset-3 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent-mid bg-accent-soft/80 text-accent-ink">
                  <UploadCloud className="size-8" />
                  <p className="text-sm font-medium">{target ? t('dropInto', { space: wsMap.get(target)?.name ?? '' }) : t('drop')}</p>
                </div>
              ) : null}
            </div>

          </div>
        </section>
        {/* el detalle del archivo, en su tarjeta al lado (en el celular, a pantalla entera) */}
        {selected ? (
          <aside className={cn('fixed inset-0 z-40 bg-canvas lg:static lg:inset-auto lg:z-auto lg:flex lg:w-[360px] lg:shrink-0 lg:flex-col lg:overflow-hidden', 'lg:rounded-[24px] lg:bg-panel lg:shadow-[0_1px_2px_oklch(0.243_0.088_312.7/0.05),0_12px_32px_-20px_oklch(0.3_0.09_312/0.25)] lg:ring-1 lg:ring-line-soft')}>
            <FileInspector
              key={selected.id}
              file={selected}
              labelSuggestions={labels}
              onClose={() => setParam('file', null)}
              onShare={() => setSharing({ kind: 'file', refId: selected.id, title: fileTitle(selected) })}
            />
          </aside>
        ) : null}
        </div>
      )}

      <ShareToChatDialog open={sharing !== null} onOpenChange={(o) => !o && setSharing(null)} item={sharing} />
      <UploadDialog
        open={uploading !== null}
        onOpenChange={(o) => !o && setUploading(null)}
        initialMode={uploading?.mode}
        initialFiles={uploading?.files}
        defaultWorkspaceId={target}
        labelSuggestions={labels}
        onUploaded={(rows) => {
          track('feature.vault_upload')
          // si fue uno solo, se abre su detalle
          if (rows.length === 1) setParam('file', rows[0].id)
        }}
      />
    </div>
  )
}

/** Dónde cuelga un archivo: el espacio, la tarea y la reunión, en chiquito. */
function LinkChips({ a, taskById, compact }: { a: AttachmentRow; taskById: Map<string, { number: number; workspace_id: string }>; compact?: boolean }) {
  const t = useTranslations('vault')
  const ws = useWorkspaceMap().get(a.workspace_id ?? '')
  const task = a.task_id ? taskById.get(a.task_id) : undefined
  if (!ws && !a.task_id && !a.meeting_id) {
    return a.chat_id ? (
      <span className="inline-flex items-center gap-1 text-2xs text-fg-muted">
        <MessagesSquare className="size-3 text-accent-mid" />
        {t('fromChat')}
      </span>
    ) : (
      <span className="text-2xs text-fg-subtle">{t('loose')}</span>
    )
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-2xs text-fg-muted">
      {ws ? (
        <span className="inline-flex min-w-0 items-center gap-1" title={ws.name}>
          <WorkspaceMark ws={ws} size={14} />
          {compact ? null : <span className="max-w-28 truncate">{ws.name}</span>}
        </span>
      ) : null}
      {task && ws ? (
        <span className="inline-flex items-center gap-1 font-mono" title={t('links.task')}>
          <CircleCheck className="size-3" />
          {taskRef(ws.key, task.number)}
        </span>
      ) : null}
      {a.meeting_id ? <Video className="size-3 text-accent-mid" aria-label={t('links.meeting')} /> : null}
    </span>
  )
}

function Ago({ date, className }: { date: string; className?: string }) {
  const locale = useDateLocale()
  return <span className={cn('text-2xs text-fg-subtle', className)}>{formatDistanceToNowStrict(new Date(date), { addSuffix: true, locale })}</span>
}
