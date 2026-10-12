'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleUser,
  Link as LinkIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Tag,
  Timer,
  Trash2,
  Video,
  MessageCircle,
} from 'lucide-react'
import { useApp, useMemberMap, useWorkspaceMap, canEdit } from '@/components/app/app-context'
import { statusPatch, taskStatusOf, workspaceStatuses, type StatusOption } from '@/lib/statuses'
import { useStatusName } from '@/lib/use-status-name'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { taskKeys, useCreateTask, useDeleteTaskWithUndo, useSubtasks, useTask, useTasks, useUpdateTask } from '@/lib/queries/tasks'
import { useAddComment, useDeleteComment, useTaskComments } from '@/lib/queries/comments'
import { useAttachments } from '@/lib/queries/attachments'
import { useWorkspaceMembers } from '@/lib/queries/workspace-members'
import { createClient } from '@/lib/supabase/client'
import { isTypingTarget } from '@/lib/hooks'
import { TASK_BACK_KEY, taskPath, taskRefKey, useOpenTask } from '@/lib/use-open-task'
import { useDateLocale } from '@/lib/dates'
import { cn, taskRef } from '@/lib/utils'
import { assigneesOf, assigneesPatch } from '@/lib/assignees'
import type { TaskRow } from '@/lib/database.types'
import type { WorkspaceWithRole } from '@/lib/types'
import { AssigneesMenu, DuePopover, LabelChip, LabelsPopover, PriorityMenu, StatusMenu } from './pickers'
import { PriorityIcon, StatusIcon } from './status-icon'
import { DueDate } from './due-date'
import type { EditorChange } from '@/components/docs/block-editor'
import { ShareToChatDialog } from '@/components/chat/share-to-chat'
import { AttachmentsSection } from '@/components/attachments/attachments'
import { AddFieldPopover, CustomFieldRows } from './custom-fields'
import { DocMark, WorkspaceMark } from '@/components/app/marks'
import { useConfirm } from '@/components/ui/confirm'

const BlockEditor = dynamic(() => import('@/components/docs/block-editor').then((m) => m.BlockEditor), {
  ssr: false,
  loading: () => <Skeleton className="h-20" />,
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Página de una tarea (/tasks/TV-3, o /tasks/<id> que se corrige sola). */
export function TaskPage({ param }: { param: string }) {
  const t = useTranslations('tasks')
  const router = useRouter()
  const qc = useQueryClient()
  const wsMap = useWorkspaceMap()
  const isId = UUID.test(param)

  // "TV-3" → espacio con clave TV (también los que se ven por jerarquía) y número 3
  const byRef = useMemo(() => {
    if (isId) return null
    const m = /^([A-Za-z0-9]+)-(\d+)$/.exec(decodeURIComponent(param))
    if (!m) return null
    const ws = [...wsMap.values()].find((w) => w.key.toUpperCase() === m[1].toUpperCase())
    return ws ? { ws, number: Number(m[2]) } : null
  }, [isId, param, wsMap])

  const resolved = useQuery({
    queryKey: byRef ? taskRefKey(byRef.ws.id, byRef.number) : ['task-ref', 'none'],
    enabled: Boolean(byRef),
    queryFn: async () => {
      const { data, error } = await createClient().from('tasks').select('*').eq('workspace_id', byRef!.ws.id).eq('number', byRef!.number).maybeSingle()
      if (error) throw error
      if (data) qc.setQueryData(taskKeys.one(data.id), data)
      return (data as TaskRow | null)?.id ?? null
    },
  })
  const id = isId ? param : (resolved.data ?? null)
  const { data: task, isLoading, isError } = useTask(id)
  const ws = task ? wsMap.get(task.workspace_id) : undefined

  // llegó por id: dejar la URL legible sin agregar otra entrada al historial (con la referencia ya resuelta)
  useEffect(() => {
    if (!isId || !task || !ws) return
    qc.setQueryData(taskRefKey(ws.id, task.number), task.id)
    // conserva ?tab= y lo demás
    router.replace(`${taskPath(ws.key, task.number)}${window.location.search}`, { scroll: false })
  }, [isId, task, ws, router, qc])

  const notFound = (!isId && !byRef) || (!isId && resolved.isSuccess && !resolved.data) || resolved.isError || isError
  if (notFound) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-start gap-3 px-6 py-16">
        <p className="text-sm text-fg-muted">{t('notFound')}</p>
        <Button size="sm" onClick={() => router.push('/tasks')}>
          {t('goToMyTasks')}
        </Button>
      </div>
    )
  }
  if (isLoading || !task || !ws) {
    return (
      <div className="flex flex-col">
        <div className="h-12 border-b border-line" />
        <div className="mx-auto flex w-full max-w-[780px] flex-col gap-4 px-6 py-10">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-6 h-28 w-full" />
        </div>
      </div>
    )
  }
  return <TaskView key={task.id} task={task} ws={ws} />
}

type Draft = Pick<
  TaskRow,
  'title' | 'status' | 'status_id' | 'priority' | 'assignee_ids' | 'due_date' | 'start_date' | 'estimate_hours' | 'labels' | 'custom' | 'description' | 'description_text'
>
const DRAFT_KEYS = ['title', 'status', 'status_id', 'priority', 'assignee_ids', 'due_date', 'start_date', 'estimate_hours', 'labels', 'custom'] as const
const toDraft = (t: TaskRow): Draft => ({
  title: t.title,
  status: t.status,
  status_id: t.status_id,
  priority: t.priority,
  assignee_ids: assigneesOf(t),
  due_date: t.due_date,
  start_date: t.start_date,
  estimate_hours: t.estimate_hours,
  labels: t.labels,
  custom: t.custom,
  description: t.description,
  description_text: t.description_text,
})

const TABS = ['subtasks', 'comments', 'attachments'] as const
type Tab = (typeof TABS)[number]

/**
 * La tarea se lee tranquila y se edita a propósito: "Editar" convierte todo en formulario y los
 * cambios se aplican juntos con "Guardar" (o se descartan con "Cancelar"). La descripción se ve
 * siempre; las propiedades van juntas en un panel a la derecha; subtareas, comentarios y adjuntos
 * van en pestañas y se agregan sin entrar al modo edición.
 */
function TaskView({ task, ws }: { task: TaskRow; ws: WorkspaceWithRole }) {
  const t = useTranslations('tasks')
  const tNav = useTranslations('nav')
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const editable = canEdit(ws)
  const update = useUpdateTask()
  const removeWithUndo = useDeleteTaskWithUndo()
  const { data: parent } = useTask(task.parent_id)
  const { data: subtasks } = useSubtasks(task.id)
  const { data: comments } = useTaskComments(task.id)
  const { data: attachments } = useAttachments({ kind: 'task', taskId: task.id })
  const ref = taskRef(ws.key, task.number)
  const listHref = `/w/${ws.slug}/tasks`

  const [draft, setDraft] = useState<Draft | null>(null)
  const [sharing, setSharing] = useState(false)
  const [descTouched, setDescTouched] = useState(false)
  // cambia al cancelar para que el editor vuelva al texto guardado
  const [editorRev, setEditorRev] = useState(0)
  const editing = draft !== null
  const view: TaskRow = editing ? { ...task, ...draft } : task
  const dirty = editing && (descTouched || DRAFT_KEYS.some((k) => JSON.stringify(draft[k]) !== JSON.stringify(task[k])))
  const canSave = editing && dirty && draft.title.trim().length > 0

  // ?tab=detail de antes cae en la primera pestaña
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'subtasks'
  // la pestaña vive en la URL, pero cambiarla no necesita ir al servidor
  const setTab = (next: Tab) => {
    const q = new URLSearchParams(window.location.search)
    if (next === 'subtasks') q.delete('tab')
    else q.set('tab', next)
    window.history.replaceState(null, '', q.toString() ? `${pathname}?${q}` : pathname)
  }

  const edit = useCallback(() => {
    setDraft(toDraft(task))
    setDescTouched(false)
  }, [task])

  const confirm = useConfirm()
  const tConfirm = useTranslations('confirm')
  const cancel = useCallback(async () => {
    if (dirty && !(await confirm({ title: t('discardConfirm'), danger: true, confirmLabel: tConfirm('discard') }))) return
    setDraft(null)
    setDescTouched(false)
    setEditorRev((r) => r + 1)
  }, [dirty, t, confirm, tConfirm])

  const save = useCallback(() => {
    if (!draft || !canSave) return
    const patch: Partial<Draft> = {}
    for (const k of DRAFT_KEYS) if (JSON.stringify(draft[k]) !== JSON.stringify(task[k])) Object.assign(patch, { [k]: draft[k] })
    if (descTouched) Object.assign(patch, { description: draft.description, description_text: draft.description_text })
    if (patch.title) patch.title = patch.title.trim().slice(0, 500)
    if (patch.assignee_ids) Object.assign(patch, assigneesPatch(patch.assignee_ids))
    update.mutate({ id: task.id, patch }, { onSuccess: () => toast.success(t('saved')) })
    setDraft(null)
    setDescTouched(false)
    setEditorRev((r) => r + 1)
  }, [draft, canSave, descTouched, task, update, t])

  const set = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d))

  // Volver: a donde estabas si llegaste desde la app; si entraste por un enlace, a las tareas del espacio
  const back = useCallback(async () => {
    if (dirty && !(await confirm({ title: t('discardConfirm'), danger: true, confirmLabel: tConfirm('discard') }))) return
    let fromApp = false
    try {
      fromApp = sessionStorage.getItem(TASK_BACK_KEY) === task.id
    } catch {
      // sin sessionStorage
    }
    if (fromApp && window.history.length > 1) router.back()
    else router.push(listHref)
  }, [dirty, router, listHref, t, confirm, tConfirm, task.id])

  // E edita · ⌘↵ guarda · Esc sale de la edición sin cambios (o vuelve si no estás editando)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        save()
        return
      }
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector('[data-open][role="menu"], [role="dialog"][data-open], [data-popup-open]')) return
      if (e.key === 'Escape') {
        // con cambios sin guardar, Esc no descarta nada (se cancela con el botón): evita perder trabajo al cerrar un menú
        if (editing) {
          if (!dirty) cancel()
        } else back()
      } else if (e.key.toLowerCase() === 'e' && !editing && editable) {
        e.preventDefault()
        edit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, dirty, editable, save, cancel, back, edit])

  // no perder cambios al cerrar o recargar la pestaña
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const statuses = workspaceStatuses(ws)
  const isDone = task.status === 'done'
  const toggleDone = () => {
    const target = statuses.find((o) => o.category === (isDone ? 'todo' : 'done'))
    if (target) update.mutate({ id: task.id, patch: statusPatch(target) })
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}${taskPath(ws.key, task.number)}`)
    toast.success(t('linkCopied'))
  }

  const counts: Record<Tab, number | null> = {
    subtasks: subtasks?.length ?? 0,
    comments: comments?.length ?? 0,
    attachments: attachments?.length ?? 0,
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-canvas/95 px-3 backdrop-blur-sm sm:px-4">
        <Tooltip content={t('back')} shortcut={['Esc']}>
          <Button variant="ghost" size="icon-sm" onClick={back} aria-label={t('back')}>
            <ArrowLeft />
          </Button>
        </Tooltip>
        <nav className="flex min-w-0 items-center gap-1 text-sm text-fg-muted" aria-label={t('breadcrumb')}>
          <Link href={`/w/${ws.slug}`} className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-hover hover:text-fg">
            <WorkspaceMark ws={ws} size={16} />
            <span className="max-w-40 truncate">{ws.name}</span>
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-fg-subtle" />
          <Link href={listHref} className="hidden rounded-md px-1.5 py-1 hover:bg-hover hover:text-fg sm:block">
            {tNav('tasks')}
          </Link>
          <ChevronRight className="hidden size-3.5 shrink-0 text-fg-subtle sm:block" />
          {parent ? (
            <>
              <Link href={taskPath(ws.key, parent.number)} className="rounded-md px-1.5 py-1 font-mono text-xs hover:bg-hover hover:text-fg">
                {taskRef(ws.key, parent.number)}
              </Link>
              <ChevronRight className="size-3.5 shrink-0 text-fg-subtle" />
            </>
          ) : null}
          <span className="px-1.5 font-mono text-xs text-fg">{ref}</span>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {editing ? (
            <>
              <span className="mr-1 hidden items-center gap-1.5 text-xs font-medium text-accent-ink sm:flex">
                <span className="size-1.5 rounded-full bg-accent" />
                {dirty ? t('unsaved') : t('editing')}
              </span>
              <Button variant="ghost" size="sm" onClick={cancel}>
                {t('cancel')}
              </Button>
              <Tooltip content={t('save')} shortcut={['⌘', '↵']}>
                <Button variant="primary" size="sm" onClick={save} disabled={!canSave}>
                  <Check />
                  {t('save')}
                </Button>
              </Tooltip>
            </>
          ) : (
            <>
              {editable ? (
                <>
                  <Button variant="secondary" size="sm" onClick={toggleDone} className="hidden sm:inline-flex">
                    {isDone ? <RotateCcw /> : <CircleCheck />}
                    {isDone ? t('reopen') : t('markDone')}
                  </Button>
                  <Tooltip content={t('edit')} shortcut={['E']}>
                    <Button variant="primary" size="sm" onClick={edit}>
                      <Pencil />
                      {t('edit')}
                    </Button>
                  </Tooltip>
                </>
              ) : (
                <span className="rounded-full bg-hover px-2.5 py-1 text-xs text-fg-muted">{t('readOnly')}</span>
              )}
              <Tooltip content={t('shareInPasillo')}>
                <Button variant="ghost" size="icon-sm" onClick={() => setSharing(true)} aria-label={t('shareInPasillo')}>
                  <MessageCircle />
                </Button>
              </Tooltip>
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
                        router.push(listHref)
                      }}
                    >
                      <Trash2 />
                      {t('delete')}
                    </MenuItem>
                  </MenuContent>
                </Menu>
              ) : null}
            </>
          )}
        </div>
      </header>

      {/* Columna principal (qué es, la descripción y lo que cuelga de la tarea) y, a la derecha, todas las
          propiedades juntas. En pantallas chicas las propiedades quedan entre el título y la descripción. */}
      <div className="mx-auto grid w-full max-w-[1200px] flex-1 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_1fr]">
        <section className="px-5 pt-8 sm:px-10 lg:col-start-1 lg:row-start-1 lg:pr-12">
          <p className="flex min-w-0 items-center gap-2 text-xs text-fg-subtle">
            <span className="font-mono">{ref}</span>
            {parent ? (
              <>
                <span aria-hidden>·</span>
                <Link href={taskPath(ws.key, parent.number)} className="truncate hover:text-fg">
                  {t('subtaskOf', { title: parent.title })}
                </Link>
              </>
            ) : null}
          </p>
          {editing ? (
            <AutoTextarea
              autoFocus
              value={draft.title}
              onChange={(e) => set({ title: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && !e.metaKey && !e.ctrlKey && e.preventDefault()}
              placeholder={t('titlePlaceholder')}
              aria-label={t('title')}
              className={cn(fieldClass, 'mt-2 px-3 py-2 text-[24px] font-semibold leading-tight tracking-[-0.02em]')}
            />
          ) : (
            <h1 className="mt-1.5 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-fg">{task.title}</h1>
          )}
        </section>

        <aside className="mt-6 border-y border-line bg-sidebar/40 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:border-y-0 lg:border-l lg:bg-transparent">
          <div className="px-5 py-5 sm:px-10 lg:sticky lg:top-12 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:px-6 lg:py-8 lg:scrollbar-thin">
            <h2 className="mb-3 text-2xs font-medium uppercase tracking-wide text-fg-subtle">{t('properties')}</h2>
            <dl className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 text-sm">
              <dt className="text-fg-muted">{t('statusLabel')}</dt>
              <dd className="min-w-0">
                <StatusValue task={view} ws={ws} editing={editing} onChange={(o) => set(statusPatch(o))} />
              </dd>
              <dt className="text-fg-muted">{t('priorityLabel')}</dt>
              <dd className="min-w-0">
                <PriorityValue value={view.priority} editing={editing} onChange={(priority) => set({ priority })} />
              </dd>
              <dt className="text-fg-muted">{t('assignees')}</dt>
              <dd className="min-w-0">
                <AssigneeValue task={view} editing={editing} onChange={(assignee_ids) => set({ assignee_ids })} />
              </dd>
              <dt className="text-fg-muted">{t('dueLabel')}</dt>
              <dd className="min-w-0">
                <DateValue value={view.due_date} done={view.status === 'done'} editing={editing} onChange={(due_date) => set({ due_date })} />
              </dd>
              <dt className="text-fg-muted">{t('startLabel')}</dt>
              <dd className="min-w-0">
                <DateValue value={view.start_date} editing={editing} onChange={(start_date) => set({ start_date })} start />
              </dd>
              <dt className="text-fg-muted">{t('estimateLabel')}</dt>
              <dd className="min-w-0">
                {editing ? (
                  <EstimateInput value={view.estimate_hours} onChange={(estimate_hours) => set({ estimate_hours })} />
                ) : (
                  <ReadValue>
                    {view.estimate_hours != null ? (
                      <>
                        <Timer className="size-3.5 text-fg-subtle" />
                        {view.estimate_hours} {t('hoursShort')}
                      </>
                    ) : (
                      <Empty />
                    )}
                  </ReadValue>
                )}
              </dd>
              <dt className="self-start pt-2 text-fg-muted">{t('labels')}</dt>
              <dd className="min-w-0">
                <LabelsValue task={view} editing={editing} onChange={(labels) => set({ labels })} />
              </dd>
              <CustomFieldRows task={view} ws={ws} editable={editing} onChange={(custom) => set({ custom })} />
              {editing && ws.my_role === 'admin' ? (
                <>
                  <dt />
                  <dd>
                    <AddFieldPopover ws={ws} />
                  </dd>
                </>
              ) : null}
              {task.doc_id || task.meeting_id ? (
                <>
                  <dt className="self-start pt-1.5 text-fg-muted">{t('origin')}</dt>
                  <dd className="min-w-0">
                    <Origin task={task} slug={ws.slug} />
                  </dd>
                </>
              ) : null}
            </dl>
            <div className="mt-5 border-t border-line pt-4">
              <CreatedBy task={task} />
            </div>
          </div>
        </aside>

        <div className="px-5 pb-20 sm:px-10 lg:col-start-1 lg:row-start-2 lg:pr-12">
          <section className="mt-8">
            <SectionTitle>{t('description')}</SectionTitle>
            {editing ? (
              <div className={cn(fieldClass, 'min-h-32 py-2')}>
                <BlockEditor
                  key={`${task.id}-edit-${editorRev}`}
                  workspaceId={task.workspace_id}
                  initialContent={task.description}
                  editable
                  onChange={(c: EditorChange) => {
                    setDescTouched(true)
                    set({ description: c.content, description_text: c.text })
                  }}
                  placeholder={t('descriptionPlaceholder')}
                  compact
                />
              </div>
            ) : task.description_text?.trim() ? (
              <div className="-ml-[30px]">
                <BlockEditor key={`${task.id}-read-${editorRev}-${task.updated_at}-${task.description_text?.length}`} workspaceId={task.workspace_id} initialContent={task.description} editable={false} compact />
              </div>
            ) : editable ? (
              <button
                type="button"
                onClick={edit}
                className="flex w-full items-center rounded-lg border border-dashed border-line px-3 py-3 text-left text-sm text-fg-subtle transition-colors hover:border-line-strong hover:text-fg-muted"
              >
                {t('descriptionPlaceholder')}
              </button>
            ) : (
              <p className="text-sm text-fg-subtle">{t('noDescription')}</p>
            )}
          </section>

          {/* lo que cuelga de la tarea: se agrega sin entrar al modo edición */}
          <div role="tablist" aria-label={t('sections')} className="mt-10 flex gap-1 overflow-x-auto border-b border-line scrollbar-none">
            {TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  '-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 rounded-t-md border-b-2 px-3 text-sm outline-none transition-colors focus-visible:bg-hover focus-visible:text-fg',
                  tab === id ? 'border-accent font-medium text-fg' : 'border-transparent text-fg-muted hover:text-fg',
                )}
              >
                {t(`tabs.${id}`)}
                {counts[id] ? <span className="rounded-full bg-hover px-1.5 text-2xs tabular-nums text-fg-muted">{counts[id]}</span> : null}
              </button>
            ))}
          </div>

          <div role="tabpanel" className="pt-5">
            {tab === 'subtasks' ? (
              <Subtasks task={task} ws={ws} editable={editable} />
            ) : tab === 'comments' ? (
              <Comments task={task} />
            ) : (
              <AttachmentsSection
                scope={{ kind: 'task', taskId: task.id }}
                parent={{ workspaceId: task.workspace_id, taskId: task.id, meetingId: task.meeting_id }}
                editable={editable}
                hideTitle
              />
            )}
          </div>
        </div>
      </div>
      <ShareToChatDialog open={sharing} onOpenChange={setSharing} item={{ kind: 'task', refId: task.id, title: `${ref} ${task.title}` }} />
    </div>
  )
}

/** Campo en modo edición: borde visible, para que se note que se puede cambiar. */
const fieldClass = 'w-full rounded-lg border border-line bg-panel text-fg outline-none transition-colors hover:border-line-strong focus-within:border-accent focus:border-accent'
const pickerField = 'h-9 w-full justify-start rounded-lg border border-line bg-panel px-2.5 text-sm hover:border-line-strong hover:bg-panel data-[popup-open]:border-accent data-[popup-open]:bg-panel'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold text-fg">{children}</h2>
}

function Empty() {
  return <span className="text-fg-subtle">—</span>
}

/** Lo que se ve en lectura: el valor tal cual, sin bordes ni flechas. */
function ReadValue({ children }: { children: React.ReactNode }) {
  return <span className="flex h-9 min-w-0 items-center gap-1.5 text-sm text-fg [&>svg]:shrink-0">{children}</span>
}

function StatusValue({ task, ws, editing, onChange }: { task: TaskRow; ws: WorkspaceWithRole; editing: boolean; onChange: (o: StatusOption) => void }) {
  const statusName = useStatusName()
  const value = taskStatusOf(task, ws)
  const content = (
    <>
      <StatusIcon status={task.status} />
      <span className="truncate">{statusName(value)}</span>
    </>
  )
  if (!editing) return <ReadValue>{content}</ReadValue>
  return (
    <StatusMenu options={workspaceStatuses(ws)} value={value} onChange={onChange} className={pickerField}>
      {content}
      <ChevronDown className="ml-auto size-3.5 text-fg-subtle" />
    </StatusMenu>
  )
}

function PriorityValue({ value, editing, onChange }: { value: TaskRow['priority']; editing: boolean; onChange: (p: TaskRow['priority']) => void }) {
  const tPriority = useTranslations('tasks.priority')
  const content = (
    <>
      <PriorityIcon priority={value} />
      <span className={cn('truncate', value === 'none' && 'text-fg-subtle')}>{tPriority(value)}</span>
    </>
  )
  if (!editing) return <ReadValue>{content}</ReadValue>
  return (
    <PriorityMenu value={value} onChange={onChange} className={pickerField}>
      {content}
      <ChevronDown className="ml-auto size-3.5 text-fg-subtle" />
    </PriorityMenu>
  )
}

function AssigneeValue({ task, editing, onChange }: { task: TaskRow; editing: boolean; onChange: (ids: string[]) => void }) {
  const t = useTranslations('tasks')
  const memberMap = useMemberMap()
  const members = useWorkspaceMembers(task.workspace_id)
  const people = assigneesOf(task).flatMap((id) => memberMap.get(id) ?? [])
  const content = people.length ? (
    <>
      <AvatarStack people={people} size={20} ring={editing ? 'panel' : 'canvas'} />
      <span className="truncate" title={people.map((p) => p.full_name).join(', ')}>
        {people.length === 1 ? people[0].full_name : people.map((p) => p.full_name.split(' ')[0]).join(', ')}
      </span>
    </>
  ) : (
    <>
      <CircleUser className="size-4 text-fg-subtle" />
      <span className="truncate text-fg-subtle">{t('unassigned')}</span>
    </>
  )
  if (!editing) return <ReadValue>{content}</ReadValue>
  return (
    <AssigneesMenu value={assigneesOf(task)} members={members} onChange={onChange} className={pickerField}>
      {content}
      <ChevronDown className="ml-auto size-3.5 text-fg-subtle" />
    </AssigneesMenu>
  )
}

function DateValue({ value, done, editing, onChange, start }: { value: string | null; done?: boolean; editing: boolean; onChange: (d: string | null) => void; start?: boolean }) {
  const t = useTranslations('tasks')
  const content = value ? (
    start ? (
      <span className="inline-flex items-center gap-1.5">
        <CalendarClock className="size-3.5 text-fg-subtle" />
        <DueDate due={value} withIcon={false} className="text-sm text-fg" />
      </span>
    ) : (
      <DueDate due={value} done={done} className="text-sm" />
    )
  ) : editing ? (
    <span className="text-fg-subtle">{t('noDate')}</span>
  ) : (
    <Empty />
  )
  if (!editing) return <ReadValue>{content}</ReadValue>
  return (
    <DuePopover value={value} onChange={onChange} className={cn(pickerField, start && 'max-w-56')} aria-label={start ? t('startLabel') : t('dueLabel')}>
      {content}
      <ChevronDown className="ml-auto size-3.5 text-fg-subtle" />
    </DuePopover>
  )
}

function LabelsValue({ task, editing, onChange }: { task: TaskRow; editing: boolean; onChange: (labels: string[]) => void }) {
  const t = useTranslations('tasks')
  const { data: wsTasks } = useTasks(editing ? { kind: 'workspace', workspaceId: task.workspace_id } : null)
  const suggestions = [...new Set((wsTasks ?? []).flatMap((x) => x.labels))]
  if (!editing) {
    return (
      <span className="flex min-h-9 flex-wrap items-center gap-1">
        {task.labels.length ? task.labels.map((l) => <LabelChip key={l} label={l} />) : <Empty />}
      </span>
    )
  }
  return (
    <LabelsPopover value={task.labels} suggestions={suggestions} onChange={onChange} className={cn(pickerField, 'h-auto min-h-9 flex-wrap py-1')}>
      {task.labels.length ? (
        task.labels.map((l) => <LabelChip key={l} label={l} />)
      ) : (
        <>
          <Tag className="size-3.5 text-fg-subtle" />
          <span className="text-fg-subtle">{t('addLabels')}</span>
        </>
      )}
    </LabelsPopover>
  )
}

function CreatedBy({ task }: { task: TaskRow }) {
  const t = useTranslations('tasks')
  const locale = useDateLocale()
  const memberMap = useMemberMap()
  const creator = task.created_by ? memberMap.get(task.created_by) : undefined
  return (
    <p className="text-xs text-fg-subtle">
      {t('createdBy', {
        who: creator?.full_name ?? t('someone'),
        when: formatDistanceToNowStrict(new Date(task.created_at), { addSuffix: true, locale }),
      })}
    </p>
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
    <div className="flex flex-col items-start gap-1">
      {data?.meeting ? (
        <Link href={`/m/${data.meeting.id}`} className="-ml-2 inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm text-fg hover:bg-hover">
          <Video className="size-3.5 shrink-0 text-accent-mid" />
          <span className="truncate">{data.meeting.title || t('meeting')}</span>
          <ArrowUpRight className="size-3.5 shrink-0 text-fg-subtle" />
        </Link>
      ) : null}
      {data?.doc ? (
        <Link href={`/w/${slug}/docs/${data.doc.id}`} className="-ml-2 inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm text-fg hover:bg-hover">
          <DocMark source={data.doc.source} />
          <span className="truncate">{data.doc.title || t('untitledDoc')}</span>
          <ArrowUpRight className="size-3.5 shrink-0 text-fg-subtle" />
        </Link>
      ) : null}
    </div>
  )
}

function Subtasks({ task, ws, editable }: { task: TaskRow; ws: WorkspaceWithRole; editable: boolean }) {
  const t = useTranslations('tasks')
  const { open } = useOpenTask()
  const { data: subtasks } = useSubtasks(task.id)
  const create = useCreateTask()
  const update = useUpdateTask()
  const [draft, setDraft] = useState('')
  const list = subtasks ?? []
  const done = list.filter((s) => s.status === 'done').length

  return (
    <section>
      {list.length ? (
        <p className="mb-3 text-xs text-fg-muted">{t('subtasksDone', { done, total: list.length })}</p>
      ) : (
        <p className="mb-3 text-sm text-fg-subtle">{t('noSubtasks')}</p>
      )}
      <div className="flex flex-col overflow-hidden rounded-lg border border-line">
        {list.map((s) => (
          <div key={s.id} className="flex h-11 items-center gap-2.5 border-b border-line-soft px-3 last:border-0 hover:bg-hover/50">
            <button
              type="button"
              onClick={() => update.mutate({ id: s.id, patch: { status: s.status === 'done' ? 'todo' : 'done' } })}
              disabled={!editable}
              aria-label={t('toggleDone')}
            >
              <StatusIcon status={s.status} />
            </button>
            <span className="w-14 shrink-0 font-mono text-2xs text-fg-subtle">{taskRef(ws.key, s.number)}</span>
            <button type="button" onClick={() => open(s.id)} className={cn('min-w-0 flex-1 truncate text-left text-sm', s.status === 'done' && 'text-fg-muted line-through')}>
              {s.title}
            </button>
            {s.due_date ? <DueDate due={s.due_date} done={s.status === 'done'} withIcon={false} /> : null}
          </div>
        ))}
        {editable ? (
          <label className="flex h-11 items-center gap-2.5 px-3 text-fg-subtle focus-within:text-fg">
            <Plus className="size-4 shrink-0" />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') (e.target as HTMLInputElement).blur()
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
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
            />
          </label>
        ) : null}
      </div>
    </section>
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
  const confirm = useConfirm()
  const tConfirm = useTranslations('confirm')
  const [body, setBody] = useState('')

  const submit = () => {
    const v = body.trim()
    if (!v) return
    add.mutate(v, { onSuccess: () => setBody('') })
  }

  return (
    <section>
      <div className="flex items-end gap-3">
        <Avatar name={profile.full_name} src={profile.avatar_url} seed={profile.id} size={28} className="mb-2" />
        <div className="flex min-w-0 flex-1 items-end gap-1 rounded-xl border border-line bg-panel px-3 py-2 focus-within:border-accent">
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
            className="max-h-48 bg-transparent py-1 text-sm outline-none placeholder:text-fg-subtle"
          />
          <Button variant="ghost" size="icon-xs" onClick={submit} disabled={!body.trim()} loading={add.isPending} aria-label={t('send')}>
            {add.isPending ? null : <Send />}
          </Button>
        </div>
      </div>
      {comments?.length ? (
        <div className="mt-6 flex flex-col gap-5">
          {[...comments].reverse().map((c) => {
            const who = memberMap.get(c.user_id)
            return (
              <div key={c.id} className="group/comment flex gap-3">
                <Avatar name={who?.full_name} src={who?.avatar_url} seed={c.user_id} size={28} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">{who?.full_name ?? t('someone')}</span>
                    <span className="text-xs text-fg-subtle">{formatDistanceToNowStrict(new Date(c.created_at), { addSuffix: true, locale })}</span>
                    {c.user_id === user.id ? (
                      <button
                        type="button"
                        onClick={async () => {
                          if (await confirm({ title: t('deleteCommentConfirm'), danger: true, confirmLabel: tConfirm('delete') })) del.mutate(c.id)
                        }}
                        className="ml-auto text-xs text-fg-subtle opacity-0 hover:text-danger group-hover/comment:opacity-100 focus-visible:opacity-100"
                      >
                        {t('deleteComment')}
                      </button>
                    ) : null}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">{c.body}</p>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="mt-6 text-sm text-fg-subtle">{t('noComments')}</p>
      )}
    </section>
  )
}

function EstimateInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const t = useTranslations('tasks')
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  const commit = (raw: string) => {
    const n = raw.trim() === '' ? null : Number(raw.replace(',', '.'))
    if (n !== null && (Number.isNaN(n) || n < 0)) return
    if (n !== value) onChange(n)
  }
  return (
    <label className={cn(fieldClass, 'inline-flex h-9 w-36 items-center gap-1.5 px-2.5 text-sm')}>
      <Timer className="size-3.5 shrink-0 text-fg-subtle" />
      <input
        value={draft}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9.,]/g, '')
          setDraft(v)
          commit(v)
        }}
        inputMode="decimal"
        placeholder={t('estimatePlaceholder')}
        className="min-w-0 flex-1 bg-transparent tabular-nums outline-none placeholder:text-fg-subtle"
        aria-label={t('estimateLabel')}
      />
      <span className="text-fg-subtle">{t('hoursShort')}</span>
    </label>
  )
}
