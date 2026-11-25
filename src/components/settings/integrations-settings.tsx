'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Calendar, Check, CircleDashed, ExternalLink, HardDrive, Mail, Users } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CalendarError, disconnectGoogle, saveSelectedCalendars, useCalendars, useInvalidateCalendar } from '@/lib/queries/calendar'
import { toErrorCode } from '@/lib/errors'
import { CalendarGlyph, GoogleConnectButton, GoogleG } from '@/components/calendar/connect-calendar'
import { ConnectMailButton } from '@/components/mail/mail-connect'
import { useMailboxes } from '@/lib/queries/mail'
import { useHydrated } from '@/lib/hooks'
import type { ApiMailbox } from '@/lib/api/correo'
import { cn } from '@/lib/utils'
import { SettingsSection } from './section'

/**
 * Integraciones, dentro de Preferencias. Arriba, los permisos de Google de cada cuenta (correo,
 * contactos, Drive y calendario) y un botón para darlos todos de una vez; después, Google Calendar
 * (qué calendarios se muestran) y Microsoft, que viene pronto.
 */
export function IntegrationsSection({ redirectUri }: { redirectUri: string }) {
  const t = useTranslations('settings.integrations')
  const tConnect = useTranslations('mail.connectErrors')
  const tErrors = useTranslations('errors')
  const router = useRouter()
  const params = useSearchParams()
  const { google, googleConfigured } = useApp()
  const invalidate = useInvalidateCalendar()
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    // la vuelta de Google: del calendario (?google=) o de todos los permisos (?mail=)
    const status = params.get('google')
    const all = params.get('mail')
    if (!status && !all) return
    if (status === 'connected') toast.success(t('connected'))
    else if (status) toast.error(t.has(`errors.${status}`) ? t(`errors.${status}`) : t('errors.generic'))
    if (all === 'connected') toast.success(t('permissions.done'))
    else if (all) toast.error(tConnect.has(all) ? tConnect(all) : tConnect('generic'))
    router.replace('/settings/preferences#integrations', { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const disconnect = async () => {
    setDisconnecting(true)
    try {
      await disconnectGoogle()
      invalidate()
      toast.success(t('disconnected'))
      router.refresh()
    } catch (e) {
      toast.error(tErrors(toErrorCode(e as Error)))
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <SettingsSection id="integrations" title={t('pageTitle')} description={t('pageDescription')} className="mt-10 scroll-mt-6">
      {googleConfigured ? <GooglePermissions calendarEmail={google?.email ?? null} /> : null}
      <div className="mt-3 overflow-hidden rounded-xl border border-line bg-panel">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <CalendarGlyph />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">Google Calendar</p>
            <p className="text-xs leading-relaxed text-fg-muted">{t('googleDescription')}</p>
          </div>
          {google ? (
            <Button variant="ghost" size="sm" onClick={disconnect} loading={disconnecting}>
              {t('disconnect')}
            </Button>
          ) : googleConfigured ? (
            <GoogleConnectButton returnTo="/settings/preferences" size="sm" />
          ) : null}
        </div>
        <div className="border-t border-line px-4 py-4">
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
        </div>
      </div>
      <MicrosoftSoon />
    </SettingsSection>
  )
}

type Permission = { key: 'mail' | 'contacts' | 'drive' | 'driveFiles' | 'calendar'; icon: typeof Mail; on: boolean; note?: string }

/**
 * Los permisos de Google de cada cuenta conectada, uno por fila (dado o no), y un botón que los pide
 * todos de una vez (en Google se destilda lo que no se quiera). Sin cuentas, el mismo botón conecta.
 */
function GooglePermissions({ calendarEmail }: { calendarEmail: string | null }) {
  const t = useTranslations('settings.integrations.permissions')
  const boxes = useMailboxes()
  // la barra lateral también pide los buzones: hasta hidratarse se dibuja la carga, como en el servidor
  const hydrated = useHydrated()
  const loading = !hydrated || boxes.isLoading
  const google = (boxes.data?.items ?? []).filter((b) => b.provider === 'google')
  const rows = (b: ApiMailbox): Permission[] => {
    const sameCalendar = calendarEmail?.toLowerCase() === b.email.toLowerCase()
    return [
      { key: 'mail', icon: Mail, on: b.canRead, note: b.canRead ? undefined : t('sendOnly') },
      { key: 'contacts', icon: Users, on: b.canContacts },
      { key: 'drive', icon: HardDrive, on: b.canDrive },
      { key: 'driveFiles', icon: HardDrive, on: b.canDriveFiles },
      { key: 'calendar', icon: Calendar, on: sameCalendar, note: calendarEmail && !sameCalendar ? t('calendarOther', { email: calendarEmail }) : undefined },
    ]
  }
  const missing = google.some((b) => rows(b).some((r) => !r.on && !r.note)) || !google.length

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-[oklch(0.995_0.003_80)] ring-1 ring-inset ring-[oklch(0.2_0.02_300/0.1)] dark:bg-[oklch(0.3_0.02_300)]">
          <GoogleG />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">{t('title')}</p>
          <p className="max-w-[62ch] text-xs leading-relaxed text-fg-muted">{t('description')}</p>
        </div>
        {loading ? null : missing ? (
          <ConnectMailButton label={google.length ? t('grantAll') : t('connect')} size="sm" purpose="all" returnTo="/settings/preferences#integrations" />
        ) : (
          <a
            href="https://myaccount.google.com/connections"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          >
            {t('review')}
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      <div className="border-t border-line">
        {loading ? (
          <div className="p-4">
            <Skeleton className="h-28" />
          </div>
        ) : !google.length ? (
          <p className="px-4 py-4 text-sm text-fg-muted">{t('none')}</p>
        ) : (
          google.map((b) => (
            <div key={b.id} className="border-b border-line-soft px-4 py-3 last:border-b-0">
              <p className="mb-1.5 text-xs font-medium text-fg-subtle">{b.email}</p>
              <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {rows(b).map((r) => (
                  <li key={r.key} className="flex min-w-0 items-center gap-2.5 py-1">
                    {r.on ? (
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    ) : (
                      <CircleDashed className="size-5 shrink-0 text-fg-subtle" />
                    )}
                    <r.icon className="size-3.5 shrink-0 text-fg-subtle" />
                    <span className="min-w-0 text-[13px] leading-snug">
                      <span className={cn('font-medium', r.on ? 'text-fg' : 'text-fg-muted')}>{t(`${r.key}.title`)}</span>
                      <span className="text-fg-subtle"> · {r.note ?? t(`${r.key}.body`)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/** Microsoft (Outlook, OneDrive y su calendario): viene pronto. */
function MicrosoftSoon() {
  const t = useTranslations('settings.integrations.microsoft')
  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-line-strong px-4 py-3.5">
      <span aria-hidden className="grid size-10 shrink-0 grid-cols-2 gap-[3px] rounded-[11px] bg-hover p-2.5 opacity-70">
        <span className="rounded-[1px] bg-[#f25022]" />
        <span className="rounded-[1px] bg-[#7fba00]" />
        <span className="rounded-[1px] bg-[#00a4ef]" />
        <span className="rounded-[1px] bg-[#ffb900]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">{t('title')}</p>
        <p className="text-xs leading-relaxed text-fg-muted">{t('body')}</p>
      </div>
      <span className="shrink-0 rounded-full bg-hover px-2.5 py-1 text-xs font-medium text-fg-muted">{t('soon')}</span>
    </div>
  )
}

function CalendarPicker() {
  const t = useTranslations('settings.integrations')
  const tErrors = useTranslations('errors')
  const invalidate = useInvalidateCalendar()
  const { data, error, isLoading, refetch } = useCalendars()
  const [saving, setSaving] = useState(false)

  if (isLoading) return <Skeleton className="h-24 max-w-md" />
  if (error instanceof CalendarError) return <p className="text-sm text-fg-muted">{tErrors(toErrorCode({ message: error.code }))}</p>
  if (!data) return null

  const toggle = async (id: string) => {
    const has = data.selected.includes(id)
    const next = has ? data.selected.filter((x) => x !== id) : [...data.selected, id]
    if (next.length === 0) return
    setSaving(true)
    try {
      await saveSelectedCalendars(next)
      await refetch()
      invalidate()
    } catch (e) {
      toast.error(tErrors(toErrorCode(e as Error)))
    } finally {
      setSaving(false)
    }
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
