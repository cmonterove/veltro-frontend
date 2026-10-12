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
import { openAttachment, useAttachmentMutations, useAttachments } from '@/lib/queries/attachments'
import { useDateLocale } from '@/lib/dates'
import { cn, taskRef, excerptOf } from '@/lib/utils'
import type { AttachmentRow, DocSource } from '@/lib/database.types'
import type { DocSummary, WorkspaceWithRole } from '@/lib/types'
import { SourceBadge } from '@/components/docs/source-badge'
import { useNewDoc } from '@/components/docs/doc-tree'
import { ImportMarkdownDialog } from '@/components/docs/import-markdown-dialog'
import { AttachmentIcon, formatBytes } from '@/components/attachments/attachments'
import { useOpenTask } from '@/lib/use-open-task'
import { useConfirm } from '@/components/ui/confirm'

type Tab = 'docs' | 'files'
type FileFilter = 'all' | 'docs' | 'images' | 'sheets' | 'links'

const GROUPS: { id: string; sources: DocSource[] }[] = [
  { id: 'meeting', sources: ['meeting'] },
  { id: 'claude', sources: ['claude'] },
  { id: 'docs', sources: ['manual', 'import'] },
]

export function WorkspaceDocs({ workspaceId, initialDocs }: { workspaceId: string; initialDocs: DocSummary[] }) {
  const t = useTranslations('docs')
  const ws = useWorkspaceMap().get(workspaceId)!
  const editable = canEdit(ws)
  const { data: docs = initialDocs } = useWorkspaceDocs(workspaceId, initialDocs)
  const { data: files } = useAttachments({ kind: 'workspace', workspaceId })
  const newDoc = useNewDoc(ws)
  const params = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => (params.get('tab') === 'files' ? 'files' : 'docs'))
  const [query, setQuery] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [fromClaude, setFromClaude] = useState(true)
  const { upload } = useAttachmentMutations()
  const fileInput = useRef<HTMLInputElement>(null)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2 sm:px-6">
        <div className="flex items-center rounded-lg bg-sidebar p-1">
          {(['docs', 'files'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-sm transition-colors',
                tab === id ? 'bg-panel font-medium text-fg shadow-card' : 'text-fg-muted hover:text-fg',
              )}
            >
              {id === 'docs' ? <FileText className="size-3.5" /> : <Paperclip className="size-3.5" />}
              {t(`library.${id}`)}
              <span className="text-xs tabular-nums text-fg-subtle">{id === 'docs' ? docs.length : (files?.length ?? 0)}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto flex items-center">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-fg-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('filterPlaceholder')}
            className="h-8 w-44 rounded-lg border border-line bg-panel pl-8 pr-2 text-sm outline-none transition-[width] duration-200 placeholder:text-fg-subtle focus:w-60 focus:border-accent"
          />
        </div>
        {editable ? (
          tab === 'docs' ? (
            <>
              <Button size="sm" onClick={() => setImportOpen(true)}>
                <FileUp />
                {t('importMarkdown')}
              </Button>
              <Button variant="primary" size="sm" onClick={() => newDoc.create()} loading={newDoc.pending}>
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
              <Button variant="primary" size="sm" onClick={() => fileInput.current?.click()} loading={upload.isPending}>
                {upload.isPending ? null : <Upload />}
                {t('library.upload')}
              </Button>
            </>
          )
        ) : null}
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6">
        {tab === 'docs' ? (
          <DocsLibrary ws={ws} docs={docs} files={files ?? []} query={query} editable={editable} onNew={() => newDoc.create()} onImport={() => setImportOpen(true)} />
        ) : (
          <FilesLibrary ws={ws} files={files ?? []} docs={docs} query={query} editable={editable} />
        )}
      </div>

      <ImportMarkdownDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        allowReplace={false}
        footerStart={
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <Switch checked={fromClaude} onCheckedChange={setFromClaude} />
            {t('import.fromClaude')}
          </label>
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

function DocsLibrary({
  ws,
  docs,
  files,
  query,
  editable,
  onNew,
  onImport,
}: {
  ws: WorkspaceWithRole
  docs: DocSummary[]
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

  const q = query.trim().toLowerCase()
  const list = docs
    .filter((d) => !q || d.title.toLowerCase().includes(q) || (d.excerpt ?? '').toLowerCase().includes(q))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  if (docs.length === 0) {
    return (
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
    )
  }
  if (list.length === 0) return <p className="py-10 text-sm text-fg-muted">{t('noMatches')}</p>

  const recent = q ? [] : list.slice(0, 4)
  const rest = q ? list : list.slice(4)

  const meta = (d: DocSummary) => {
    const nt = taskCount.get(d.id) ?? 0
    const nf = fileCount.get(d.id) ?? 0
    return (
      <span className="flex items-center gap-2.5 text-xs text-fg-subtle">
        {nt ? (
          <span className="inline-flex items-center gap-1">
            <ListTodo className="size-3.5" />
            {nt}
          </span>
        ) : null}
        {nf ? (
          <span className="inline-flex items-center gap-1">
            <Paperclip className="size-3.5" />
            {nf}
          </span>
        ) : null}
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-10">
      {recent.length ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold">{t('library.recent')}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {recent.map((d) => {
              const author = d.created_by ? memberMap.get(d.created_by) : undefined
              return (
                <Link
                  key={d.id}
                  href={`/w/${ws.slug}/docs/${d.id}`}
                  className="group/card flex h-48 flex-col rounded-xl border border-line bg-panel p-4 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-card"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-2xs font-medium text-fg-subtle">
                    <DocMark source={d.source} className="size-3.5" />
                    <span className="truncate">{d.source === 'meeting' && d.meeting_id ? (meetingTitle.get(d.meeting_id) ?? t(`kicker.${d.source}`)) : t(`kicker.${d.source}`)}</span>
                  </span>
                  <span className="mt-2 line-clamp-2 text-[15px] font-semibold leading-snug text-fg group-hover/card:underline group-hover/card:decoration-line-strong group-hover/card:underline-offset-4">
                    {d.title || t('untitled')}
                  </span>
                  <span className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-fg-muted">{excerptOf(d.excerpt) || t('library.emptyDoc')}</span>
                  <span className="mt-auto flex items-center gap-2 pt-3">
                    {author ? <Avatar name={author.full_name} src={author.avatar_url} seed={author.id} size={18} /> : null}
                    <span className="text-xs text-fg-subtle">{formatDistanceToNowStrict(new Date(d.updated_at), { addSuffix: true, locale })}</span>
                    <span className="ml-auto">{meta(d)}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      ) : null}

      {GROUPS.map((g) => {
        const items = rest.filter((d) => g.sources.includes(d.source))
        if (!items.length) return null
        return (
          <section key={g.id}>
            <h2 className="mb-1 flex items-baseline gap-2 text-sm font-semibold">
              {t(`library.groups.${g.id}`)}
              <span className="text-xs font-normal tabular-nums text-fg-subtle">{items.length}</span>
            </h2>
            <ul className="flex flex-col divide-y divide-line-soft">
              {items.map((d) => {
                const parent = d.parent_id ? byId.get(d.parent_id) : undefined
                const author = d.created_by ? memberMap.get(d.created_by) : undefined
                const sub = d.meeting_id && meetingTitle.get(d.meeting_id) ? meetingTitle.get(d.meeting_id) : parent ? parent.title || t('untitled') : excerptOf(d.excerpt, 90)
                return (
                  <li key={d.id}>
                    <Link href={`/w/${ws.slug}/docs/${d.id}`} className="-mx-3 flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-hover/70">
                      <DocMark source={d.source} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium text-fg">{d.title || t('untitled')}</span>
                        {sub ? <span className="truncate text-xs text-fg-subtle">{sub}</span> : null}
                      </span>
                      {meta(d)}
                      {d.source === 'import' ? <SourceBadge source={d.source} className="hidden md:inline-flex" /> : null}
                      <span className="hidden w-24 shrink-0 text-right text-xs text-fg-subtle sm:block">
                        {formatDistanceToNowStrict(new Date(d.updated_at), { addSuffix: true, locale })}
                      </span>
                      {author ? <Avatar name={author.full_name} src={author.avatar_url} seed={author.id} size={20} /> : <span className="size-5" />}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
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
      className={cn('flex flex-col gap-4 rounded-2xl transition-colors', dragging && 'bg-highlight ring-2 ring-accent/40')}
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
      <div className="flex flex-wrap items-center gap-1">
        {(['all', 'docs', 'images', 'sheets', 'links'] as const).map((f) =>
          f === 'all' || counts[f] ? (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn('inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors', filter === f ? 'bg-active font-medium text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg')}
            >
              {t(`fileFilters.${f}`)}
              <span className="text-xs tabular-nums text-fg-subtle">{f === 'all' ? files.length : counts[f]}</span>
            </button>
          ) : null,
        )}
        {editable ? <span className="ml-auto text-xs text-fg-subtle">{t('dropHint')}</span> : null}
      </div>

      {files.length === 0 ? (
        <EmptyState icon={<Paperclip />} title={t('noFilesTitle')} description={t('noFilesBody')} />
      ) : list.length === 0 ? (
        <p className="py-8 text-sm text-fg-muted">{t('noFileMatches')}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-sidebar text-left text-xs text-fg-muted">
                <th className="px-4 py-2 font-medium">{t('cols.name')}</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">{t('cols.origin')}</th>
                <th className="hidden px-3 py-2 font-medium lg:table-cell">{t('cols.by')}</th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">{t('cols.size')}</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {list.map((f) => {
                const task = f.task_id ? taskById.get(f.task_id) : undefined
                const meeting = f.meeting_id ? meetingById.get(f.meeting_id) : undefined
                const doc = f.doc_id ? docById.get(f.doc_id) : undefined
                const who = f.uploaded_by ? memberMap.get(f.uploaded_by) : undefined
                return (
                  <tr key={f.id} className="group/f border-b border-line-soft last:border-0 hover:bg-hover/50">
                    <td className="px-4 py-2.5">
                      <button type="button" onClick={() => openAttachment(f)} className="flex min-w-0 items-center gap-3 text-left">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar">
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
        </div>
      )}
    </div>
  )
}
