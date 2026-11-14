'use client'

import { Fragment, useMemo } from 'react'
import { cn } from '@/lib/utils'

const URL_RE = /(https?:\/\/[^\s]+)/g
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Texto de un mensaje o comentario: los links clicables y las menciones resaltadas («@Nombre» de
 * las personas mencionadas). La mención a quien lee resalta más.
 */
export function RichText({ text, mentions = [], me }: { text: string; mentions?: { id: string; name: string }[]; me?: string }) {
  const parts = useMemo(() => {
    const named = mentions.filter((m) => m.name)
    if (!named.length) return [{ text, mention: null as string | null }]
    // los nombres más largos primero: «@Ana María» antes que «@Ana»
    const re = new RegExp(`@(${named.map((m) => escape(m.name)).sort((a, b) => b.length - a.length).join('|')})`, 'g')
    const out: { text: string; mention: string | null }[] = []
    let last = 0
    for (const m of text.matchAll(re)) {
      const at = m.index ?? 0
      if (at > last) out.push({ text: text.slice(last, at), mention: null })
      out.push({ text: m[0], mention: named.find((x) => x.name === m[1])?.id ?? null })
      last = at + m[0].length
    }
    if (last < text.length) out.push({ text: text.slice(last), mention: null })
    return out
  }, [text, mentions])

  return (
    <>
      {parts.map((p, i) =>
        p.mention ? (
          <span
            key={i}
            className={cn(
              'rounded-[4px] px-0.5 font-medium [box-decoration-break:clone]',
              p.mention === me ? 'bg-warning-soft text-mandarina-ink' : 'bg-accent-soft/70 text-accent-ink',
            )}
          >
            {p.text}
          </span>
        ) : (
          <Links key={i} text={p.text} />
        ),
      )}
    </>
  )
}

function Links({ text }: { text: string }) {
  const parts = text.split(URL_RE)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-ink underline decoration-accent-mid/40 underline-offset-2 hover:decoration-accent-mid"
          >
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  )
}
