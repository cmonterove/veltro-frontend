'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search, Sparkles } from 'lucide-react'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip } from '@/components/ui/tooltip'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { track } from '@/lib/telemetry'

/** En Pulso la pregunta se responde ahí mismo (la respuesta flota sobre el tablero); en el resto abre Veltro IA. */
export const ASK_EVENT = 'veltro:ask'
export const ASK_INPUT_ID = 'veltro-ask'

/**
 * La barra de arriba vive sobre el marco: «Pregúntale a Veltro» al centro, siempre a mano (⌘J),
 * y a la derecha el buscador (⌘K) y los avisos. Solo en escritorio; en el celular cada pantalla trae lo suyo.
 */
export function TopBar({ onSearch }: { onSearch: () => void }) {
  const t = useTranslations('pulse.ask')
  const tn = useTranslations('nav')
  const router = useRouter()
  const pathname = usePathname()
  const inputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="hidden h-[60px] shrink-0 items-center gap-3 pl-2 pr-2.5 md:flex">
      <form
        data-tour="ask"
        onSubmit={(e) => {
          e.preventDefault()
          const question = q.trim()
          if (!question) return
          track('feature.assistant_ask', { props: { from: 'topbar' } })
          if (pathname === '/home') window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: question }))
          else router.push(`/veltro?q=${encodeURIComponent(question)}`)
          setQ('')
          inputRef.current?.blur()
        }}
        className="mx-auto flex h-12 w-full max-w-[720px] items-center gap-3 rounded-[16px] bg-panel pl-2 pr-2.5 text-fg shadow-[0_0_0_4px_oklch(0.773_0.115_303/0.2),0_14px_32px_-18px_oklch(0.12_0.04_315/0.75)] transition-shadow focus-within:shadow-[0_0_0_4px_oklch(0.773_0.115_303/0.42),0_14px_32px_-18px_oklch(0.12_0.04_315/0.75)]"
      >
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[11px] bg-accent text-accent-fg">
          <Sparkles className="size-4" />
        </span>
        <label htmlFor={ASK_INPUT_ID} className="shrink-0 text-[15px] font-semibold text-fg">
          {t('title')}
        </label>
        <input
          ref={inputRef}
          id={ASK_INPUT_ID}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('barPlaceholder')}
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-subtle"
        />
        <Kbd>⌘J</Kbd>
      </form>
      <div className="on-frame flex shrink-0 items-center gap-0.5">
        <Tooltip content={tn('search')} shortcut={['⌘', 'K']}>
          <button
            type="button"
            onClick={onSearch}
            data-tour="search"
            aria-label={tn('search')}
            className="inline-flex size-9 items-center justify-center rounded-[10px] text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/40"
          >
            <Search className="size-[17px]" />
          </button>
        </Tooltip>
        <NotificationBell variant="frame" />
      </div>
    </div>
  )
}
