'use client'

import { useTranslations } from 'next-intl'
import { CalendarPlus, RefreshCw } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { track } from '@/lib/telemetry'

/** Estado vacío del calendario: explica qué pasa al conectar Google Calendar. */
export function ConnectCalendar({ reason, returnTo, compact }: { reason?: string; returnTo: string; compact?: boolean }) {
  const t = useTranslations('calendar.connect')
  const { googleConfigured } = useApp()
  const revoked = reason === 'google_auth_revoked'

  return (
    <div className={cn('flex flex-col items-start gap-3 rounded-xl border border-dashed border-line-strong p-5', compact && 'p-4')}>
      <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
        {revoked ? <RefreshCw className="size-4" /> : <CalendarPlus className="size-4" />}
      </span>
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-base font-medium text-fg">{revoked ? t('revokedTitle') : t('title')}</p>
        <p className="text-sm text-fg-muted">{googleConfigured ? (revoked ? t('revokedBody') : t('body')) : t('notConfigured')}</p>
      </div>
      {googleConfigured ? (
        <a
          href={`/api/integrations/google/connect?returnTo=${encodeURIComponent(returnTo)}`}
          onClick={() => track('feature.calendar_connect')}
          className={buttonVariants({ variant: 'primary', size: 'sm' })}
        >
          <GoogleG />
          {revoked ? t('reconnect') : t('cta')}
        </a>
      ) : null}
    </div>
  )
}

export function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  )
}
