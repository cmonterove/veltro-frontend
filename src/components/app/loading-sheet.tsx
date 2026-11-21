'use client'

import { usePathname } from 'next/navigation'
import { isBareRoute } from '@/lib/routes'

/**
 * La carga general (app/loading) dentro de la hoja que le corresponde. En el Pasillo la barra ya quitó la
 * hoja común (arma la suya): sin esto, los esqueletos quedaban sobre el marco ciruela.
 */
export function LoadingSheet({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (!isBareRoute(pathname)) return <>{children}</>
  return (
    <div className="flex h-full min-h-0">
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden md:rounded-[20px] md:bg-canvas md:shadow-sheet">{children}</div>
    </div>
  )
}
