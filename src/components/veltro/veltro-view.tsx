'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { motion } from 'motion/react'
import { formatDistanceToNowStrict } from 'date-fns'
import { ArrowUp, ArrowUpRight, CalendarCheck2, CircleAlert, MessageSquarePlus, OctagonPause, Sparkles, SunMedium, Trash2, UserRound, FileText, Mic, Paperclip } from 'lucide-react'
import { useApp, useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { AvatarStack } from '@/components/ui/avatar'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { StatusIcon } from '@/components/tasks/status-icon'
import { DueDate } from '@/components/tasks/due-date'
import { useLocalStorage } from '@/lib/hooks'
import { useVeltro } from '@/lib/assistant/use-veltro'
import type { VeltroAnswer } from '@/lib/assistant/intents'
import { useDateLocale } from '@/lib/dates'
import { track } from '@/lib/telemetry'
import { cn, taskRef } from '@/lib/utils'
import type { TaskRow } from '@/lib/database.types'
import { useOpenTask } from '@/lib/use-open-task'
import { assigneesOf } from '@/lib/assignees'

type Turn = { id: string; q: string; a: VeltroAnswer; at: string }
type Thread = { id: string; title: string; updatedAt: string; turns: Turn[] }

const MAX_THREADS = 30

/** Veltro IA: conversaciones con el asistente sobre todo lo que pasa en tus espacios. */
export function VeltroView() {
  const t = useTranslations('veltro')
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const locale = useDateLocale()
  const { profile, members } = useApp()
  const veltro = useVeltro()
  // Las conversaciones quedan en este navegador (comodidad personal); los datos viven en la base.
  const [threads, setThreads] = useLocalStorage<Thread[]>('veltro:ai-threads', [])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const active = threads.find((th) => th.id === activeId) ?? null
  // pregunta que llegó por ?q= y espera a que carguen los datos
  const incoming = params.get('q')

  // si los datos todavía cargan, la pregunta espera (antes respondía "no encontré nada")
  const [queued, setQueued] = useState<{ q: string; threadId: string | null } | null>(null)
  const send = (question: string, threadId: string | null = activeId) => {
    const q = question.trim()
    if (!q) return
    if (!veltro.ready) {
      setQueued({ q, threadId })
      setDraft('')
      return
    }
    track('feature.assistant_ask', { props: { from: 'veltro' } })
    const turn: Turn = { id: crypto.randomUUID(), q, a: veltro.ask(q), at: new Date().toISOString() }
    const id = threadId && threads.some((th) => th.id === threadId) ? threadId : crypto.randomUUID()
    setThreads((prev) => {
      const existing = prev.find((th) => th.id === id)
      const next: Thread = existing
        ? { ...existing, turns: [...existing.turns, turn], updatedAt: turn.at }
        : { id, title: q.slice(0, 80), updatedAt: turn.at, turns: [turn] }
      return [next, ...prev.filter((th) => th.id !== id)].slice(0, MAX_THREADS)
    })
    setActiveId(id)
    setDraft('')
  }

  // Llegar desde Pulso con una pregunta (?q=): se responde en una conversación nueva
  const handledQ = useRef(false)
  useEffect(() => {
    const q = params.get('q')
    if (!q || handledQ.current || !veltro.ready) return
    handledQ.current = true
    send(q, null)
    router.replace(pathname, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, veltro.ready])

  useEffect(() => {
    if (!queued || !veltro.ready) return
    setQueued(null)
    send(queued.q, queued.threadId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued, veltro.ready])

  // bajar al último mensaje
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [activeId, active?.turns.length])

  const suggestions = useMemo(() => {
    const recent = [...veltro.meetings].sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    const closed = recent.find((m) => m.phase === 'closed')
    const someone = members.find((m) => m.id !== profile.id)
    const out: { icon: React.ReactNode; text: string }[] = [
      { icon: <SunMedium className="size-4" />, text: t('suggest.week') },
      { icon: <OctagonPause className="size-4" />, text: t('suggest.blocked') },
      { icon: <CircleAlert className="size-4" />, text: t('suggest.overdue') },
      { icon: <CalendarCheck2 className="size-4" />, text: t('suggest.today') },
    ]
    if (closed) out.push({ icon: <Mic className="size-4" />, text: t('suggest.decided', { title: closed.title }) })
    if (someone) out.push({ icon: <UserRound className="size-4" />, text: t('suggest.person', { name: someone.full_name.split(' ')[0] }) })
    return out
  }, [veltro.meetings, members, profile.id, t])

  return (
    <div className="flex h-full min-h-0">
      {/* conversaciones */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-sidebar/40 lg:flex">
        <div className="p-3">
          <button
            type="button"
            onClick={() => {
              setActiveId(null)
              inputRef.current?.focus()
            }}
            className="flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-panel px-3 text-sm font-medium text-fg transition-colors hover:border-accent"
          >
            <MessageSquarePlus className="size-4 text-accent" />
            {t('newChat')}
          </button>
        </div>
        <p className="px-4 pb-1 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">{t('history')}</p>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 scrollbar-thin">
          {threads.length === 0 ? <li className="px-2 py-2 text-xs text-fg-subtle">{t('noHistory')}</li> : null}
          {threads.map((th) => (
            <li key={th.id} className="group/th relative">
              <button
                type="button"
                onClick={() => setActiveId(th.id)}
                className={cn('flex w-full flex-col rounded-md px-2 py-1.5 pr-7 text-left hover:bg-hover', activeId === th.id && 'bg-accent-soft hover:bg-accent-soft')}
              >
                <span className={cn('truncate text-sm', activeId === th.id ? 'font-medium text-accent-ink' : 'text-fg')}>{th.title}</span>
                <span className="text-2xs text-fg-subtle">
                  {Date.now() - new Date(th.updatedAt).getTime() < 60_000 ? t('justNow') : formatDistanceToNowStrict(new Date(th.updatedAt), { addSuffix: true, locale })}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setThreads((prev) => prev.filter((x) => x.id !== th.id))
                  if (activeId === th.id) setActiveId(null)
                }}
                className="absolute right-1 top-1.5 inline-flex size-6 items-center justify-center rounded-md text-fg-subtle opacity-0 hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover/th:opacity-100"
                aria-label={t('deleteChat')}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* conversación */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4 sm:px-6">
          <span className="flex size-6 items-center justify-center rounded-md bg-accent text-accent-fg">
            <Sparkles className="size-3.5" />
          </span>
          <h1 className="text-sm font-semibold">{t('title')}</h1>
          <span className="hidden truncate text-xs text-fg-subtle sm:inline">· {t('subtitle')}</span>
          {active ? (
            <button type="button" onClick={() => setActiveId(null)} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-fg-muted hover:bg-hover hover:text-fg lg:hidden">
              <MessageSquarePlus className="size-3.5" />
              {t('newChat')}
            </button>
          ) : null}
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto w-full max-w-[780px] px-4 py-8 sm:px-6">
            {(incoming || queued) && !veltro.ready ? (
              <div className="flex flex-col gap-4">
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-[15px] text-fg">{queued?.q ?? incoming}</div>
                <div className="flex items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg">
                    <Sparkles className="size-3.5" />
                  </span>
                  <span className="flex items-center gap-1" aria-label={t('thinking')}>
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="size-1.5 rounded-full bg-fg-subtle"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </span>
                </div>
              </div>
            ) : !active ? (
              <div className="flex flex-col items-center pt-[6vh] text-center">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-card">
                  <Sparkles className="size-7" />
                </span>
                <h2 className="mt-5 font-brand text-[30px] font-semibold tracking-[-0.03em]">{t('emptyTitle', { name: profile.full_name.split(' ')[0] })}</h2>
                <p className="mt-1.5 max-w-md text-[15px] text-fg-muted">{t('emptyHint')}</p>
                <div className="mt-8 grid w-full grid-cols-1 gap-2 text-left sm:grid-cols-2">
                  {suggestions.map((s) => (
                    <button
                      key={s.text}
                      type="button"
                      disabled={!veltro.ready}
                      onClick={() => send(s.text, null)}
                      className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3.5 py-3 text-left text-sm text-fg transition-colors hover:border-accent disabled:opacity-60"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-highlight text-highlight-ink">{s.icon}</span>
                      <span className="min-w-0 flex-1 truncate">{s.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                {active.turns.map((turn) => (
                  <TurnView key={turn.id} turn={turn} tasks={veltro.tasks} onAsk={(q) => send(q)} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* composer */}
        <div className="shrink-0 border-t border-line bg-canvas/95 px-4 py-4 sm:px-6">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(draft)
            }}
            className="mx-auto flex w-full max-w-[780px] items-end gap-2 rounded-2xl border border-accent/30 bg-panel p-2 pl-4 shadow-card transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-[0_0_0_4px_color-mix(in_oklch,var(--accent)_14%,transparent)]"
          >
            <AutoTextarea
              ref={inputRef}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(draft)
                }
              }}
              placeholder={active ? t('followPlaceholder') : t('placeholder')}
              aria-label={t('title')}
              className="max-h-40 min-h-9 overflow-y-auto bg-transparent py-2 text-[15px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-40"
              aria-label={t('send')}
            >
              <ArrowUp className="size-4" />
            </button>
          </form>
          <p className="mx-auto mt-1.5 max-w-[780px] px-1 text-2xs text-fg-subtle">{t('composerHint')}</p>
        </div>
      </main>
    </div>
  )
}

function TurnView({ turn, tasks, onAsk }: { turn: Turn; tasks: TaskRow[]; onAsk: (q: string) => void }) {
  const t = useTranslations('veltro')
  const byId = useMemo(() => new Map(tasks.map((x) => [x.id, x])), [tasks])
  const list = turn.a.taskIds.map((id) => byId.get(id)).filter(Boolean) as TaskRow[]
  return (
    <div className="flex flex-col gap-4">
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-[15px] text-fg">{turn.q}</div>
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }} className="flex gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg">
          <Sparkles className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-relaxed text-fg">{turn.a.text}</p>

          {list.length ? (
            <ul className="mt-3 overflow-hidden rounded-xl border border-line bg-panel">
              {list.map((x) => (
                <TaskMini key={x.id} task={x} />
              ))}
            </ul>
          ) : null}

          {turn.a.refs.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {turn.a.refs.map((r) => (
                <Link key={`${r.kind}-${r.id}`} href={r.href} className="inline-flex h-7 max-w-72 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg-muted transition-colors hover:border-accent hover:text-fg">
                  {r.kind === 'doc' ? <FileText className="size-3.5 shrink-0" /> : r.kind === 'file' ? <Paperclip className="size-3.5 shrink-0" /> : <Mic className="size-3.5 shrink-0" />}
                  <span className="truncate">{r.label}</span>
                  <ArrowUpRight className="size-3 shrink-0" />
                </Link>
              ))}
            </div>
          ) : null}

          {turn.a.followUps.length ? (
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">{t('followUp')}</span>
              {turn.a.followUps.map((f) => (
                <button key={f} type="button" onClick={() => onAsk(f)} className="rounded-full border border-line px-2.5 py-1 text-xs text-fg-muted transition-colors hover:border-accent hover:text-fg">
                  {f}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </motion.div>
    </div>
  )
}

function TaskMini({ task }: { task: TaskRow }) {
  const { open } = useOpenTask()
  const ws = useWorkspaceMap().get(task.workspace_id)
  const memberMap = useMemberMap()
  const owners = assigneesOf(task).flatMap((id) => memberMap.get(id) ?? [])
  return (
    <li className="border-b border-line-soft last:border-0">
      <button type="button" onClick={() => open(task.id)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-hover/50">
        <StatusIcon status={task.status} />
        <span className="w-14 shrink-0 font-mono text-2xs text-fg-subtle">{ws ? taskRef(ws.key, task.number) : ''}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-fg">{task.title}</span>
        {task.due_date ? <DueDate due={task.due_date} done={task.status === 'done'} className="shrink-0" /> : null}
        <AvatarStack people={owners} size={18} ring="panel" />
      </button>
    </li>
  )
}
