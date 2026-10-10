'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { addDays, differenceInCalendarDays, differenceInMinutes, format, parseISO, startOfDay, subDays } from 'date-fns'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useApp, useMemberMap } from '@/components/app/app-context'
import { WorkspaceMark, DocMark } from '@/components/app/marks'
import { Avatar } from '@/components/ui/avatar'
import { StatusIcon } from '@/components/tasks/status-icon'
import { NotesButton } from '@/components/calendar/notes-button'
import { useCalendarEvents } from '@/lib/queries/calendar'
import { useTasks } from '@/lib/queries/tasks'
import { useMeetingsInRange, useWorkspaceItems } from '@/lib/queries/meetings'
import { useRecentDocs } from '@/lib/queries/docs'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTaskPanel, useNow } from '@/lib/hooks'
import { cn, taskRef } from '@/lib/utils'
import { meetingAgreements } from '@/lib/agreements'
import { useDateLocale } from '@/lib/dates'
import type { MeetingItemRow, MeetingRow, TaskRow } from '@/lib/database.types'
import type { CalendarEvent, DocSummary, WorkspaceWithRole } from '@/lib/types'


const ROWS = ['next', 'agreements', 'stuck', 'progress', 'memory'] as const

export function MesaView() {
  const t = useTranslations('mesa')
  const { workspaces, members, google } = useApp()
  const now = useNow()
  const wsIds = useMemo(() => workspaces.map((w) => w.id), [workspaces])
  const from = useMemo(() => subDays(startOfDay(new Date()), 14), [])
  const to = useMemo(() => addDays(startOfDay(new Date()), 14), [])

  const { data: tasks } = useTasks({ kind: 'workspaces', workspaceIds: wsIds })
  const { data: items } = useWorkspaceItems(wsIds)
  const { data: meetings } = useMeetingsInRange(wsIds, from, to)
  const { data: docs } = useRecentDocs(wsIds, 40)
  const { data: events } = useCalendarEvents(startOfDay(now), addDays(startOfDay(now), 7), Boolean(google))
  const { data: wsMembers } = useQuery({
    queryKey: ['workspace-members', 'all', wsIds],
    enabled: wsIds.length > 0,
    queryFn: async () => {
      const { data } = await createClient().from('workspace_members').select('workspace_id, user_id').in('workspace_id', wsIds)
      return data ?? []
    },
  })

  const openTasks = (tasks ?? []).filter((x) => x.status !== 'done')

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-end gap-x-6 gap-y-2 px-4 pb-4 pt-6 sm:px-8">
        <div className="mr-auto">
          <h1 className="font-brand text-[28px] font-semibold leading-tight tracking-[-0.03em]">{t('title')}</h1>
          <p className="text-sm text-fg-muted">
            {t('subtitle', { workspaces: workspaces.length, people: members.length, open: openTasks.length })}
          </p>
        </div>
      </header>

      <DayBand events={(events ?? []).filter((e) => !e.allDay && format(new Date(e.start), 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd'))} now={now} />

      <div className="min-h-0 flex-1 overflow-x-auto px-4 pb-6 pt-4 sm:px-8 scrollbar-thin">
        <div
          className="grid min-w-[880px] gap-x-3"
          style={{ gridTemplateColumns: `120px repeat(${Math.max(workspaces.length, 1)}, minmax(260px, 1fr))` }}
        >
          <div />
          {workspaces.map((ws) => (
            <ColumnHeader key={ws.id} ws={ws} tasks={(tasks ?? []).filter((x) => x.workspace_id === ws.id)} memberIds={(wsMembers ?? []).filter((m) => m.workspace_id === ws.id).map((m) => m.user_id)} />
          ))}

          {ROWS.map((row) => (
            <Row key={row} label={t(`rows.${row}`)} hint={t(`hints.${row}`)}>
              {workspaces.map((ws) => (
                <Cell key={ws.id}>
                  {row === 'next' ? (
                    <NextMeeting ws={ws} events={events ?? []} meetings={meetings ?? []} now={now} />
                  ) : row === 'agreements' ? (
                    <Agreements ws={ws} items={items ?? []} meetings={meetings ?? []} tasks={tasks ?? []} />
                  ) : row === 'stuck' ? (
                    <Stuck ws={ws} tasks={tasks ?? []} now={now} />
                  ) : row === 'progress' ? (
                    <Progress ws={ws} tasks={tasks ?? []} />
                  ) : (
                    <Memory ws={ws} docs={docs ?? []} />
                  )}
                </Cell>
              ))}
            </Row>
          ))}
        </div>
      </div>

      <Briefing tasks={tasks ?? []} items={items ?? []} workspaces={workspaces} now={now} />
    </div>
  )
}

// ---------------- franja del día ----------------

/** Franja horaria del día: el rango se ajusta a las reuniones y a la hora actual; las que se solapan van en carriles. */
function DayBand({ events, now }: { events: CalendarEvent[]; now: Date }) {
  const t = useTranslations('mesa')
  const { workspaces } = useApp()
  const hourOf = (d: Date) => d.getHours() + d.getMinutes() / 60
  const nowH = hourOf(now)
  const endOf = (e: CalendarEvent) => (sameDay(new Date(e.end), now) ? hourOf(new Date(e.end)) : 24)
  const lo = Math.min(nowH, ...events.map((e) => hourOf(new Date(e.start))))
  const hi = Math.max(nowH, ...events.map(endOf))
  // Jornada normal (8 a 20) si todo cabe; si no, el rango sigue a lo que pasa hoy, con al menos 10 horas visibles.
  let startHour = lo >= 8 && hi <= 20 ? 8 : Math.max(0, Math.floor(lo - 0.5))
  let endHour = lo >= 8 && hi <= 20 ? 20 : Math.min(24, Math.ceil(hi + 1))
  if (endHour - startHour < 10) endHour = Math.min(24, startHour + 10)
  if (endHour - startHour < 10) startHour = Math.max(0, endHour - 10)
  const span = endHour - startHour
  const step = span > 16 ? 2 : 1
  const pos = (h: number) => Math.min(100, Math.max(0, ((h - startHour) / span) * 100))
  const wsOf = (e: CalendarEvent) => workspaces.find((w) => e.links.some((l) => l.workspaceId === w.id))

  // carriles: cada evento va al primer carril libre
  const lanes: number[] = []
  const placed = [...events]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) => {
      const s = hourOf(new Date(e.start))
      const en = endOf(e)
      let lane = lanes.findIndex((busyUntil) => busyUntil <= s)
      if (lane === -1) lane = lanes.push(en) - 1
      else lanes[lane] = en
      return { e, s, en, lane }
    })
  const laneCount = Math.max(1, lanes.length)

  return (
    <div className="mx-4 rounded-xl border border-line bg-panel px-4 pb-4 pt-2.5 sm:mx-8">
      <div className="flex items-center gap-3 pb-1.5">
        <span className="text-xs font-semibold">{t('yourDay')}</span>
        <span className="text-xs text-fg-muted">{t('meetingsToday', { count: events.length })}</span>
      </div>
      <div className="relative" style={{ height: 22 + laneCount * 30 }}>
        {Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => {
          const h = startHour + i * step
          return (
            <span key={h} className="absolute top-0 h-full border-l border-line-soft" style={{ left: `${pos(h)}%` }}>
              <span className="absolute -top-0.5 left-1 font-mono text-2xs text-fg-subtle">{String(h % 24).padStart(2, '0')}</span>
            </span>
          )
        })}
        {placed.map(({ e, s, en, lane }) => {
          const ws = wsOf(e)
          const link = e.links[0]
          const live = now >= new Date(e.start) && now < new Date(e.end)
          const left = pos(s)
          const width = Math.max(3, pos(en) - left)
          const cls = cn(
            'absolute flex h-[26px] items-center gap-1.5 overflow-hidden rounded-md px-1.5 text-xs transition-colors',
            live ? 'bg-highlight font-semibold text-highlight-ink ring-1 ring-mandarina' : 'bg-sidebar text-fg hover:bg-hover',
            new Date(e.end) < now && 'opacity-55',
          )
          const style = { left: `${left}%`, width: `calc(${width}% - 2px)`, top: 20 + lane * 30 }
          const body = (
            <>
              {ws ? <WorkspaceMark ws={ws} size={14} /> : null}
              <span className="truncate">{e.title}</span>
            </>
          )
          return link ? (
            <Link key={e.id} href={`/m/${link.meetingId}`} className={cls} style={style} title={`${format(new Date(e.start), 'HH:mm')} ${e.title}`}>
              {body}
            </Link>
          ) : (
            <div key={e.id} className={cls} style={style} title={`${format(new Date(e.start), 'HH:mm')} ${e.title}`}>
              {body}
            </div>
          )
        })}
        <span className="pointer-events-none absolute bottom-1 top-3 z-[1] w-0.5 rounded-full bg-mandarina" style={{ left: `${pos(nowH)}%` }} aria-hidden>
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-sm bg-mandarina px-1 font-mono text-2xs font-semibold leading-4 text-on-mandarina">
            {format(now, 'HH:mm')}
          </span>
        </span>
      </div>
    </div>
  )
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// ---------------- grilla ----------------

function ColumnHeader({ ws, tasks, memberIds }: { ws: WorkspaceWithRole; tasks: TaskRow[]; memberIds: string[] }) {
  const t = useTranslations('mesa')
  const memberMap = useMemberMap()
  const now = new Date()
  const blocked = tasks.filter((x) => x.status === 'blocked').length
  const overdue = tasks.filter((x) => x.status !== 'done' && x.due_date && differenceInCalendarDays(parseISO(x.due_date), now) < 0).length
  const healthy = !blocked && !overdue
  return (
    <Link
      href={`/w/${ws.slug}`}
      className={cn('ws-' + ws.color, 'group/col sticky top-0 z-10 mb-1 flex flex-col gap-2 overflow-hidden rounded-xl border border-line bg-panel px-3 pb-3 pt-0 hover:border-line-strong')}
    >
      <span className="-mx-3 h-1" style={{ background: 'var(--ws-color)' }} />
      <span className="flex items-center gap-2">
        <WorkspaceMark ws={ws} size={24} />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{ws.name}</span>
        <ArrowRight className="size-4 text-fg-subtle opacity-0 transition-opacity group-hover/col:opacity-100" />
      </span>
      <span className="flex items-center gap-2">
        <span className="flex -space-x-1">
          {memberIds.slice(0, 4).map((id) => {
            const m = memberMap.get(id)
            return m ? <Avatar key={id} name={m.full_name} seed={m.id} src={m.avatar_url} size={18} className="ring-2 ring-panel" /> : null
          })}
        </span>
        <span className={cn('ml-auto text-xs font-medium', healthy ? 'text-fg-muted' : 'text-danger')}>
          {healthy ? t('healthy') : [blocked ? t('blocked', { count: blocked }) : null, overdue ? t('overdue', { count: overdue }) : null].filter(Boolean).join(' · ')}
        </span>
      </span>
    </Link>
  )
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <>
      <div className="border-t border-line py-3 pr-2">
        <p className="text-xs font-semibold text-fg">{label}</p>
        <p className="mt-0.5 text-2xs leading-snug text-fg-subtle">{hint}</p>
      </div>
      {children}
    </>
  )
}

function Cell({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 border-t border-line py-3">{children}</div>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-fg-subtle">{children}</p>
}

function NextMeeting({ ws, events, meetings, now }: { ws: WorkspaceWithRole; events: CalendarEvent[]; meetings: MeetingRow[]; now: Date }) {
  const t = useTranslations('mesa')
  const locale = useDateLocale()
  const upcoming = events
    .filter((e) => !e.allDay && new Date(e.end) > now && e.links.some((l) => l.workspaceId === ws.id && l.phase !== 'closed'))
    .sort((a, b) => a.start.localeCompare(b.start))[0]
  const fallback = !upcoming
    ? meetings.filter((m) => m.workspace_id === ws.id && m.phase !== 'closed' && new Date(m.ends_at ?? m.starts_at) > now).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]
    : null
  if (!upcoming && !fallback) return <Empty>{t('noMeeting')}</Empty>
  const start = new Date(upcoming?.start ?? fallback!.starts_at)
  const live = start <= now
  const mins = differenceInMinutes(start, now)
  return (
    <div className="flex flex-col gap-2">
      <span className={cn('text-xs font-medium', live ? 'text-mandarina-ink' : 'text-fg-muted')}>
        {live ? t('liveNow') : mins < 60 ? t('inMinutes', { minutes: mins }) : mins < 60 * 24 ? t('inHours', { hours: Math.floor(mins / 60) }) : <span className="first-letter:uppercase">{format(start, 'EEE d MMM · HH:mm', { locale })}</span>}
      </span>
      <span className="text-sm font-medium leading-snug">{upcoming?.title ?? fallback!.title}</span>
      {upcoming ? (
        <div>
          <NotesButton event={upcoming} workspaceId={ws.id} />
        </div>
      ) : (
        <Link href={`/m/${fallback!.id}`} className="text-xs text-accent-ink hover:underline">
          {t('open')}
        </Link>
      )}
    </div>
  )
}

function Agreements({ ws, items, meetings, tasks }: { ws: WorkspaceWithRole; items: MeetingItemRow[]; meetings: MeetingRow[]; tasks: TaskRow[] }) {
  const t = useTranslations('mesa')
  const { open } = useTaskPanel()
  const meetingById = new Map(meetings.map((m) => [m.id, m]))
  const groups = meetingAgreements(
    items.filter((i) => i.workspace_id === ws.id),
    tasks.filter((x) => x.workspace_id === ws.id),
  )
    .map((g) => ({ ...g, meeting: meetingById.get(g.meetingId) }))
    .slice(0, 2)
  if (!groups.length) return <Empty>{t('noAgreements')}</Empty>
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <div key={g.decisions[0].id} className="flex flex-col gap-1.5">
          {g.meeting ? (
            <Link href={`/m/${g.meeting.id}`} className="truncate text-2xs text-fg-subtle hover:text-fg">
              {g.meeting.title}
            </Link>
          ) : null}
          {g.decisions.slice(0, 2).map((d) => (
            <p key={d.id} className="text-sm leading-snug">
              «{d.text}»
            </p>
          ))}
          <div className="flex flex-wrap gap-1">
            {g.open.slice(0, 3).map((x) => (
              <button key={x.id} type="button" onClick={() => open(x.id)} className="inline-flex h-5 items-center gap-1 rounded-md bg-k-action-soft px-1.5 font-mono text-2xs font-semibold text-k-action hover:opacity-80">
                <StatusIcon status={x.status} className="size-2.5" />
                {taskRef(ws.key, x.number)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Stuck({ ws, tasks, now }: { ws: WorkspaceWithRole; tasks: TaskRow[]; now: Date }) {
  const t = useTranslations('mesa')
  const memberMap = useMemberMap()
  const { open } = useTaskPanel()
  const stuck = tasks
    .filter((x) => x.workspace_id === ws.id && x.status !== 'done')
    .map((x) => ({ x, late: x.due_date ? -differenceInCalendarDays(parseISO(x.due_date), now) : 0 }))
    .filter(({ x, late }) => x.status === 'blocked' || late > 0)
    .sort((a, b) => b.late - a.late)
    .slice(0, 3)
  if (!stuck.length) return <Empty>{t('nothingStuck')}</Empty>
  return (
    <ul className="flex flex-col gap-2">
      {stuck.map(({ x, late }) => {
        const owner = x.assignee_id ? memberMap.get(x.assignee_id) : undefined
        return (
          <li key={x.id}>
            <button type="button" onClick={() => open(x.id)} className="flex w-full items-start gap-2.5 rounded-md text-left hover:bg-hover/60">
              <span className="flex w-8 shrink-0 flex-col items-center">
                {late > 0 ? (
                  <>
                    <span className="font-brand text-xl font-semibold leading-none text-danger">{late}</span>
                    <span className="text-2xs text-fg-subtle">{t('days', { count: late })}</span>
                  </>
                ) : (
                  <>
                    <StatusIcon status="blocked" className="mt-0.5 size-4" />
                    <span className="mt-1 text-2xs text-fg-subtle">{t('blockedShort')}</span>
                  </>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-snug">{x.title}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-2xs text-fg-muted">
                  <StatusIcon status={x.status} className="size-3" />
                  {taskRef(ws.key, x.number)}
                  {owner ? ` · ${owner.full_name.split(' ')[0]}` : ''}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Progress({ ws, tasks }: { ws: WorkspaceWithRole; tasks: TaskRow[] }) {
  const t = useTranslations('mesa')
  const { open } = useTaskPanel()
  const list = tasks.filter((x) => x.workspace_id === ws.id)
  const done = list.filter((x) => x.status === 'done').length
  const active = list.filter((x) => x.status === 'in_progress').slice(0, 2)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-fg-muted">{t('doneOf', { done, total: list.length })}</span>
        <span className="text-fg-subtle">{t('inProgress', { count: list.filter((x) => x.status === 'in_progress').length })}</span>
      </div>
      <div className={cn('ws-' + ws.color, 'h-1.5 overflow-hidden rounded-full bg-hover')}>
        <div className="h-full rounded-full" style={{ width: `${list.length ? (done / list.length) * 100 : 0}%`, background: 'var(--ws-color)' }} />
      </div>
      {active.length ? (
        <ul className="flex flex-col gap-1">
          {active.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => open(x.id)} className="flex w-full items-center gap-2 rounded-md text-left text-sm hover:bg-hover/60">
                <StatusIcon status={x.status} />
                <span className="truncate">{x.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t('nothingActive')}</Empty>
      )}
    </div>
  )
}

function Memory({ ws, docs }: { ws: WorkspaceWithRole; docs: DocSummary[] }) {
  const t = useTranslations('mesa')
  const list = docs.filter((d) => d.workspace_id === ws.id).slice(0, 3)
  if (!list.length) return <Empty>{t('noMemory')}</Empty>
  return (
    <ul className="flex flex-col gap-1.5">
      {list.map((d) => (
        <li key={d.id}>
          <Link href={`/w/${ws.slug}/docs/${d.id}`} className="flex items-center gap-2 rounded-md text-sm hover:bg-hover/60">
            <DocMark source={d.source} className="size-3.5" />
            <span className="truncate">{d.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

// ---------------- briefing ----------------

function Briefing({ tasks, items, workspaces, now }: { tasks: TaskRow[]; items: MeetingItemRow[]; workspaces: WorkspaceWithRole[]; now: Date }) {
  const t = useTranslations('mesa.briefing')
  const weekAgo = subDays(now, 7).toISOString()
  const risks = tasks.filter((x) => x.status === 'blocked' || (x.status !== 'done' && x.due_date && differenceInCalendarDays(parseISO(x.due_date), now) < 0))
  const decisions = items.filter((i) => i.kind === 'decision' && i.created_at >= weekAgo)
  const wins = tasks
    .filter((x) => x.status === 'done' && (x.completed_at ?? '') >= weekAgo)
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
  const wsKey = new Map(workspaces.map((w) => [w.id, w.key]))
  const { open } = useTaskPanel()

  return (
    <section className="mx-4 mb-6 grid gap-4 rounded-xl bg-highlight px-5 py-4 sm:mx-8 lg:grid-cols-[180px_repeat(3,minmax(0,1fr))]">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-highlight-ink">
          <Sparkles className="size-4" />
          {t('title')}
        </p>
        <p className="mt-0.5 text-xs text-fg-muted">{t('period')}</p>
      </div>
      <div>
        <p className="text-2xs font-semibold uppercase tracking-wider text-danger">{t('risks')}</p>
        {risks.length ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm leading-snug">
            <span>{t('risksCount', { count: risks.length })}</span>
            {risks.slice(0, 4).map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => open(x.id)}
                title={x.title}
                className="inline-flex h-5 items-center gap-1 rounded-md bg-danger-soft px-1.5 font-mono text-2xs font-semibold text-danger hover:opacity-80"
              >
                <StatusIcon status={x.status} className="size-2.5" />
                {taskRef(wsKey.get(x.workspace_id) ?? '', x.number)}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-sm leading-snug">{t('noRisks')}</p>
        )}
      </div>
      <div>
        <p className="text-2xs font-semibold uppercase tracking-wider text-k-decision">{t('decisions')}</p>
        {decisions.length ? (
          <Link href={`/m/${decisions[0].meeting_id}`} className="mt-1 block text-sm leading-snug hover:underline">
            {t('decisionsText', { count: decisions.length, latest: decisions[0].text })}
          </Link>
        ) : (
          <p className="mt-1 text-sm leading-snug">{t('noDecisions')}</p>
        )}
      </div>
      <div>
        <p className="text-2xs font-semibold uppercase tracking-wider text-accent-ink">{t('wins')}</p>
        {wins.length ? (
          <button type="button" onClick={() => open(wins[0].id)} className="mt-1 block text-left text-sm leading-snug hover:underline">
            {t('winsText', { count: wins.length, latest: wins[0].title })}
          </button>
        ) : (
          <p className="mt-1 text-sm leading-snug">{t('noWins')}</p>
        )}
      </div>
    </section>
  )
}
