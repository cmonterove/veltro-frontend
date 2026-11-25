'use client'

import { fileTitle } from '@/components/vault/file-visual'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { formatDistanceToNowStrict } from 'date-fns'
import { FilePlus2, FileText, FileUp, ListTodo, Paperclip, Search, Upload } from 'lucide-react'
import { useMemberMap, useWorkspaceMap, canEdit } from '@/components/app/app-context'
import { DocMark } from '@/components/app/marks'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Avatar } from '@/components/ui/avatar'
import { EmptyState } from '@/components/ui/empty-state'
import { useWorkspaceDocs } from '@/lib/queries/docs'
import { useTasks } from '@/lib/queries/tasks'
import { useWorkspaceMeetings } from '@/lib/queries/meetings'
import { useAttachmentMutations, useAttachments } from '@/lib/queries/attachments'
import { useDateLocale } from '@/lib/dates'
import { cn, taskRef, excerptOf } from '@/lib/utils'
import type { AttachmentRow, DocSource } from '@/lib/database.types'
import type { DocSummary, WorkspaceWithRole } from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'
import { useNewDoc } from '@/components/docs/doc-tree'
import { ImportMarkdownDialog } from '@/components/docs/import-markdown-dialog'
import { AttachmentIcon, formatBytes } from '@/components/attachments/attachments'
import { useOpenTask } from '@/lib/use-open-task'
import { useConfirm } from '@/components/ui/confirm'
import { previewOrOpen } from '@/components/vault/file-viewer'
import { AI_ENABLED } from '@/lib/features'
import { CARD } from '@/components/ui/surface'
import { useMediaQuery } from '@/lib/hooks'
import { SpaceHeader } from './workspace-header'

type Tab = 'docs' | 'files'
type FileFilter = 'all' | 'docs' | 'images' | 'sheets' | 'links'

// sin la IA (lib/features), los docs de Claude van con los demás
const GROUPS: { id: string; sources: DocSource[] }[] = AI_ENABLED
  ? [
      { id: 'meeting', sources: ['meeting'] },
      { id: 'claude', sources: ['claude'] },
      { id: 'docs', sources: ['manual', 'import'] },
    ]
  : [
      { id: 'meeting', sources: ['meeting'] },
      { id: 'docs', sources: ['manual', 'import', 'claude'] },
    ]

const NO_DOCS: DocSummary[] = []

export function WorkspaceDocs({ workspaceId, initialDocs }: { workspaceId: string; initialDocs?: DocSummary[] }) {
  const t = useTranslations('docs')
  const ws = useWorkspaceMap().get(workspaceId)!
  const editable = canEdit(ws)
  const { data } = useWorkspaceDocs(workspaceId, initialDocs)
  const docs = data ?? NO_DOCS
  const { data: files } = useAttachments({ kind: 'workspace', workspaceId })
  const newDoc = useNewDoc(ws)
  const params = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => (params.get('tab') === 'files' ? 'files' : 'docs'))
  const [query, setQuery] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [fromClaude, setFromClaude] = useState(AI_ENABLED)
  const { upload } = useAttachmentMutations()
  const fileInput = useRef<HTMLInputElement>(null)

  const [source, setSource] = useState<string>('all')
  // los tipos que hay (solo se ofrecen si hay más de uno)
  const sourceCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of docs) {
      const g = GROUPS.find((x) => x.sources.includes(d.source))
      if (g) m.set(g.id, (m.get(g.id) ?? 0) + 1)
    }
    return m
  }, [docs])
  const sourceChips = sourceCounts.size > 1

  const actions = editable ? (
    tab === 'docs' ? (
      <>
        <Button onClick={() => setImportOpen(true)}>
          <FileUp />
          <span className="hidden lg:inline">{t('importMarkdown')}</span>
        </Button>
        <Button variant="primary" onClick={() => newDoc.create()} loading={newDoc.pending}>
          <FilePlus2 />
          {t('newDoc')}
        </Button>
      </>
    ) : (
      <>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            upload.mutate({ parent: { workspaceId }, files: Array.from(e.target.files ?? []) })
            e.target.value = ''
          }}
        />
        <Button variant="primary" onClick={() => fileInput.current?.click()} loading={upload.isPending}>
          {upload.isPending ? null : <Upload />}
          {t('library.upload')}
        </Button>
      </>
    )
  ) : undefined

  return (
    // isolate: la portada de la cabecera va detrás de la página, pero encima de la hoja
    <div className="isolate flex h-full min-h-0 flex-col gap-4 px-4 pb-4 pt-4 sm:px-6">
      {/* la fila de documentos o archivos, tipos y buscar va en la portada, debajo del título */}
      <SpaceHeader ws={ws} section="docs" actions={actions}>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2">
        {/* documentos o archivos: el mismo control segmentado de las vistas de Tareas */}
        <nav className="flex items-center gap-0.5 rounded-2xl bg-fg/[0.05] p-1" aria-label={t('library.views')}>
          {(['docs', 'files'] as const).map((id) => {
            const Icon = id === 'docs' ? FileText : Paperclip
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-pressed={tab === id}
                className={cn(
                  'inline-flex h-8 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium outline-none transition-[background-color,color,box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-accent-mid/40',
                  tab === id ? 'bg-panel text-fg shadow-card' : 'text-fg-muted hover:text-fg',
                )}
              >
                <Icon className={cn('size-4', tab === id ? 'text-accent' : 'text-fg-subtle')} />
                {t(`library.${id}`)}
                <span className="text-xs font-normal tabular-nums text-fg-subtle">{id === 'docs' ? docs.length : (files?.length ?? 0)}</span>
              </button>
            )
          })}
        </nav>

        {/* qué tipo de doc: notas de reuniones o documentos escritos */}
        {tab === 'docs' && sourceChips ? (
          <div className="flex items-center gap-1" role="group" aria-label={t('library.sourcesLabel')}>
            {[{ id: 'all', n: docs.length }, ...GROUPS.filter((g) => sourceCounts.get(g.id)).map((g) => ({ id: g.id, n: sourceCounts.get(g.id) ?? 0 }))].map(({ id, n }) => (
              <button
                key={id}
                type="button"
                onClick={() => setSource(id)}
                aria-pressed={source === id}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid/40',
                  source === id ? 'bg-fg/[0.07] font-medium text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg',
                )}
              >
                {id === 'all' ? t('library.fileFilters.all') : t(`library.groups.${id}`)}
                <span className="text-xs tabular-nums text-fg-subtle">{n}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 size-3.5 text-fg-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQuery('')
              }}
              placeholder={tab === 'docs' ? t('library.search') : t('library.searchFiles')}
              aria-label={tab === 'docs' ? t('library.search') : t('library.searchFiles')}
              className="h-8 w-44 rounded-lg border border-line bg-panel pl-8 pr-2 text-sm outline-none transition-[width,border-color] duration-200 placeholder:text-fg-subtle hover:border-line-strong focus:w-60 focus:border-accent-mid"
            />
          </div>
        </div>
      </div>
      </SpaceHeader>

      <div className="min-h-0 flex-1">
        {!data ? (
          <div className="grid h-full grid-cols-2 gap-4 lg:grid-cols-4">
            <Skeleton className="h-56 rounded-[20px] lg:col-span-2" />
            <Skeleton className="h-56 rounded-[20px]" />
            <Skeleton className="h-56 rounded-[20px]" />
          </div>
        ) : tab === 'docs' ? (
          <DocsShelf
            ws={ws}
            docs={source === 'all' ? docs : docs.filter((d) => GROUPS.find((g) => g.id === source)?.sources.includes(d.source))}
            total={docs.length}
            files={files ?? []}
            query={query}
            editable={editable}
            onNew={() => newDoc.create()}
            onImport={() => setImportOpen(true)}
          />
        ) : (
          <FilesLibrary ws={ws} files={files ?? []} docs={docs} query={query} editable={editable} />
        )}
      </div>

      <ImportMarkdownDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        allowReplace={false}
        footerStart={
          AI_ENABLED ? (
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              <Switch checked={fromClaude} onCheckedChange={setFromClaude} />
              {t('import.fromClaude')}
            </label>
          ) : undefined
        }
        onImport={(markdown) => {
          const firstHeading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim()
          const body = firstHeading ? markdown.replace(/^#\s+.+$/m, '').trimStart() : markdown
          newDoc.create({ title: (firstHeading ?? '').slice(0, 300), import_markdown: body, source: fromClaude ? 'claude' : 'import' })
        }}
      />
    </div>
  )
}

// ---------------- documentos ----------------

/**
 * Los docs como hojas en un estante que llena la pantalla: cada hoja muestra el comienzo del texto
 * (más alta, más texto) y la del último cambio va al frente, más ancha. Al final, la hoja en blanco
 * para escribir otro.
 */
function DocsShelf({
  ws,
  docs,
  total,
  files,
  query,
  editable,
  onNew,
  onImport,
}: {
  ws: WorkspaceWithRole
  docs: DocSummary[]
  total: number
  files: AttachmentRow[]
  query: string
  editable: boolean
  onNew: () => void
  onImport: () => void
}) {
  const t = useTranslations('docs')
  const locale = useDateLocale()
  const memberMap = useMemberMap()
  const { data: tasks } = useTasks({ kind: 'workspace', workspaceId: ws.id })
  const { data: meetings } = useWorkspaceMeetings(ws.id)
  const meetingTitle = useMemo(() => new Map((meetings ?? []).map((m) => [m.id, m.title])), [meetings])
  const byId = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs])
  const taskCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of tasks ?? []) if (x.doc_id) m.set(x.doc_id, (m.get(x.doc_id) ?? 0) + 1)
    return m
  }, [tasks])
  const fileCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of files) if (f.doc_id) m.set(f.doc_id, (m.get(f.doc_id) ?? 0) + 1)
    return m
  }, [files])

  const sm = useMediaQuery('(min-width: 640px)')
  const lg = useMediaQuery('(min-width: 1024px)')
  const xl = useMediaQuery('(min-width: 1280px)')

  const q = query.trim().toLowerCase()
  const list = docs
    .filter((d) => !q || d.title.toLowerCase().includes(q) || (d.excerpt ?? '').toLowerCase().includes(q))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  if (total === 0) {
    return (
      <div className={cn(CARD, 'flex h-full items-center justify-center px-6')}>
        <EmptyState
          icon={<FileText />}
          title={t('empty.title')}
          description={t('empty.description')}
          action={
            editable ? (
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={onNew}>
                  <FilePlus2 />
                  {t('newDoc')}
                </Button>
                <Button size="sm" onClick={onImport}>
                  <FileUp />
                  {t('importMarkdown')}
                </Button>
              </div>
            ) : null
          }
        />
      </div>
    )
  }
  if (list.length === 0) {
    return (
      <div className={cn(CARD, 'flex h-full items-center justify-center px-6')}>
        <p className="text-sm text-fg-muted">{t('noMatches')}</p>
      </div>
    )
  }

  // la del último cambio, al frente (sin búsqueda: buscando, todas iguales)
  const featured = q ? null : list[0]
  // la hoja en blanco solo si completa la última fila (si no, quedaría sola en una fila nueva)
  const cols = xl ? 4 : lg ? 3 : sm ? 2 : 1
  const cells = list.length + (featured && cols > 1 ? 1 : 0)
  const blank = editable && !q && cells % cols !== 0

  return (
    // las filas se estiran hasta abajo; si no caben, el estante se desplaza (con aire para las sombras)
    <div className="-m-2 h-[calc(100%+1rem)] overflow-y-auto p-2 scrollbar-thin">
      <div className="grid min-h-full grid-cols-1 gap-4 [grid-auto-rows:minmax(15rem,1fr)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((d) => {
          const author = d.created_by ? memberMap.get(d.created_by) : undefined
          const parent = d.parent_id ? byId.get(d.parent_id) : undefined
          const big = d.id === featured?.id
          const nt = taskCount.get(d.id) ?? 0
          const nf = fileCount.get(d.id) ?? 0
          const kicker = d.source === 'meeting' && d.meeting_id ? (meetingTitle.get(d.meeting_id) ?? t(`kicker.${d.source}`)) : t(`kicker.${d.source}`)
          return (
            <Link
              key={d.id}
              href={`/w/${ws.slug}/docs/${d.id}`}
              className={cn(
                'group/doc relative flex min-h-0 flex-col overflow-hidden rounded-[20px] bg-panel p-5 outline-none ring-1 ring-line-soft transition-[box-shadow,transform] duration-200 ease-out',
                'shadow-[0_1px_2px_oklch(0.243_0.088_312.7/0.05),0_10px_26px_-20px_oklch(0.3_0.09_312/0.3)] hover:-translate-y-0.5 hover:shadow-[0_2px_4px_oklch(0.243_0.088_312.7/0.05),0_18px_36px_-20px_oklch(0.3_0.09_312/0.42)] focus-visible:ring-2 focus-visible:ring-accent-mid/50',
                big && 'sm:col-span-2',
              )}
            >
              <span className="flex min-w-0 items-center gap-2 text-[11.5px] font-medium text-fg-subtle">
                <DocMark source={d.source} className="size-3.5" />
                <span className="truncate">{kicker}</span>
                {big ? <span className="ml-auto shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent-ink">{t('library.latest')}</span> : null}
              </span>
              <span className={cn('mt-3 line-clamp-2 font-semibold leading-snug tracking-[-0.015em] text-fg', big ? 'text-[20px]' : 'text-[16px]')}>{d.title || t('untitled')}</span>
              {parent ? <span className="mt-1 truncate text-xs text-fg-subtle">{t('library.inParent', { title: parent.title || t('untitled') })}</span> : null}
              {/* el comienzo del texto, como en la hoja: llena lo que haya y se desvanece al pie. Va
                  posicionado para no empujar el alto de la fila (la fila la decide la pantalla, no el texto) */}
              <span className="relative mt-2.5 min-h-12 flex-1">
                <span
                  className={cn(
                    'absolute inset-0 overflow-hidden whitespace-pre-line text-fg-muted [mask-image:linear-gradient(to_bottom,black_55%,transparent)]',
                    big ? 'text-[13.5px] leading-[1.65] sm:columns-2 sm:gap-6' : 'text-[12.5px] leading-[1.6]',
                  )}
                >
                  {(big ? d.excerpt : excerptOf(d.excerpt, 400)) || t('library.emptyDoc')}
                </span>
              </span>
              <span className="mt-3 flex items-center gap-2 border-t border-line-soft pt-3 text-xs text-fg-subtle">
                {author ? <Avatar name={author.full_name} src={author.avatar_url} seed={author.id} size={20} /> : null}
                <span className="truncate">{formatDistanceToNowStrict(new Date(d.updated_at), { addSuffix: true, locale })}</span>
                <span className="ml-auto flex items-center gap-2.5">
                  {nt ? (
                    <span className="inline-flex items-center gap-1" title={t('library.tasksCount', { count: nt })}>
                      <ListTodo className="size-3.5" />
                      {nt}
                    </span>
                  ) : null}
                  {nf ? (
                    <span className="inline-flex items-center gap-1" title={t('library.filesCount', { count: nf })}>
                      <Paperclip className="size-3.5" />
                      {nf}
                    </span>
                  ) : null}
                </span>
              </span>
            </Link>
          )
        })}
        {/* la hoja en blanco: escribir otro doc o traerlo de Markdown */}
        {blank ? (
          <div className="flex min-h-0 flex-col items-center justify-center gap-3 rounded-[20px] border border-dashed border-line-strong/80 p-5 text-center">
            <button
              type="button"
              onClick={onNew}
              className="flex flex-col items-center gap-2 rounded-xl px-4 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid/40"
            >
              <span className="flex size-11 items-center justify-center rounded-2xl bg-panel text-fg-muted shadow-card transition-transform duration-200 ease-out group-hover:scale-105">
                <FilePlus2 className="size-5" />
              </span>
              <span className="text-sm font-semibold text-fg">{t('library.newCardTitle')}</span>
            </button>
            <button type="button" onClick={onImport} className="text-xs text-fg-muted underline-offset-4 hover:text-fg hover:underline">
              {t('library.newCardHint')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ---------------- archivos ----------------

function kindOf(a: AttachmentRow): Exclude<FileFilter, 'all'> {
  if (a.kind === 'link') return 'links'
  const mime = a.mime_type ?? ''
  const ext = a.name.split('.').pop()?.toLowerCase() ?? ''
  if (mime.startsWith('image/')) return 'images'
  if (mime.includes('sheet') || mime.includes('csv') || ['xlsx', 'xls', 'csv'].includes(ext)) return 'sheets'
  return 'docs'
}

function FilesLibrary({ ws, files, docs, query, editable }: { ws: WorkspaceWithRole; files: AttachmentRow[]; docs: DocSummary[]; query: string; editable: boolean }) {
  const t = useTranslations('docs.library')
  const locale = useDateLocale()
  const memberMap = useMemberMap()
  const { open } = useOpenTask()
  const { data: tasks } = useTasks({ kind: 'workspace', workspaceId: ws.id })
  const { data: meetings } = useWorkspaceMeetings(ws.id)
  const { upload, remove } = useAttachmentMutations()
  const confirm = useConfirm()
  const tConfirm = useTranslations('confirm')
  const tAtt = useTranslations('attachments')
  const [filter, setFilter] = useState<FileFilter>('all')
  const [dragging, setDragging] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const taskById = useMemo(() => new Map((tasks ?? []).map((x) => [x.id, x])), [tasks])
  const meetingById = useMemo(() => new Map((meetings ?? []).map((m) => [m.id, m])), [meetings])
  const docById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs])

  const q = query.trim().toLowerCase()
  const list = files.filter((f) => (filter === 'all' || kindOf(f) === filter) && (!q || f.name.toLowerCase().includes(q)))
  const counts = files.reduce<Record<string, number>>((acc, f) => {
    const k = kindOf(f)
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})

  return (
    <div
      // una tarjeta hasta abajo: los tipos arriba, la tabla se desplaza por dentro; soltar archivos la marca entera
      className={cn(CARD, 'flex h-full min-h-0 flex-col overflow-hidden transition-shadow', dragging && 'ring-2 ring-accent/50')}
      onDragOver={(e) => {
        if (!editable) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={(e) => {
        if (!editable) return
        e.preventDefault()
        setDragging(false)
        upload.mutate({ parent: { workspaceId: ws.id }, files: Array.from(e.dataTransfer.files) })
      }}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line-soft px-4 py-2.5">
        {(['all', 'docs', 'images', 'sheets', 'links'] as const).map((f) =>
          f === 'all' || counts[f] ? (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-colors', filter === f ? 'bg-fg/[0.07] font-medium text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg')}
            >
              {t(`fileFilters.${f}`)}
              <span className="text-xs tabular-nums text-fg-subtle">{f === 'all' ? files.length : counts[f]}</span>
            </button>
          ) : null,
        )}
      </div>

      {files.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <EmptyState icon={<Paperclip />} title={t('noFilesTitle')} description={t('noFilesBody')} />
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="text-sm text-fg-muted">{t('noFileMatches')}</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-[11.5px] text-fg-muted">
                <th className="sticky top-0 z-10 border-b border-line-soft bg-panel px-4 py-2.5 font-semibold">{t('cols.name')}</th>
                <th className="sticky top-0 z-10 hidden border-b border-line-soft bg-panel px-3 py-2.5 font-semibold md:table-cell">{t('cols.origin')}</th>
                <th className="sticky top-0 z-10 hidden border-b border-line-soft bg-panel px-3 py-2.5 font-semibold lg:table-cell">{t('cols.by')}</th>
                <th className="sticky top-0 z-10 hidden border-b border-line-soft bg-panel px-3 py-2.5 text-right font-semibold sm:table-cell">{t('cols.size')}</th>
                <th className="sticky top-0 z-10 w-16 border-b border-line-soft bg-panel" />
              </tr>
            </thead>
            <tbody>
              {list.map((f) => {
                const task = f.task_id ? taskById.get(f.task_id) : undefined
                const meeting = f.meeting_id ? meetingById.get(f.meeting_id) : undefined
                const doc = f.doc_id ? docById.get(f.doc_id) : undefined
                const who = f.uploaded_by ? memberMap.get(f.uploaded_by) : undefined
                return (
                  <tr key={f.id} className="group/f transition-colors duration-100 hover:bg-canvas [&>td]:border-b [&>td]:border-line-soft">
                    <td className="px-4 py-2.5">
                      <button type="button" onClick={() => previewOrOpen(f)} className="flex min-w-0 items-center gap-3 text-left">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-canvas ring-1 ring-inset ring-line-soft">
                          <AttachmentIcon a={f} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-fg hover:underline">{fileTitle(f)}</span>
                          <span className="block text-xs text-fg-subtle">{formatDistanceToNowStrict(new Date(f.created_at), { addSuffix: true, locale })}</span>
                        </span>
                      </button>
                    </td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      <span className="flex flex-wrap gap-1">
                        {task ? (
                          <button type="button" onClick={() => open(task.id)} className="inline-flex h-6 max-w-56 items-center gap-1.5 rounded-md bg-k-action-soft px-2 text-xs text-k-action hover:opacity-80">
                            <span className="shrink-0 whitespace-nowrap font-mono font-semibold">{taskRef(ws.key, task.number)}</span>
                            <span className="truncate">{task.title}</span>
                          </button>
                        ) : null}
                        {meeting ? (
                          <Link href={`/m/${meeting.id}`} className="inline-flex h-6 max-w-56 items-center gap-1.5 rounded-md bg-highlight px-2 text-xs text-highlight-ink hover:opacity-80">
                            <span className="size-1.5 shrink-0 rounded-full bg-mandarina" />
                            <span className="truncate">{meeting.title}</span>
                          </Link>
                        ) : null}
                        {doc ? (
                          <Link href={`/w/${ws.slug}/docs/${doc.id}`} className="inline-flex h-6 max-w-56 items-center gap-1.5 rounded-md bg-hover px-2 text-xs text-fg-muted hover:text-fg">
                            <DocMark source={doc.source} className="size-3" />
                            <span className="truncate">{doc.title || '…'}</span>
                          </Link>
                        ) : null}
                        {!task && !meeting && !doc ? <span className="text-xs text-fg-subtle">{t('workspaceLevel')}</span> : null}
                      </span>
                    </td>
                    <td className="hidden px-3 py-2.5 lg:table-cell">
                      {who ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
                          <Avatar name={who.full_name} seed={who.id} src={who.avatar_url} size={18} />
                          {who.full_name.split(' ')[0]}
                        </span>
                      ) : null}
                    </td>
                    <td className="hidden px-3 py-2.5 text-right text-xs tabular-nums text-fg-subtle sm:table-cell">{f.kind === 'link' ? t('link') : formatBytes(f.size_bytes)}</td>
                    <td className="px-3 py-2.5 text-right">
                      {editable ? (
                        <button
                          type="button"
                          onClick={async () => {
                            if (await confirm({ title: tAtt('deleteConfirm', { name: fileTitle(f) }), danger: true, confirmLabel: tConfirm('delete') })) remove.mutate(f)
                          }}
                          className="text-xs text-fg-subtle opacity-0 hover:text-danger group-hover/f:opacity-100 focus-visible:opacity-100"
                        >
                          {t('remove')}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {/* lo que queda de la tarjeta es donde se sueltan archivos (o se eligen) */}
          {editable ? (
            <div className="m-4 flex min-h-28 flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong/80 px-6 text-center">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-canvas text-fg-muted ring-1 ring-inset ring-line-soft">
                <Upload className="size-[18px]" />
              </span>
              <p className="text-sm text-fg-muted">{t('dropHint')}</p>
              <button type="button" onClick={() => picker.current?.click()} className="text-xs font-medium text-accent-ink underline-offset-4 hover:underline">
                {t('pick')}
              </button>
              <input
                ref={picker}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  upload.mutate({ parent: { workspaceId: ws.id }, files: Array.from(e.target.files ?? []) })
                  e.target.value = ''
                }}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
