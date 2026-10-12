'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNowStrict, format } from 'date-fns'
import { toast } from 'sonner'
import type { BlockNoteEditor } from '@blocknote/core'
import {
  ChevronRight,
  ClipboardCopy,
  ExternalLink,
  FilePlus2,
  FileUp,
  ListChecks,
  MoreHorizontal,
  Plus,
  Trash2,
  MessageCircle,
} from 'lucide-react'
import { useApp, useMemberMap, canEdit } from '@/components/app/app-context'
import { Button } from '@/components/ui/button'
import { ShareToChatDialog } from '@/components/chat/share-to-chat'
import { Tooltip } from '@/components/ui/tooltip'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { useArchiveDoc, useDoc, useSaveDoc, useWorkspaceDocs } from '@/lib/queries/docs'
import { useCreateTask, useTasks, useUpdateTask } from '@/lib/queries/tasks'
import { createClient } from '@/lib/supabase/client'
import { useDateLocale } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { DocRow, MeetingRow } from '@/lib/database.types'
import type { WorkspaceWithRole } from '@/lib/types'
import { StatusIcon } from '@/components/tasks/status-icon'
import { DueDate } from '@/components/tasks/due-date'
import { DocMark, WorkspaceMark } from '@/components/app/marks'
import { AttachmentsSection } from '@/components/attachments/attachments'
import { ImportMarkdownDialog } from './import-markdown-dialog'
import { useNewDoc, buildDocTree } from './doc-tree'
import type { EditorChange } from './block-editor'
import { inlineText, type LooseBlock } from '@/lib/blocks'
import { useOpenTask } from '@/lib/use-open-task'
import { useConfirm } from '@/components/ui/confirm'

const BlockEditor = dynamic(() => import('./block-editor').then((m) => m.BlockEditor), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col gap-3 px-[54px] pt-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  ),
})

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function DocView({ initialDoc, workspace }: { initialDoc: DocRow; workspace: WorkspaceWithRole }) {
  const t = useTranslations('docs')
  const router = useRouter()
  const locale = useDateLocale()
  const memberMap = useMemberMap()
  const { data: doc = initialDoc } = useDoc(initialDoc.id, initialDoc)
  const { data: allDocs } = useWorkspaceDocs(workspace.id)
  const editable = canEdit(workspace)
  const save = useSaveDoc()
  const archive = useArchiveDoc()
  const newDoc = useNewDoc(workspace)
  const editorRef = useRef<BlockNoteEditor | null>(null)
  const [title, setTitle] = useState(doc.title)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [importOpen, setImportOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const confirm = useConfirm()
  const tConfirm = useTranslations('confirm')
  const pending = useRef<Partial<DocRow> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const patch = pending.current
    if (!patch) return
    pending.current = null
    setSaveState('saving')
    save.mutate(
      { id: doc.id, patch: patch as never },
      {
        onSuccess: () => setSaveState('saved'),
        onError: () => {
          setSaveState('error')
          toast.error(t('saveError'))
        },
      },
    )
  }, [doc.id, save, t])

  const queue = useCallback(
    (patch: Partial<DocRow>, delay = 800) => {
      pending.current = { ...(pending.current ?? {}), ...patch }
      setSaveState('saving')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, delay)
    },
    [flush],
  )

  useEffect(() => {
    const onUnload = () => flush()
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      flush()
    }
  }, [flush])

  const onEditorChange = useCallback(
    (c: EditorChange) => queue({ content: c.content, content_text: c.text }),
    [queue],
  )
  const onImported = useCallback(
    (c: EditorChange) => {
      pending.current = { ...(pending.current ?? {}), content: c.content, content_text: c.text, import_markdown: null }
      flush()
    },
    [flush],
  )
  const onReady = useCallback((e: BlockNoteEditor) => {
    editorRef.current = e
  }, [])

  // breadcrumbs
  const crumbs = useMemo(() => {
    const byId = new Map((allDocs ?? []).map((d) => [d.id, d]))
    const chain: { id: string; title: string; icon: string | null }[] = []
    let cur = doc.parent_id ? byId.get(doc.parent_id) : undefined
    while (cur && chain.length < 6) {
      chain.unshift({ id: cur.id, title: cur.title, icon: cur.icon })
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
    }
    return chain
  }, [allDocs, doc.parent_id])

  const children = useMemo(() => buildDocTree(allDocs ?? []).get(doc.id) ?? [], [allDocs, doc.id])
  const author = doc.created_by ? memberMap.get(doc.created_by) : undefined

  const copyMarkdown = async () => {
    const editor = editorRef.current
    if (!editor) return
    const md = `# ${title || t('untitled')}\n\n${editor.blocksToMarkdownLossy(editor.document)}`
    await navigator.clipboard.writeText(md)
    toast.success(t('copied'))
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 flex h-11 shrink-0 items-center gap-2 border-b border-line-soft bg-canvas/95 px-3 sm:px-4">
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm text-fg-muted">
          <Link href={`/w/${workspace.slug}/docs`} className="flex shrink-0 items-center gap-1.5 rounded-sm px-1 py-0.5 hover:bg-hover hover:text-fg">
            <WorkspaceMark ws={workspace} size={16} />
            <span className="hidden sm:inline">{workspace.name}</span>
          </Link>
          {crumbs.map((c) => (
            <span key={c.id} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="size-3.5 shrink-0 text-fg-subtle" />
              <Link href={`/w/${workspace.slug}/docs/${c.id}`} className="truncate rounded-sm px-1 py-0.5 hover:bg-hover hover:text-fg">
                {c.title || t('untitled')}
              </Link>
            </span>
          ))}
          <ChevronRight className="size-3.5 shrink-0 text-fg-subtle" />
          <span className="truncate px-1 text-fg">{title || t('untitled')}</span>
        </nav>

        <span className="hidden text-xs text-fg-subtle sm:inline" aria-live="polite">
          {saveState === 'saving' ? t('saving') : saveState === 'saved' ? t('saved') : saveState === 'error' ? t('saveError') : null}
        </span>

        <Button variant="ghost" size="sm" onClick={copyMarkdown} className="hidden sm:inline-flex">
          <ClipboardCopy />
          {t('copyForClaude')}
        </Button>
        <Tooltip content={t('shareInPasillo')}>
          <Button variant="ghost" size="icon-sm" onClick={() => setSharing(true)} aria-label={t('shareInPasillo')}>
            <MessageCircle />
          </Button>
        </Tooltip>

        <Menu>
          <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t('more')} />}>
            <MoreHorizontal />
          </MenuTrigger>
          <MenuContent align="end" className="w-60">
            <MenuItem onClick={copyMarkdown}>
              <ClipboardCopy />
              {t('copyMarkdown')}
            </MenuItem>
            {editable ? (
              <>
                <MenuItem onClick={() => setImportOpen(true)}>
                  <FileUp />
                  {t('importMarkdown')}
                </MenuItem>
                <MenuItem onClick={() => newDoc.create({ parentId: doc.id, after: children.at(-1)?.position })}>
                  <FilePlus2 />
                  {t('addSubpage')}
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  danger
                  onClick={async () => {
                    if (!(await confirm({ title: t('deleteConfirm', { title: title || t('untitled') }), description: t('deleteConfirmHint'), danger: true, confirmLabel: tConfirm('delete') }))) return
                    archive.mutate(doc.id, {
                      onSuccess: () => {
                        toast.success(t('deleted'))
                        router.push(doc.parent_id ? `/w/${workspace.slug}/docs/${doc.parent_id}` : `/w/${workspace.slug}/docs`)
                      },
                    })
                  }}
                >
                  <Trash2 />
                  {t('delete')}
                </MenuItem>
              </>
            ) : null}
          </MenuContent>
        </Menu>
      </header>

      <div className="mx-auto grid w-full max-w-[1160px] grid-cols-1 gap-x-12 gap-y-10 px-5 pb-40 pt-8 sm:px-10 xl:grid-cols-[minmax(0,1fr)_288px] xl:pt-12">
        <article className="min-w-0">
          <p className="mb-3 flex items-center gap-2 text-xs font-medium text-fg-muted">
            <DocMark source={doc.source} className="size-3.5" />
            {t(`kicker.${doc.source}`)}
          </p>
          <AutoTextarea
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              queue({ title: e.target.value.slice(0, 300) }, 500)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                editorRef.current?.focus()
              }
            }}
            readOnly={!editable}
            placeholder={t('untitled')}
            className="max-w-[44ch] bg-transparent font-brand text-[34px] font-semibold leading-[1.15] tracking-[-0.03em] text-fg outline-none placeholder:text-fg-subtle/70"
          />

          <div className="-mx-[18px] mt-6 max-w-[calc(72ch+108px)] sm:-mx-[54px]">
            <BlockEditor
              key={doc.id}
              workspaceId={workspace.id}
              initialContent={doc.content}
              importMarkdown={doc.import_markdown}
              editable={editable}
              onChange={onEditorChange}
              onImported={onImported}
              onReady={onReady}
              placeholder={t('editorPlaceholder')}
            />
          </div>
        </article>

        <aside className="flex min-w-0 flex-col gap-8 xl:sticky xl:top-[68px] xl:max-h-[calc(100dvh-90px)] xl:self-start xl:overflow-y-auto xl:pb-6 scrollbar-thin">
          {doc.meeting_id ? <MeetingContext meetingId={doc.meeting_id} /> : null}
          {doc.source === 'claude' ? (
            <RailSection title={t('rail.origin')}>
              <div className="flex flex-col gap-2 rounded-xl bg-highlight p-3">
                <span className="flex items-center gap-2 text-sm font-medium text-highlight-ink">
                  <DocMark source="claude" className="size-3.5" />
                  {t('rail.claudeTitle')}
                </span>
                <p className="text-xs text-fg-muted">{t('rail.claudeBody')}</p>
              </div>
            </RailSection>
          ) : null}

          <DocTasks doc={doc} workspace={workspace} editorRef={editorRef} editable={editable} />

          <AttachmentsSection
            scope={{ kind: 'doc', docId: doc.id }}
            parent={{ workspaceId: workspace.id, docId: doc.id, meetingId: doc.meeting_id }}
            editable={editable}
            dense
          />

          {children.length || editable ? (
            <RailSection
              title={t('subpages')}
              action={
                editable ? (
                  <button
                    type="button"
                    onClick={() => newDoc.create({ parentId: doc.id, after: children.at(-1)?.position })}
                    className="inline-flex size-6 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
                    aria-label={t('addSubpage')}
                  >
                    <Plus className="size-3.5" />
                  </button>
                ) : null
              }
            >
              {children.length ? (
                <div className="flex flex-col">
                  {children.map((c) => (
                    <Link key={c.id} href={`/w/${workspace.slug}/docs/${c.id}`} className="-mx-2 flex h-8 items-center gap-2 rounded-md px-2 text-sm hover:bg-hover">
                      <DocMark source={c.source} className="size-3.5" />
                      <span className="truncate">{c.title || t('untitled')}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-fg-subtle">{t('rail.noSubpages')}</p>
              )}
            </RailSection>
          ) : null}

          <RailSection title={t('rail.details')}>
            <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-y-2 text-xs">
              <dt className="text-fg-subtle">{t('rail.author')}</dt>
              <dd className="flex min-w-0 items-center gap-1.5 text-fg">
                {author ? <Avatar name={author.full_name} src={author.avatar_url} seed={author.id} size={16} /> : null}
                <span className="truncate">{author?.full_name ?? t('rail.unknown')}</span>
              </dd>
              <dt className="text-fg-subtle">{t('rail.created')}</dt>
              <dd className="text-fg">{format(new Date(doc.created_at), 'd MMM yyyy', { locale })}</dd>
              <dt className="text-fg-subtle">{t('rail.updated')}</dt>
              <dd className="text-fg">{formatDistanceToNowStrict(new Date(doc.updated_at), { addSuffix: true, locale })}</dd>
            </dl>
          </RailSection>
        </aside>
      </div>

      <ImportMarkdownDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={(markdown, mode) => {
          const editor = editorRef.current
          if (!editor) return
          const blocks = editor.tryParseMarkdownToBlocks(markdown)
          if (mode === 'replace') editor.replaceBlocks(editor.document, blocks)
          else editor.insertBlocks(blocks, editor.document[editor.document.length - 1], 'after')
          if (doc.source === 'manual' && mode === 'replace') save.mutate({ id: doc.id, patch: { source: 'import' } })
        }}
      />
      <ShareToChatDialog open={sharing} onOpenChange={setSharing} item={{ kind: 'doc', refId: doc.id, title: title || t('untitled') }} />
    </div>
  )
}

function RailSection({ title, action, children }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex h-6 items-center justify-between">
        <h2 className="text-xs font-medium text-fg-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function MeetingContext({ meetingId }: { meetingId: string }) {
  const t = useTranslations('docs')
  const locale = useDateLocale()
  const { data: meeting } = useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: async () => {
      const { data } = await createClient().from('meetings').select('*').eq('id', meetingId).single()
      return data as MeetingRow | null
    },
  })
  if (!meeting) return null
  const start = new Date(meeting.starts_at)
  const end = meeting.ends_at ? new Date(meeting.ends_at) : null
  return (
    <RailSection title={t('rail.origin')}>
      <div className="flex flex-col gap-3 rounded-xl bg-highlight p-3">
        <div className="flex items-start gap-2">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-mandarina" />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug text-highlight-ink">{meeting.title || t('untitledMeeting')}</p>
            <p className="text-xs text-fg-muted first-letter:uppercase">
              {format(start, 'EEEE d MMM', { locale })} · {format(start, 'HH:mm')}
              {end ? ` - ${format(end, 'HH:mm')}` : ''}
            </p>
          </div>
        </div>
        {meeting.attendees.length ? (
          <ul className="flex flex-col gap-1.5">
            {meeting.attendees.slice(0, 6).map((a) => (
              <li key={a.email} className="flex items-center gap-2 text-xs text-fg">
                <Avatar name={a.name || a.email} seed={a.email} size={16} />
                <span className="truncate">{a.name || a.email}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {meeting.html_link ? (
          <a href={meeting.html_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent-ink hover:underline">
            Google Calendar
            <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>
    </RailSection>
  )
}

type CheckItem = { id: string; text: string }

function collectChecklist(blocks: readonly unknown[]): CheckItem[] {
  const out: CheckItem[] = []
  const walk = (list: LooseBlock[]) => {
    for (const b of list) {
      if (b.type === 'checkListItem' && !b.props?.checked && b.id) {
        const text = inlineText(Array.isArray(b.content) ? b.content : undefined).trim()
        if (text) out.push({ id: b.id, text })
      }
      if (b.children?.length) walk(b.children)
    }
  }
  walk(blocks as LooseBlock[])
  return out
}

function DocTasks({
  doc,
  workspace,
  editorRef,
  editable,
}: {
  doc: DocRow
  workspace: WorkspaceWithRole
  editorRef: React.RefObject<BlockNoteEditor | null>
  editable: boolean
}) {
  const t = useTranslations('docs')
  const { user } = useApp()
  const { open } = useOpenTask()
  const { data: tasks } = useTasks({ kind: 'doc', docId: doc.id })
  const create = useCreateTask()
  const update = useUpdateTask()
  const [draft, setDraft] = useState('')
  const list = [...(tasks ?? [])].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || a.position - b.position)
  const done = list.filter((x) => x.status === 'done').length

  // Ítems de checklist sin marcar que todavía no son tareas: el botón solo aparece cuando hay algo que convertir.
  const [pending, setPending] = useState(0)
  const linkedKey = list.map((x) => x.doc_block_id ?? '').join(',')
  useEffect(() => {
    const count = () => {
      const editor = editorRef.current
      if (!editor) return
      const linked = new Set(linkedKey.split(',').filter(Boolean))
      setPending(collectChecklist(editor.document).filter((i) => !linked.has(i.id)).length)
    }
    count()
    const id = window.setInterval(count, 1500)
    return () => window.clearInterval(id)
  }, [editorRef, linkedKey])

  const extract = () => {
    const editor = editorRef.current
    if (!editor) return
    const linked = new Set(list.map((x) => x.doc_block_id).filter(Boolean))
    const items = collectChecklist(editor.document).filter((i) => !linked.has(i.id))
    if (items.length === 0) {
      toast(t('noChecklist'))
      return
    }
    const base = Date.now() / 1000
    create.mutate(
      items.map((i, n) => ({
        workspace_id: workspace.id,
        title: i.text.slice(0, 500),
        doc_id: doc.id,
        doc_block_id: i.id,
        meeting_id: doc.meeting_id,
        assignee_id: user.id,
        status: 'todo' as const,
        position: base + n,
      })),
      { onSuccess: (rows) => toast.success(t('tasksCreated', { count: rows.length })) },
    )
  }

  if (!editable && list.length === 0) return null

  return (
    <RailSection
      title={
        <span className="flex items-center gap-2">
          {t('linkedTasks')}
          {list.length ? <span className="tabular-nums text-fg-subtle">{done}/{list.length}</span> : null}
        </span>
      }
    >
      {list.length ? (
        <ul className="-mx-2 flex flex-col">
          {list.map((task) => (
            <li key={task.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover">
              <button
                type="button"
                disabled={!editable}
                onClick={() => update.mutate({ id: task.id, patch: { status: task.status === 'done' ? 'todo' : 'done' } })}
                aria-label={t('toggleTask')}
                className="shrink-0"
              >
                <StatusIcon status={task.status} />
              </button>
              <button
                type="button"
                onClick={() => open(task.id)}
                className={cn('min-w-0 flex-1 truncate text-left text-sm', task.status === 'done' ? 'text-fg-subtle line-through' : 'text-fg')}
              >
                {task.title}
              </button>
              {task.due_date ? <DueDate due={task.due_date} done={task.status === 'done'} withIcon={false} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {editable ? (
        <>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) {
                create.mutate({
                  workspace_id: workspace.id,
                  title: draft.trim().slice(0, 500),
                  doc_id: doc.id,
                  meeting_id: doc.meeting_id,
                  assignee_id: user.id,
                  status: 'todo',
                  position: Date.now() / 1000,
                })
                setDraft('')
              }
            }}
            placeholder={t('rail.addTask')}
            className="h-8 rounded-md border border-dashed border-line-strong bg-transparent px-2.5 text-sm outline-none placeholder:text-fg-subtle focus:border-accent focus:border-solid"
          />
          {pending ? (
            <Button variant="secondary" size="sm" onClick={extract} loading={create.isPending} className="justify-start">
              <ListChecks />
              {t('extractCount', { count: pending })}
            </Button>
          ) : null}
          <p className="text-xs leading-relaxed text-fg-subtle">{t('rail.extractHint')}</p>
        </>
      ) : null}
    </RailSection>
  )
}
