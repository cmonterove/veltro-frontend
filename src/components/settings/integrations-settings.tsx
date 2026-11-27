'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Check, ChevronDown, ExternalLink, Link2, Plus } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { Skeleton } from '@/components/ui/skeleton'
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/components/ui/menu'
import { CalendarError, disconnectGoogle, saveSelectedCalendars, useCalendars, useInvalidateCalendar } from '@/lib/queries/calendar'
import { toErrorCode } from '@/lib/errors'
import { GoogleConnectButton, GoogleG } from '@/components/calendar/connect-calendar'
import { MicrosoftMark } from '@/components/mail/mail-connect'
import { MailConnectGuide } from '@/components/mail/mail-connect-guide'
import { useMailboxes } from '@/lib/queries/mail'
import { useHydrated } from '@/lib/hooks'
import type { ApiMailbox } from '@/lib/api/correo'
import { cn } from '@/lib/utils'
import { PrefPanel } from './pref-panel'
import { ServiceArt, SERVICE_TONE, type ServiceKind } from './service-art'
import { ExchangeBlocks } from './exchange-mail'

const RETURN_TO = '/settings/preferences#integrations'

/**
 * Integraciones, el panel derecho de Preferencias: Google con cada servicio en miniatura (con permiso o
 * con lo que falta; tocar uno que falta pide todos de una vez), los calendarios que se ven en Veltro y
 * Microsoft, que viene pronto. Al volver de Google avisa cómo salió.
 */
export function IntegrationsSection({ redirectUri }: { redirectUri: string }) {
  const t = useTranslations('settings.integrations')
  const tConnect = useTranslations('mail.connectErrors')
  const router = useRouter()
  const params = useSearchParams()
  const { googleConfigured } = useApp()

  useEffect(() => {
    // la vuelta de Google: del calendario (?google=) o de todos los permisos (?mail=)
    const status = params.get('google')
    const all = params.get('mail')
    if (!status && !all) return
    if (status === 'connected') toast.success(t('connected'))
    else if (status) toast.error(t.has(`errors.${status}`) ? t(`errors.${status}`) : t('errors.generic'))
    if (all === 'connected') toast.success(t('permissions.done'))
    else if (all) toast.error(tConnect.has(all) ? tConnect(all) : tConnect('generic'))
    router.replace(RETURN_TO, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <PrefPanel id="integrations" title={t('pageTitle')}>
      {googleConfigured ? <GoogleBlock /> : <GoogleSetup redirectUri={redirectUri} />}
      <ExchangeBlocks head={(p) => <ProviderHead {...p} />} />
      <MicrosoftSoon />
    </PrefPanel>
  )
}

/** La cabecera de un proveedor: su marca en una ficha blanca, el nombre, una línea de estado y la acción. */
function ProviderHead({ mark, name, sub, action, muted }: { mark: React.ReactNode; name: string; sub: React.ReactNode; action?: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
      <span
        aria-hidden
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[oklch(0.995_0.003_80)] shadow-[0_1px_2px_oklch(0.2_0.02_300/0.08)] ring-1 ring-inset ring-[oklch(0.2_0.02_300/0.1)] dark:bg-[oklch(0.3_0.02_300)] dark:ring-white/10',
          muted && 'opacity-80 grayscale-[0.35]',
        )}
      >
        {mark}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-[15px] font-semibold leading-tight tracking-[-0.01em]', muted ? 'text-fg-muted' : 'text-fg')}>{name}</p>
        <div className="mt-0.5 text-xs leading-snug text-fg-muted">{sub}</div>
      </div>
      {/* en el teléfono la acción baja a su propio renglón, alineada con el texto */}
      {action ? <div className="shrink-0 max-sm:basis-full max-sm:pl-[52px]">{action}</div> : null}
    </div>
  )
}

type Account = { email: string; box: ApiMailbox | null }
type PermState = 'on' | 'off' | 'elsewhere'
type Perm = { key: ServiceKind; state: PermState; note?: string }

const same = (a?: string | null, b?: string | null) => Boolean(a && b && a.toLowerCase() === b.toLowerCase())

/**
 * Google: la cuenta (con varias, se elige en un menú junto al correo), sus cinco servicios en miniatura y, si el
 * calendario es de esa cuenta, qué calendarios se muestran. Lo que falta se pide todo junto: en Google
 * se destilda lo que no se quiera.
 */
function GoogleBlock() {
  const t = useTranslations('settings.integrations.permissions')
  const tMail = useTranslations('mail')
  const { google } = useApp()
  const boxes = useMailboxes()
  const calendars = useCalendars(Boolean(google))
  // la barra lateral también pide los buzones: hasta hidratarse se dibuja la carga, como en el servidor
  const hydrated = useHydrated()
  const loading = !hydrated || boxes.isLoading
  const [guide, setGuide] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)

  // las cuentas: las del correo y, si el calendario está con otra, también esa
  const accounts: Account[] = (boxes.data?.items ?? []).filter((b) => b.provider === 'google').map((b) => ({ email: b.email, box: b }))
  if (google && !accounts.some((a) => same(a.email, google.email))) accounts.push({ email: google.email, box: null })
  const current = accounts.find((a) => same(a.email, picked)) ?? accounts[0] ?? null

  const calRevoked = calendars.error instanceof CalendarError && calendars.error.code === 'google_auth_revoked'
  const perms = (a: Account | null): Perm[] => {
    const b = a?.box ?? null
    const revoked = b?.problem === 'mail_auth_revoked'
    const has = (v?: boolean): PermState => (v && !revoked ? 'on' : 'off')
    const cal: PermState = google && !calRevoked ? (same(google.email, a?.email) ? 'on' : 'elsewhere') : 'off'
    return [
      { key: 'mail', state: has(b?.canRead), note: b && !b.canRead && !revoked ? t('sendOnly') : undefined },
      { key: 'contacts', state: has(b?.canContacts) },
      { key: 'drive', state: has(b?.canDrive) },
      { key: 'driveFiles', state: has(b?.canDriveFiles) },
      { key: 'calendar', state: cal, note: cal === 'elsewhere' && google ? t('calendarOther', { email: google.email }) : undefined },
    ]
  }
  const missingOf = (a: Account) => perms(a).filter((p) => p.state === 'off').length
  const list = perms(current)
  const missing = list.filter((p) => p.state === 'off').length
  const problem = current?.box?.problem ?? null
  const ask = () => setGuide(true)

  const sub = loading ? (
    <Skeleton className="h-3.5 w-48" />
  ) : !current ? (
    t('connectHint')
  ) : (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
      {accounts.length > 1 ? (
        // con varias cuentas, la de arriba se elige aquí (el punto dice si le falta algo)
        <Menu>
          <MenuTrigger className="-mx-1 inline-flex min-w-0 items-center gap-1 rounded-md px-1 font-medium text-fg outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent-mid/40">
            <span className="truncate">{current.email}</span>
            <ChevronDown className="size-3 shrink-0 text-fg-muted" />
          </MenuTrigger>
          <MenuContent align="start">
            <MenuRadioGroup value={current.email} onValueChange={(v) => setPicked(String(v))}>
              {accounts.map((a) => (
                <MenuRadioItem key={a.email} value={a.email} closeOnClick className="relative">
                  <span className={cn('size-1.5 shrink-0 rounded-full', missingOf(a) || a.box?.problem ? 'bg-warning' : 'bg-success')} />
                  <span className="truncate">{a.email}</span>
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuContent>
        </Menu>
      ) : (
        <span className="min-w-0 truncate">{current.email}</span>
      )}
      <span aria-hidden className="text-fg-subtle">·</span>
      {problem ? (
        <span className="text-warning">{tMail.has(`errors.${problem}`) ? tMail(`errors.${problem}`) : tMail('errors.generic')}</span>
      ) : missing ? (
        <span className="font-medium text-warning">{t('missing', { count: missing })}</span>
      ) : (
        <span className="inline-flex items-center gap-1 font-medium text-success">
          <Check className="size-3" strokeWidth={3} />
          {t('allSet')}
        </span>
      )}
    </span>
  )

  const action = loading ? null : !current || missing || problem ? (
    <GoogleConnectButton
      kind="mail"
      size="sm"
      returnTo={RETURN_TO}
      label={!current ? t('connect') : problem === 'mail_auth_revoked' ? tMail('connect.reconnect') : t('grantAll')}
      onClick={(e) => {
        e.preventDefault()
        ask()
      }}
    />
  ) : (
    <a
      href="https://myaccount.google.com/connections"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg"
    >
      {t('review')}
      <ExternalLink className="size-3" />
    </a>
  )

  return (
    <div className="border-b-0 pb-3.5 pt-1">
      <ProviderHead mark={<GoogleG className="size-5" />} name="Google" sub={sub} action={action} />

      <ul className="mt-3.5 grid grid-cols-3 gap-x-2.5 gap-y-4 sm:grid-cols-5">
        {list.map((p) => (loading ? <TileSkeleton key={p.key} /> : <ServiceTile key={p.key} perm={p} onAsk={ask} />))}
      </ul>

      {/* debajo: los calendarios si el calendario es de esta cuenta; si no, lo que suman los permisos que faltan */}
      {loading ? null : google && same(google.email, current?.email) ? (
        <CalendarsRow onReconnect={ask} />
      ) : missing && !problem ? (
        <GainsRow keys={list.filter((p) => p.state === 'off').map((p) => p.key)} fresh={!current} onAsk={ask} />
      ) : null}

      <MailConnectGuide open={guide} onOpenChange={setGuide} returnTo={RETURN_TO} purpose="all" />
    </div>
  )
}

/** Un servicio: su miniatura (en color si tiene permiso; gris y punteada si falta), su nombre y qué hace. */
function ServiceTile({ perm, onAsk }: { perm: Perm; onAsk: () => void }) {
  const t = useTranslations('settings.integrations.permissions')
  const off = perm.state === 'off'
  const name = t(`${perm.key}.chip`)
  const body = perm.note ?? t(`${perm.key}.body`)
  const inner = (
    <>
      <span className="relative block">
        <span
          className={cn(
            'relative block h-16 overflow-hidden rounded-xl border transition-[filter,opacity,transform] duration-300 ease-out [--tint:13%] tall:h-[88px] dark:[--tint:24%]',
            off
              ? 'border-dashed border-line-strong opacity-55 grayscale group-hover:-translate-y-px group-hover:opacity-100 group-hover:grayscale-0'
              : 'border-[oklch(0.2_0.02_300/0.06)] dark:border-white/10',
          )}
          style={{ ['--art-bg' as string]: `color-mix(in oklch, ${SERVICE_TONE[perm.key]} var(--tint), var(--panel))`, background: 'var(--art-bg)' }}
        >
          {/* en pantallas altas la caja crece y la miniatura con ella (la misma, más grande) */}
          <span className="absolute inset-0 tall:[zoom:1.375]">
            <ServiceArt kind={perm.key} />
          </span>
        </span>
        <span
          aria-hidden
          className={cn(
            'absolute -right-1.5 -top-1.5 flex size-[18px] items-center justify-center rounded-full ring-2 ring-panel',
            perm.state === 'on' ? 'bg-success text-panel' : perm.state === 'elsewhere' ? 'bg-hover text-fg-muted' : 'bg-panel text-fg-muted shadow-[inset_0_0_0_1px_var(--line-strong)]',
          )}
        >
          {perm.state === 'on' ? <Check className="size-3" strokeWidth={3.25} /> : perm.state === 'elsewhere' ? <Link2 className="size-3" strokeWidth={2.5} /> : <Plus className="size-3" strokeWidth={2.75} />}
        </span>
      </span>
      <span className={cn('mt-2 block truncate text-[12.5px] font-medium leading-tight tall:text-[13.5px]', off ? 'text-fg-muted' : 'text-fg')}>
        {name}
        <span className="sr-only">: {off ? t('stateOff') : t('stateOn')}</span>
      </span>
      <span className="mt-0.5 line-clamp-2 block text-[11px] leading-[1.35] text-fg-subtle [overflow-wrap:anywhere] tall:text-xs">{body}</span>
    </>
  )
  return (
    <li className="min-w-0">
      {off ? (
        <button type="button" onClick={onAsk} title={t('grantOne', { name })} className="group block w-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-accent-mid/40">
          {inner}
        </button>
      ) : (
        <div title={body}>{inner}</div>
      )}
    </li>
  )
}

function TileSkeleton() {
  return (
    <li className="min-w-0">
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="mt-2 h-3 w-3/4" />
      <Skeleton className="mt-1.5 h-2.5 w-full" />
    </li>
  )
}

/** De lo que falta, lo que más suma primero: el calendario, leer el correo, la Bóveda, contactos y Drive. */
const GAIN_ORDER: ServiceKind[] = ['calendar', 'mail', 'driveFiles', 'contacts', 'drive']

/** Lo que suma cada permiso que falta (tres como mucho), en una línea; tocar una pide todos de una vez. */
function GainsRow({ keys, fresh, onAsk }: { keys: ServiceKind[]; fresh: boolean; onAsk: () => void }) {
  const t = useTranslations('settings.integrations.permissions')
  const shown = GAIN_ORDER.filter((k) => keys.includes(k)).slice(0, 3)
  return (
    <div className="mt-3 border-t border-line-soft pt-2.5">
      <h3 className="mb-1 text-[13px] font-medium text-fg">{fresh ? t('gainsNew') : t('gains')}</h3>
      <ul>
        {shown.map((k) => (
          <li key={k}>
            <button
              type="button"
              onClick={onAsk}
              title={t(`${k}.gain`)}
              className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-lg px-2 py-[3px] text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent-mid/40"
            >
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full text-fg-muted shadow-[inset_0_0_0_1px_var(--line-strong)]">
                <Plus className="size-2.5" strokeWidth={3} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] leading-[18px]">
                <span className="font-medium text-fg">{t(`${k}.chip`)}</span>
                <span className="text-fg-muted"> · {t(`${k}.gain`)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Los calendarios de Google que se ven en Veltro, en fichas con su color (tocar una la prende o la apaga). */
function CalendarsRow({ onReconnect }: { onReconnect: () => void }) {
  const t = useTranslations('settings.integrations')
  const tErrors = useTranslations('errors')
  const router = useRouter()
  const invalidate = useInvalidateCalendar()
  const { data, error, isLoading, refetch, isFetching } = useCalendars()
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  // dos renglones de fichas como mucho (el panel no crece y la página no se desplaza): «Ver todos» abre el resto
  const chipsRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState(false)
  const [expanded, setExpanded] = useState(false)
  useLayoutEffect(() => {
    const el = chipsRef.current
    if (!el) return
    const check = () => setOverflow(el.scrollHeight > el.clientHeight + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [data, expanded])

  const toggle = async (id: string) => {
    if (!data) return
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

  const code = error instanceof CalendarError ? error.code : error ? 'google_error' : null

  return (
    <div className="mt-3.5 border-t border-line-soft pt-2.5">
      <div className="mb-1.5 flex min-h-6 items-center gap-3">
        <h3 className="text-[13px] font-medium text-fg">{t('calendars')}</h3>
        <span className="flex-1" />
        {data && (overflow || expanded) ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="rounded-md px-2 py-1 text-xs font-medium text-fg outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent-mid/40"
          >
            {expanded ? t('permissions.showLess') : t('permissions.showAll', { count: data.calendars.length })}
          </button>
        ) : null}
        <button
          type="button"
          onClick={disconnect}
          disabled={disconnecting}
          className="shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-xs text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/40 disabled:cursor-wait disabled:opacity-60"
        >
          {t('permissions.disconnectCalendar')}
        </button>
      </div>
      {isLoading ? (
        <div className="flex gap-1.5">
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-32 rounded-full" />
        </div>
      ) : code ? (
        <div className="flex items-center gap-3 rounded-xl bg-warning-soft/70 px-3 py-2">
          <p className="min-w-0 flex-1 text-xs leading-snug text-fg">{tErrors.has(code) ? tErrors(code) : tErrors('google_error')}</p>
          <button
            type="button"
            onClick={() => (code === 'google_auth_revoked' ? onReconnect() : refetch())}
            disabled={isFetching}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-fg outline-none transition-colors hover:bg-panel/70 focus-visible:ring-2 focus-visible:ring-accent-mid/40 disabled:opacity-60"
          >
            {code === 'google_auth_revoked' ? t('permissions.reconnect') : t('permissions.retry')}
          </button>
        </div>
      ) : data ? (
        <div ref={chipsRef} className={cn('-m-0.5 flex flex-wrap gap-1.5 p-0.5', !expanded && 'max-h-[62px] overflow-hidden tall:max-h-[94px]', saving && 'pointer-events-none opacity-70')}>
          {data.calendars.map((c) => {
            const on = data.selected.includes(c.id)
            const color = c.color ?? 'var(--accent)'
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                aria-pressed={on}
                title={c.primary ? t('primary') : undefined}
                className={cn(
                  'inline-flex h-[26px] max-w-full items-center gap-1.5 rounded-full px-2.5 text-xs outline-none transition-[background-color,color,box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-accent-mid/40',
                  on ? 'font-medium text-fg' : 'text-fg-muted ring-1 ring-inset ring-line hover:text-fg hover:ring-line-strong',
                )}
                style={on ? { background: `color-mix(in oklch, ${color} 18%, var(--panel))` } : undefined}
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: color, opacity: on ? 1 : 0.4 }} />
                <span className="truncate">{c.name}</span>
                {on ? <Check className="size-3 shrink-0" strokeWidth={2.5} /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/** Sin Google configurado en el servidor: los pasos para quien lo administra. */
function GoogleSetup({ redirectUri }: { redirectUri: string }) {
  const t = useTranslations('settings.integrations')
  return (
    <div className="border-b-0 pb-4 pt-1.5">
      <ProviderHead mark={<GoogleG className="size-5" />} name="Google" sub={t('setupTitle')} muted />
      <ol className="mt-3 list-decimal space-y-1 rounded-xl border border-dashed border-line-strong py-3 pl-9 pr-4 text-[13px] text-fg-muted">
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
  )
}

/** Microsoft (Outlook, OneDrive y su calendario): viene pronto. Queda abajo del todo. */
function MicrosoftSoon() {
  const t = useTranslations('settings.integrations.microsoft')
  return (
    <div className="mt-auto border-t border-line-soft pb-0.5 pt-3">
      <ProviderHead
        muted
        mark={<MicrosoftMark className="size-[18px]" />}
        name="Microsoft 365"
        sub={t('body')}
        action={<span className="shrink-0 rounded-full border border-dashed border-line-strong px-2.5 py-1 text-xs font-medium text-fg-muted">{t('soon')}</span>}
      />
    </div>
  )
}
