'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { ArrowUpRight, CornerDownLeft, Sparkles } from 'lucide-react'
import { useApp, useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusIcon } from '@/components/tasks/status-icon'
import { useTaskPanel } from '@/lib/hooks'
import { answerQuestion, type AnswerRef } from '@/lib/assistant'
import { track } from '@/lib/telemetry'
import { PRIORITY_WEIGHT } from '@/lib/constants'
import { cn, taskRef } from '@/lib/utils'
import type { MeetingItemRow, MeetingRow, TaskRow } from '@/lib/database.types'
import type { DocSummary } from '@/lib/types'

const MAX_FOCUS = 5

export function FocusPanel({
  loading,
  tasks,
  items,
  meetings,
  docs,
  scopeIds,
}: {
  loading?: boolean
  tasks: TaskRow[]
  items: MeetingItemRow[]
  meetings: MeetingRow[]
  docs: DocSummary[]
  scopeIds: string[]
}) {
  const t = useTranslations('pulse.focus')
  const { user } = useApp()
  const wsMap = useWorkspaceMap()
  const memberMap = useMemberMap()
  const { open } = useTaskPanel()
  const now = new Date()

  const meetingTitle = useMemo(() => new Map(meetings.map((m) => [m.id, m.title])), [meetings])
  const docTitle = useMemo(() => new Map(docs.map((d) => [d.id, d.title])), [docs])

  const focus = useMemo(() => {
    const mine = tasks.filter((x) => x.assignee_id === user.id && x.status !== 'done' && scopeIds.includes(x.workspace_id))
    const scored = mine
      .map((x) => {
        const diff = x.due_date ? differenceInCalendarDays(parseISO(x.due_date), now) : 99
        const score = (diff < 0 ? 1000 - diff : diff === 0 ? 500 : 0) + (x.status === 'blocked' ? 200 : 0) + PRIORITY_WEIGHT[x.priority] * 10
        return { x, diff, score }
      })
      .filter((s) => s.score >= 500 || s.x.status === 'in_progress')
      .sort((a, b) => b.score - a.score)
    return scored.slice(0, MAX_FOCUS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, user.id, scopeIds])

  const overdueCount = focus.filter((f) => f.diff < 0).length

  return (
    <aside className="flex flex-col gap-8 border-t border-line bg-sidebar/50 px-5 py-6 scrollbar-thin @min-[1100px]/pulse:sticky @min-[1100px]/pulse:top-0 @min-[1100px]/pulse:h-dvh @min-[1100px]/pulse:overflow-y-auto @min-[1100px]/pulse:border-t-0">
      <section>
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">{t('title')}</h2>
          {overdueCount ? <span className="font-mono text-xs text-danger">{t('overdue', { count: overdueCount })}</span> : null}
        </div>
        <p className="mb-3 text-xs text-fg-muted">{t('hint', { max: MAX_FOCUS })}</p>
        {loading ? (
          <div className="flex flex-col gap-3 py-1" aria-busy>
            {[72, 88, 64].map((w) => (
              <div key={w} className="flex gap-3">
                <Skeleton className="h-3 w-5" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3.5" style={{ width: `${w}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : focus.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong px-3 py-4 text-sm text-fg-muted">{t('empty')}</p>
        ) : (
          <ol className="flex flex-col">
            {focus.map(({ x, diff }, i) => {
              const ws = wsMap.get(x.workspace_id)
              const origin = x.meeting_id ? meetingTitle.get(x.meeting_id) : x.doc_id ? docTitle.get(x.doc_id) : null
              const owner = x.assignee_id ? memberMap.get(x.assignee_id) : undefined
              return (
                <li key={x.id} className="border-b border-line-soft last:border-0">
                  <button type="button" onClick={() => open(x.id)} className="flex w-full gap-3 rounded-md py-2.5 text-left hover:bg-hover/60">
                    <span className="w-5 shrink-0 pt-0.5 font-mono text-2xs text-fg-subtle">{String(i + 1).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-xs">
                        <StatusIcon status={x.status} className="size-3" />
                        <span className="font-mono text-fg-subtle">{ws ? taskRef(ws.key, x.number) : ''}</span>
                        <span className={cn('font-medium', diff < 0 ? 'text-danger' : diff === 0 ? 'text-mandarina-ink' : 'text-fg-muted')}>
                          {diff < 0 ? t('lateDays', { count: -diff }) : diff === 0 ? t('dueToday') : x.status === 'in_progress' ? t('inProgress') : ''}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-sm font-medium leading-snug">{x.title}</span>
                      {origin ? <span className="mt-0.5 block truncate text-xs text-fg-muted">{t('from', { origin })}</span> : null}
                    </span>
                    {owner && owner.id !== user.id ? <Avatar name={owner.full_name} seed={owner.id} size={18} /> : null}
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <AskPanel tasks={tasks} items={items} meetings={meetings} docs={docs} />
    </aside>
  )
}

function AskPanel({ tasks, items, meetings, docs }: { tasks: TaskRow[]; items: MeetingItemRow[]; meetings: MeetingRow[]; docs: DocSummary[] }) {
  const t = useTranslations('pulse.ask')
  const ta = useTranslations('assistant')
  const wsMap = useWorkspaceMap()
  const [q, setQ] = useState('')
  const [asked, setAsked] = useState<{ q: string; text: string; refs: AnswerRef[] } | null>(null)
  const { open } = useTaskPanel()

  const ask = (question: string) => {
    track('feature.assistant_ask')
    const meetingById = new Map(meetings.map((m) => [m.id, m]))
    const res = answerQuestion({
      question,
      tasks: tasks.map((x) => {
        const ws = wsMap.get(x.workspace_id)
        return { ...x, ref: ws ? taskRef(ws.key, x.number) : '', href: x.id }
      }),
      decisions: items
        .filter((i) => i.kind === 'decision')
        .map((i) => ({ ...i, meetingTitle: meetingById.get(i.meeting_id)?.title ?? '', href: `/m/${i.meeting_id}` })),
      docs: docs.map((d) => ({ id: d.id, title: d.title, href: `/w/${wsMap.get(d.workspace_id)?.slug}/docs/${d.id}` })),
      meetings: meetings.map((m) => ({ id: m.id, title: m.title, href: `/m/${m.id}` })),
      t: (k, v) => ta(k, v),
    })
    setAsked({ q: question, ...res })
  }

  const examples = [t('example1'), t('example2'), t('example3')]

  return (
    <section>
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-accent" />
        {t('title')}
      </h2>
      <p className="mb-3 mt-1 text-xs text-fg-muted">{t('hint')}</p>

      {asked ? (
        <div className="mb-3 rounded-xl bg-panel p-3 shadow-card">
          <p className="text-xs font-medium text-fg-muted">{asked.q}</p>
          <p className="mt-1.5 text-sm leading-relaxed">{asked.text}</p>
          {asked.refs.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {asked.refs.map((r) =>
                r.kind === 'task' ? (
                  <button key={r.id} type="button" onClick={() => open(r.id)} className="inline-flex h-6 items-center rounded-md bg-k-action-soft px-2 font-mono text-2xs font-semibold text-k-action hover:opacity-80">
                    {r.label}
                  </button>
                ) : (
                  <Link key={r.id} href={r.href} className="inline-flex h-6 max-w-48 items-center gap-1 rounded-md bg-hover px-2 text-2xs font-medium text-fg-muted hover:text-fg">
                    <span className="truncate">{r.label}</span>
                    <ArrowUpRight className="size-3 shrink-0" />
                  </Link>
                ),
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (q.trim()) {
            ask(q.trim())
            setQ('')
          }
        }}
        className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3 focus-within:border-accent"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('placeholder')} className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle" />
        <button type="submit" className="text-fg-subtle hover:text-fg" aria-label={t('send')}>
          <CornerDownLeft className="size-4" />
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {examples.map((ex) => (
          <button key={ex} type="button" onClick={() => ask(ex)} className="rounded-full border border-line bg-panel px-2.5 py-1 text-xs text-fg-muted hover:border-accent hover:text-fg">
            {ex}
          </button>
        ))}
      </div>
    </section>
  )
}
