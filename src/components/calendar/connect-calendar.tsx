'use client'

import { useTranslations } from 'next-intl'
import { RefreshCw } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { cn } from '@/lib/utils'
import { track } from '@/lib/telemetry'

/** A dónde va el botón: la web arma la conexión con la API y vuelve a `returnTo` con ?google=… */
export const connectGoogleHref = (returnTo: string) => `/api/integrations/google/connect?returnTo=${encodeURIComponent(returnTo)}`

/** La «G» de Google en sus cuatro colores. */
export function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-[18px] shrink-0', className)} aria-hidden>
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.11A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.29 14.29A7.2 7.2 0 0 1 4.91 12c0-.79.14-1.56.38-2.29V6.6H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l4.01-3.11Z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.6l4.01 3.11C6.23 6.86 8.88 4.75 12 4.75Z" />
    </svg>
  )
}

/**
 * Una hoja de calendario con el día de hoy y, arriba, una franja fina con los colores de Google: se
 * reconoce como «tu calendario de Google» sin copiar su logo. El número sale del reloj de quien mira
 * (en el servidor puede ser otro día: por eso no se compara al hidratar).
 */
const GLYPH = {
  sm: { box: 'size-9 rounded-[10px]', num: 'text-[14px]' },
  md: { box: 'size-10 rounded-[11px]', num: 'text-[15px]' },
  lg: { box: 'size-12 rounded-[13px]', num: 'text-lg' },
} as const

export function CalendarGlyph({ size = 'md', revoked, className }: { size?: keyof typeof GLYPH; revoked?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative flex shrink-0 flex-col overflow-hidden bg-[oklch(0.995_0.003_80)] shadow-[0_1px_2px_oklch(0.2_0.02_300/0.08)] ring-1 ring-inset ring-[oklch(0.2_0.02_300/0.1)] dark:bg-[oklch(0.3_0.02_300)] dark:ring-white/10',
        GLYPH[size].box,
        className,
      )}
    >
      <span className="flex h-[5px] shrink-0">
        <span className="flex-1 bg-[#4285F4]" />
        <span className="flex-1 bg-[#EA4335]" />
        <span className="flex-1 bg-[#FBBC05]" />
        <span className="flex-1 bg-[#34A853]" />
      </span>
      <span className={cn('flex flex-1 items-center justify-center font-semibold tabular-nums tracking-[-0.02em] text-[oklch(0.25_0.03_300)] dark:text-[oklch(0.95_0.01_300)]', GLYPH[size].num)} suppressHydrationWarning>
        {new Date().getDate()}
      </span>
      {revoked ? (
        <span className="absolute -bottom-px -right-px flex size-4 items-center justify-center rounded-tl-md bg-warning-soft text-mandarina-ink">
          <RefreshCw className="size-2.5" strokeWidth={2.5} />
        </span>
      ) : null}
    </span>
  )
}

/**
 * El botón para conectar: con la «G» y los colores del botón de Google (claro en el tema claro, casi
 * negro en el oscuro, como pide su guía de marca). Es lo que la gente reconoce como «entrar con Google».
 */
export function GoogleConnectButton({ returnTo, label, size = 'md', className }: { returnTo: string; label?: string; size?: 'sm' | 'md'; className?: string }) {
  const t = useTranslations('calendar.connect')
  return (
    <a
      href={connectGoogleHref(returnTo)}
      onClick={() => track('feature.calendar_connect')}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2.5 whitespace-nowrap rounded-full border font-medium outline-none transition-[background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-accent-mid/40',
        'border-[#747775] bg-[#ffffff] text-[#1f1f1f] shadow-[0_1px_2px_rgb(60_64_67/0.12)] hover:bg-[#f8fafd] hover:shadow-[0_1px_3px_rgb(60_64_67/0.25)]',
        'dark:border-[#8e918f] dark:bg-[#131314] dark:text-[#e3e3e3] dark:shadow-none dark:hover:bg-[#1e1f20]',
        size === 'sm' ? 'h-8 pl-2.5 pr-3.5 text-[13px]' : 'h-10 pl-3.5 pr-4.5 text-sm',
        className,
      )}
    >
      <GoogleG className={size === 'sm' ? 'size-4' : 'size-[18px]'} />
      {label ?? t('button')}
    </a>
  )
}

/**
 * Tarjeta para conectar (o volver a conectar) Google Calendar: la hoja de calendario, qué se gana,
 * el botón de Google y, al pie, qué permisos pide. `compact`: en Pulso, en una columna angosta.
 */
export function ConnectCalendar({ reason, returnTo, compact }: { reason?: string; returnTo: string; compact?: boolean }) {
  const t = useTranslations('calendar.connect')
  const { googleConfigured } = useApp()
  const revoked = reason === 'google_auth_revoked'

  return (
    <div className={cn('rounded-[20px] border border-line bg-panel shadow-[0_1px_2px_oklch(0.2_0.02_300/0.04)]', compact ? 'p-4' : 'p-5')}>
      <div className={cn('flex gap-4', compact ? 'items-start' : 'items-center')}>
        <CalendarGlyph revoked={revoked} size={compact ? 'md' : 'lg'} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{revoked ? t('revokedTitle') : t('title')}</p>
          <p className="mt-0.5 max-w-[60ch] text-sm leading-relaxed text-fg-muted">{googleConfigured ? (revoked ? t('revokedBody') : t('body')) : t('notConfigured')}</p>
        </div>
        {googleConfigured && !compact ? <GoogleConnectButton returnTo={returnTo} label={revoked ? t('reconnect') : undefined} className="max-sm:hidden" /> : null}
      </div>
      {googleConfigured ? (
        <div className={cn('mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2', !compact && 'sm:hidden')}>
          <GoogleConnectButton returnTo={returnTo} label={revoked ? t('reconnect') : undefined} size={compact ? 'sm' : 'md'} />
        </div>
      ) : null}
    </div>
  )
}

/**
 * Sin Google Calendar las reuniones de Veltro funcionan igual; esta franja solo ofrece sumar los
 * eventos del calendario, con el botón de Google a mano. Si el servidor no tiene Google, no aparece.
 */
export function ConnectCalendarHint({ returnTo, className }: { returnTo: string; className?: string }) {
  const t = useTranslations('calendar.connect')
  const { googleConfigured } = useApp()
  if (!googleConfigured) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-panel py-2 pl-2 pr-2 shadow-[0_1px_2px_oklch(0.2_0.02_300/0.04)]', className)}>
      <CalendarGlyph size="sm" />
      <p className="min-w-0 flex-1 text-[13px] leading-snug">
        <span className="block font-semibold text-fg">{t('hint')}</span>
        <span className="block text-fg-muted">{t('hintBody')}</span>
      </p>
      <GoogleConnectButton returnTo={returnTo} size="sm" />
    </div>
  )
}
