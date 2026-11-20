'use client'

import { usePathname } from 'next/navigation'
import { isBareRoute } from '@/lib/routes'
import { SettingsAside } from '@/components/settings/settings-nav'

/**
 * La carga general (app/loading) dentro de la hoja que le corresponde. En Pasillo y Ajustes la barra ya
 * quitó la hoja común (cada una arma la suya): sin esto, los esqueletos quedaban sobre el marco ciruela.
 * En Ajustes además va el menú, que no espera a nada: entrar se ve igual que ya cargado.
 */
export function LoadingSheet({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (!isBareRoute(pathname)) return <>{children}</>
  const sheet = <div className="min-h-0 min-w-0 flex-1 overflow-hidden md:rounded-[20px] md:bg-canvas md:shadow-sheet">{children}</div>
  if (!pathname.startsWith('/settings')) return <div className="flex h-full min-h-0">{sheet}</div>
  return (
    <div className="flex h-full min-h-0">
      <SettingsAside />
      {sheet}
    </div>
  )
}
