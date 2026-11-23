'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowUpRight, Check } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { CalendarGlyph, GoogleConnectButton } from '@/components/calendar/connect-calendar'
import { Button, buttonVariants } from '@/components/ui/button'

/**
 * ¿La tarea es «conectar Google Calendar»? La siembra la API al crear la cuenta, en el idioma de cada
 * quien («Conectar Google Calendar», «Connect…», «Conectar o…», «Connecter…»); también vale para
 * cualquier tarea que diga lo mismo. «Desconectar» no cuenta.
 */
export function isCalendarTask(title: string) {
  const n = title.trim().toLowerCase()
  return /google\s*calendar/.test(n) && /(^|\s)(conect|connect)/.test(n)
}

/**
 * Lo que se hace dentro de una tarea de inicio: en «Conectar Google Calendar», el botón de Google ahí
 * mismo (vuelve a esta tarea) y, ya conectado, con qué cuenta y «Marcar como hecha» a un toque.
 */
export function TaskStarterAction({ title, isDone, onDone }: { title: string; isDone: boolean; onDone: () => void }) {
  const calendar = isCalendarTask(title)
  const t = useTranslations('tasks.starter')
  const tTasks = useTranslations('tasks')
  const tInt = useTranslations('settings.integrations')
  const { google, googleConfigured } = useApp()
  const pathname = usePathname()
  const params = useSearchParams()
  const router = useRouter()

  // la vuelta de Google trae ?google=connected (o el motivo del error): se avisa y se limpia la dirección
  useEffect(() => {
    const status = params.get('google')
    if (!calendar || !status) return
    if (status === 'connected') toast.success(tInt('connected'))
    else toast.error(tInt.has(`errors.${status}`) ? tInt(`errors.${status}`) : tInt('errors.generic'))
    router.replace(pathname, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!calendar || !googleConfigured) return null

  if (google) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[20px] border border-success/20 bg-success-soft/55 p-4 sm:px-5">
        <span className="relative shrink-0">
          <CalendarGlyph />
          <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-success text-[oklch(0.99_0.006_150)] ring-2 ring-panel">
            <Check className="size-3" strokeWidth={3} />
          </span>
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{t('connectedTitle')}</p>
          <p className="mt-0.5 break-words text-sm leading-snug text-fg-muted">{t('connectedBody', { email: google.email })}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link href="/calendar" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            {t('openCalendar')}
            <ArrowUpRight />
          </Link>
          {isDone ? (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-success/15 px-2.5 text-xs font-semibold text-success">
              <Check className="size-3.5" strokeWidth={2.5} />
              {t('doneNote')}
            </span>
          ) : (
            <Button variant="primary" size="sm" onClick={onDone}>
              <Check />
              {tTasks('markDone')}
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6 overflow-hidden rounded-[20px] border border-line bg-panel shadow-[0_1px_2px_oklch(0.2_0.02_300/0.04)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3.5 p-4 sm:p-5">
        <CalendarGlyph size="lg" />
        <div className="min-w-0 flex-1 basis-60">
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{t('calendarTitle')}</p>
          <p className="mt-0.5 max-w-[62ch] text-sm leading-relaxed text-fg-muted">{t('calendarBody')}</p>
        </div>
        <GoogleConnectButton returnTo={pathname} />
      </div>
      <p className="border-t border-line-soft bg-canvas/60 px-4 py-2.5 text-xs leading-relaxed text-fg-muted sm:px-5">{t('calendarAfter')}</p>
    </div>
  )
}
