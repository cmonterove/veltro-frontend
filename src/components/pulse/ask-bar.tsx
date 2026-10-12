'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowUpRight, CornerDownLeft, Maximize2, Sparkles, X } from 'lucide-react'
import { useApp, useWorkspaceMap } from '@/components/app/app-context'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip } from '@/components/ui/tooltip'
import { isTypingTarget } from '@/lib/hooks'
import { askVeltro, type VeltroAnswer } from '@/lib/assistant/intents'
import { buildVeltroInput } from '@/lib/assistant/use-veltro'
import { useVaultFiles } from '@/lib/queries/attachments'
import { track } from '@/lib/telemetry'
import { taskRef } from '@/lib/utils'
import type { MeetingItemRow, MeetingRow, TaskRow } from '@/lib/database.types'
import type { DocSummary } from '@/lib/types'
import { useOpenTask } from '@/lib/use-open-task'

const veltroHref = (q?: string) => (q ? `/veltro?q=${encodeURIComponent(q)}` : '/veltro')

/**
 * "Pregúntale a Veltro": el centro de Pulso. Responde con el mismo motor que Veltro IA; la respuesta
 * flota sobre la pantalla para no mover el tablero, y cualquier pregunta se puede expandir a la vista completa.
 */
export function AskBar({ tasks, items, meetings, docs }: { tasks: TaskRow[]; items: MeetingItemRow[]; meetings: MeetingRow[]; docs: DocSummary[] }) {
  const t = useTranslations('pulse.ask')
  const ta = useTranslations('assistant')
  const router = useRouter()
  const { members } = useApp()
  const wsMap = useWorkspaceMap()
  const { open } = useOpenTask()
  const inputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [asked, setAsked] = useState<{ q: string; a: VeltroAnswer } | null>(null)

  // "/" lleva el foco a la pregunta desde cualquier parte de Pulso; Esc cierra la respuesta
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !isTypingTarget(e.target) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape') setAsked(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const { data: files } = useVaultFiles()
  const input = useMemo(() => buildVeltroInput({ tasks, items, meetings, docs, wsMap, members, files }), [tasks, items, meetings, docs, wsMap, members, files])
  const taskById = useMemo(() => new Map(tasks.map((x) => [x.id, x])), [tasks])

  const ask = (question: string) => {
    track('feature.assistant_ask', { props: { from: 'pulse' } })
    setAsked({ q: question, a: askVeltro({ question, ...input, t: (k, v) => ta(k, v) }) })
  }

  const expand = () => {
    track('feature.veltro_expand')
    router.push(veltroHref(q.trim() || undefined))
  }

  // Sugerencias armadas con lo que hay en la cuenta (reuniones y docs recientes), nunca con ejemplos fijos
  const examples = useMemo(() => {
    const recent = [...meetings].sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    const closed = recent.filter((m) => m.phase === 'closed')
    const out: string[] = [t('suggest.week')]
    if (closed[0]) out.push(t('suggest.decided', { title: closed[0].title }))
    const pending = recent.find((m) => m.id !== closed[0]?.id)
    if (pending) out.push(t('suggest.pending', { title: pending.title }))
    const doc = docs.find((d) => d.title)
    if (doc) out.push(t('suggest.doc', { title: doc.title }))
    return out
  }, [meetings, docs, t])

  const shownTasks = asked ? asked.a.taskIds.slice(0, 6).map((id) => taskById.get(id)).filter(Boolean) as TaskRow[] : []
  const hiddenTasks = asked ? asked.a.taskIds.length - shownTasks.length : 0

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl border border-accent/30 bg-panel shadow-card transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-[0_0_0_4px_color-mix(in_oklch,var(--accent)_14%,transparent)]">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (q.trim()) {
              ask(q.trim())
              setQ('')
            }
          }}
          className="flex h-14 items-center gap-3 pl-3 pr-2"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg">
            <Sparkles className="size-4" />
          </span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('heroPlaceholder')}
            aria-label={t('title')}
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-subtle"
          />
          {q ? (
            <button type="submit" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg hover:bg-accent-hover">
              {t('send')}
              <CornerDownLeft className="size-3.5" />
            </button>
          ) : (
            <span className="hidden shrink-0 items-center gap-1.5 text-xs text-fg-subtle sm:flex">
              {t('focusHint')}
              <Kbd>/</Kbd>
            </span>
          )}
          <span className="h-6 w-px shrink-0 bg-line" aria-hidden />
          <Tooltip content={t('expand')} shortcut={['G', 'V']}>
            <button
              type="button"
              onClick={expand}
              aria-label={t('expand')}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-fg-muted transition-colors hover:bg-accent-soft hover:text-accent-ink"
            >
              <Maximize2 className="size-4" />
              <span className="hidden md:inline">{t('expandShort')}</span>
            </button>
          </Tooltip>
        </form>
        <div className="flex items-center gap-1.5 overflow-x-auto border-t border-line-soft bg-sidebar/40 px-3 py-2 scrollbar-thin">
          <span className="shrink-0 pr-1 text-2xs font-medium uppercase tracking-wide text-fg-subtle">{t('try')}</span>
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => ask(ex)}
              className="max-w-80 shrink-0 truncate rounded-full border border-line bg-panel px-2.5 py-1 text-xs text-fg-muted transition-colors hover:border-accent hover:text-fg"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {asked ? (
        <div className="popup-motion absolute inset-x-0 top-full z-30 mt-2 flex max-h-[min(400px,55vh)] flex-col overflow-hidden rounded-2xl border border-accent/30 bg-panel shadow-lift">
          <div className="flex min-h-0 items-start gap-3 overflow-y-auto p-4 scrollbar-thin">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-highlight text-highlight-ink">
              <Sparkles className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-fg-muted">{asked.q}</p>
              <p className="mt-1 max-w-[75ch] text-[15px] leading-relaxed text-fg">{asked.a.text}</p>
              {shownTasks.length || asked.a.refs.length ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {shownTasks.map((x) => {
                    const ws = wsMap.get(x.workspace_id)
                    return (
                      <button
                        key={x.id}
                        type="button"
                        onClick={() => open(x.id)}
                        title={x.title}
                        className="inline-flex h-6 max-w-64 items-center gap-1.5 rounded-md bg-k-action-soft px-2 text-2xs text-k-action hover:opacity-80"
                      >
                        <span className="shrink-0 font-mono font-semibold">{ws ? taskRef(ws.key, x.number) : ''}</span>
                        <span className="truncate">{x.title}</span>
                      </button>
                    )
                  })}
                  {hiddenTasks > 0 ? <span className="inline-flex h-6 items-center px-1 text-2xs text-fg-subtle">{t('moreTasks', { count: hiddenTasks })}</span> : null}
                  {asked.a.refs.map((r) => (
                    <Link key={`${r.kind}-${r.id}`} href={r.href} className="inline-flex h-6 max-w-64 items-center gap-1 rounded-md bg-hover px-2 text-2xs font-medium text-fg-muted hover:text-fg">
                      <span className="truncate">{r.label}</span>
                      <ArrowUpRight className="size-3 shrink-0" />
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setAsked(null)}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
              aria-label={t('dismiss')}
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line-soft bg-sidebar/40 px-4 py-2">
            <span className="hidden text-2xs text-fg-subtle sm:inline">{t('continueHint')}</span>
            <Link
              href={veltroHref(asked.q)}
              onClick={() => track('feature.veltro_expand')}
              className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-accent-ink hover:bg-accent-soft"
            >
              <Maximize2 className="size-3.5" />
              {t('continue')}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
