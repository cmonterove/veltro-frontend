import { cn } from '@/lib/utils'

// Los paneles de Preferencias (tus ajustes): un panel por tema, con su título y lo suyo debajo (las
// secciones de adentro, separadas por una línea fina).

/** Un panel de Preferencias: su título y secciones separadas por una línea (no tarjetas sueltas). */
export function PrefPanel({ id, title, children, className }: { id?: string; title: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    // con sombra: arriba se monta sobre la portada ciruela de tus ajustes
    <section id={id} className={cn('flex min-w-0 scroll-mt-6 flex-col rounded-[20px] bg-panel px-5 py-3.5 shadow-sheet ring-1 ring-line-soft', className)}>
      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{title}</h2>
      {/* llena el alto del panel (los dos van parejos): una sección con mt-auto queda abajo del todo */}
      <div className="mt-2 flex flex-1 flex-col divide-y divide-line-soft">{children}</div>
    </section>
  )
}
