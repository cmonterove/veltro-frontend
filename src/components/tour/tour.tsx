'use client'

import { createContext, use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, ArrowRight, CalendarDays, Sparkles, X } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { LogoMark } from '@/components/app/logo'
import { KindChip } from '@/components/meeting/kinds'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { detectKind, extractDue } from '@/lib/capture'
import { useDateLocale } from '@/lib/dates'
import { track } from '@/lib/telemetry'
import { cn } from '@/lib/utils'

/**
 * Recorrido de bienvenida: ilumina cada parte real de la app y explica para qué sirve.
 * Sale solo la primera vez que alguien entra a Pulso (por persona y navegador) y se repite desde
 * el menú de la persona o ⌘K. Los pasos se anclan a elementos con `data-tour="..."`; si el
 * elemento no está a la vista (celular, barra colapsada a medias), la tarjeta va centrada.
 */

type Placement = 'right' | 'bottom'
type Step = { id: string; target?: string; placement?: Placement; interactive?: 'notation' }

// En orden de lectura: primero Pulso de arriba abajo y después el menú de arriba abajo,
// para que el foco no salte de un lado a otro. La notación va pegada a las reuniones.
const STEPS: Step[] = [
  { id: 'welcome' },
  { id: 'ask', target: 'ask', placement: 'bottom' },
  { id: 'counters', target: 'counters', placement: 'bottom' },
  { id: 'search', target: 'search', placement: 'right' },
  { id: 'mesa', target: 'nav-mesa', placement: 'right' },
  { id: 'meetings', target: 'nav-calendar', placement: 'right' },
  { id: 'notation', interactive: 'notation' },
  { id: 'tasks', target: 'nav-tasks', placement: 'right' },
  { id: 'vault', target: 'nav-vault', placement: 'right' },
  { id: 'pasillo', target: 'nav-chat', placement: 'right' },
  { id: 'spaces', target: 'spaces', placement: 'right' },
]

const storageKey = (userId: string) => `veltro:tour:v1:${userId}`
const PAD = 6
const GAP = 14
const MARGIN = 12

type TourApi = { start: () => void }
const TourContext = createContext<TourApi | null>(null)

/** Para abrir el recorrido desde cualquier parte (menú de la persona, ⌘K). */
export function useTour() {
  return use(TourContext) ?? { start: () => {} }
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { user } = useApp()
  const pathname = usePathname()
  const router = useRouter()
  const [step, setStep] = useState<number | null>(null)

  // la primera vez en Pulso arranca solo, cuando la pantalla ya cargó
  useEffect(() => {
    if (pathname !== '/home' || step !== null) return
    let seen: string | null = 'unknown'
    try {
      seen = localStorage.getItem(storageKey(user.id))
    } catch {
      // sin almacenamiento (modo privado estricto): mejor no insistir en cada visita
    }
    if (seen) return
    const id = window.setTimeout(() => setStep(0), 1100)
    return () => window.clearTimeout(id)
  }, [pathname, user.id, step])

  const close = useCallback(
    (how: 'done' | 'skipped') => {
      try {
        localStorage.setItem(storageKey(user.id), how)
      } catch {}
      setStep(null)
      track(how === 'done' ? 'feature.tour_done' : 'feature.tour_skipped')
    },
    [user.id],
  )

  const api = useMemo<TourApi>(
    () => ({
      start: () => {
        if (pathname !== '/home') router.push('/home')
        setStep(0)
        track('feature.tour_start')
      },
    }),
    [pathname, router],
  )

  return (
    <TourContext value={api}>
      {children}
      {step !== null ? <TourOverlay step={step} onStep={setStep} onClose={close} /> : null}
    </TourContext>
  )
}

/** El primer elemento visible con ese ancla (el menú del celular también lo tiene, pero escondido). */
function findTarget(name: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    if (el.closest('[inert]')) continue
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight) return el
  }
  return null
}

type Box = { top: number; left: number; width: number; height: number }
const sameBox = (a: Box | null, b: Box | null) => a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height)

function TourOverlay({ step, onStep, onClose }: { step: number; onStep: (n: number) => void; onClose: (how: 'done' | 'skipped') => void }) {
  const t = useTranslations('tour')
  const s = STEPS[step]
  const last = step === STEPS.length - 1
  const [box, setBox] = useState<Box | null>(null)
  const [card, setCard] = useState({ width: 360, height: 220 })
  const [viewport, setViewport] = useState({ width: 1200, height: 800 })
  const cardRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)

  // sigue al elemento: si se mueve (scroll, carga, cambio de tamaño) el foco va con él
  useLayoutEffect(() => {
    if (!s.target) {
      setBox(null)
      return
    }
    findTarget(s.target)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    let raf = 0
    const measure = () => {
      const el = findTarget(s.target!)
      const r = el?.getBoundingClientRect()
      const next = r ? { top: Math.round(r.top) - PAD, left: Math.round(r.left) - PAD, width: Math.round(r.width) + PAD * 2, height: Math.round(r.height) + PAD * 2 } : null
      setBox((prev) => (sameBox(prev, next) ? prev : next))
      raf = requestAnimationFrame(measure)
    }
    measure()
    return () => cancelAnimationFrame(raf)
  }, [s.target])

  useLayoutEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setCard({ width: el.offsetWidth, height: el.offsetHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // cada paso nuevo deja el foco en el botón principal (o en el campo, si es el paso para probar)
  useEffect(() => {
    if (s.interactive) return
    primaryRef.current?.focus({ preventScroll: true })
  }, [step, s.interactive])

  const next = () => (last ? onClose('done') : onStep(step + 1))
  const back = () => step > 0 && onStep(step - 1)

  const onKeyDown = (e: React.KeyboardEvent) => {
    const typing = e.target instanceof HTMLInputElement
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose('skipped')
    } else if (e.key === 'ArrowRight' && !typing) {
      e.preventDefault()
      next()
    } else if (e.key === 'ArrowLeft' && !typing) {
      e.preventDefault()
      back()
    } else if (e.key === 'Tab') {
      // el foco no sale de la tarjeta mientras dura el recorrido
      const items = cardRef.current?.querySelectorAll<HTMLElement>('button, input')
      if (!items?.length) return
      const first = items[0]
      const lastItem = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  // dónde va la tarjeta: al lado del elemento si cabe; si no, debajo; sin elemento, al centro
  const pos = useMemo(() => {
    const vw = viewport.width
    const vh = viewport.height
    const clampX = (x: number) => Math.min(Math.max(x, MARGIN), vw - card.width - MARGIN)
    const clampY = (y: number) => Math.min(Math.max(y, MARGIN), vh - card.height - MARGIN)
    if (!box || vw < 640) return { top: vh < 640 || vw < 640 ? Math.max(MARGIN, vh - card.height - MARGIN) : clampY((vh - card.height) / 2), left: clampX((vw - card.width) / 2) }
    const fitsRight = box.left + box.width + GAP + card.width + MARGIN <= vw
    if (s.placement === 'right' && fitsRight) return { top: clampY(box.top + box.height / 2 - card.height / 2), left: box.left + box.width + GAP }
    const below = box.top + box.height + GAP
    if (below + card.height + MARGIN <= vh) return { top: below, left: clampX(box.left) }
    return { top: clampY(box.top - GAP - card.height), left: clampX(box.left) }
  }, [box, card, viewport, s.placement])

  const titleId = `tour-title-${s.id}`

  return (
    <div className="fixed inset-0 z-[90]" onKeyDown={onKeyDown}>
      {/* atrapa los clics: durante el recorrido la app no se toca */}
      <div className="absolute inset-0" aria-hidden onClick={() => primaryRef.current?.focus()} />
      {box ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-accent ring-offset-2 ring-offset-transparent transition-[top,left,width,height] duration-300 ease-[var(--ease-out-quart)]"
          style={{ ...box, boxShadow: '0 0 0 9999px oklch(0.16 0.03 290 / 0.55)' }}
        />
      ) : (
        <div aria-hidden className="pointer-events-none absolute inset-0 animate-in fade-in bg-[oklch(0.16_0.03_290/0.55)] duration-200" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute w-[min(380px,calc(100vw-24px))] rounded-2xl border border-line bg-panel text-fg shadow-lift transition-[top,left] duration-300 ease-[var(--ease-out-quart)]"
        style={{ top: pos.top, left: pos.left }}
      >
        <div key={s.id} className="animate-in fade-in slide-in-from-bottom-1 px-5 pb-4 pt-5 duration-300">
          {s.id === 'welcome' ? (
            <span className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-accent-soft">
              <LogoMark className="size-7" cut="var(--accent-soft)" />
            </span>
          ) : null}
          <div className="flex items-start gap-3">
            <h2 id={titleId} className="min-w-0 flex-1 font-brand text-lg font-semibold leading-snug tracking-[-0.02em]">
              {t(`steps.${s.id}.title`)}
            </h2>
            <button
              type="button"
              onClick={() => onClose('skipped')}
              className="-mr-1.5 -mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
              aria-label={t('close')}
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{t(`steps.${s.id}.body`)}</p>
          {s.interactive === 'notation' ? <NotationTry /> : null}
          {last ? <p className="mt-3 rounded-lg bg-hover px-3 py-2 text-xs text-fg-muted">{t('replayHint')}</p> : null}
        </div>

        <div className="flex items-center gap-2 border-t border-line px-5 py-3">
          {s.id === 'welcome' ? (
            <>
              <button type="button" onClick={() => onClose('skipped')} className="text-sm text-fg-muted hover:text-fg">
                {t('later')}
              </button>
              <Button ref={primaryRef} variant="primary" size="sm" className="ml-auto" onClick={next}>
                <Sparkles />
                {t('start')}
              </Button>
            </>
          ) : (
            <>
              <span className="mr-auto flex items-center gap-1" aria-label={t('progress', { n: step, total: STEPS.length - 1 })}>
                {STEPS.slice(1).map((x, i) => (
                  <span key={x.id} className={cn('h-1.5 rounded-full transition-all duration-300', i + 1 === step ? 'w-4 bg-accent' : i + 1 < step ? 'w-1.5 bg-accent/50' : 'w-1.5 bg-line-strong')} />
                ))}
              </span>
              <Button variant="ghost" size="sm" onClick={back} aria-label={t('back')}>
                <ArrowLeft />
              </Button>
              <Button ref={primaryRef} variant="primary" size="sm" onClick={next}>
                {last ? t('done') : t('next')}
                {last ? null : <ArrowRight />}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** El paso para probar la notación: el mismo intérprete que la sala de reunión. */
function NotationTry() {
  const t = useTranslations('tour.notation')
  const locale = useDateLocale()
  const { members, user } = useApp()
  const someone = members.find((m) => m.id !== user.id) ?? members[0]
  const firstName = someone?.full_name.split(' ')[0] ?? 'Ana'
  const [text, setText] = useState(() => t('example', { name: firstName }))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
    inputRef.current?.select()
  }, [])

  const parsed = useMemo(() => {
    const { kind, rest } = detectKind(text)
    if (!kind) return null
    // la mención: @nombre → la persona del equipo cuyo nombre empieza así
    const mention = rest.match(/@([\p{L}]+)/u)
    const who = mention ? members.find((m) => m.full_name.toLowerCase().split(' ').some((p) => p.startsWith(mention[1].toLowerCase()))) : undefined
    const withoutMention = mention ? rest.replace(mention[0], who ? who.full_name.split(' ')[0] : mention[1]).replace(/\s+/g, ' ') : rest
    const { due, rest: clean } = kind === 'action' ? extractDue(withoutMention) : { due: null, rest: withoutMention.trim() }
    return { kind, text: clean, who, due }
  }, [text, members])

  return (
    <div className="mt-4 flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5 text-xs text-fg-muted">
        {(['->', '<>', '??'] as const).map((sign) => (
          <button
            key={sign}
            type="button"
            onClick={() => {
              const { rest } = detectKind(text)
              setText(`${sign} ${rest.trim()}`)
              inputRef.current?.focus()
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 hover:bg-hover"
          >
            <code className="font-mono font-semibold text-fg [font-variant-ligatures:none]">{sign}</code>
            {t(sign === '->' ? 'action' : sign === '<>' ? 'decision' : 'question')}
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="tour-notation">
        {t('label')}
      </label>
      <input
        id="tour-notation"
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={120}
        className="h-10 w-full rounded-lg border border-line bg-canvas px-3 font-mono text-[13px] outline-none [font-variant-ligatures:none] focus:border-accent focus:ring-4 focus:ring-accent/15"
      />
      <div className="min-h-[52px] rounded-lg border border-dashed border-line-strong px-3 py-2.5" aria-live="polite">
        {parsed ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <KindChip kind={parsed.kind} />
            <span className="min-w-0 font-medium">{parsed.text || '…'}</span>
            {parsed.who ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-hover py-0.5 pl-0.5 pr-2 text-xs">
                <Avatar name={parsed.who.full_name} src={parsed.who.avatar_url} seed={parsed.who.id} size={16} />
                {parsed.who.full_name.split(' ')[0]}
              </span>
            ) : null}
            {parsed.due ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning">
                <CalendarDays className="size-3" />
                {format(parseISO(parsed.due), 'EEE d MMM', { locale })}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-fg-subtle">{t('hint')}</p>
        )}
      </div>
    </div>
  )
}
