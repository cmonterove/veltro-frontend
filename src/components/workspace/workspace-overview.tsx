'use client'

import { fileTitle } from '@/components/vault/file-visual'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { differenceInMinutes, format, formatDistanceToNowStrict, isPast } from 'date-fns'
import { ArrowRight, Play, PenLine, Video } from 'lucide-react'
import { useWorkspaceMap } from '@/components/app/app-context'
import { Avatar } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AllClear } from '@/components/ui/empty-state'
import { SplitPanel } from '@/components/settings/ui'
import { useTasks } from '@/lib/queries/tasks'
import { useWorkspaceDocs } from '@/lib/queries/docs'
import { useWorkspaceItems, useWorkspaceMeetings, type MeetingWithNotes } from '@/lib/queries/meetings'
import { useAttachments } from '@/lib/queries/attachments'
import { useDateLocale, dueInfo } from '@/lib/dates'
import { useNow } from '@/lib/hooks'
import { TASK_STATUSES } from '@/lib/constants'
import { cn, taskRef } from '@/lib/utils'
import { meetingAgreements } from '@/lib/agreements'
import type { MeetingItemRow, TaskRow } from '@/lib/database.types'
import type { WorkspaceWithRole } from '@/lib/types'
import { TaskGroupList } from '@/components/tasks/task-list'
import { StatusIcon } from '@/components/tasks/status-icon'
import { SourceBadge } from '@/components/docs/source-badge'
import { DocMark } from '@/components/app/marks'
import { AttachmentIcon, formatBytes } from '@/components/attachments/attachments'
import { previewOrOpen } from '@/components/vault/file-viewer'
import { NoMeetingsAhead, dueThisWeek } from '@/components/calendar/no-meetings'
import { SpaceHeader } from './workspace-header'

/**
 * Inicio del espacio, en una sola superficie que cabe en la pantalla. A la izquierda cómo va (la cifra
 * grande y la barra por estado) y, debajo, lo que requiere atención (o, si todo está en orden, lo que
 * sigue). A la derecha, en la columna teñida, lo que viene y lo que pasó: la próxima reunión, los
 * acuerdos vivos y lo último. Lo vacío es una línea, no una caja.
 */
export function WorkspaceOverview({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('workspace.overview')
  const ws = useWorkspaceMap().get(workspaceId)!
  const now = useNow()
  const { data: tasks, isLoading } = useTasks({ kind: 'workspace', workspaceId })
  const { data: meetings } = useWorkspaceMeetings(workspaceId, 40)
  const { data: items } = useWorkspaceItems([workspaceId])

  const { focus, upNext } = useMemo(() => {
    const open = (tasks ?? []).filter((x) => x.status !== 'done')
    const overdue = open.filter((x) => x.due_date && dueInfo(x.due_date).tone === 'overdue')
    const active = open.filter((x) => x.status === 'in_progress' || x.status === 'blocked')
    const ids = new Set([...overdue, ...active].map((x) => x.id))
    // lo siguiente por empezar: primero lo que tiene fecha, la más cercana arriba
    const next = open.filter((x) => !ids.has(x.id)).sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
    return { focus: open.filter((x) => ids.has(x.id)), upNext: next.slice(0, 12) }
  }, [tasks])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4 pt-4 sm:px-6">
      <SpaceHeader ws={ws} section="overview" />
      <SplitPanel
        className="xl:grid-cols-[minmax(0,1fr)_23rem] 2xl:grid-cols-[minmax(0,1fr)_27rem]"
        main={
          <>
            <Progress ws={ws} tasks={tasks} loading={isLoading} now={now} />
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              {isLoading ? (
                <div className="flex flex-col gap-2 p-5">
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                </div>
              ) : focus.length ? (
                <TaskGroupList groups={[{ id: 'focus', label: t('focus'), tasks: focus, defaults: null }]} className="pb-2" />
              ) : (tasks ?? []).length ? (
                // todo en orden: una línea y, debajo, lo que sigue (en vez de una caja vacía)
                <>
                  <AllClear title={t('focusClear')} hint={t('noFocus')} className="border-b border-line-soft px-5 py-3" />
                  {upNext.length ? <TaskGroupList groups={[{ id: 'next', label: t('upNext'), tasks: upNext, defaults: null }]} className="pb-2" /> : null}
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
                  <span className="flex gap-1.5" aria-hidden>
                    {(['todo', 'in_progress', 'done'] as const).map((s) => (
                      <span key={s} className="flex size-9 items-center justify-center rounded-xl border border-dashed border-line-strong bg-canvas">
                        <StatusIcon status={s} className="size-4" />
                      </span>
                    ))}
                  </span>
                  <p className="mt-4 text-sm font-semibold text-fg">{t('noTasksTitle')}</p>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-fg-muted">{t('noTasksHint')}</p>
                  <Link href={`/w/${ws.slug}/tasks`} className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'mt-4')}>
                    {t('goToTasks')}
                  </Link>
                </div>
              )}
            </div>
          </>
        }
        side={
          <>
            <Side title={t('nextMeeting')}>
              <NextMeeting ws={ws} meetings={meetings} tasks={tasks} now={now} />
            </Side>
            <Side title={t('agreements')} href={`/decisions?ws=${ws.id}`} linkLabel={t('allShort')}>
              <Agreements ws={ws} items={items ?? []} meetings={meetings ?? []} tasks={tasks ?? []} />
            </Side>
            <Recent ws={ws} tasks={tasks ?? []} meetings={meetings} />
          </>
        }
      />
    </div>
  )
}

/** Un bloque de la columna de la derecha: título chico, su enlace y lo suyo, separados por una línea. */
function Side({ title, href, linkLabel, lead, children }: { title?: string; href?: string; linkLabel?: string; lead?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-b border-line-soft px-5 py-4 last:border-b-0">
      <div className="mb-3 flex min-h-6 items-center gap-2">
        {lead ?? <h2 className="text-[13px] font-semibold text-fg">{title}</h2>}
        {href ? (
          <Link href={href} className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-fg-muted hover:text-fg">
            {linkLabel}
            <ArrowRight className="size-3" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  )
}

/** Una línea en voz baja para lo que todavía no tiene nada. */
function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-relaxed text-fg-muted">{children}</p>
}

// ---------------- avance ----------------

function Progress({ ws, tasks, loading, now }: { ws: WorkspaceWithRole; tasks: TaskRow[] | undefined; loading: boolean; now: Date }) {
  const t = useTranslations('workspace.overview')
  const tStatus = useTranslations('tasks.status')

  const stats = useMemo(() => {
    const list = tasks ?? []
    const counts = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<string, number>
    list.forEach((x) => counts[x.status]++)
    const overdue = list.filter((x) => x.status !== 'done' && x.due_date && dueInfo(x.due_date).tone === 'overdue').length
    const hours = list.filter((x) => x.status !== 'done').reduce((n, x) => n + (Number(x.estimate_hours) || 0), 0)
    return { counts, total: list.length, overdue, hours }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, now.toDateString()])

  return (
    <section className="shrink-0 border-b border-line-soft px-5 pb-5 pt-4 sm:px-6">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-fg-subtle">{t('progress')}</p>
          {loading ? (
            <Skeleton className="mt-1.5 h-8 w-48" />
          ) : (
            <p className="mt-0.5 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-fg">
              {stats.total ? t('doneOf', { done: stats.counts.done, total: stats.total }) : t('noTasksShort')}
            </p>
          )}
        </div>
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          {stats.counts.blocked ? <Chip tone="danger">{t('blocked', { count: stats.counts.blocked })}</Chip> : null}
          {stats.overdue ? <Chip tone="danger">{t('overdue', { count: stats.overdue })}</Chip> : null}
          {stats.hours ? <Chip>{t('hoursLeft', { hours: stats.hours })}</Chip> : null}
        </div>
        <Link href={`/w/${ws.slug}/tasks`} className="mb-1.5 ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-fg-muted hover:text-fg">
          {t('allTasks')}
          <ArrowRight className="size-3" />
        </Link>
      </div>
      {stats.total ? (
        <>
          {/* la barra por estado: cada tramo con su color y su ancho según cuántas tareas tiene */}
          <div className="mt-4 flex h-2.5 gap-1">
            {TASK_STATUSES.filter((s) => stats.counts[s]).map((s) => (
              <span
                key={s}
                title={`${tStatus(s)}: ${stats.counts[s]}`}
                className={cn(
                  'h-full min-w-2 rounded-full transition-[flex-grow] duration-500 ease-out',
                  s === 'done' && 'bg-st-done',
                  s === 'in_progress' && 'bg-st-progress',
                  s === 'blocked' && 'bg-st-blocked',
                  s === 'todo' && 'bg-st-todo/50',
                  s === 'backlog' && 'bg-st-backlog/30',
                )}
                style={{ flexGrow: stats.counts[s] }}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {TASK_STATUSES.map((s) => (
              <li key={s} className="flex items-center gap-1.5 text-xs text-fg-muted">
                <StatusIcon status={s} className="size-3.5" />
                {tStatus(s)}
                <span className="tabular-nums font-medium text-fg">{stats.counts[s]}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}

function Chip({ tone, children }: { tone?: 'danger'; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium', tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-hover text-fg-muted')}>{children}</span>
  )
}

// ---------------- próxima reunión ----------------

function NextMeeting({ ws, meetings, tasks, now }: { ws: WorkspaceWithRole; meetings: MeetingWithNotes[] | undefined; tasks: TaskRow[] | undefined; now: Date }) {
  const t = useTranslations('workspace.overview')
  const locale = useDateLocale()
  if (!meetings) return <Skeleton className="h-28" />

  const live = meetings.find((m) => m.phase !== 'closed' && new Date(m.starts_at) <= now && new Date(m.ends_at ?? m.starts_at) > now)
  const next =
    live ??
    [...meetings]
      .filter((m) => m.phase !== 'closed' && new Date(m.starts_at) > now)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]

  // sin reuniones: la semana libre (con lo que vence) y «Nueva reunión», apilado para la columna
  if (!next) return <NoMeetingsAhead compact now={now} workspaceId={ws.id} due={dueThisWeek(tasks, now)} calendarHref={`/w/${ws.slug}/meetings`} />

  const start = new Date(next.starts_at)
  const end = next.ends_at ? new Date(next.ends_at) : null
  const isLive = next === live
  const remaining = end ? differenceInMinutes(end, now) : null

  return (
    <div
      className={cn('ws-' + ws.color, 'flex flex-col gap-3 rounded-xl p-3.5 ring-1', isLive ? 'ring-mandarina/60' : 'ring-line-soft')}
      style={{ background: 'color-mix(in oklch, var(--ws-color) 10%, var(--panel))' }}
    >
      <p className="text-2xs font-medium uppercase tracking-wide">
        {isLive ? (
          <span className="inline-flex items-center gap-1.5 text-mandarina-ink">
            <span className="size-1.5 animate-pulse rounded-full bg-mandarina" />
            {t('liveNow')}
            {remaining != null && remaining > 0 ? <span className="font-normal normal-case tracking-normal text-fg-muted">· {t('remaining', { minutes: remaining })}</span> : null}
          </span>
        ) : (
          <span className="text-fg-subtle">{formatDistanceToNowStrict(start, { addSuffix: true, locale })}</span>
        )}
      </p>
      <div className="min-w-0">
        <Link href={`/m/${next.id}`} className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-[-0.01em] hover:underline">
          {next.title}
        </Link>
        <p className="mt-0.5 text-xs text-fg-muted first-letter:uppercase">
          {format(start, 'EEEE d MMM', { locale })} · {format(start, 'HH:mm')}
          {end ? ` - ${format(end, 'HH:mm')}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {next.attendees.length ? (
          <span className="flex -space-x-1.5">
            {next.attendees.slice(0, 5).map((a) => (
              <Avatar key={a.email} name={a.name || a.email} seed={a.email} size={22} className="ring-2 ring-panel" />
            ))}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-1.5">
          {isLive && next.conference_url ? (
            <a href={next.conference_url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              <Video />
              {t('join')}
            </a>
          ) : null}
          <Link href={`/m/${next.id}`} className={buttonVariants({ variant: 'primary', size: 'sm' })}>
            {isLive ? <Play /> : <PenLine />}
            {isLive ? t('enter') : t('prepare')}
          </Link>
        </span>
      </div>
    </div>
  )
}

// ---------------- acuerdos vivos ----------------

function Agreements({ ws, items, meetings, tasks }: { ws: WorkspaceWithRole; items: MeetingItemRow[]; meetings: MeetingWithNotes[]; tasks: TaskRow[] }) {
  const t = useTranslations('workspace.overview')
  const locale = useDateLocale()
  const meetingById = new Map(meetings.map((m) => [m.id, m]))
  const groups = meetingAgreements(items, tasks)
    .map((g) => ({ ...g, meeting: meetingById.get(g.meetingId) }))
    .slice(0, 3)

  if (!groups.length) return <Quiet>{t('noAgreements')}</Quiet>

  return (
    <ul className="flex flex-col gap-3.5">
      {groups.map((g) => (
        <li key={g.decisions[0].id} className="min-w-0">
          {g.meeting ? (
            <Link href={`/m/${g.meeting.id}`} className="mb-1.5 flex items-center gap-1.5 text-xs text-fg-subtle hover:text-fg">
              <DocMark source="meeting" className="size-3.5" />
              <span className="truncate">{g.meeting.title}</span>
              <span className="shrink-0">· {format(new Date(g.meeting.starts_at), 'd MMM', { locale })}</span>
            </Link>
          ) : null}
          <ul className="flex flex-col gap-1">
            {g.decisions.slice(0, 2).map((d) => (
              <li key={d.id} className="flex gap-2 text-[13px] leading-snug text-fg">
                <span className="mt-1.5 size-1.5 shrink-0 rotate-45 bg-k-decision" aria-hidden />
                <span className="line-clamp-2">{d.text}</span>
              </li>
            ))}
          </ul>
          {g.open.length ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-3.5 text-2xs text-fg-subtle">
              {g.open.slice(0, 3).map((x) => (
                <span key={x.id} className="inline-flex items-center gap-1 rounded bg-k-action-soft px-1.5 py-0.5 font-mono font-semibold text-k-action">
                  <StatusIcon status={x.status} className="size-2.5" />
                  {taskRef(ws.key, x.number)}
                </span>
              ))}
              {g.open.length > 3 ? <span>+{g.open.length - 3}</span> : null}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

// ---------------- lo último: reuniones, docs y archivos ----------------

type RecentTab = 'meetings' | 'docs' | 'files'

/** Lo último del espacio con pestañas (Reuniones · Docs · Archivos). Abre en la primera que tenga algo. */
function Recent({ ws, tasks, meetings }: { ws: WorkspaceWithRole; tasks: TaskRow[]; meetings: MeetingWithNotes[] | undefined }) {
  const t = useTranslations('workspace.overview')
  const locale = useDateLocale()
  const { data: docs } = useWorkspaceDocs(ws.id)
  const { data: files } = useAttachments({ kind: 'workspace', workspaceId: ws.id })
  const [picked, setPicked] = useState<RecentTab | null>(null)
  const auto: RecentTab = meetings?.length ? 'meetings' : docs?.length ? 'docs' : files?.length ? 'files' : 'meetings'
  const tab = picked ?? auto
  const href = tab === 'meetings' ? `/w/${ws.slug}/meetings` : tab === 'docs' ? `/w/${ws.slug}/docs` : `/w/${ws.slug}/docs?tab=files`
  const tabs: { id: RecentTab; label: string }[] = [
    { id: 'meetings', label: t('tabMeetings') },
    { id: 'docs', label: t('tabDocs') },
    { id: 'files', label: t('tabFiles') },
  ]
  const row = 'flex h-9 items-center gap-2.5 rounded-lg px-2 -mx-2 hover:bg-panel/70'

  let body: React.ReactNode
  if (tab === 'meetings') {
    if (!meetings) body = <Skeleton className="h-20" />
    else if (!meetings.length) body = <Quiet>{t('noMeetings')}</Quiet>
    else {
      const list = [...meetings].sort((a, b) => b.starts_at.localeCompare(a.starts_at)).slice(0, 6)
      body = (
        <ul>
          {list.map((m) => {
            const unclosed = m.phase !== 'closed' && isPast(new Date(m.ends_at ?? m.starts_at))
            return (
              <li key={m.id}>
                <Link href={`/m/${m.id}`} className={row}>
                  <DocMark source="meeting" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{m.title}</span>
                  {unclosed ? <span className="shrink-0 rounded-md bg-warning-soft px-1.5 py-0.5 text-2xs font-medium text-mandarina-ink">{t('unclosed')}</span> : null}
                  <span className="shrink-0 text-2xs text-fg-subtle">{formatDistanceToNowStrict(new Date(m.starts_at), { addSuffix: true, locale })}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )
    }
  } else if (tab === 'docs') {
    if (!docs) body = <Skeleton className="h-20" />
    else if (!docs.length) body = <Quiet>{t('noDocs')}</Quiet>
    else {
      const list = [...docs].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6)
      body = (
        <ul>
          {list.map((d) => (
            <li key={d.id}>
              <Link href={`/w/${ws.slug}/docs/${d.id}`} className={row}>
                <DocMark source={d.source} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{d.title || t('untitled')}</span>
                {d.source !== 'manual' ? <SourceBadge source={d.source} /> : null}
              </Link>
            </li>
          ))}
        </ul>
      )
    }
  } else {
    if (!files) body = <Skeleton className="h-20" />
    else if (!files.length) body = <Quiet>{t('noFiles')}</Quiet>
    else {
      const taskById = new Map(tasks.map((x) => [x.id, x]))
      const meetingById = new Map((meetings ?? []).map((m) => [m.id, m]))
      body = (
        <ul>
          {files.slice(0, 6).map((a) => {
            const task = a.task_id ? taskById.get(a.task_id) : undefined
            const meeting = a.meeting_id ? meetingById.get(a.meeting_id) : undefined
            const origin = task ? taskRef(ws.key, task.number) : meeting ? meeting.title : null
            return (
              <li key={a.id}>
                <button type="button" onClick={() => previewOrOpen(a)} className={cn(row, 'h-10 w-[calc(100%+1rem)] text-left')}>
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-panel ring-1 ring-line-soft">
                    <AttachmentIcon a={a} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-fg">{fileTitle(a)}</span>
                    <span className="block truncate text-2xs text-fg-subtle">{[origin, a.kind === 'file' ? formatBytes(a.size_bytes) : null].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )
    }
  }

  return (
    <Side
      lead={
        <div className="flex gap-0.5 rounded-lg bg-fg/[0.05] p-0.5" role="tablist" aria-label={t('recentLabel')}>
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={tab === x.id}
              onClick={() => setPicked(x.id)}
              className={cn(
                'inline-flex h-6 items-center rounded-md px-2 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid',
                tab === x.id ? 'bg-panel font-medium text-fg shadow-card' : 'text-fg-muted hover:text-fg',
              )}
            >
              {x.label}
            </button>
          ))}
        </div>
      }
      href={href}
      linkLabel={t('seeAll')}
    >
      {body}
    </Side>
  )
}
