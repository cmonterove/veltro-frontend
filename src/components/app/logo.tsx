import { cn } from '@/lib/utils'

/**
 * Isotipo "el punto de encuentro": una V de dos trazos que se encuentran abajo.
 * El corte entre trazos toma el color del fondo donde vive el logo (`cut`).
 */
export function LogoMark({ className, cut = 'var(--canvas)' }: { className?: string; cut?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-6', className)} aria-hidden>
      <path d="M15 15 L32 49" fill="none" stroke="var(--logo-a)" strokeWidth="12" strokeLinecap="round" />
      <path d="M49 15 L32 49" fill="none" stroke={cut} strokeWidth="19" strokeLinecap="round" />
      <path d="M49 15 L32 49" fill="none" stroke="var(--logo-b)" strokeWidth="12" strokeLinecap="round" />
    </svg>
  )
}

export function Logo({ className, cut, size = 'md' }: { className?: string; cut?: string; size?: 'md' | 'lg' }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-fg', className)}>
      <LogoMark cut={cut} className={size === 'lg' ? 'size-8' : 'size-[22px]'} />
      <span className={cn('font-brand font-semibold tracking-[-0.04em]', size === 'lg' ? 'text-[28px] leading-none' : 'text-[17px] leading-none')}>
        Veltro
      </span>
    </span>
  )
}
