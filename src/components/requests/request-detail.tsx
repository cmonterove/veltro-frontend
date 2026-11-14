'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { format, isBefore, isToday, parseISO, startOfDay } from 'date-fns'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  CalendarDays,
  CircleCheck,
  CircleSlash,
  Clock,
  Hand,
  ListPlus,
  MoreHorizontal,
  PackageCheck,
  RotateCcw,
  UserRound,
  UserRoundPlus,
} from 'lucide-react'
import { useApp, useMemberMap } from '@/components/app/app-context'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { EmptyState } from '@/components/ui/empty-state'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuSubmenu, MenuSubmenuTrigger, MenuTrigger } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusIcon } from '@/components/tasks/status-icon'
import { useAgo } from '@/components/support/support-bits'
import { useDateLocale } from '@/lib/dates'
import { REQUEST_STEPS, isClosed, useRequest, useRequestMutations, type DeptRequestDetail, type RequestEvent, type RequestStatus } from '@/lib/queries/requests'
import { useOpenTask } from '@/lib/use-open-task'
import { cn } from '@/lib/utils'
import { DeptMark, KIND_ICON, RequestStatusIcon, RequestStatusPill, RequestsIcon, useDepartmentPeople } from './request-bits'
import { ForwardDialog, RequestTaskDialog } from './request-dialogs'

/** Una solicitud: quién pide qué a quién, en qué va, sus tareas y la conversación. */
export function RequestDetail({ id }: { id: string }) {
  const t = useTranslations('requests.detail')
  const router = useRouter()
  const { data, isLoading, isError } = useRequest(id)
  const { read } = useRequestMutations()

  // al abrirla (y si llega algo mientras se mira) queda leída
  const unread = data?.unread
  const { mutate: markRead } = read
  useEffect(() => {
    if (unread && document.visibilityState === 'visible') markRead(id)
  }, [id, unread, markRead])

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="h-14 border-b border-line" />
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-8">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-20" />
          <Skeleton className="h-32" />
        </div>
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <EmptyState
          icon={<RequestsIcon />}
          title={t('notFound')}
          description={t('notFoundHint')}
          action={
            <Button size="sm" onClick={() => router.push('/requests')}>
              <ArrowLeft />
              {t('back')}
            </Button>
          }
        />
      </div>
    )
  }
  return <RequestView request={data} />
}

function RequestView({ request: r }: { request: DeptRequestDetail }) {
  const t = useTranslations('requests.detail')
  const tr = useTranslations('requests')
  const router = useRouter()
  const ago = useAgo()
  const locale = useDateLocale()
  const { user, departments } = useApp()
  const people = useDepartmentPeople()
  const { patch } = useRequestMutations()
  const [converting, setConverting] = useState(false)
  const [forwarding, setForwarding] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  const handler = r.myRole === 'department'
  // quien la pidió (aunque sea admin) confirma o reabre desde su lado
  const mine = r.requester.id === user.id
  const closed = isClosed(r.status)
  const Kind = KIND_ICON[r.kind]
  const deptPeople = r.department ? (people.get(r.department.id) ?? []) : []
  const overdue = r.dueDate && !closed && isBefore(parseISO(r.dueDate), startOfDay(new Date()))

  const setStatus = (status: RequestStatus, toastKey: string) => patch.mutate({ id: r.id, patch: { status } }, { onSuccess: () => toast.success(t(toastKey)) })
  const assign = (assigneeId: string | null) =>
    patch.mutate(
      { id: r.id, patch: { assigneeId, ...(assigneeId && r.status === 'new' ? { status: 'in_review' as const } : {}) } },
      { onSuccess: () => toast.success(assigneeId === user.id ? t('toastTaken') : t('toastAssigned')) },
    )

  // si llega algo mientras se mira, baja hasta lo nuevo
  const count = r.events.length
  const seen = useRef(count)
  useEffect(() => {
    if (count > seen.current) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
    seen.current = count
  }, [count])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-5">
        <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => router.push('/requests')} aria-label={t('back')}>
          <ArrowLeft />
        </Button>
        <RequestStatusIcon status={r.status} className="size-4" />
        <span className="font-mono text-xs text-fg-muted">{r.code}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{r.title}</span>
        <div className="flex shrink-0 items-center gap-1">
          {handler && !closed ? (
            <Button size="sm" variant="primary" onClick={() => setConverting(true)}>
              <ListPlus />
              <span className="max-sm:sr-only">{t('toTask')}</span>
            </Button>
          ) : null}
          <Menu>
            <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t('more')} disabled={patch.isPending} />}>
              <MoreHorizontal />
            </MenuTrigger>
            <MenuContent align="end" className="w-60">
              {handler ? (
                <>
                  <MenuSubmenu>
                    <MenuSubmenuTrigger>
                      <UserRoundPlus />
                      <span className="flex-1">{t('assign')}</span>
                    </MenuSubmenuTrigger>
                    <MenuContent side="left" align="start" sideOffset={4} className="w-56">
                      {deptPeople.map((p) => (
                        <MenuItem key={p.id} onClick={() => assign(p.id)}>
                          <Avatar name={p.full_name} src={p.avatar_url} seed={p.id} size={18} />
                          <span className="flex-1 truncate">{p.id === user.id ? t('me') : p.full_name}</span>
                          {r.assignee?.id === p.id ? <CircleCheck className="!text-accent" /> : null}
                        </MenuItem>
                      ))}
                      {r.assignee ? (
                        <>
                          <MenuSeparator />
                          <MenuItem onClick={() => assign(null)}>
                            <UserRound />
                            {t('unassign')}
                          </MenuItem>
                        </>
                      ) : null}
                    </MenuContent>
                  </MenuSubmenu>
                  {departments.length > 1 ? (
                    <MenuItem onClick={() => setForwarding(true)}>
                      <ArrowRightLeft />
                      {t('forward')}
                    </MenuItem>
                  ) : null}
                  <MenuSeparator />
                  <MenuLabel>{t('changeStatus')}</MenuLabel>
                  {closed ? (
                    <MenuItem onClick={() => setStatus('in_review', 'toastReopened')}>
                      <RotateCcw />
                      {t('reopen')}
                    </MenuItem>
                  ) : (
                    <>
                      {r.status !== 'delivered' ? (
                        <MenuItem onClick={() => setStatus('delivered', 'toastDelivered')}>
                          <PackageCheck />
                          {t('markDelivered')}
                        </MenuItem>
                      ) : null}
                      <MenuItem onClick={() => setStatus('resolved', 'toastResolved')}>
                        <CircleCheck />
                        {t('markResolved')}
                      </MenuItem>
                      <MenuItem danger onClick={() => setStatus('declined', 'toastDeclined')}>
                        <CircleSlash />
                        {t('decline')}
                      </MenuItem>
                    </>
                  )}
                </>
              ) : closed ? (
                <MenuItem onClick={() => setStatus('in_review', 'toastReopened')}>
                  <RotateCcw />
                  {t('reopen')}
                </MenuItem>
              ) : (
                <MenuItem onClick={() => setStatus('resolved', 'toastResolved')}>
                  <CircleCheck />
                  {t('closeMine')}
                </MenuItem>
              )}
            </MenuContent>
          </Menu>
        </div>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 pb-10 pt-7 sm:px-8">
          <section>
            <div className="flex flex-wrap items-center gap-1.5">
              <RequestStatusPill status={r.status} />
              {r.urgent && !closed ? <span className="inline-flex h-5 items-center rounded-full bg-danger-soft px-2 text-2xs font-semibold text-danger">{tr('urgent')}</span> : null}
            </div>
            <h1 className="mt-2.5 text-balance text-xl font-semibold leading-tight tracking-[-0.015em] text-fg">{r.title}</h1>

            {/* quién → a quién */}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex min-w-0 items-center gap-2 rounded-full bg-sidebar py-1 pl-1 pr-3">
                <Avatar name={r.requester.fullName} src={r.requester.avatarUrl} seed={r.requester.id} size={22} />
                <span className="truncate font-medium text-fg">{mine ? t('you') : r.requester.fullName}</span>
                {r.requester.department ? <span className="truncate text-fg-muted">· {r.requester.department.name}</span> : null}
              </span>
              <ArrowRight className="size-3.5 text-fg-subtle" aria-hidden />
              {r.department ? (
                <span className="inline-flex min-w-0 items-center gap-2 rounded-full bg-sidebar py-1 pl-1 pr-3">
                  <DeptMark name={r.department.name} size={22} />
                  <span className="truncate font-medium text-fg">{r.department.name}</span>
                </span>
              ) : (
                <span className="text-fg-muted">{t('noDepartment')}</span>
              )}
            </div>

            <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-fg-muted">
              <Meta icon={<Kind className="size-3.5" />} label={tr(`kind.${r.kind}`)} />
              <Meta
                icon={r.assignee ? <Avatar name={r.assignee.fullName} src={r.assignee.avatarUrl} seed={r.assignee.id} size={16} /> : <UserRound className="size-3.5" />}
                label={r.assignee ? t('assignee', { name: r.assignee.id === user.id ? t('you') : r.assignee.fullName }) : t('noAssignee')}
              />
              {r.dueDate ? (
                <Meta
                  icon={<CalendarDays className={cn('size-3.5', overdue && 'text-danger')} />}
                  label={t('due', { date: format(parseISO(r.dueDate), 'EEE d MMM', { locale }) })}
                  className={overdue ? 'text-danger' : undefined}
                />
              ) : null}
              <Meta icon={<Clock className="size-3.5" />} label={t('createdAgo', { when: ago(r.createdAt) })} />
            </dl>
          </section>

          {r.status === 'declined' ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-line bg-panel px-4 py-3 text-sm text-fg-muted">
              <CircleSlash className="size-4 shrink-0" />
              {t('declinedNote')}
            </div>
          ) : (
            <Steps request={r} />
          )}

          {/* a quien atiende: que alguien la tome */}
          {handler && r.status === 'new' && !r.assignee ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-mandarina/30 bg-warning-soft px-4 py-3">
              <Hand className="size-4 shrink-0 text-mandarina-ink" aria-hidden />
              <p className="min-w-0 flex-1 text-sm text-fg">{t('takeHint', { name: r.requester.fullName.split(' ')[0] })}</p>
              <Button size="sm" variant="primary" onClick={() => assign(user.id)} disabled={patch.isPending}>
                {t('take')}
              </Button>
            </div>
          ) : null}

          {/* quien la pidió confirma */}
          {mine && r.status === 'delivered' ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/25 bg-success-soft px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{t('resolvedQ')}</p>
                <p className="text-xs text-fg-muted">{t('resolvedQHint', { department: r.department?.name ?? '' })}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setStatus('in_review', 'toastReopened')} disabled={patch.isPending}>
                {t('notYet')}
              </Button>
              <Button size="sm" variant="primary" onClick={() => setStatus('resolved', 'toastResolved')} disabled={patch.isPending}>
                <CircleCheck />
                {t('yesResolved')}
              </Button>
            </div>
          ) : null}

          <TaskProgress request={r} handler={handler} onConvert={() => setConverting(true)} />

          <section aria-label={t('conversation')}>
            <h2 className="mb-1 text-sm font-semibold text-fg">{t('conversation')}</h2>
            <ol className="flex flex-col">
              {r.body ? (
                <MessageRow
                  author={{ id: r.requester.id, fullName: r.requester.fullName, avatarUrl: r.requester.avatarUrl }}
                  body={r.body}
                  at={r.createdAt}
                  ago={ago}
                />
              ) : null}
              {r.events.map((e) =>
                e.kind === 'message' ? <MessageRow key={e.id} author={e.author} body={e.body} at={e.createdAt} ago={ago} /> : <EventLine key={e.id} e={e} ago={ago} />,
              )}
            </ol>
          </section>
        </div>
      </div>

      <Composer request={r} />

      {handler ? <RequestTaskDialog request={r} open={converting} onOpenChange={setConverting} /> : null}
      {handler ? (
        <ForwardDialog
          request={r}
          open={forwarding}
          onOpenChange={setForwarding}
          onForwarded={(visible) => {
            if (!visible) router.push('/requests')
          }}
        />
      ) : null}
    </div>
  )
}

function Meta({ icon, label, className }: { icon: React.ReactNode; label: string; className?: string }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <dt className="flex shrink-0 items-center text-fg-subtle">{icon}</dt>
      <dd className="truncate">{label}</dd>
    </div>
  )
}

/** Los cinco pasos: hasta dónde llegó (la fecha sale de lo que pasó). */
function Steps({ request: r }: { request: DeptRequestDetail }) {
  const t = useTranslations('requests')
  const dl = useDateLocale()
  const idx = REQUEST_STEPS.indexOf(r.status)
  // cuándo llegó a cada paso: el último evento que la dejó ahí (o la creación)
  const reached = new Map<RequestStatus, string>([['new', r.createdAt]])
  for (const e of r.events) {
    if (e.kind === 'status' && typeof e.data.to === 'string') reached.set(e.data.to as RequestStatus, e.createdAt)
    if (e.kind === 'task_created' && !reached.has('in_progress')) reached.set('in_progress', e.createdAt)
    if (e.kind === 'tasks_done') reached.set('delivered', e.createdAt)
    if (e.kind === 'message' && !reached.has('in_review') && e.author?.id !== r.requester.id) reached.set('in_review', e.createdAt)
    if (e.kind === 'assigned' && !reached.has('in_review')) reached.set('in_review', e.createdAt)
  }
  if (r.resolvedAt && r.status === 'resolved') reached.set('resolved', r.resolvedAt)
  const when = (iso: string) => {
    const d = new Date(iso)
    return isToday(d) ? format(d, 'HH:mm') : format(d, 'd MMM', { locale: dl })
  }
  return (
    <ol className="grid grid-cols-5 rounded-xl border border-line bg-panel px-1 py-4" aria-label={t('stepsLabel', { status: t(`status.${r.status}`) })}>
      {REQUEST_STEPS.map((st, i) => {
        const done = i <= idx
        const current = i === idx
        const at = done ? reached.get(st) : undefined
        return (
          <li key={st} className="flex min-w-0 flex-col items-center gap-1.5" aria-current={current ? 'step' : undefined}>
            <span className="relative flex h-5 w-full items-center justify-center">
              {i > 0 ? <span className={cn('absolute left-0 right-1/2 h-0.5', done ? 'bg-accent-mid' : 'bg-line')} /> : null}
              {i < REQUEST_STEPS.length - 1 ? <span className={cn('absolute left-1/2 right-0 h-0.5', i < idx ? 'bg-accent-mid' : 'bg-line')} /> : null}
              {current ? (
                <span className="relative flex size-5 items-center justify-center rounded-full bg-accent-soft">
                  <span className="size-2.5 rounded-full bg-accent-mid" />
                </span>
              ) : (
                <span className={cn('relative size-2.5 rounded-full', done ? 'bg-accent-mid' : 'border-2 border-line-strong bg-panel')} />
              )}
            </span>
            <span className={cn('max-w-full truncate px-0.5 text-xs', current ? 'font-semibold text-fg' : done ? 'text-fg-muted' : 'text-fg-subtle')}>{t(`status.${st}`)}</span>
            <span className="h-4 text-2xs tabular-nums text-fg-subtle">{at ? when(at) : ''}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** Las tareas que salieron de la solicitud: el avance para quien la pidió y el control para quien la atiende. */
function TaskProgress({ request: r, handler, onConvert }: { request: DeptRequestDetail; handler: boolean; onConvert: () => void }) {
  const t = useTranslations('requests.detail')
  const memberMap = useMemberMap()
  const { open } = useOpenTask()
  const locale = useDateLocale()
  const list = r.taskList
  const done = list.filter((x) => x.status === 'done').length
  if (!list.length) {
    if (!handler || isClosed(r.status)) return null
    return (
      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line-strong px-4 py-3">
        <ListPlus className="size-4 shrink-0 text-fg-subtle" />
        <p className="min-w-0 flex-1 text-sm text-fg-muted">{t('noTasksHint')}</p>
        <Button size="sm" onClick={onConvert}>
          {t('toTask')}
        </Button>
      </section>
    )
  }
  const pct = Math.round((done / list.length) * 100)
  return (
    <section aria-label={t('tasks')}>
      <div className="mb-2 flex items-center gap-3">
        <h2 className="text-sm font-semibold text-fg">{t('tasks')}</h2>
        <span className="text-xs tabular-nums text-fg-muted">{t('tasksDone', { done, total: list.length })}</span>
        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-line" aria-hidden>
          <span className="block h-full rounded-full bg-done transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </span>
        {handler && !isClosed(r.status) ? (
          <Button size="xs" variant="ghost" className="ml-auto" onClick={onConvert}>
            <ListPlus />
            {t('addTask')}
          </Button>
        ) : null}
      </div>
      <ul className="flex flex-col overflow-hidden rounded-lg border border-line">
        {list.map((x) => {
          const people = x.assigneeIds.flatMap((id) => memberMap.get(id) ?? [])
          const finished = x.status === 'done'
          const row = (
            <>
              <StatusIcon status={x.status} />
              <span className="w-16 shrink-0 font-mono text-2xs text-fg-subtle">{x.ref}</span>
              <span className={cn('min-w-0 flex-1 truncate text-left text-sm', finished && 'text-fg-muted line-through')}>{x.title}</span>
              {x.dueDate && !finished ? <span className="shrink-0 text-xs text-fg-muted">{format(parseISO(x.dueDate), 'd MMM', { locale })}</span> : null}
              {people.length ? <AvatarStack people={people} size={20} max={3} /> : null}
            </>
          )
          return (
            <li key={x.id} className="border-b border-line-soft last:border-0">
              {x.canOpen ? (
                <button type="button" onClick={() => open(x.id)} className="flex h-11 w-full items-center gap-2.5 px-3 hover:bg-hover/50">
                  {row}
                </button>
              ) : (
                <div className="flex h-11 items-center gap-2.5 px-3">{row}</div>
              )}
            </li>
          )
        })}
      </ul>
      {!handler ? <p className="mt-1.5 text-2xs text-fg-subtle">{t('tasksHintRequester', { department: r.department?.name ?? '' })}</p> : null}
    </section>
  )
}

function MessageRow({ author, body, at, ago }: { author: RequestEvent['author']; body: string; at: string; ago: (iso: string) => string }) {
  const t = useTranslations('requests.detail')
  const { user } = useApp()
  const locale = useLocale()
  const name = author ? (author.id === user.id ? t('you') : author.fullName) : t('someone')
  return (
    <li className="flex gap-3 py-3">
      <Avatar name={author?.fullName ?? '?'} src={author?.avatarUrl} seed={author?.id ?? 'x'} size={32} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold text-fg">{name}</span>
          <time dateTime={at} title={new Date(at).toLocaleString(locale)} className="text-2xs tabular-nums text-fg-subtle">
            {ago(at)}
          </time>
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">{body}</p>
      </div>
    </li>
  )
}

/** Lo que pasó, en una línea: estado, responsable, derivada, tarea creada, tareas terminadas. */
function EventLine({ e, ago }: { e: RequestEvent; ago: (iso: string) => string }) {
  const t = useTranslations('requests.events')
  const ts = useTranslations('requests.status')
  const { user, departments } = useApp()
  const memberMap = useMemberMap()
  const self = e.author?.id === user.id ? 'yes' : 'no'
  const who = e.author ? e.author.fullName.split(' ')[0] : 'Veltro'
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const deptName = (id: unknown) => departments.find((d) => d.id === id)?.name ?? t('otherDept')
  let text = ''
  let icon: React.ReactNode = null
  switch (e.kind) {
    case 'status': {
      const to = str(e.data.to) as RequestStatus
      text = t('status', { who, self, status: ts(to) })
      icon = <RequestStatusIcon status={to} className="size-3" />
      break
    }
    case 'assigned': {
      const to = str(e.data.to)
      const name = to === user.id ? t('youLower') : (memberMap.get(to)?.full_name.split(' ')[0] ?? t('someone'))
      text = to === e.author?.id ? t('took', { who, self }) : t('assigned', { who, self, name })
      icon = <UserRoundPlus className="size-3" />
      break
    }
    case 'forwarded':
      text = t('forwarded', { who, self, from: deptName(e.data.from), to: deptName(e.data.to) })
      icon = <ArrowRightLeft className="size-3" />
      break
    case 'task_created':
      text = t('taskCreated', { who, self, ref: str(e.data.ref), title: str(e.data.title) })
      icon = <ListPlus className="size-3" />
      break
    case 'tasks_done':
      text = t('tasksDone')
      icon = <PackageCheck className="size-3 text-success" />
      break
  }
  return (
    <li className="flex items-center justify-center gap-1.5 py-2 text-center text-xs text-fg-subtle">
      {icon}
      <span>
        {text} · {ago(e.createdAt)}
      </span>
    </li>
  )
}

/** Escribir: las dos partes conversan aquí. Enter envía; Mayús+Enter, otra línea. */
function Composer({ request: r }: { request: DeptRequestDetail }) {
  const t = useTranslations('requests.detail')
  const { user } = useApp()
  const { message } = useRequestMutations()
  const [text, setText] = useState('')
  const mine = r.requester.id === user.id
  const placeholder = mine && r.myRole !== 'department' ? t('replyMine', { department: r.department?.name ?? '' }) : t('replyTo', { name: r.requester.fullName.split(' ')[0] })
  const ready = text.trim().length > 0 && !message.isPending
  const send = () => {
    if (!ready) return
    message.mutate({ id: r.id, body: text.trim() }, { onSuccess: () => setText('') })
  }
  return (
    <div className="mx-auto w-full max-w-3xl shrink-0 px-3 pb-3 sm:px-8 sm:pb-4">
      <div className="rounded-xl border border-line bg-panel shadow-card transition-colors focus-within:border-accent-mid">
        <AutoTextarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          maxLength={4000}
          className="max-h-48 bg-transparent px-3.5 pb-1 pt-3 text-sm leading-relaxed outline-none placeholder:text-fg-subtle"
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <span className="ml-auto mr-2 hidden text-2xs text-fg-subtle sm:inline">{t('enterHint')}</span>
          <Button size="icon-sm" variant="primary" onClick={send} disabled={!ready} loading={message.isPending} aria-label={t('send')} className="rounded-lg">
            {message.isPending ? null : <ArrowUp />}
          </Button>
        </div>
      </div>
    </div>
  )
}

