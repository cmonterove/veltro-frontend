import { cn } from '@/lib/utils'

/*
 * Logo de Veltro (kit de identidad 1.0). Trazados copiados tal cual de los SVG del kit:
 * el logotipo «veltro» es un dibujo, nunca se escribe con una fuente.
 * Los colores salen de --logo-a (sello), --logo-b (punta del check) y --logo-ink (logotipo):
 * versión a color en claro y versión oscuro en modo oscuro, sin otras combinaciones.
 * Espacio libre (x = mitad del radio del sello): ~6 % del ancho del logo horizontal
 * (7 px a 120 px) y 25 % del ancho del isotipo. Tamaño mínimo: horizontal 120 px, isotipo 16 px.
 */

/** Isotipo: el sello con el check y su punta. Ícono, avatar y espacios pequeños. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="150 23.3 724.3 851" className={cn('size-6 shrink-0', className)} aria-hidden>
      <path fill="var(--logo-a)" d="M670.8 188.9A360 360 0 1 0 770.4 261.3L483.6 758L305.6 530.1L371.6 415.8L468.4 539.6Z" />
      <path fill="var(--logo-b)" d="M686.2 162.4L765.4 25.2L871.4 86.4L786.2 233.9A390.6 390.6 0 0 0 686.2 162.4Z" />
    </svg>
  )
}

/** Logo horizontal (versión principal): isotipo + logotipo en línea. */
export function Logo({ className, size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  return (
    <svg
      viewBox="37.8 95 889.3 258.3"
      role="img"
      aria-label="Veltro"
      className={cn('block h-auto shrink-0', size === 'lg' ? 'w-[160px]' : 'w-[120px]', className)}
    >
      <path fill="var(--logo-a)" d="M195.7 146.3A108 108 0 1 0 225.5 168L139.5 317L86.1 248.6L105.9 214.3L134.9 251.5Z" />
      <path fill="var(--logo-b)" d="M200.3 138.3L224 97.2L255.8 115.5L230.3 159.8A117.2 117.2 0 0 0 200.3 138.3Z" />
      <g fill="var(--logo-ink)" fillRule="evenodd">
        <path d="M318 192.3L343.6 192.3L377.7 266.2L411.7 192.3L437.3 192.3L377.7 321.8Z" />
        <path d="M571.9 259.6A66.3 66.6 0 1 0 558.6 296.1L541.1 279.4A41.3 45.4 0 0 1 464.5 259.6ZM467.2 239.5L544.2 239.5A41.3 45.4 0 0 0 467.2 239.5Z" />
        <path d="M585.8 319.8L585.8 138.2L610.5 138.2L610.5 319.8Z" />
        <path d="M688.5 321.3A45.4 39.8 0 0 1 643.1 281.5L643.1 212.4L622.2 212.4L622.2 192.3L643.1 192.3L643.1 162.7L667.9 156.6L667.9 192.3L696.4 192.3L696.4 212.4L667.9 212.4L667.9 281.5A20.7 19.9 0 0 0 688.5 301.4Z" />
        <path d="M709.2 319.8L709.2 192.3L733.9 192.3L733.9 198.6A50 66.6 0 0 1 787.1 200.8L778.8 221.2A30.6 45.4 0 0 0 733.9 230.3L733.9 319.8Z" />
        <path d="M788.1 256A68.3 66.6 0 1 1 924.8 256A68.3 66.6 0 1 1 788.1 256ZM813.6 256A42.8 45.4 0 1 0 899.3 256A42.8 45.4 0 1 0 813.6 256Z" />
      </g>
    </svg>
  )
}
