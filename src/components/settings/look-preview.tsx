import type { AppLocale } from '@/i18n/config'
import { cn } from '@/lib/utils'

// «Así ves Veltro»: la app en miniatura tal como la vas a ver. El tema (claro, oscuro o mitad y mitad si
// sigue al equipo), el saludo en el idioma elegido y la fecha y la hora de tu zona, con la barra del día.
// Cambia al momento con cada opción (y al pasar el mouse por una, antes de elegirla).

export const SAMPLE: Record<AppLocale, string> = { es: 'Hola, ¿cómo vas?', en: 'Hi, how’s it going?', pt: 'Olá, tudo bem?', fr: 'Bonjour, ça va ?' }

type Palette = {
  frame: string
  nav: string
  navOn: string
  navOnText: string
  sheet: string
  card: string
  line: string
  lineStrong: string
  text: string
  muted: string
  chip: string
  accent: string
  event1: string
  event2: string
}

// los colores fijos de cada tema (no los del tema de ahora: la miniatura muestra el que se elige)
const PALETTE: Record<'light' | 'dark', Palette> = {
  light: {
    frame: 'oklch(0.33 0.085 312)',
    nav: 'oklch(1 0 0 / 0.26)',
    navOn: 'oklch(1 0 0 / 0.14)',
    navOnText: 'oklch(1 0 0 / 0.8)',
    sheet: 'oklch(0.975 0.008 75)',
    card: 'oklch(1 0 0)',
    line: 'oklch(0.3 0.04 312 / 0.12)',
    lineStrong: 'oklch(0.3 0.04 312 / 0.3)',
    text: 'oklch(0.243 0.088 312.7)',
    muted: 'oklch(0.47 0.019 309.9)',
    chip: 'oklch(0.3 0.04 312 / 0.07)',
    accent: 'oklch(0.55 0.13 312)',
    event1: 'oklch(0.62 0.12 312 / 0.2)',
    event2: 'oklch(0.7 0.12 160 / 0.24)',
  },
  dark: {
    frame: 'oklch(0.19 0.03 312)',
    nav: 'oklch(1 0 0 / 0.18)',
    navOn: 'oklch(1 0 0 / 0.09)',
    navOnText: 'oklch(1 0 0 / 0.62)',
    sheet: 'oklch(0.235 0.02 312)',
    card: 'oklch(0.28 0.022 312)',
    line: 'oklch(1 0 0 / 0.1)',
    lineStrong: 'oklch(1 0 0 / 0.28)',
    text: 'oklch(0.969 0.011 54.5)',
    muted: 'oklch(0.765 0.03 311)',
    chip: 'oklch(1 0 0 / 0.08)',
    accent: 'oklch(0.72 0.11 312)',
    event1: 'oklch(0.72 0.11 312 / 0.3)',
    event2: 'oklch(0.72 0.12 160 / 0.28)',
  },
}

const NIGHT = 'oklch(0.4 0.07 295)'
/** El día en colores: noche, amanecer, día, atardecer y noche otra vez. */
export const DAY_GRADIENT = `linear-gradient(90deg, ${NIGHT} 0%, ${NIGHT} 21%, oklch(0.78 0.12 55) 29%, oklch(0.9 0.09 90) 50%, oklch(0.78 0.13 45) 73%, ${NIGHT} 81%, ${NIGHT} 100%)`

/** Los minutos desde la medianoche en esa zona (zona rara: mediodía). */
export function minutesIn(timeZone: string, at: Date) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(at)
    return Number(parts.find((p) => p.type === 'hour')?.value ?? 12) * 60 + Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  } catch {
    return 720
  }
}

function fmt(locale: string, opts: Intl.DateTimeFormatOptions, at: Date) {
  try {
    return new Intl.DateTimeFormat(locale, opts).format(at)
  } catch {
    return new Intl.DateTimeFormat(locale, { ...opts, timeZone: undefined }).format(at)
  }
}

/**
 * La miniatura. `at` es null hasta hidratar (el servidor no sabe la hora de quien mira): la fecha y la
 * hora quedan en blanco y el punto del día, a mediodía.
 */
export function LookPreview({
  mode,
  locale,
  timeZone,
  at,
  className,
}: {
  mode: 'light' | 'dark' | 'system'
  locale: AppLocale
  timeZone: string
  at: Date | null
  className?: string
}) {
  const scene = (p: Palette) => <Scene p={p} locale={locale} timeZone={timeZone} at={at} />
  return (
    <div
      aria-hidden
      className={cn(
        'relative select-none overflow-hidden rounded-xl shadow-[0_14px_32px_-14px_oklch(0.25_0.09_310/0.5),0_2px_6px_oklch(0.25_0.05_310/0.12)] ring-1 ring-[oklch(0.25_0.05_310/0.14)]',
        className,
      )}
    >
      {/* al cambiar de tema, el nuevo entra con un fundido */}
      <div key={mode} className="absolute inset-0 animate-in fade-in-0 duration-300">
        {mode === 'system' ? (
          <>
            {scene(PALETTE.light)}
            <div className="absolute inset-0 [clip-path:polygon(60%_0,100%_0,100%_100%,44%_100%)]">{scene(PALETTE.dark)}</div>
          </>
        ) : (
          scene(PALETTE[mode])
        )}
      </div>
    </div>
  )
}

function Scene({ p, locale, timeZone, at }: { p: Palette; locale: AppLocale; timeZone: string; at: Date | null }) {
  const date = at ? fmt(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone }, at) : ' '
  const time = at ? fmt(locale, { hour: 'numeric', minute: '2-digit', timeZone }, at) : ' '
  const minutes = at ? minutesIn(timeZone, at) : 720
  return (
    <div className="absolute inset-0 flex gap-2 p-2" style={{ background: p.frame }}>
      {/* el menú: la marca, la sección abierta y las demás, y tu foto abajo */}
      <div className="flex w-[19%] min-w-0 flex-col gap-[6px] px-1 pt-1.5">
        <span className="mb-1.5 flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.accent }} />
          <span className="h-1.5 w-1/2 rounded-full" style={{ background: p.navOnText }} />
        </span>
        {[0.82, 0.58, 0.7, 0.5, 0.64].map((w, i) => (
          <span key={i} className="flex h-[14px] items-center rounded-[5px] px-1.5" style={{ background: i === 0 ? p.navOn : 'transparent' }}>
            <span className="h-1 rounded-full" style={{ width: `${w * 100}%`, background: i === 0 ? p.navOnText : p.nav }} />
          </span>
        ))}
        <span className="mb-1 mt-auto flex items-center gap-1.5 px-0.5">
          <span className="size-3.5 shrink-0 rounded-full bg-[oklch(0.82_0.13_80)]" />
          <span className="h-1 w-2/5 rounded-full" style={{ background: p.nav }} />
        </span>
      </div>

      {/* la hoja: la fecha y la hora de tu zona, el saludo en tu idioma, el día y dos tarjetas */}
      <div className="flex min-w-0 flex-1 flex-col rounded-lg px-3.5 pb-3 pt-2.5" style={{ background: p.sheet }}>
        <div className="flex items-center gap-2 text-[10px] leading-none">
          <span className="min-w-0 flex-1 truncate first-letter:uppercase" style={{ color: p.muted }}>
            {date}
          </span>
          <span className="shrink-0 rounded-full px-1.5 py-[3px] font-semibold tabular-nums" style={{ background: p.chip, color: p.text }}>
            {time}
          </span>
        </div>
        <p lang={locale} className="mt-1.5 truncate text-[17px] font-semibold leading-tight tracking-[-0.02em] tall:text-[21px]" style={{ color: p.text }}>
          {SAMPLE[locale]}
        </p>
        <div className="relative mt-2.5 h-[5px] shrink-0 rounded-full" style={{ background: DAY_GRADIENT }}>
          <span
            className="absolute top-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: `${(minutes / 1440) * 100}%`, background: p.card, boxShadow: `0 0 0 1.5px ${p.text}` }}
          />
        </div>
        <div className="mt-3 grid min-h-0 flex-1 grid-cols-[1.25fr_1fr] gap-2">
          {/* tareas de hoy, una hecha */}
          <div className="flex min-h-0 flex-col gap-[7px] overflow-hidden rounded-md p-2" style={{ background: p.card, boxShadow: `inset 0 0 0 1px ${p.line}` }}>
            <span className="h-1.5 w-[42%] shrink-0 rounded-full" style={{ background: p.lineStrong }} />
            {[0.78, 0.6, 0.7, 0.52].map((w, i) => (
              <span key={i} className="flex shrink-0 items-center gap-1.5">
                <span
                  className="size-[9px] shrink-0 rounded-[3px]"
                  style={i === 1 ? { background: p.accent } : { boxShadow: `inset 0 0 0 1px ${p.lineStrong}` }}
                />
                <span className="h-1 rounded-full" style={{ width: `${w * 100}%`, background: p.line }} />
              </span>
            ))}
          </div>
          {/* la agenda: dos reuniones */}
          <div className="flex min-h-0 flex-col gap-[7px] overflow-hidden rounded-md p-2" style={{ background: p.card, boxShadow: `inset 0 0 0 1px ${p.line}` }}>
            <span className="h-1.5 w-1/2 shrink-0 rounded-full" style={{ background: p.lineStrong }} />
            <span className="h-3.5 shrink-0 rounded-[4px]" style={{ background: p.event1 }} />
            <span className="h-3.5 w-3/4 shrink-0 rounded-[4px]" style={{ background: p.event2 }} />
          </div>
        </div>
      </div>
    </div>
  )
}
