'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { FlaskConical } from 'lucide-react'
import { MenuCheckboxItem } from '@/components/ui/menu'
import { setDemoData } from '@/app/actions/preferences'
import { useApp } from './app-context'

/**
 * Datos de prueba: una cuenta demo en la misma base, a la que se entra con una segunda sesión sin
 * cerrar la real. Al cambiar se recarga desde Pulso: la caché y la página abierta eran de la otra cuenta.
 */
function useDemoData() {
  const t = useTranslations('demo')
  const { demoData } = useApp()
  const [pending, start] = useTransition()
  const set = (on: boolean) =>
    start(async () => {
      const res = await setDemoData(on)
      if (!res.ok) {
        toast.error(t('error'))
        return
      }
      window.location.href = '/home'
    })
  return { ...demoData, pending, set }
}

export function DemoDataMenuItem() {
  const t = useTranslations('demo')
  const { available, active, pending, set } = useDemoData()
  if (!available && !active) return null
  return (
    <MenuCheckboxItem checked={active} disabled={pending} closeOnClick={false} onCheckedChange={(on) => set(Boolean(on))}>
      <FlaskConical />
      {t('switch')}
    </MenuCheckboxItem>
  )
}

/** Para quien todavía no tiene cuenta (onboarding): mirar Veltro con los datos de prueba antes de crear la suya. */
export function DemoDataStart() {
  const t = useTranslations('demo')
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await setDemoData(true)
          if (res.ok) window.location.href = '/home'
          else toast.error(t('error'))
        })
      }
      className="mx-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
    >
      <FlaskConical className="size-4" />
      {t('start')}
    </button>
  )
}

export function DemoDataBanner() {
  const t = useTranslations('demo')
  const { active, pending, set } = useDemoData()
  if (!active) return null
  return (
    <div role="status" className="flex shrink-0 items-center gap-2 border-b border-line bg-warning-soft px-4 py-1.5 text-sm text-fg">
      <FlaskConical className="size-4 shrink-0 text-warning" />
      <span className="min-w-0 flex-1 truncate">{t('banner')}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => set(false)}
        className="shrink-0 rounded-md px-2 py-0.5 font-medium text-fg underline-offset-2 hover:underline disabled:opacity-60"
      >
        {t('exit')}
      </button>
    </div>
  )
}
