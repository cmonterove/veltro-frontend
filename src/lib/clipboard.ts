'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

/**
 * Copia texto al portapapeles. Primero con la API moderna; si el navegador no da permiso
 * (sin HTTPS, en un iframe o por política), con el método clásico. Devuelve si se pudo.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // sigue con el método clásico
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    Object.assign(area.style, { position: 'fixed', top: '0', left: '0', opacity: '0', pointerEvents: 'none' })
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

/** Copiar con aviso: el de éxito lo pone quien copia; si no se pudo, siempre se avisa. */
export function useCopy() {
  const te = useTranslations('errors')
  return useCallback(
    async (text: string, success: string) => {
      if (await copyText(text)) toast.success(success)
      else toast.error(te('copyFailed'))
    },
    [te],
  )
}
