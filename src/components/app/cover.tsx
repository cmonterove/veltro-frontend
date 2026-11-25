import { cn } from '@/lib/utils'

/**
 * La portada de una página: el ciruela del marco (el mismo de los bloques de Pulso, Mesa y Solicitudes) con
 * el sello de Veltro enorme de textura, como en la pantalla de entrada. Va detrás de la cabecera, que lleva
 * `on-frame` (texto perla), y baja más que ella: lo primero de la página se monta sobre su borde de abajo,
 * así que eso tiene que ser una tarjeta con fondo (nunca texto suelto ni un fondo transparente).
 *
 * Se posiciona con `className` (inset, top, bottom) respecto de la cabecera. Pide un `isolate` arriba que
 * abarque la cabecera y lo que sigue: así queda detrás de todo eso, pero encima de la hoja.
 */
export function CoverBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'day-surface pointer-events-none absolute -z-10 overflow-hidden rounded-[24px] shadow-[0_18px_40px_-24px_oklch(0.3_0.12_312/0.55)]',
        className,
      )}
    >
      {/* el isotipo en su versión blanco (la que va sobre ciruela), apenas visible */}
      <svg viewBox="150 23.3 724.3 851" className="absolute -top-[150px] right-[4%] size-[440px] text-[oklch(0.969_0.011_54.5)] opacity-[0.09]">
        <path fill="currentColor" d="M670.8 188.9A360 360 0 1 0 770.4 261.3L483.6 758L305.6 530.1L371.6 415.8L468.4 539.6Z" />
        <path fill="currentColor" d="M686.2 162.4L765.4 25.2L871.4 86.4L786.2 233.9A390.6 390.6 0 0 0 686.2 162.4Z" />
      </svg>
    </div>
  )
}

/**
 * La cabecera de una página de trabajo sobre su portada: adentro van texto perla (`on-frame`) y los colores
 * de estado aclarados (`day-ink`); el ciruela baja 76px más que la cabecera y lo que sigue, con
 * `COVER_INSET` a los lados, se monta encima. El contenedor de la página lleva `isolate`.
 */
export function Cover({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <header className={cn('on-frame day-ink relative flex shrink-0 flex-col px-4 pb-1 pt-4 sm:px-5', className)}>
      <CoverBackdrop className="inset-x-0 top-0 -bottom-[76px]" />
      {children}
    </header>
  )
}

/** El margen de lo que se monta sobre la portada: a los lados se ve su ciruela. */
export const COVER_INSET = 'mx-3 sm:mx-4'
