'use client'

import { useDeferredValue, useMemo, useState } from 'react'
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
import { Tooltip } from '@/components/ui/tooltip'
import { FilterFacet, type FilterOption } from '@/components/tasks/task-filters'
import { LabelChip } from '@/components/tasks/pickers'
import { formatBytes } from '@/components/attachments/attachments'
import { ShareToChatDialog, type ShareItem } from '@/components/chat/share-to-chat'
import { DocsHub } from '@/components/docs/docs-hub'
import { useVaultFiles } from '@/lib/queries/attachments'
import { useDocsIn } from '@/lib/queries/docs'
import { useTasks } from '@/lib/queries/tasks'
import { useDateLocale } from '@/lib/dates'
import { useLocalStorage } from '@/lib/hooks'
import { track } from '@/lib/telemetry'
import type { AttachmentRow } from '@/lib/database.types'
import { cn, taskRef } from '@/lib/utils'
import { FILE_KINDS, FilePreview, FileKindIcon, KIND_STYLE, fileKindOf, fileTitle } from './file-visual'
import { FileInspector } from './file-inspector'
import { UploadDialog, type UploadMode } from './upload-dialog'

type VaultFilters = { kind: string[]; ws: string[]; link: string[]; label: string[]; who: string[] }
type FilterKey = keyof VaultFilters
const NO_FILTERS: VaultFilters = { kind: [], ws: [], link: [], label: [], who: [] }
const NONE = 'none'
const LINKS = ['task', 'meeting', 'doc', NONE] as const

const linkKeys = (a: AttachmentRow) => {
  const keys = [a.task_id && 'task', a.meeting_id && 'meeting', a.doc_id && 'doc'].filter(Boolean) as string[]
  return keys.length ? keys : [NONE]
}

/**
 * La bóveda: todos los archivos y links de la cuenta en un lugar. Cada uno puede tener título y
 * etiquetas y colgar de un espacio, una tarea o una reunión, pero no hace falta: lo que se sube aquí
 * queda suelto hasta que se vincule. La pestaña "Escritos" junta los documentos de los espacios.
 */
export function VaultView() {
  const t = useTranslations('vault')
  const pathname = usePathname()
  const params = useSearchParams()
  const tab = params.get('tab') === 'written' ? 'written' : 'files'
  const { workspaces, observedWorkspaces, user } = useApp()
  const wsMap = useWorkspaceMap()
  const memberMap = useMemberMap()
  const wsIds = useMemo(() => [...workspaces, ...observedWorkspaces].map((w) => w.id), [workspaces, observedWorkspaces])
  const { data: files, isLoading, isError, refetch } = useVaultFiles()
  const { data: docs } = useDocsIn(wsIds)
  const { data: tasks } = useTasks({ kind: 'workspaces', workspaceIds: wsIds })
  const taskById = useMemo(() => new Map((tasks ?? []).map((x) => [x.id, x])), [tasks])
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useLocalStorage<VaultFilters>('veltro:vault-filters', NO_FILTERS)
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

  // la búsqueda filtra con un pequeño margen: escribir no recalcula todo en cada tecla
  const deferredQuery = useDeferredValue(query)
  const q = deferredQuery.trim().toLowerCase()
  const matches = (a: AttachmentRow, skip?: FilterKey) =>
    (!q ||
      fileTitle(a).toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.labels.some((l) => l.toLowerCase().includes(q)) ||
      (a.url ?? '').toLowerCase().includes(q)) &&
    (skip === 'kind' || !filters.kind.length || filters.kind.includes(fileKindOf(a))) &&
    (skip === 'ws' || !filters.ws.length || filters.ws.includes(a.workspace_id ?? NONE)) &&
    (skip === 'link' || !filters.link.length || linkKeys(a).some((k) => filters.link.includes(k))) &&
    (skip === 'label' || !filters.label.length || a.labels.some((l) => filters.label.includes(l))) &&
    (skip === 'who' || !filters.who.length || filters.who.includes(a.uploaded_by ?? ''))

  const all = useMemo(() => files ?? [], [files])
  const shown = all.filter((a) => matches(a))
  const selected = selectedId ? all.find((a) => a.id === selectedId) : undefined
  const active = filters.kind.length + filters.ws.length + filters.link.length + filters.label.length + filters.who.length
  const filtering = active > 0 || q !== ''
  const labels = useMemo(() => [...new Set(all.flatMap((a) => a.labels))].sort((a, b) => a.localeCompare(b)), [all])

  const tally = (k: FilterKey, keysOf: (a: AttachmentRow) => string[]) => {
    const m = new Map<string, number>()
    for (const a of all) if (matches(a, k)) for (const key of keysOf(a)) m.set(key, (m.get(key) ?? 0) + 1)
    return (v: string) => m.get(v) ?? 0
  }
  const kindN = tally('kind', (a) => [fileKindOf(a)])
  const wsN = tally('ws', (a) => [a.workspace_id ?? NONE])
  const linkN = tally('link', linkKeys)
  const labelN = tally('label', (a) => a.labels)
  const whoN = tally('who', (a) => (a.uploaded_by ? [a.uploaded_by] : []))
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
    who: [...new Set(all.flatMap((a) => (a.uploaded_by ? [a.uploaded_by] : [])))]
      .map((id) => {
        const m = memberMap.get(id)
        return { value: id, label: m?.full_name ?? '?', icon: <Avatar name={m?.full_name} src={m?.avatar_url} seed={id} size={18} />, count: whoN(id) }
      })
      .sort((a, b) => Number(b.value === user.id) - Number(a.value === user.id) || a.label.localeCompare(b.label)),
  }
  const toggle = (k: FilterKey) => (v: string, on: boolean) => setFilters((f) => ({ ...f, [k]: on ? [...f[k].filter((x) => x !== v), v] : f[k].filter((x) => x !== v) }))
  const clear = (k: FilterKey) => () => setFilters((f) => ({ ...f, [k]: [] }))

  // lo que se sube va al espacio filtrado (si hay uno solo y se puede editar); si no, queda suelto
  const target = filters.ws.length === 1 && filters.ws[0] !== NONE && canEdit(wsMap.get(filters.ws[0])) ? filters.ws[0] : null
  // subir abre el formulario (título, etiquetas, vínculos); soltar archivos también, ya con ellos cargados
  const [uploading, setUploading] = useState<{ mode: UploadMode; files?: File[] } | null>(null)
  const totalBytes = all.reduce((n, a) => n + (a.size_bytes ?? 0), 0)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line px-4 pt-6 sm:px-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="mr-auto min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">{t('title')}</h1>
            <p className="truncate text-sm text-fg-muted">{files ? t('subtitle', { count: all.length, size: formatBytes(totalBytes) || '0 KB' }) : ' '}</p>
          </div>
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
          ) : null}
        </div>
        <nav className="-mb-px mt-4 flex gap-1" aria-label={t('title')}>
          {(['files', 'written'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setParam('tab', id === 'files' ? null : id)}
              aria-current={tab === id ? 'page' : undefined}
              className={cn(
                'inline-flex h-10 items-center gap-1.5 rounded-t-md border-b-2 px-3 text-sm outline-none transition-colors focus-visible:bg-hover',
                tab === id ? 'border-accent font-medium text-fg' : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {id === 'files' ? <Vault className="size-4" /> : <FileText className="size-4" />}
              {t(`tabs.${id}`)}
              <span className="text-xs tabular-nums text-fg-subtle">{id === 'files' ? (files?.length ?? '') : (docs?.length ?? '')}</span>
            </button>
          ))}
        </nav>
      </div>

      {tab === 'written' ? (
        <DocsHub embedded />
      ) : (
        <>
          <div role="search" aria-label={t('filters')} className="flex shrink-0 items-start gap-2 border-b border-line px-4 py-2.5 sm:px-6">
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
              {filtering && files ? (
                <span className="whitespace-nowrap text-xs tabular-nums text-fg-subtle">{t('shownOf', { shown: shown.length, count: all.length })}</span>
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
              className="@container relative min-w-0 flex-1 overflow-y-auto scrollbar-thin"
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
              <div className="px-4 pb-24 pt-5 sm:px-6">
                {isError ? (
                  <ErrorState onRetry={() => refetch()} />
                ) : isLoading || !files ? (
                  <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-4">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-52 rounded-xl" />
                    ))}
                  </div>
                ) : all.length === 0 ? (
                  <EmptyState
                    icon={<Vault />}
                    title={t('emptyTitle')}
                    description={t('emptyBody')}
                    action={
                      <Button variant="primary" size="sm" onClick={() => setUploading({ mode: 'files' })}>
                        <Upload />
                        {t('upload')}
                      </Button>
                    }
                  />
                ) : shown.length === 0 ? (
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
                ) : view === 'grid' ? (
                  <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-4 @7xl:grid-cols-5">
                    {shown.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setParam('file', a.id === selectedId ? null : a.id)}
                        aria-pressed={a.id === selectedId}
                        className={cn(
                          'group/tile flex min-w-0 flex-col overflow-hidden rounded-xl border bg-panel text-left outline-none transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-accent-mid/40',
                          a.id === selectedId ? 'border-accent-mid shadow-card ring-2 ring-accent-mid/25' : 'border-line hover:border-line-strong hover:shadow-card',
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
              </div>

              {dragging ? (
                <div className="pointer-events-none absolute inset-3 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent-mid bg-accent-soft/80 text-accent-ink">
                  <UploadCloud className="size-8" />
                  <p className="text-sm font-medium">{target ? t('dropInto', { space: wsMap.get(target)?.name ?? '' }) : t('drop')}</p>
                </div>
              ) : null}
            </div>

            {selected ? (
              <aside className="fixed inset-0 z-40 bg-canvas lg:static lg:inset-auto lg:z-auto lg:w-[360px] lg:shrink-0 lg:border-l lg:border-line">
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
        </>
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
