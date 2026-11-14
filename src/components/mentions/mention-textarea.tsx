'use client'

import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { cn } from '@/lib/utils'

/**
 * Cuadro de texto con menciones: al escribir «@» aparecen las personas que se pueden mencionar
 * (flechas para elegir, Enter o Tab para poner, Esc para cerrar). En el texto queda «@Nombre» y
 * la lista de quiénes se eligió; al enviar, `mentionIds` dice quiénes siguen en el texto.
 */

export type MentionCandidate = { id: string; name: string; avatarUrl: string | null; sub?: string }

const strip = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Las personas elegidas que siguen escritas en el texto (sin repetir). */
export function mentionIds(text: string, picked: MentionCandidate[]) {
  return [...new Set(picked.filter((p) => text.includes(`@${p.name}`)).map((p) => p.id))]
}

type Props = Omit<React.ComponentProps<'textarea'>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (v: string) => void
  candidates: MentionCandidate[]
  picked: MentionCandidate[]
  onPickedChange: (p: MentionCandidate[]) => void
  /** dónde sale la lista: arriba (compositor al pie) o abajo */
  placement?: 'top' | 'bottom'
}

export function MentionTextarea({ value, onValueChange, candidates, picked, onPickedChange, placement = 'top', onKeyDown, onBlur, ref: outerRef, ...props }: Props) {
  const inner = useRef<HTMLTextAreaElement>(null)
  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      inner.current = el
      if (typeof outerRef === 'function') outerRef(el)
      else if (outerRef) outerRef.current = el
    },
    [outerRef],
  )
  const [query, setQuery] = useState<{ start: number; text: string } | null>(null)
  const [index, setIndex] = useState(0)
  const listId = useId()

  // «@algo» justo antes del cursor (al principio o después de un espacio)
  const detect = (el: HTMLTextAreaElement) => {
    const caret = el.selectionStart ?? 0
    if (el.selectionEnd !== caret || !candidates.length) return setQuery(null)
    const m = /(?:^|[\s(])@([^\s@]{0,30})$/u.exec(el.value.slice(0, caret))
    if (!m) return setQuery(null)
    const text = m[1] ?? ''
    setQuery((q) => (q && q.text === text ? q : { start: caret - text.length - 1, text }))
    setIndex(0)
  }

  const matches = useMemo(() => {
    if (!query) return []
    const q = strip(query.text)
    return candidates
      .filter((c) => {
        if (!q) return true
        const name = strip(c.name)
        return name.startsWith(q) || name.split(/\s+/).some((w) => w.startsWith(q))
      })
      .slice(0, 6)
  }, [query, candidates])
  const open = query !== null && matches.length > 0

  const choose = (c: MentionCandidate) => {
    const el = inner.current
    if (!el || !query) return
    const caret = el.selectionStart ?? value.length
    const insert = `@${c.name} `
    onValueChange(value.slice(0, query.start) + insert + value.slice(caret))
    if (!picked.some((p) => p.id === c.id)) onPickedChange([...picked, c])
    const pos = query.start + insert.length
    setQuery(null)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="relative">
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className={cn(
            'popup-motion absolute left-2 z-30 w-72 max-w-[calc(100%-1rem)] rounded-lg border border-line bg-panel p-1 shadow-popover',
            placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-1',
          )}
        >
          {matches.map((c, i) => (
            <li key={c.id} id={`${listId}-${i}`} role="option" aria-selected={i === index}>
              <button
                type="button"
                tabIndex={-1}
                // no robar el foco del cuadro de texto
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setIndex(i)}
                onClick={() => choose(c)}
                className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]', i === index ? 'bg-hover text-fg' : 'text-fg-muted')}
              >
                <Avatar name={c.name} src={c.avatarUrl} seed={c.id} size={20} />
                <span className="min-w-0 truncate font-medium text-fg">{c.name}</span>
                {c.sub ? <span className="ml-auto min-w-0 shrink truncate text-xs text-fg-subtle">{c.sub}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <AutoTextarea
        ref={setRef}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${index}` : undefined}
        onChange={(e) => {
          onValueChange(e.target.value)
          detect(e.target)
        }}
        onSelect={(e) => detect(e.currentTarget)}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              setIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length)
              return
            }
            if ((e.key === 'Enter' || e.key === 'Tab') && !e.nativeEvent.isComposing) {
              e.preventDefault()
              const c = matches[index]
              if (c) choose(c)
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              setQuery(null)
              return
            }
          }
          onKeyDown?.(e)
        }}
        onBlur={(e) => {
          setQuery(null)
          onBlur?.(e)
        }}
        {...props}
      />
    </div>
  )
}
