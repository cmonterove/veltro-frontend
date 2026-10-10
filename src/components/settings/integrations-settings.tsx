'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useCalendars, useInvalidateCalendar } from '@/lib/queries/calendar'
import { GoogleG } from '@/components/calendar/connect-calendar'
import { cn } from '@/lib/utils'
import { SettingsSection } from './section'

export function IntegrationsSettings({ redirectUri }: { redirectUri: string }) {
  const t = useTranslations('settings.integrations')
  const router = useRouter()
  const params = useSearchParams()
  const { google, googleConfigured } = useApp()
  const invalidate = useInvalidateCalendar()
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    const status = params.get('google')
    if (!status) return
    if (status === 'connected') toast.success(t('connected'))
    else toast.error(t.has(`errors.${status}`) ? t(`errors.${status}`) : t('errors.generic'))
    router.replace('/settings/integrations')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const disconnect = async () => {
    setDisconnecting(true)
    await fetch('/api/integrations/google/disconnect', { method: 'POST' })
    setDisconnecting(false)
    invalidate()
    toast.success(t('disconnected'))
    router.refresh()
  }

  return (
    <div>
      <SettingsSection
        title={
          <span className="flex items-center gap-2">
            <GoogleG />
            Google Calendar
          </span>
        }
        description={t('googleDescription')}
        action={
          google ? (
            <Button variant="ghost" size="sm" onClick={disconnect} loading={disconnecting}>
              {t('disconnect')}
            </Button>
          ) : googleConfigured ? (
            <a href="/api/integrations/google/connect?returnTo=/settings/integrations" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              {t('connect')}
            </a>
          ) : null
        }
      >
        {google ? (
          <div className="flex flex-col gap-4">
            <p className="flex items-center gap-2 text-sm text-fg">
              <span className="flex size-5 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
                <Check className="size-3" />
              </span>
              {t('connectedAs', { email: google.email })}
            </p>
            <CalendarPicker />
          </div>
        ) : !googleConfigured ? (
          <div className="flex max-w-xl flex-col gap-3 rounded-xl border border-dashed border-line-strong p-4 text-sm text-fg-muted">
            <p className="font-medium text-fg">{t('setupTitle')}</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>{t('setup1')}</li>
              <li>{t('setup2')}</li>
              <li>
                {t('setup3')}
                <code className="mt-1 block break-all rounded-md bg-hover px-2 py-1 font-mono text-xs text-fg">{redirectUri}</code>
              </li>
              <li>
                {t('setup4')}
                <code className="mt-1 block rounded-md bg-hover px-2 py-1 font-mono text-xs text-fg">GOOGLE_CLIENT_ID=…{'\n'}GOOGLE_CLIENT_SECRET=…</code>
              </li>
            </ol>
          </div>
        ) : (
          <p className="text-sm text-fg-muted">{t('notConnected')}</p>
        )}
      </SettingsSection>
    </div>
  )
}

function CalendarPicker() {
  const t = useTranslations('settings.integrations')
  const invalidate = useInvalidateCalendar()
  const { data, isLoading, refetch } = useCalendars()
  const [saving, setSaving] = useState(false)

  if (isLoading) return <Skeleton className="h-24 max-w-md" />
  if (!data) return null

  const toggle = async (id: string) => {
    const has = data.selected.includes(id)
    const next = has ? data.selected.filter((x) => x !== id) : [...data.selected, id]
    if (next.length === 0) return
    setSaving(true)
    await fetch('/api/calendar/calendars', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selected: next }),
    })
    await refetch()
    invalidate()
    setSaving(false)
  }

  return (
    <div className="max-w-md">
      <p className="mb-2 text-sm font-medium text-fg">{t('calendars')}</p>
      <ul className={cn('flex flex-col rounded-lg border border-line p-1', saving && 'opacity-70')}>
        {data.calendars.map((c) => {
          const on = data.selected.includes(c.id)
          return (
            <li key={c.id}>
              <button type="button" onClick={() => toggle(c.id)} className="flex h-9 w-full items-center gap-2.5 rounded-sm px-2 text-left text-sm hover:bg-hover">
                <span
                  className="flex size-4 items-center justify-center rounded-xs border"
                  style={{ background: on ? (c.color ?? 'var(--accent)') : 'transparent', borderColor: c.color ?? 'var(--line-strong)' }}
                >
                  {on ? <Check className="size-3 text-white" /> : null}
                </span>
                <span className="truncate">{c.name}</span>
                {c.primary ? <span className="ml-auto text-xs text-fg-subtle">{t('primary')}</span> : null}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
