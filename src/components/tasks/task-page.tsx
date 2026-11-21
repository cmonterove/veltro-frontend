'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'
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
  Repeat,
  RotateCcw,
  Send,
  Tag,
  Timer,
  Trash2,
  Video,
  MessageCircle,
  MessagesSquare,
  LayoutTemplate,
} from 'lucide-react'
import { useApp, useMemberMap, useWorkspaceMap, canEdit } from '@/components/app/app-context'
import { statusPatch, taskStatusOf, workspaceStatuses, type StatusOption } from '@/lib/statuses'
import { useStatusName } from '@/lib/use-status-name'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { MentionTextarea, mentionIds, type MentionCandidate } from '@/components/mentions/mention-textarea'
import { RichText } from '@/components/mentions/rich-text'
import { EventText, useTaskActivity, type TaskEvent } from './task-activity'
import { LogoMark } from '@/components/app/logo'
import { CARD } from '@/components/ui/surface'
import { FollowButton } from './follow-button'
import { TaskDependencies } from './task-dependencies'
import { SaveTaskTemplateDialog } from './task-templates'
import { Menu, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { fetchTaskByRef, useCreateTask, useDeleteTaskWithUndo, useSubtasks, useTask, useTaskOrigin, useUpdateTask, useWorkspaceLabels } from '@/lib/queries/tasks'
import { useAddComment, useDeleteComment, useTaskComments } from '@/lib/queries/comments'
import { useAttachments } from '@/lib/queries/attachments'
import { ApiError } from '@/lib/api/client'
import { useWorkspaceMembers } from '@/lib/queries/workspace-members'
import { isTypingTarget } from '@/lib/hooks'
import { TASK_BACK_KEY, taskPath, taskRefKey, useOpenTask } from '@/lib/use-open-task'
import { toDateKey, useDateLocale } from '@/lib/dates'
import { nextAfterDone, RECURRENCE_PRESETS, recurrenceKey, sameRule } from '@/lib/recurrence'
import { cn, taskRef } from '@/lib/utils'
import { assigneesOf, assigneesPatch } from '@/lib/assignees'
import type { TaskRecurrence, TaskRow } from '@/lib/database.types'
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
import { useCopy } from '@/lib/clipboard'

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
  const { account } = useApp()
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
    // la referencia no cambia de tarea: si ya se conoce, no se vuelve a preguntar (la tarea la pide useTask)
    staleTime: 5 * 60_000,
    queryFn: async () => {
      try {
        return (await fetchTaskByRef(qc, `${byRef!.ws.key}-${byRef!.number}`, account.id)).id
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null
        throw e
      }
    },
  })
  const id = isId ? param : (resolved.data ?? null)
  // en una lista no viene la descripción: la página espera la tarea completa
  const { data: task, isLoading, isError, isPlaceholderData } = useTask(id)
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
  if (isLoading || isPlaceholderData || !task || !ws) {
    // la misma forma que la página: barra arriba, la tarea a la izquierda y la conversación a la derecha
    return (
      <div className="flex min-h-full flex-col lg:h-full lg:min-h-0">
        <div className="flex h-14 shrink-0 items-center gap-3 px-3 sm:px-5">
          <Skeleton className="size-7 rounded-lg" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-4 px-3 pb-4 sm:px-5 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(21rem,25rem)]">
          <div className={cn(CARD, 'flex flex-col gap-4 px-8 py-7')}>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="mt-2 h-36 w-full rounded-2xl" />
            <Skeleton className="mt-4 h-20 w-full" />
          </div>
          <div className={cn(CARD, 'hidden flex-col justify-end gap-3 p-5 lg:flex')}>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-10 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }
  return <TaskView key={task.id} task={task} ws={ws} />
}

type Draft = Pick<
  TaskRow,
  'title' | 'status' | 'status_id' | 'priority' | 'assignee_ids' | 'due_date' | 'start_date' | 'estimate_hours' | 'labels' | 'custom' | 'recurrence' | 'description' | 'description_text'
>
const DRAFT_KEYS = ['title', 'status', 'status_id', 'priority', 'assignee_ids', 'due_date', 'start_date', 'estimate_hours', 'labels', 'custom', 'recurrence'] as const
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
  recurrence: t.recurrence,
  description: t.description,
  description_text: t.description_text,
})

/**
 * La tarea se lee tranquila y se edita a propósito: "Editar" convierte todo en formulario y los
 * cambios se aplican juntos con "Guardar" (o se descartan con "Cancelar").
 *
 * Dos tarjetas, sin pestañas. A la izquierda la tarea misma: qué es, sus propiedades en una grilla de
 * dos columnas y, debajo, la descripción, de qué depende, sus subtareas (con su avance) y adjuntos.
 * A la derecha la conversación: comentarios y cambios en una sola línea de tiempo, con el campo para
 * comentar siempre a mano. Subtareas, comentarios y adjuntos se agregan sin entrar al modo edición.
 */
function TaskView({ task, ws }: { task: TaskRow; ws: WorkspaceWithRole }) {
  const copy = useCopy()
  const t = useTranslations('tasks')
  const tNav = useTranslations('nav')
  const router = useRouter()
  const params = useSearchParams()
  const editable = canEdit(ws)
  const update = useUpdateTask()
  const removeWithUndo = useDeleteTaskWithUndo()
  const { data: parent } = useTask(task.parent_id)
  const { data: attachments } = useAttachments({ kind: 'task', taskId: task.id })
  const ref = taskRef(ws.key, task.number)
  const listHref = `/w/${ws.slug}/tasks`

  const [draft, setDraft] = useState<Draft | null>(null)
  const [sharing, setSharing] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [descTouched, setDescTouched] = useState(false)
  // cambia al cancelar para que el editor vuelva al texto guardado
  const [editorRev, setEditorRev] = useState(0)
  const editing = draft !== null
  const view: TaskRow = editing ? { ...task, ...draft } : task
  const dirty = editing && (descTouched || DRAFT_KEYS.some((k) => JSON.stringify(draft[k]) !== JSON.stringify(task[k])))
  const canSave = editing && dirty && draft.title.trim().length > 0
  // los enlaces de los avisos de comentarios (?tab=comments) dejan listo el campo para responder
  const replying = params.get('tab') === 'comments'

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

  const copyLink = () => copy(`${window.location.origin}${taskPath(ws.key, task.number)}`, t('linkCopied'))

  return (
    // en pantallas grandes cabe en la ventana: cada tarjeta se desplaza por dentro
    <div className="flex min-h-full flex-col lg:h-full lg:min-h-0">
      {/* volver, dónde está y lo que se hace con ella: sobre el fondo, sin raya */}
      <header className="flex h-14 shrink-0 items-center gap-1.5 px-3 sm:px-5">
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
          <span className="whitespace-nowrap px-1.5 font-mono text-xs text-fg">{ref}</span>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
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
                  {/* lo que más se hace con una tarea es terminarla: va primero y en relieve */}
                  <Button variant={isDone ? 'secondary' : 'primary'} size="sm" onClick={toggleDone}>
                    {isDone ? <RotateCcw /> : <CircleCheck />}
                    {isDone ? t('reopen') : t('markDone')}
                  </Button>
                  <Tooltip content={t('edit')} shortcut={['E']}>
                    <Button variant="secondary" size="sm" onClick={edit}>
                      <Pencil />
                      <span className="hidden sm:inline">{t('edit')}</span>
                    </Button>
                  </Tooltip>
                </>
              ) : (
                <span className="rounded-full bg-hover px-2.5 py-1 text-xs text-fg-muted">{t('readOnly')}</span>
              )}
              {/* en el celular quedan volver, terminar, editar y «más»: lo demás desde sm */}
              <span className="hidden items-center gap-1.5 sm:flex">
                <FollowButton taskId={task.id} />
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
              </span>
              <Menu>
                {/* sin permiso de edición, en pantallas medianas y grandes no queda nada adentro */}
                <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t('more')} className={cn(!editable && 'sm:hidden')} />}>
                  <MoreHorizontal />
                </MenuTrigger>
                <MenuContent align="end" className="w-56">
                  {/* en el celular, lo que no entra en la barra */}
                  <MenuItem onClick={() => setSharing(true)} className="sm:hidden">
                    <MessageCircle />
                    {t('shareInPasillo')}
                  </MenuItem>
                  <MenuItem onClick={copyLink} className="sm:hidden">
                    <LinkIcon />
                    {t('copyLink')}
                  </MenuItem>
                  {editable ? (
                    <>
                      <MenuItem onClick={() => setSavingTemplate(true)}>
                        <LayoutTemplate />
                        {t('saveAsTemplate')}
                      </MenuItem>
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
                    </>
                  ) : null}
                </MenuContent>
              </Menu>
            </>
          )}
        </div>
      </header>

      {/* una columna que nunca pasa del ancho de la pantalla; en grandes, la conversación al lado */}
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-4 px-3 pb-4 sm:px-5 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(21rem,25rem)]">
        {/* la tarea misma */}
        <article className={cn(CARD, 'flex min-w-0 flex-col transition-shadow lg:min-h-0 lg:overflow-hidden', editing && 'ring-2 ring-accent/35')}>
          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:scrollbar-thin">
            <div className="mx-auto w-full max-w-[56rem] px-5 pb-12 pt-6 sm:px-8">
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
                {editing ? (
                  <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink">
                    <span className="size-1.5 rounded-full bg-accent" />
                    {dirty ? t('unsaved') : t('editing')}
                  </span>
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
                <h1 className={cn('mt-1.5 text-[26px] font-semibold leading-tight tracking-[-0.02em]', isDone ? 'text-fg-muted line-through decoration-fg-subtle/40' : 'text-fg')}>{task.title}</h1>
              )}

              {/* las propiedades juntas, en dos columnas: se leen de un vistazo y no se pierde una columna entera */}
              <dl className="mt-5 grid gap-x-8 rounded-2xl bg-canvas/55 px-4 py-2 text-[13px] ring-1 ring-inset ring-line-soft sm:grid-cols-2">
                <Prop label={t('statusLabel')}>
                  <StatusValue task={view} ws={ws} editing={editing} onChange={(o) => set(statusPatch(o))} />
                </Prop>
                <Prop label={t('priorityLabel')}>
                  <PriorityValue value={view.priority} editing={editing} onChange={(priority) => set({ priority })} />
                </Prop>
                <Prop label={t('assignees')}>
                  <AssigneeValue task={view} editing={editing} onChange={(assignee_ids) => set({ assignee_ids })} />
                </Prop>
                <Prop label={t('dueLabel')}>
                  <DateValue value={view.due_date} done={view.status === 'done'} editing={editing} onChange={(due_date) => set({ due_date })} />
                </Prop>
                <Prop label={t('startLabel')}>
                  <DateValue value={view.start_date} editing={editing} onChange={(start_date) => set({ start_date })} start />
                </Prop>
                <Prop label={t('recurrence.label')}>
                  <RecurrenceValue
                    task={view}
                    editing={editing}
                    onChange={(recurrence) =>
                      // repetir sin fecha: vence hoy (la API hace lo mismo)
                      set(recurrence && !view.due_date ? { recurrence, due_date: toDateKey(new Date()) } : { recurrence })
                    }
                  />
                </Prop>
                <Prop label={t('estimateLabel')}>
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
                </Prop>
                <Prop label={t('labels')} top>
                  <LabelsValue task={view} editing={editing} onChange={(labels) => set({ labels })} />
                </Prop>
                <CustomFieldRows task={view} ws={ws} editable={editing} onChange={(custom) => set({ custom })} rowClassName={PROP_ROW} />
                {editing && ws.my_role === 'admin' ? (
                  <div className={PROP_ROW}>
                    <dt />
                    <dd>
                      <AddFieldPopover ws={ws} />
                    </dd>
                  </div>
                ) : null}
                {task.doc_id || task.meeting_id ? (
                  <Prop label={t('origin')} top>
                    <Origin task={task} slug={ws.slug} />
                  </Prop>
                ) : null}
              </dl>
              <div className="mt-2 px-1">
                <CreatedBy task={task} />
              </div>

              <Block title={t('description')}>
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
                    className="flex w-full items-center gap-2 rounded-xl border border-dashed border-line-strong/80 px-3.5 py-3.5 text-left text-sm text-fg-subtle transition-colors hover:border-accent-mid/60 hover:bg-accent-soft/30 hover:text-fg-muted"
                  >
                    <Pencil className="size-3.5 shrink-0" />
                    {t('descriptionPlaceholder')}
                  </button>
                ) : (
                  <p className="text-sm text-fg-subtle">{t('noDescription')}</p>
                )}
              </Block>

              {/* bloqueada por / bloquea a: se agrega sin entrar al modo edición */}
              <TaskDependencies task={task} editable={editable} />

              <Subtasks task={task} ws={ws} editable={editable} />

              <Block title={t('tabs.attachments')} aside={attachments?.length ? <Count n={attachments.length} /> : null}>
                <AttachmentsSection
                  scope={{ kind: 'task', taskId: task.id }}
                  parent={{ workspaceId: task.workspace_id, taskId: task.id, meetingId: task.meeting_id }}
                  editable={editable}
                  hideTitle
                />
              </Block>
            </div>
          </div>
        </article>

        {/* lo que se habla y lo que pasó con ella */}
        <Conversation task={task} ws={ws} replying={replying} />
      </div>
      <ShareToChatDialog open={sharing} onOpenChange={setSharing} item={{ kind: 'task', refId: task.id, title: `${ref} ${task.title}` }} />
      {editable ? <SaveTaskTemplateDialog task={task} open={savingTemplate} onOpenChange={setSavingTemplate} /> : null}
    </div>
  )
}

/** Una fila de la grilla de propiedades: el nombre a la izquierda y el valor (o su selector, editando). */
const PROP_ROW = 'grid min-w-0 grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 py-0.5'

function Prop({ label, top, children }: { label: string; top?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn(PROP_ROW, top && 'items-start')}>
      <dt className={cn('truncate text-fg-muted', top && 'pt-2')}>{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

/** Un bloque de la tarea (descripción, subtareas, adjuntos): título chico y lo suyo debajo. */
function Block({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <div className="mb-3 flex min-h-6 items-center gap-3">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {aside ? <div className="ml-auto flex items-center gap-2">{aside}</div> : null}
      </div>
      {children}
    </section>
  )
}

function Count({ n }: { n: number }) {
  return <span className="rounded-full bg-fg/[0.06] px-1.5 text-[11px] font-semibold tabular-nums text-fg-muted">{n}</span>
}

/** Campo en modo edición: borde visible, para que se note que se puede cambiar. */
const fieldClass = 'w-full rounded-lg border border-line bg-panel text-fg outline-none transition-colors hover:border-line-strong focus-within:border-accent focus:border-accent'
const pickerField = 'h-9 w-full justify-start rounded-lg border border-line bg-panel px-2.5 text-sm hover:border-line-strong hover:bg-panel data-[popup-open]:border-accent data-[popup-open]:bg-panel'

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
  // solo al editar: en lectura alcanza con las personas de la cuenta (y un espacio observado no deja ver su gente)
  const members = useWorkspaceMembers(editing ? task.workspace_id : null)
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

/** Repetir: al terminarla nace la siguiente. En lectura dice cada cuánto y cuándo toca la próxima. */
function RecurrenceValue({ task, editing, onChange }: { task: TaskRow; editing: boolean; onChange: (r: TaskRecurrence | null) => void }) {
  const t = useTranslations('tasks.recurrence')
  const locale = useDateLocale()
  const rule = task.recurrence
  const label = rule ? (() => {
    const k = recurrenceKey(rule)
    return t(`rules.${k.key}`, { count: k.count ?? 1 })
  })() : null
  const next = rule ? nextAfterDone(task.due_date, rule) : null
  const content = rule ? (
    <>
      <Repeat className="size-3.5 text-accent-mid" />
      <span className="truncate">{label}</span>
    </>
  ) : editing ? (
    <>
      <Repeat className="size-3.5 text-fg-subtle" />
      <span className="text-fg-subtle">{t('never')}</span>
    </>
  ) : (
    <Empty />
  )
  if (!editing) {
    if (!rule || !next) return <ReadValue>{content}</ReadValue>
    // la próxima fecha va abajo: en la columna angosta no entra al lado
    return (
      <span className="flex min-h-9 flex-col justify-center py-1 text-sm text-fg">
        <span className="flex min-w-0 items-center gap-1.5 [&>svg]:shrink-0">{content}</span>
        <span className="truncate pl-5 text-xs text-fg-subtle">{t('next', { date: format(parseISO(next), 'EEE d MMM', { locale }) })}</span>
      </span>
    )
  }
  return (
    <Menu>
      <MenuTrigger className={cn(pickerField, 'inline-flex items-center gap-1.5 outline-none')}>
        {content}
        <ChevronDown className="ml-auto size-3.5 text-fg-subtle" />
      </MenuTrigger>
      <MenuContent align="start" className="w-60">
        <MenuRadioGroup
          value={rule ? (RECURRENCE_PRESETS.find((p) => sameRule(p.rule, rule))?.key ?? 'custom') : 'never'}
          onValueChange={(v) => onChange(v === 'never' ? null : (RECURRENCE_PRESETS.find((p) => p.key === v)?.rule ?? rule))}
        >
          <MenuRadioItem value="never" closeOnClick>
            {t('never')}
          </MenuRadioItem>
          {RECURRENCE_PRESETS.map((p) => (
            <MenuRadioItem key={p.key} value={p.key} closeOnClick>
              {t(`rules.${p.key}`, { count: p.rule.interval ?? 1 })}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        <p className="px-2 pb-1.5 pt-2 text-2xs leading-snug text-fg-subtle">{t('hint')}</p>
      </MenuContent>
    </Menu>
  )
}

function LabelsValue({ task, editing, onChange }: { task: TaskRow; editing: boolean; onChange: (labels: string[]) => void }) {
  const t = useTranslations('tasks')
  const { data: suggestions = [] } = useWorkspaceLabels(editing ? task.workspace_id : null)
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
  // viene en el detalle de la tarea (ya en caché al abrir la página)
  const { data } = useTaskOrigin(task.id)
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
  // un solo nivel de subtareas (la API no deja colgar subtareas de una subtarea)
  const canAdd = editable && !task.parent_id
  if (!list.length && !canAdd) return null

  return (
    <Block
      title={t('tabs.subtasks')}
      aside={
        list.length ? (
          // el avance, a la vista: cuántas van y una barra
          <span className="flex items-center gap-2.5 text-xs tabular-nums text-fg-muted">
            {t('subtasksDone', { done, total: list.length })}
            <span className="relative h-1.5 w-24 overflow-hidden rounded-full bg-fg/[0.08]" aria-hidden>
              <span className="absolute inset-y-0 left-0 rounded-full bg-done transition-[width] duration-300 ease-out" style={{ width: `${(done / list.length) * 100}%` }} />
            </span>
          </span>
        ) : null
      }
    >
      {list.length ? null : <p className="-mt-1 mb-2.5 text-xs text-fg-subtle">{t('noSubtasks')}</p>}
      <div className="flex flex-col overflow-hidden rounded-xl ring-1 ring-inset ring-line-soft">
        {list.map((s) => (
          <div key={s.id} className="flex h-11 items-center gap-2.5 border-b border-line-soft px-3 last:border-0 hover:bg-canvas">
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
        {canAdd ? (
          <label className="flex h-11 items-center gap-2.5 px-3 text-fg-subtle focus-within:bg-canvas/60 focus-within:text-fg">
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
    </Block>
  )
}

type Entry = { kind: 'comment'; at: string; id: string; c: NonNullable<ReturnType<typeof useTaskComments>['data']>[number] } | { kind: 'event'; at: string; id: string; e: TaskEvent }

/**
 * La conversación de la tarea: comentarios y cambios (quién hizo qué) en una sola línea de tiempo, del
 * más viejo arriba al más nuevo abajo, como un chat. Los comentarios van en burbujas; los cambios, en
 * líneas chicas. El campo para comentar queda fijo abajo (con @ se le avisa a alguien).
 */
function Conversation({ task, ws, replying }: { task: TaskRow; ws: WorkspaceWithRole; replying?: boolean }) {
  const t = useTranslations('tasks')
  const locale = useDateLocale()
  const { user, profile } = useApp()
  const memberMap = useMemberMap()
  const { data: comments } = useTaskComments(task.id)
  const { data: events, isLoading } = useTaskActivity(task.id)
  const add = useAddComment(task.id)
  const del = useDeleteComment(task.id)
  const confirm = useConfirm()
  const tConfirm = useTranslations('confirm')
  const [body, setBody] = useState('')
  const [picked, setPicked] = useState<MentionCandidate[]>([])
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  // se menciona a quien tiene acceso al espacio de la tarea (cada mención le llega como aviso)
  const people = useWorkspaceMembers(task.workspace_id)
  const candidates = useMemo<MentionCandidate[]>(
    () => people.filter((p) => p.id !== user.id).map((p) => ({ id: p.id, name: p.full_name, avatarUrl: p.avatar_url, sub: p.title ?? undefined })),
    [people, user.id],
  )

  const entries = useMemo<Entry[]>(
    () =>
      [
        ...(comments ?? []).map((c) => ({ kind: 'comment' as const, at: c.created_at, id: `c-${c.id}`, c })),
        ...(events ?? []).map((e) => ({ kind: 'event' as const, at: e.createdAt, id: `e-${e.id}`, e })),
      ].sort((a, b) => a.at.localeCompare(b.at)),
    [comments, events],
  )
  const commentCount = comments?.length ?? 0

  // baja sola al final: al abrir y con cada comentario o cambio nuevo
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries.length])

  useEffect(() => {
    if (replying) input.current?.focus()
  }, [replying])

  const submit = () => {
    const v = body.trim()
    if (!v) return
    add.mutate(
      { body: v, mentions: mentionIds(v, picked) },
      {
        onSuccess: () => {
          setBody('')
          setPicked([])
        },
      },
    )
  }

  return (
    <aside className={cn(CARD, 'flex min-w-0 flex-col lg:min-h-0 lg:overflow-hidden')} aria-label={t('conversation')}>
      <header className="flex shrink-0 items-center gap-2 border-b border-line-soft px-5 py-3.5">
        <MessagesSquare className="size-4 text-fg-subtle" />
        <h2 className="text-sm font-semibold text-fg">{t('conversation')}</h2>
        {commentCount ? <Count n={commentCount} /> : null}
      </header>

      <div ref={scroller} className="px-5 py-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:scrollbar-thin">
        {/* pegado abajo, junto al campo para comentar (con poco, lo de arriba queda libre) */}
        <div className="flex min-h-full flex-col justify-end">
          {!commentCount ? (
            <p className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-fg-subtle">
              <MessagesSquare className="mt-0.5 size-3.5 shrink-0" />
              {t('conversationHint')}
            </p>
          ) : null}
          {isLoading && !entries.length ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-5 w-2/3" />
              ))}
            </div>
          ) : (
            <ol className="relative flex flex-col">
              {/* la línea que une todo lo que pasó */}
              <span aria-hidden className="absolute bottom-3 left-[13px] top-3 w-px bg-line-soft" />
              {entries.map((it) => {
                if (it.kind === 'event') {
                  const e = it.e
                  return (
                    <li key={it.id} className="relative flex gap-3 py-1.5 pl-1">
                      <span className="relative z-[1] mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-panel ring-4 ring-panel">
                        {e.actor ? (
                          <Avatar name={e.actor.fullName} src={e.actor.avatarUrl} seed={e.actor.id} size={20} />
                        ) : (
                          <span className="flex size-5 items-center justify-center rounded-full bg-highlight">
                            <LogoMark className="size-3" />
                          </span>
                        )}
                      </span>
                      <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-fg-muted">
                        <EventText e={e} ws={ws} />
                        <Tooltip content={format(parseISO(e.createdAt), 'd MMM yyyy, HH:mm', { locale })}>
                          <span className="ml-1.5 whitespace-nowrap text-[11.5px] text-fg-subtle">
                            {formatDistanceToNowStrict(parseISO(e.createdAt), { addSuffix: true, locale })}
                          </span>
                        </Tooltip>
                      </p>
                    </li>
                  )
                }
                const c = it.c
                const who = memberMap.get(c.user_id)
                const mine = c.user_id === user.id
                return (
                  <li key={it.id} className="group/comment relative flex gap-3 py-2.5">
                    <Avatar name={who?.full_name} src={who?.avatar_url} seed={c.user_id} size={28} className="relative z-[1] ring-4 ring-panel" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-[13px] font-medium text-fg">{who?.full_name ?? t('someone')}</span>
                        <Tooltip content={format(new Date(c.created_at), 'd MMM yyyy, HH:mm', { locale })}>
                          <span className="shrink-0 text-[11.5px] text-fg-subtle">{formatDistanceToNowStrict(new Date(c.created_at), { addSuffix: true, locale })}</span>
                        </Tooltip>
                        {mine ? (
                          <button
                            type="button"
                            onClick={async () => {
                              if (await confirm({ title: t('deleteCommentConfirm'), danger: true, confirmLabel: tConfirm('delete') })) del.mutate(c.id)
                            }}
                            className="ml-auto text-xs text-fg-subtle opacity-0 hover:text-danger focus-visible:opacity-100 group-hover/comment:opacity-100"
                          >
                            {t('deleteComment')}
                          </button>
                        ) : null}
                      </div>
                      <div
                        className={cn(
                          'mt-1 whitespace-pre-wrap break-words rounded-2xl rounded-tl-md px-3.5 py-2.5 text-[13.5px] leading-relaxed text-fg ring-1 ring-inset',
                          mine ? 'bg-accent-soft/45 ring-accent-mid/15' : 'bg-canvas ring-line-soft',
                        )}
                      >
                        <RichText
                          text={c.body}
                          me={user.id}
                          mentions={c.mentions.flatMap((id) => {
                            const p = memberMap.get(id)
                            return p ? [{ id, name: p.full_name }] : []
                          })}
                        />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </div>

      {/* comentar: siempre a mano, abajo */}
      <footer className="shrink-0 border-t border-line-soft p-3">
        <div className="flex items-end gap-2.5">
          <Avatar name={profile.full_name} src={profile.avatar_url} seed={profile.id} size={28} className="mb-1" />
          <div className="flex min-w-0 flex-1 items-end gap-1 rounded-2xl bg-canvas px-3 py-1.5 ring-1 ring-inset ring-line-soft transition-shadow focus-within:ring-accent-mid/60">
            <div className="min-w-0 flex-1">
              <MentionTextarea
                ref={input}
                value={body}
                onValueChange={setBody}
                candidates={candidates}
                picked={picked}
                onPickedChange={setPicked}
                placement="top"
                aria-label={t('commentPlaceholder')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    submit()
                  }
                }}
                placeholder={t('commentPlaceholder')}
                className="max-h-40 bg-transparent py-1 text-sm outline-none placeholder:text-fg-subtle"
              />
            </div>
            <Tooltip content={t('send')} shortcut={['⌘', '↵']}>
              <Button variant={body.trim() ? 'primary' : 'ghost'} size="icon-xs" onClick={submit} disabled={!body.trim()} loading={add.isPending} aria-label={t('send')} className="mb-0.5">
                {add.isPending ? null : <Send />}
              </Button>
            </Tooltip>
          </div>
        </div>
      </footer>
    </aside>
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
