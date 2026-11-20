'use client'

import { createContext, useContext, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Pantalla completa: la hoja ocupa toda la ventana (sin menú ni barra de arriba). Para salir, cada
 * pantalla pone el botón «Salir» junto a sus otros botones (como «Nueva reunión»); si una pantalla no
 * lo pone, el marco muestra el mismo botón flotando abajo a la derecha. Esc también sale.
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
  return (
    <Button
      variant="secondary"
      size="md"
      onClick={ctx.exit}
      title={`${t('exitFullscreen')} (Esc)`}
      aria-label={t('exitFullscreen')}
      // entra con un pequeño fundido y escala, mientras el marco se va
      className={cn('animate-in fade-in-0 zoom-in-95 duration-300', floating && 'fixed bottom-4 right-4 z-30 shadow-lift', className)}
    >
      <Minimize2 />
      {t('exitShort')}
      <kbd className="ml-0.5 rounded-[5px] bg-fg/[0.07] px-1 py-px font-sans text-2xs font-medium text-fg-muted">Esc</kbd>
    </Button>
  )
}
