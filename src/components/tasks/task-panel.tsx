'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'
import { ArrowUpRight, CircleUser, Link as LinkIcon, MoreHorizontal, Plus, Send, Tag, Trash2, Video, X } from 'lucide-react'
import { useApp, useMemberMap, useWorkspaceMap, canEdit } from '@/components/app/app-context'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { useCreateTask, useDeleteTaskWithUndo, useSubtasks, useTask, useTasks, useUpdateTask } from '@/lib/queries/tasks'
import { useAddComment, useDeleteComment, useTaskComments } from '@/lib/queries/comments'
import { useWorkspaceMembers } from '@/lib/queries/workspace-members'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { isTypingTarget, useTaskPanel } from '@/lib/hooks'
import { useDateLocale } from '@/lib/dates'
import { cn, taskRef } from '@/lib/utils'
import type { TaskRow } from '@/lib/database.types'
import { AssigneeMenu, DuePopover, LabelChip, LabelsPopover, PriorityMenu, StatusMenu } from './pickers'
import { PriorityIcon, StatusIcon } from './status-icon'
import { DueDate } from './due-date'
import type { EditorChange } from '@/components/docs/block-editor'
import { AttachmentsSection } from '@/components/attachments/attachments'
import { AddFieldPopover, CustomFieldRows } from './custom-fields'
import { CalendarClock, Timer } from 'lucide-react'
import { DocMark, WorkspaceMark } from '@/components/app/marks'

const BlockEditor = dynamic(() => import('@/components/docs/block-editor').then((m) => m.BlockEditor), {
  ssr: false,
  loading: () => <Skeleton className="mx-[30px] h-16" />,
})

export function TaskPanelHost() {
  const { openId, close } = useTaskPanel()

  useEffect(() => {
    if (!openId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isTypingTarget(e.target) && !document.querySelector('[data-open][role="menu"], [role="dialog"][data-open]')) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, close])

  if (!openId) return null
  return (
    <aside className="fixed inset-0 z-30 flex flex-col bg-panel md:static md:z-auto md:w-[460px] md:shrink-0 md:border-l md:border-line md:shadow-panel lg:w-[520px]">
      <TaskPanel key={openId} id={openId} onClose={close} />
    </aside>
  )
}

function TaskPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations('tasks')
  const { data: task, isLoading, isError } = useTask(id)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }
  if (isError || !task) {
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p className="text-sm text-fg-muted">{t('notFound')}</p>
        <Button size="sm" onClick={onClose}>
          {t('close')}
        </Button>
      </div>
    )
  }
  return <TaskDetail task={task} onClose={onClose} />
}

function TaskDetail({ task, onClose }: { task: TaskRow; onClose: () => void }) {
  const t = useTranslations('tasks')
  const tStatus = useTranslations('tasks.status')
  const tPriority = useTranslations('tasks.priority')
  const locale = useDateLocale()
  const wsMap = useWorkspaceMap()
  const memberMap = useMemberMap()
  const ws = wsMap.get(task.workspace_id)
  const editable = canEdit(ws)
  const members = useWorkspaceMembers(task.workspace_id)
  const update = useUpdateTask()
  const removeWithUndo = useDeleteTaskWithUndo()
  const [title, setTitle] = useState(task.title)
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { data: wsTasks } = useTasks({ kind: 'workspace', workspaceId: task.workspace_id })
  const labelSuggestions = [...new Set((wsTasks ?? []).flatMap((x) => x.labels))]

  const patch = useCallback(
    (p: Parameters<typeof update.mutate>[0]['patch']) => update.mutate({ id: task.id, patch: p }),
    [task.id, update],
  )

  const saveTitle = (value: string) => {
    setTitle(value)
    if (titleTimer.current) clearTimeout(titleTimer.current)
    titleTimer.current = setTimeout(() => {
      const v = value.trim()
      if (v && v !== task.title) patch({ title: v.slice(0, 500) })
    }, 600)
  }

  const onDescription = useCallback(
    (c: EditorChange) => {
      if (descTimer.current) clearTimeout(descTimer.current)
      descTimer.current = setTimeout(() => patch({ description: c.content, description_text: c.text }), 900)
    },
    [patch],
  )

  useEffect(
    () => () => {
      if (titleTimer.current) clearTimeout(titleTimer.current)
      if (descTimer.current) clearTimeout(descTimer.current)
    },
    [],
  )

  const assignee = task.assignee_id ? memberMap.get(task.assignee_id) : undefined
  const creator = task.created_by ? memberMap.get(task.created_by) : undefined
  const ref = ws ? taskRef(ws.key, task.number) : ''

  const copyLink = async () => {
    const url = `${window.location.origin}/w/${ws?.slug}/tasks?task=${task.id}`
    await navigator.clipboard.writeText(url)
    toast.success(t('linkCopied'))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        {ws ? (
          <Link href={`/w/${ws.slug}/tasks`} className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-sm text-fg-muted hover:bg-hover hover:text-fg">
            <WorkspaceMark ws={ws} size={16} />
            <span className="max-w-32 truncate">{ws.name}</span>
          </Link>
        ) : null}
        <span className="font-mono text-xs text-fg-subtle">{ref}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip content={t('copyLink')}>
            <Button variant="ghost" size="icon-sm" onClick={copyLink} aria-label={t('copyLink')}>
              <LinkIcon />
            </Button>
          </Tooltip>
          {editable ? (
            <Menu>
              <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t('more')} />}>
                <MoreHorizontal />
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem
                  danger
                  onClick={() => {
                    removeWithUndo(task, ref)
                    onClose()
                  }}
                >
                  <Trash2 />
                  {t('delete')}
                </MenuItem>
              </MenuContent>
            </Menu>
          ) : null}
          <Tooltip content={t('close')} shortcut={['Esc']}>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('close')}>
              <X />
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="px-6 pb-2 pt-5">
          <AutoTextarea
            value={title}
            onChange={(e) => saveTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
            readOnly={!editable}
            className="bg-transparent text-xl font-semibold leading-snug tracking-tight text-fg outline-none"
            aria-label={t('title')}
          />
        </div>

        <dl className="grid grid-cols-[128px_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 px-6 py-2 text-sm">
          <dt className="text-fg-muted">{t('statusLabel')}</dt>
          <dd>
            <StatusMenu value={task.status} onChange={(status) => patch({ status })} disabled={!editable} className="h-7 px-2">
              <StatusIcon status={task.status} />
              {tStatus(task.status)}
            </StatusMenu>
          </dd>

          <dt className="text-fg-muted">{t('priorityLabel')}</dt>
          <dd>
            <PriorityMenu value={task.priority} onChange={(priority) => patch({ priority })} disabled={!editable} className="h-7 px-2">
              <PriorityIcon priority={task.priority} />
              <span className={cn(task.priority === 'none' && 'text-fg-subtle')}>{tPriority(task.priority)}</span>
            </PriorityMenu>
          </dd>

          <dt className="text-fg-muted">{t('assignee')}</dt>
          <dd>
            <AssigneeMenu value={task.assignee_id} members={members} onChange={(assignee_id) => patch({ assignee_id })} disabled={!editable} className="h-7 px-2">
              {assignee ? (
                <>
                  <Avatar name={assignee.full_name} src={assignee.avatar_url} seed={assignee.id} size={18} />
                  {assignee.full_name}
                </>
              ) : (
                <>
                  <CircleUser className="size-4 text-fg-subtle" />
                  <span className="text-fg-subtle">{t('unassigned')}</span>
                </>
              )}
            </AssigneeMenu>
          </dd>

          <dt className="text-fg-muted">{t('dueLabel')}</dt>
          <dd>
            <DuePopover value={task.due_date} onChange={(due_date) => patch({ due_date })} disabled={!editable} className="h-7 px-2">
              {task.due_date ? <DueDate due={task.due_date} done={task.status === 'done'} className="text-sm" /> : <span className="text-fg-subtle">{t('noDate')}</span>}
            </DuePopover>
          </dd>

          <dt className="text-fg-muted">{t('startLabel')}</dt>
          <dd>
            <DuePopover value={task.start_date} onChange={(start_date) => patch({ start_date })} disabled={!editable} className="h-7 px-2" aria-label={t('startLabel')}>
              {task.start_date ? (
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <CalendarClock className="size-3.5 text-fg-subtle" />
                  <DueDate due={task.start_date} withIcon={false} className="text-sm text-fg" />
                </span>
              ) : (
                <span className="text-fg-subtle">{t('noDate')}</span>
              )}
            </DuePopover>
          </dd>

          <dt className="text-fg-muted">{t('estimateLabel')}</dt>
          <dd>
            <EstimateInput value={task.estimate_hours} editable={editable} onChange={(estimate_hours) => patch({ estimate_hours })} />
          </dd>

          <dt className="text-fg-muted">{t('labels')}</dt>
          <dd>
            <LabelsPopover value={task.labels} suggestions={labelSuggestions} onChange={(labels) => patch({ labels })} disabled={!editable} className="min-h-7 flex-wrap px-2 py-1">
              {task.labels.length ? (
                task.labels.map((l) => <LabelChip key={l} label={l} />)
              ) : (
                <>
                  <Tag className="size-3.5 text-fg-subtle" />
                  <span className="text-fg-subtle">{t('addLabels')}</span>
                </>
              )}
            </LabelsPopover>
          </dd>

          {ws ? <CustomFieldRows task={task} ws={ws} editable={editable} onChange={(custom) => patch({ custom })} /> : null}
          {ws && ws.my_role === 'admin' ? (
            <>
              <dt />
              <dd>
                <AddFieldPopover ws={ws} />
              </dd>
            </>
          ) : null}

          {task.doc_id || task.meeting_id ? (
            <>
              <dt className="text-fg-muted">{t('origin')}</dt>
              <dd className="py-1">
                <Origin task={task} slug={ws?.slug ?? ''} />
              </dd>
            </>
          ) : null}
        </dl>

        <div className="mt-2 border-t border-line pt-4">
          <p className="px-6 pb-1 text-xs font-medium text-fg-subtle">{t('description')}</p>
          <BlockEditor
            key={task.id}
            workspaceId={task.workspace_id}
            initialContent={task.description}
            editable={editable}
            onChange={onDescription}
            placeholder={t('descriptionPlaceholder')}
            compact
          />
        </div>

        <div className="mt-4 border-t border-line px-6 pt-4">
          <AttachmentsSection
            scope={{ kind: 'task', taskId: task.id }}
            parent={{ workspaceId: task.workspace_id, taskId: task.id, meetingId: task.meeting_id }}
            editable={editable}
          />
        </div>

        <Subtasks task={task} editable={editable} />
        <Comments task={task} />

        <p className="px-6 pb-8 pt-2 text-xs text-fg-subtle">
          {t('createdBy', {
            who: creator?.full_name ?? t('someone'),
            when: formatDistanceToNowStrict(new Date(task.created_at), { addSuffix: true, locale }),
          })}
        </p>
      </div>
    </div>
  )
}

function Origin({ task, slug }: { task: TaskRow; slug: string }) {
  const t = useTranslations('tasks')
  const { data } = useQuery({
    queryKey: ['task-origin', task.doc_id, task.meeting_id],
    queryFn: async () => {
      const supabase = createClient()
      const [doc, meeting] = await Promise.all([
        task.doc_id ? supabase.from('docs').select('id, title, source').eq('id', task.doc_id).maybeSingle() : Promise.resolve({ data: null }),
        task.meeting_id ? supabase.from('meetings').select('id, title').eq('id', task.meeting_id).maybeSingle() : Promise.resolve({ data: null }),
      ])
      return { doc: doc.data, meeting: meeting.data }
    },
  })
  return (
    <div className="flex flex-col gap-1">
      {data?.meeting ? (
        <span className="inline-flex items-center gap-1.5 px-2 text-sm text-fg">
          <Video className="size-3.5 text-accent-mid" />
          <span className="truncate">{data.meeting.title || t('meeting')}</span>
        </span>
      ) : null}
      {data?.doc ? (
        <Link href={`/w/${slug}/docs/${data.doc.id}`} className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-sm text-fg hover:bg-hover">
          <DocMark source={data.doc.source} />
          <span className="truncate underline decoration-line-strong underline-offset-4">{data.doc.title || t('untitledDoc')}</span>
          <ArrowUpRight className="size-3.5 text-fg-subtle" />
        </Link>
      ) : null}
    </div>
  )
}

function Subtasks({ task, editable }: { task: TaskRow; editable: boolean }) {
  const t = useTranslations('tasks')
  const { open } = useTaskPanel()
  const { data: subtasks } = useSubtasks(task.id)
  const create = useCreateTask()
  const update = useUpdateTask()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const list = subtasks ?? []
  const done = list.filter((s) => s.status === 'done').length

  if (!editable && list.length === 0) return null

  return (
    <div className="mt-4 border-t border-line px-6 pt-4">
      <div className="flex items-center gap-2 pb-1">
        <p className="text-xs font-medium text-fg-subtle">{t('subtasks')}</p>
        {list.length ? <span className="text-xs tabular-nums text-fg-subtle">{done}/{list.length}</span> : null}
        {editable ? (
          <Button variant="ghost" size="icon-xs" className="ml-auto" onClick={() => setAdding(true)} aria-label={t('addSubtask')}>
            <Plus />
          </Button>
        ) : null}
      </div>
      <div className="-mx-2 flex flex-col">
        {list.map((s) => (
          <div key={s.id} className="group/sub flex h-8 items-center gap-2 rounded-md px-2 hover:bg-hover">
            <button
              type="button"
              onClick={() => update.mutate({ id: s.id, patch: { status: s.status === 'done' ? 'todo' : 'done' } })}
              disabled={!editable}
              aria-label={t('toggleDone')}
            >
              <StatusIcon status={s.status} />
            </button>
            <button type="button" onClick={() => open(s.id)} className={cn('min-w-0 flex-1 truncate text-left text-sm', s.status === 'done' && 'text-fg-muted line-through')}>
              {s.title}
            </button>
            {s.due_date ? <DueDate due={s.due_date} done={s.status === 'done'} withIcon={false} /> : null}
          </div>
        ))}
        {adding ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => !draft.trim() && setAdding(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setAdding(false)
              if (e.key === 'Enter' && draft.trim()) {
                create.mutate({
                  workspace_id: task.workspace_id,
                  parent_id: task.id,
                  title: draft.trim(),
                  status: 'todo',
                  position: (list.at(-1)?.position ?? 0) + 1000,
                })
                setDraft('')
              }
            }}
            placeholder={t('subtaskPlaceholder')}
            className="mx-2 h-8 rounded-md bg-transparent text-sm outline-none placeholder:text-fg-subtle"
          />
        ) : null}
      </div>
    </div>
  )
}

function Comments({ task }: { task: TaskRow }) {
  const t = useTranslations('tasks')
  const locale = useDateLocale()
  const { user, profile } = useApp()
  const memberMap = useMemberMap()
  const { data: comments } = useTaskComments(task.id)
  const add = useAddComment(task.id)
  const del = useDeleteComment(task.id)
  const [body, setBody] = useState('')

  const submit = () => {
    const v = body.trim()
    if (!v) return
    add.mutate(v, { onSuccess: () => setBody('') })
  }

  return (
    <div className="mt-4 border-t border-line px-6 pt-4">
      <p className="pb-2 text-xs font-medium text-fg-subtle">{t('comments')}</p>
      <div className="flex flex-col gap-4">
        {(comments ?? []).map((c) => {
          const who = memberMap.get(c.user_id)
          return (
            <div key={c.id} className="group/comment flex gap-2.5">
              <Avatar name={who?.full_name} src={who?.avatar_url} seed={c.user_id} size={22} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium">{who?.full_name ?? t('someone')}</span>
                  <span className="text-xs text-fg-subtle">{formatDistanceToNowStrict(new Date(c.created_at), { addSuffix: true, locale })}</span>
                  {c.user_id === user.id ? (
                    <button
                      type="button"
                      onClick={() => del.mutate(c.id)}
                      className="ml-auto text-xs text-fg-subtle opacity-0 hover:text-danger group-hover/comment:opacity-100 focus-visible:opacity-100"
                    >
                      {t('deleteComment')}
                    </button>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-fg">{c.body}</p>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex items-end gap-2.5">
        <Avatar name={profile.full_name} src={profile.avatar_url} seed={profile.id} size={22} className="mb-1.5" />
        <div className="flex min-w-0 flex-1 items-end gap-1 rounded-lg border border-line bg-canvas px-3 py-1.5 focus-within:border-accent-mid">
          <AutoTextarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={t('commentPlaceholder')}
            className="max-h-40 bg-transparent py-1 text-sm outline-none placeholder:text-fg-subtle"
          />
          <Button variant="ghost" size="icon-xs" onClick={submit} disabled={!body.trim()} loading={add.isPending} aria-label={t('send')}>
            {add.isPending ? null : <Send />}
          </Button>
        </div>
      </div>
    </div>
  )
}

function EstimateInput({ value, editable, onChange }: { value: number | null; editable: boolean; onChange: (v: number | null) => void }) {
  const t = useTranslations('tasks')
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  useEffect(() => setDraft(value == null ? '' : String(value)), [value])
  return (
    <label className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-sm hover:bg-hover focus-within:bg-panel focus-within:ring-1 focus-within:ring-accent">
      <Timer className="size-3.5 shrink-0 text-fg-subtle" />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9.,]/g, ''))}
        onBlur={() => {
          const n = draft.trim() === '' ? null : Number(draft.replace(',', '.'))
          if (n !== null && (Number.isNaN(n) || n < 0)) return setDraft(value == null ? '' : String(value))
          if (n !== value) onChange(n)
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        readOnly={!editable}
        inputMode="decimal"
        placeholder={t('estimatePlaceholder')}
        className="w-14 bg-transparent tabular-nums outline-none placeholder:text-fg-subtle"
        aria-label={t('estimateLabel')}
      />
      {draft ? <span className="text-fg-subtle">{t('hoursShort')}</span> : null}
    </label>
  )
}
