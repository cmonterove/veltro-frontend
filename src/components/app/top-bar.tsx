'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Maximize2, Search, Sparkles } from 'lucide-react'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip } from '@/components/ui/tooltip'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { track } from '@/lib/telemetry'
import { AI_ENABLED } from '@/lib/features'
import { SpaceSwitcher } from './space-switcher'

/** En Pulso la pregunta se responde ahí mismo (la respuesta flota sobre el tablero); en el resto abre Veltro IA. */
export const ASK_EVENT = 'veltro:ask'
export const ASK_INPUT_ID = 'veltro-ask'

/**
 * La barra de arriba vive sobre el marco: a la izquierda los espacios (en cuál estás y sus secciones), con
 * la IA «Pregúntale a Veltro» al centro (⌘J), y a la derecha el buscador compacto (⌘K), los avisos y la
 * pantalla completa. Solo en escritorio; en el celular cada pantalla trae lo suyo.
 */
export function TopBar({ onSearch, onFullscreen }: { onSearch: () => void; onFullscreen: () => void }) {
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
      {/* a la izquierda, los espacios: en cuál estás y, adentro de uno, sus secciones */}
      <div className="flex min-w-0 flex-1 items-center">
        <SpaceSwitcher />
      </div>
      {AI_ENABLED ? (
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
          className="flex h-11 w-full max-w-[560px] items-center gap-3 rounded-[16px] bg-panel pl-2 pr-2.5 text-fg shadow-[0_0_0_4px_oklch(0.773_0.115_303/0.2),0_14px_32px_-18px_oklch(0.12_0.04_315/0.75)] transition-shadow focus-within:shadow-[0_0_0_4px_oklch(0.773_0.115_303/0.42),0_14px_32px_-18px_oklch(0.12_0.04_315/0.75)]"
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
      ) : null}
      {/* sin la IA, el buscador (abre ⌘K) va compacto a la derecha; en pantallas medianas, solo la lupa */}
      {!AI_ENABLED ? (
        <button
          type="button"
          onClick={onSearch}
          data-tour="search"
          aria-label={tn('search')}
          className="flex h-9 w-9 shrink-0 items-center gap-2 rounded-[11px] bg-panel px-2.5 text-left text-fg shadow-[0_0_0_3px_oklch(0.773_0.115_303/0.16),0_10px_24px_-16px_oklch(0.12_0.04_315/0.7)] outline-none transition-shadow hover:shadow-[0_0_0_3px_oklch(0.773_0.115_303/0.3),0_10px_24px_-16px_oklch(0.12_0.04_315/0.7)] focus-visible:shadow-[0_0_0_3px_oklch(0.773_0.115_303/0.45)] lg:w-56 xl:w-64"
        >
          <Search className="size-4 shrink-0 text-fg-muted" />
          <span className="hidden min-w-0 flex-1 truncate text-sm text-fg-subtle lg:inline">{tn('search')}…</span>
          <Kbd className="hidden lg:inline-flex">⌘K</Kbd>
        </button>
      ) : null}
      <div className="on-frame flex shrink-0 items-center gap-0.5">
        {AI_ENABLED ? (
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
        ) : null}
        <NotificationBell variant="frame" />
        {/* la pantalla actual a toda la ventana, sin el menú ni esta barra (F; Esc para volver) */}
        <Tooltip content={tn('fullscreen')} shortcut={['F']}>
          <button
            type="button"
            onClick={onFullscreen}
            aria-label={tn('fullscreen')}
            className="inline-flex size-9 items-center justify-center rounded-[10px] text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/40"
          >
            <Maximize2 className="size-[17px]" />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
