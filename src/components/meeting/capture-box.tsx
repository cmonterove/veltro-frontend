'use client'

import { useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CornerDownLeft } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Kbd } from '@/components/ui/kbd'
import { activeMention, detectKind, extractDue } from '@/lib/capture'
import { cn } from '@/lib/utils'
import type { MeetingItemKind } from '@/lib/database.types'
import type { Member } from '@/lib/types'
import { KIND_STYLE } from './kinds'

const KINDS: MeetingItemKind[] = ['note', 'decision', 'action', 'question']

/**
 * Captura rápida: escribes una línea y la marcas como nota, decisión, acción o pregunta.
 * Prefijos: "->" acción, "<>" decisión, "??" pregunta. "@nombre" asigna. "hoy", "mañana", "vie" ponen fecha.
 */
export function CaptureBox({
  members,
  onCapture,
  defaultKind = 'note',
  placeholder,
}: {
  members: Member[]
  onCapture: (item: { kind: MeetingItemKind; text: string; assignee_id: string | null; due_date: string | null }) => void
  defaultKind?: MeetingItemKind
  placeholder?: string
}) {
  const t = useTranslations('meeting')
  const tk = useTranslations('meeting.kind')
  const [kind, setKind] = useState<MeetingItemKind>(defaultKind)
  const [text, setText] = useState('')
  const [assignee, setAssignee] = useState<Member | null>(null)
  const [caret, setCaret] = useState(0)
  const [highlight, setHighlight] = useState(0)
  const ref = useRef<HTMLInputElement>(null)

  const mention = activeMention(text, caret)
  const suggestions = useMemo(() => {
    if (!mention) return []
    const q = mention.query.toLowerCase()
    return members.filter((m) => m.full_name.toLowerCase().split(' ').some((p) => p.startsWith(q))).slice(0, 5)
  }, [mention, members])

  // La mención se quita del texto: el responsable se muestra como chip y queda en assignee_id.
  const pick = (m: Member) => {
    if (!mention) return
    const before = text.slice(0, mention.start).replace(/\s+$/, ' ')
    const after = text.slice(caret).trimStart()
    setText(`${before}${after}`)
    setAssignee(m)
    if (kind === 'note') setKind('action')
    requestAnimationFrame(() => {
      const pos = before.length
      ref.current?.setSelectionRange(pos, pos)
      setCaret(pos)
    })
  }

  const submit = () => {
    const { kind: detected, rest } = detectKind(text)
    const finalKind = detected ?? kind
    const { due, rest: clean } = finalKind === 'action' ? extractDue(rest) : { due: null, rest: rest.trim() }
    if (!clean) return
    onCapture({ kind: finalKind, text: clean, assignee_id: finalKind === 'action' ? (assignee?.id ?? null) : null, due_date: due })
    setText('')
    setAssignee(null)
  }

  /** Devuelve cuántos caracteres de prefijo se quitaron (para corregir el cursor). */
  const onChange = (value: string) => {
    const { kind: detected, rest } = detectKind(value)
    if (detected) {
      setKind(detected)
      setText(rest)
      return value.length - rest.length
    }
    setText(value)
    return 0
  }

  return (
    <div className="relative rounded-xl border border-line bg-panel shadow-card focus-within:border-accent">
      <div className="flex items-center gap-1 border-b border-line-soft px-2 py-1.5">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k)
              ref.current?.focus()
            }}
            aria-pressed={kind === k}
            className={cn(
              'inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors',
              kind === k ? KIND_STYLE[k].chip : 'text-fg-muted hover:bg-hover hover:text-fg',
            )}
          >
            {tk(k)}
          </button>
        ))}
        {assignee ? (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-k-action-soft px-2 py-0.5 text-xs text-k-action">
            <Avatar name={assignee.full_name} seed={assignee.id} src={assignee.avatar_url} size={14} />
            {assignee.full_name.split(' ')[0]}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 px-3">
        <input
          ref={ref}
          value={text}
          onChange={(e) => {
            const stripped = onChange(e.target.value)
            setCaret(Math.max(0, (e.target.selectionStart ?? e.target.value.length) - stripped))
            setHighlight(0)
          }}
          onSelect={(e) => setCaret((e.target as HTMLInputElement).selectionStart ?? 0)}
          onKeyDown={(e) => {
            if (suggestions.length) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHighlight((h) => (h + 1) % suggestions.length)
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length)
                return
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                pick(suggestions[highlight])
                return
              }
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
            if (e.key === 'Backspace' && !text && kind !== 'note') setKind('note')
          }}
          placeholder={placeholder ?? t(`placeholder.${kind}`)}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-subtle"
          maxLength={2000}
        />
        <button type="button" onClick={submit} className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg" aria-label={t('capture')}>
          <CornerDownLeft className="size-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft px-3 py-1.5 text-2xs text-fg-subtle">
        <span className="inline-flex items-center gap-1"><Kbd>-&gt;</Kbd> {tk('action')}</span>
        <span className="inline-flex items-center gap-1"><Kbd>&lt;&gt;</Kbd> {tk('decision')}</span>
        <span className="inline-flex items-center gap-1"><Kbd>??</Kbd> {tk('question')}</span>
        <span className="inline-flex items-center gap-1"><Kbd>@</Kbd> {t('hintOwner')}</span>
        <span>{t('hintDate')}</span>
      </div>
      {suggestions.length ? (
        <div className="absolute bottom-full left-3 z-20 mb-1 w-56 rounded-lg border border-line bg-panel p-1 shadow-popover">
          {suggestions.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                pick(m)
              }}
              className={cn('flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm', i === highlight && 'bg-hover')}
            >
              <Avatar name={m.full_name} seed={m.id} src={m.avatar_url} size={18} />
              {m.full_name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
