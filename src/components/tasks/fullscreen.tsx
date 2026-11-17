'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'

/**
 * Ver una vista de tareas (calendario, tablero, tabla) a pantalla completa dentro de la app: tapa
 * la barra lateral y la cabecera. No usa la pantalla completa del navegador porque los menús,
 * popovers y ventanas se abren en el body y quedarían fuera. Esc sale si no hay nada abierto encima.
 */
export function useFullscreen() {
  const [full, setFull] = useState(false)
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      // Esc cierra primero el menú o la ventana que esté abierta
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return
      setFull(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])
  const toggle = useCallback(() => setFull((f) => !f), [])
  return { full, toggle }
}

/** La capa que ocupa toda la ventana (debajo de menús y ventanas, que van en z-50). */
export const FULLSCREEN_CLASS = 'fixed inset-0 z-40 bg-canvas shadow-lift'

export function FullscreenButton({ full, onToggle }: { full: boolean; onToggle: () => void }) {
  const t = useTranslations('tasks')
  const label = full ? t('exitFullscreen') : t('fullscreen')
  return (
    <Tooltip content={label} shortcut={full ? ['Esc'] : undefined}>
      <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label={label} aria-pressed={full} className="shrink-0">
        {full ? <Minimize2 /> : <Maximize2 />}
      </Button>
    </Tooltip>
  )
}
