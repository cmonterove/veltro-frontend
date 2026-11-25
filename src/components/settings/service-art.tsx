import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// Cada servicio de Google en miniatura (como la app en miniatura de cada tema, en el panel de al lado):
// el correo con sus filas, la gente, los archivos, lo que pasa a la Bóveda y la hoja del calendario.
// Se reconocen por la forma y los colores de Google sin copiar sus logos.

export type ServiceKind = 'mail' | 'contacts' | 'drive' | 'driveFiles' | 'calendar'

/** El tono del fondo de cada miniatura: un color de Google por servicio, y la ciruela de Veltro para la Bóveda. */
export const SERVICE_TONE: Record<ServiceKind, string> = {
  mail: '#EA4335',
  contacts: '#4285F4',
  drive: '#34A853',
  driveFiles: 'var(--accent)',
  calendar: '#FBBC05',
}

const GOOGLE = ['#4285F4', '#EA4335', '#FBBC05', '#34A853']
const PAPER = 'bg-[oklch(0.995_0.003_80)] shadow-[0_1px_2px_oklch(0.25_0.05_300/0.14)] dark:bg-[oklch(0.36_0.035_305)]'
const INK = 'bg-[oklch(0.3_0.05_310/0.15)] dark:bg-[oklch(0.97_0.01_55/0.2)]'
const INK_STRONG = 'bg-[oklch(0.3_0.05_310/0.34)] dark:bg-[oklch(0.97_0.01_55/0.45)]'
const ON_COLOR = 'bg-[oklch(0.995_0.003_80/0.94)]'

/** La miniatura de un servicio; llena la caja que la contiene (la caja pone el fondo con `--art-bg`). */
export function ServiceArt({ kind }: { kind: ServiceKind }) {
  if (kind === 'mail') return <MailArt />
  if (kind === 'contacts') return <ContactsArt />
  if (kind === 'drive') return <DriveArt />
  if (kind === 'driveFiles') return <VaultArt />
  return <CalendarArt />
}

/** Recibidos: tres correos, el primero sin leer (con el punto rojo y el asunto más oscuro). */
function MailArt() {
  const rows = [
    { dot: '#EA4335', a: 'w-[74%]', b: 'w-[50%]', unread: true },
    { dot: null, a: 'w-[60%]', b: 'w-[42%]' },
    { dot: null, a: 'w-[68%]', b: 'w-[34%]' },
  ]
  return (
    <span className={cn(PAPER, 'absolute inset-x-[13%] bottom-0 top-[11px] flex flex-col gap-[7px] rounded-t-[8px] px-[11%] pt-[9px]')}>
      {rows.map((r, i) => (
        <span key={i} className="flex items-center gap-[7%]">
          <span className={cn('size-[7px] shrink-0 rounded-full', !r.dot && INK)} style={r.dot ? { background: r.dot } : undefined} />
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className={cn('h-[3px] rounded-full', r.a, r.unread ? INK_STRONG : INK)} />
            <span className={cn('h-[2px] rounded-full', r.b, INK)} />
          </span>
        </span>
      ))}
    </span>
  )
}

/** Tus contactos: tres personas, la del medio adelante, y su nombre debajo. */
function ContactsArt() {
  const people = [
    { color: '#34A853', size: 'size-[25px]', front: false },
    { color: '#4285F4', size: 'size-[31px]', front: true },
    { color: '#FBBC05', size: 'size-[25px]', front: false },
  ]
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-[7px]">
      <span className="flex items-center">
        {people.map((p, i) => (
          <span
            key={i}
            className={cn('relative -mx-[4px] overflow-hidden rounded-full', p.size, p.front && 'z-10')}
            style={{ background: p.color, boxShadow: '0 0 0 2.5px var(--art-bg)' }}
          >
            <span className={cn('absolute left-1/2 top-[19%] size-[34%] -translate-x-1/2 rounded-full', ON_COLOR)} />
            <span className={cn('absolute -bottom-[16%] left-1/2 h-[44%] w-[68%] -translate-x-1/2 rounded-t-full', ON_COLOR)} />
          </span>
        ))}
      </span>
      <span className="flex w-full flex-col items-center gap-[3px]">
        <span className={cn('h-[3px] w-[34%] rounded-full', INK_STRONG)} />
        <span className={cn('h-[2px] w-[22%] rounded-full', INK)} />
      </span>
    </span>
  )
}

/** Drive: cuatro archivos, cada uno con el color de su app (documento, hoja, presentación, PDF). */
function DriveArt() {
  return (
    <span className="absolute inset-x-[15%] inset-y-[9px] grid grid-cols-2 gap-[5px]">
      {GOOGLE.map((c) => (
        <span key={c} className={cn(PAPER, 'flex flex-col gap-[3px] overflow-hidden rounded-[5px]')}>
          <span className="h-[5px] shrink-0" style={{ background: c }} />
          <span className={cn('mx-[14%] h-[2px] rounded-full', INK_STRONG)} />
          <span className={cn('ml-[14%] h-[2px] w-[46%] rounded-full', INK)} />
        </span>
      ))}
    </span>
  )
}

/** De Drive a la Bóveda: un archivo, la flecha y la caja fuerte de Veltro con su perilla. */
function VaultArt() {
  return (
    <span className="absolute inset-0 flex items-center justify-center gap-[6%]">
      <span className={cn(PAPER, 'flex h-[34px] w-[26px] shrink-0 flex-col gap-[3px] overflow-hidden rounded-[4px]')}>
        <span className="h-[5px] shrink-0 bg-[#4285F4]" />
        <span className={cn('mx-[4px] h-[2px] rounded-full', INK_STRONG)} />
        <span className={cn('mx-[4px] h-[2px] rounded-full', INK)} />
        <span className={cn('ml-[4px] h-[2px] w-[50%] rounded-full', INK)} />
      </span>
      <ArrowRight className="size-3.5 shrink-0 text-accent" strokeWidth={2.5} />
      <span className="relative flex size-[36px] shrink-0 items-center justify-center rounded-[9px] bg-accent shadow-[0_1px_3px_oklch(0.25_0.08_310/0.3)]">
        <span className="absolute left-[4px] top-[8px] h-[5px] w-[2px] rounded-full bg-panel/70" />
        <span className="absolute bottom-[8px] left-[4px] h-[5px] w-[2px] rounded-full bg-panel/70" />
        <span className="relative size-[15px] rounded-full ring-2 ring-panel/90">
          <span className="absolute left-1/2 top-[2px] h-[4px] w-[2px] -translate-x-1/2 rounded-full bg-panel/90" />
        </span>
      </span>
    </span>
  )
}

/** La hoja del calendario: la franja de Google, el día de hoy y tres reuniones. */
function CalendarArt() {
  return (
    <span className={cn(PAPER, 'absolute inset-x-[13%] inset-y-[9px] flex flex-col overflow-hidden rounded-[7px]')}>
      <span className="flex h-[4px] shrink-0">
        {GOOGLE.map((c) => (
          <span key={c} className="flex-1" style={{ background: c }} />
        ))}
      </span>
      <span className="flex flex-1 items-center gap-[9%] px-[10%]">
        {/* el día sale del reloj de quien mira (en el servidor puede ser otro) */}
        <span className="text-[19px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[oklch(0.25_0.03_300)] dark:text-[oklch(0.95_0.01_300)]" suppressHydrationWarning>
          {new Date().getDate()}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[4px]">
          <span className="h-[5px] rounded-full bg-[#4285F4]/75" />
          <span className="h-[5px] w-[70%] rounded-full bg-[#34A853]/75" />
          <span className="h-[5px] w-[86%] rounded-full bg-[#EA4335]/65" />
        </span>
      </span>
    </span>
  )
}
