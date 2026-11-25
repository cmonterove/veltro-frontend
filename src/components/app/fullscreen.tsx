'use client'

import { createContext, useContext, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Pantalla completa: la hoja ocupa toda la ventana (sin menú ni barra de arriba). Para salir, cada
 * pantalla pone el botón «Salir» junto a sus otros botones (como «Nueva reunión»); si una pantalla no
 * lo pone, el marco cuelga una pestaña «Salir» arriba al centro (donde el navegador pone la suya: abajo
 * a la derecha la tapaban el indicador de Next y lo que cada pantalla tiene en esa esquina). Esc también sale.
 */
type FullscreenState = {
  full: boolean
  exit: () => void
  /** una pantalla avisa que tiene su propio botón (el marco no muestra el flotante); devuelve cómo desavisar */
  claim: () => () => void
}

export const FullscreenContext = createContext<FullscreenState | null>(null)

export function FullscreenExitButton({ className, floating = false }: { className?: string; floating?: boolean }) {
  const ctx = useContext(FullscreenContext)
  const t = useTranslations('nav')
  const claim = ctx?.claim
  // el flotante es el del marco: no se reclama a sí mismo
  useEffect(() => (floating ? undefined : claim?.()), [claim, floating])
  if (!ctx?.full) return null
  if (floating) {
    return (
      <button
        type="button"
        onClick={ctx.exit}
        title={`${t('exitFullscreen')} (Esc)`}
        aria-label={t('exitFullscreen')}
        // centrada sin transform (la animación de entrada usa el suyo)
        className="fixed inset-x-0 top-0 z-40 mx-auto inline-flex h-8 w-fit items-center gap-1.5 rounded-b-[12px] border border-t-0 border-line bg-panel pl-3 pr-2 text-xs font-medium text-fg-muted shadow-lift outline-none transition-colors duration-200 animate-in fade-in-0 slide-in-from-top-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/40"
      >
        <Minimize2 className="size-3.5" />
        {t('exitShort')}
        <kbd className="ml-0.5 rounded-[5px] bg-fg/[0.07] px-1 py-px font-sans text-2xs font-medium text-fg-muted">Esc</kbd>
      </button>
    )
  }
  return (
    <Button
      variant="secondary"
      size="md"
      onClick={ctx.exit}
      title={`${t('exitFullscreen')} (Esc)`}
      aria-label={t('exitFullscreen')}
      // entra con un pequeño fundido y escala, mientras el marco se va
      className={cn('animate-in fade-in-0 zoom-in-95 duration-300', className)}
    >
      <Minimize2 />
      {t('exitShort')}
      <kbd className="ml-0.5 rounded-[5px] bg-fg/[0.07] px-1 py-px font-sans text-2xs font-medium text-fg-muted">Esc</kbd>
    </Button>
  )
}
