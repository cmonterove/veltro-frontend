'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Check, Eye, EyeOff, KeyRound, Mail, Monitor, Moon, SlidersHorizontal, Sun, UserRound } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { IntegrationsSection } from './integrations-settings'
import { setLocale } from '@/app/actions/preferences'
import { localeNames, locales, type AppLocale } from '@/i18n/config'
import { Select } from '@/components/ui/select'
import { changePassword, updateProfile } from '@/app/actions/settings'
import { passwordProblem } from '@/lib/api/ajustes'
import { cn } from '@/lib/utils'
import { useHydrated } from '@/lib/hooks'
import { SaveBar, SettingsCard, SettingsRow } from './ui'

/** active: llegó por el enlace de recuperación y aún vale; expired: llegó por el enlace pero ya venció. */
export type RecoveryState = 'active' | 'expired' | null

/**
 * Tus ajustes: tu foto y nombre arriba y dos pestañas, Perfil y Preferencias. Las dos viven aquí: cambiar
 * de una a otra es al instante (no va al servidor) y solo se actualiza la dirección, para recargar o compartirla.
 */
export function PersonalSettings({ tab, recovery = null, redirectUri }: { tab: 'profile' | 'preferences'; recovery?: RecoveryState; redirectUri: string }) {
  const t = useTranslations('settings.nav')
  const tSettings = useTranslations('settings')
  const { profile } = useApp()
  const [current, setCurrent] = useState(tab)
  const go = (next: 'profile' | 'preferences') => {
    if (next === current) return
    setCurrent(next)
    window.history.replaceState(null, '', next === 'profile' ? '/settings/profile' : '/settings/preferences')
    // el título de la pestaña del navegador, como si se hubiera entrado por esa dirección
    document.title = `${t(next)} · ${tSettings('title')} · Veltro`
  }
  const tabs = [
    { id: 'profile' as const, label: t('profile'), icon: <UserRound /> },
    { id: 'preferences' as const, label: t('preferences'), icon: <SlidersHorizontal /> },
  ]
  return (
    <div>
      <header className="mb-8 flex flex-wrap items-center gap-4">
        <Avatar name={profile.full_name} src={profile.avatar_url} seed={profile.id} size={52} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-semibold leading-tight tracking-[-0.02em] text-fg">{profile.full_name}</h1>
          <p className="truncate text-sm text-fg-muted">{profile.email}</p>
        </div>
        <nav className="flex items-center gap-0.5 rounded-2xl bg-fg/[0.05] p-1" aria-label={t('groupYou')}>
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => go(x.id)}
              aria-current={current === x.id ? 'page' : undefined}
              className={cn(
                'inline-flex h-8 items-center gap-2 rounded-xl px-3 text-sm font-medium outline-none transition-[background-color,color,box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-accent-mid/40 [&_svg]:size-4',
                current === x.id ? 'bg-panel text-fg shadow-card [&_svg]:text-accent' : 'text-fg-muted hover:text-fg [&_svg]:text-fg-subtle',
              )}
            >
              {x.icon}
              {x.label}
            </button>
          ))}
        </nav>
      </header>
      {current === 'profile' ? (
        <ProfileSettings recovery={recovery} />
      ) : (
        <>
          <PreferencesSettings />
          <IntegrationsSection redirectUri={redirectUri} />
        </>
      )}
    </div>
  )
}

/**
 * Perfil (de tus ajustes): una lista corta, cada fila con su ícono — tu nombre (se cambia aquí), tu correo
 * y tu contraseña (se cambia en un diálogo). La foto se toma de tu cuenta de Google o Apple.
 */
export function ProfileSettings({ recovery = null }: { recovery?: RecoveryState }) {
  const t = useTranslations('settings.profile')
  const te = useTranslations('errors')
  const router = useRouter()
  const { profile } = useApp()
  const [name, setName] = useState(profile.full_name)
  const [saving, start] = useTransition()
  const [changing, setChanging] = useState(false)
  const dirty = name.trim() !== profile.full_name

  const save = () =>
    start(async () => {
      const res = await updateProfile({ full_name: name.trim() || profile.full_name })
      if (res.ok) {
        toast.success(t('saved'))
        router.refresh()
      } else toast.error(te(res.error))
    })

  // con contraseña temporal o recién llegado del enlace, la contraseña va primero: es lo que vino a hacer
  const urgent = recovery !== null || profile.must_change_password

  return (
    <div className="flex flex-col gap-3">
      {urgent ? <PasswordCard recovery={recovery} email={profile.email} mustChange={profile.must_change_password} /> : null}

      <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl bg-panel ring-1 ring-line-soft">
        <ListRow icon={<UserRound />} tone="bg-accent-soft text-accent-ink" label={t('name')} hint={t('nameHint')} htmlFor="p-name">
          <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="sm:w-64" />
        </ListRow>
        <ListRow icon={<Mail />} tone="bg-k-decision-soft text-k-decision" label={t('email')} hint={t('emailHint')}>
          <span className="truncate text-sm text-fg-muted">{profile.email}</span>
        </ListRow>
        {urgent ? null : (
          <ListRow icon={<KeyRound />} tone="bg-warning-soft text-mandarina-ink" label={t('password')} hint={t('passwordDescription')}>
            <Button size="sm" onClick={() => setChanging(true)}>
              {t('changeShort')}
            </Button>
          </ListRow>
        )}
      </ul>
      <p className="px-1 text-xs text-fg-subtle">{t('photoHint')}</p>

      <PasswordDialog open={changing} onOpenChange={setChanging} />

      <SaveBar dirty={dirty} pending={saving} onSave={save} onDiscard={() => setName(profile.full_name)} disabled={name.trim().length < 2} />
    </div>
  )
}

/** Cambiar la contraseña: cabecera con su ícono y el formulario con el medidor y las reglas a la vista. */
function PasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('settings.profile')
  const { profile } = useApp()
  const close = () => onOpenChange(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden rounded-2xl">
        <div className="flex items-start gap-3.5 border-b border-line-soft bg-canvas/60 px-6 pb-4 pr-12 pt-5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-warning-soft text-mandarina-ink">
            <KeyRound className="size-5" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold text-fg">{t('changePassword')}</DialogTitle>
            <DialogDescription className="mt-0.5 text-sm leading-relaxed text-fg-muted">{t('passwordDescription')}</DialogDescription>
          </div>
        </div>
        {/* se arma al abrir: cada vez empieza vacío */}
        {open ? <PasswordCard recovery={null} email={profile.email} mustChange={false} variant="dialog" onDone={close} onCancel={close} /> : null}
      </DialogContent>
    </Dialog>
  )
}

/** Un campo de contraseña con el ojo para ver lo que se escribe. */
function PasswordInput({ id, value, onChange, autoComplete, autoFocus }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; autoFocus?: boolean }) {
  const t = useTranslations('settings.profile')
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input id={id} type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} maxLength={72} autoFocus={autoFocus} className="pr-10" />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? t('hidePassword') : t('showPassword')}
        className="absolute right-1.5 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

/** Una fila de la lista: su ícono en una ficha de color, qué es (con una línea que explica) y el control a la derecha. */
function ListRow({ icon, tone, label, hint, htmlFor, children }: { icon: React.ReactNode; tone: string; label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
      <span className="flex min-w-0 flex-1 items-center gap-3.5">
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-[18px]', tone)} aria-hidden>
          {icon}
        </span>
        <span className="min-w-0">
          {htmlFor ? (
            <label htmlFor={htmlFor} className="block text-sm font-medium text-fg">
              {label}
            </label>
          ) : (
            <span className="block text-sm font-medium text-fg">{label}</span>
          )}
          {hint ? <span className="block text-xs leading-relaxed text-fg-muted">{hint}</span> : null}
        </span>
      </span>
      <span className="flex min-w-0 shrink-0 items-center sm:justify-end">{children}</span>
    </li>
  )
}

type PasswordCardProps = {
  recovery: RecoveryState
  email: string
  /** contraseña temporal: no hace falta la actual */
  mustChange: boolean
  /** fuera de la app (/auth/reset): adónde ir al terminar, con recarga completa */
  doneHref?: string
  /** section: dentro de una sección de Perfil (su título va afuera), con los campos lado a lado; dialog: igual, sin tarjeta */
  variant?: 'card' | 'section' | 'dialog'
  /** al cambiarla con éxito (p. ej. cerrar el diálogo) */
  onDone?: () => void
  /** el diálogo: «Cancelar» */
  onCancel?: () => void
}

/**
 * Cambiar la contraseña. Pide la actual salvo con contraseña temporal o recién llegado del
 * enlace de recuperación (la API lo vuelve a comprobar: si la ventana venció, la pide).
 */
export function PasswordCard({ recovery, email, mustChange, doneHref, variant = 'card', onDone, onCancel }: PasswordCardProps) {
  const t = useTranslations('settings.profile')
  const te = useTranslations('errors')
  const router = useRouter()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pending, start] = useTransition()
  // la API puede pedir la actual aunque llegue por el enlace (si pasaron más de 15 minutos)
  const [needCurrent, setNeedCurrent] = useState(recovery !== 'active' && !mustChange)
  const [error, setError] = useState<string | null>(null)

  const mode = recovery === 'active' && !needCurrent ? 'recovery' : recovery === 'expired' || (recovery === 'active' && needCurrent) ? 'expired' : mustChange ? 'temp' : 'normal'
  const title = mode === 'recovery' || mode === 'expired' ? t('recoveryTitle') : mode === 'temp' ? t('tempTitle') : t('password')
  const description = mode === 'recovery' ? t('recoveryDescription') : mode === 'temp' ? t('passwordTemp') : mode === 'normal' ? t('passwordDescription') : null

  const submit = () => {
    setError(null)
    if (needCurrent && !current) return setError(te('current_password_required'))
    const problem = passwordProblem(password)
    if (problem) return setError(t(problem))
    if (password !== confirm) return setError(t('passwordMismatch'))
    start(async () => {
      const res = await changePassword({ newPassword: password, currentPassword: needCurrent ? current : undefined })
      if (!res.ok) {
        if (res.error === 'current_password_required') setNeedCurrent(true)
        setError(te(res.error))
        return
      }
      setCurrent('')
      setPassword('')
      setConfirm('')
      toast.success(t('passwordChanged'), { description: t('passwordChangedHint') })
      onDone?.()
      if (doneHref) {
        window.location.href = doneHref
        return
      }
      // sin ?reset=1: el enlace ya se usó
      if (recovery) router.replace('/settings/profile')
      router.refresh()
    })
  }

  if (variant === 'dialog') {
    // las mismas reglas que la API (lib/api/ajustes passwordProblem): 8 o más y tres de los cuatro tipos
    const checks = [
      { key: 'length', ok: password.length >= 8 },
      { key: 'lower', ok: /[a-z]/.test(password) },
      { key: 'upper', ok: /[A-Z]/.test(password) },
      { key: 'digit', ok: /[0-9]/.test(password) },
      { key: 'symbol', ok: /[^A-Za-z0-9]/.test(password) },
    ]
    const kinds = checks.slice(1).filter((c) => c.ok).length
    const score = !password ? 0 : password.length < 8 ? 1 : kinds < 3 ? 2 : kinds === 3 ? 3 : 4
    const matches = confirm.length > 0 && confirm === password
    const ready = score >= 3 && password.length <= 72 && matches && (!needCurrent || current.length > 0)
    const meter = ['', 'bg-danger', 'bg-mandarina', 'bg-accent-mid', 'bg-done'][score]
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
        <div className="flex flex-col gap-4 px-6 py-5">
          {needCurrent ? (
            <Field label={t('currentPassword')} htmlFor="p-pw0">
              <PasswordInput id="p-pw0" autoComplete="current-password" value={current} onChange={setCurrent} autoFocus />
            </Field>
          ) : null}
          <Field label={t('newPassword')} htmlFor="p-pw">
            <PasswordInput id="p-pw" autoComplete="new-password" value={password} onChange={setPassword} autoFocus={!needCurrent} />
            {/* qué tan segura: cuatro tramos que se llenan y su nombre */}
            <div className="mt-2.5 flex items-center gap-3">
              <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden>
                {[1, 2, 3, 4].map((i) => (
                  <span key={i} className={cn('h-1.5 rounded-full transition-colors duration-300', i <= score ? meter : 'bg-fg/[0.07]')} />
                ))}
              </div>
              <span className={cn('w-14 text-right text-xs font-medium', score ? 'text-fg' : 'text-fg-subtle')}>{score ? t(`strength.${score}`) : ''}</span>
            </div>
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {checks.map((c) => (
                <li
                  key={c.key}
                  className={cn('inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs transition-colors duration-200', c.ok ? 'bg-done-soft text-done' : 'bg-fg/[0.05] text-fg-muted')}
                >
                  {c.ok ? <Check className="size-3" strokeWidth={2.5} /> : <span className="size-1 rounded-full bg-current opacity-50" />}
                  {t(`rule.${c.key}`)}
                </li>
              ))}
            </ul>
          </Field>
          <Field label={t('confirmPassword')} htmlFor="p-pw2">
            <PasswordInput id="p-pw2" autoComplete="new-password" value={confirm} onChange={setConfirm} />
            {confirm ? (
              <p className={cn('mt-1.5 flex items-center gap-1 text-xs', matches ? 'text-done' : 'text-fg-muted')}>
                {matches ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
                {matches ? t('matches') : t('noMatchYet')}
              </p>
            ) : null}
          </Field>
          {error ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line-soft bg-canvas/60 px-6 py-3.5">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={pending} disabled={!ready}>
            {t('savePassword')}
          </Button>
        </div>
      </form>
    )
  }

  if (variant === 'section') {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="rounded-2xl bg-panel p-5 ring-1 ring-line-soft"
      >
        <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
        <div className="grid gap-4 sm:grid-cols-2">
          {needCurrent ? (
            <Field label={t('currentPassword')} htmlFor="p-pw0" className="sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
              <Input id="p-pw0" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </Field>
          ) : null}
          <Field label={t('newPassword')} htmlFor="p-pw">
            <Input id="p-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72} />
          </Field>
          <Field label={t('confirmPassword')} htmlFor="p-pw2">
            <Input id="p-pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={72} />
          </Field>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line-soft pt-4">
          {error ? (
            <p role="alert" className="mr-auto text-sm text-danger">
              {error}
            </p>
          ) : (
            <p className="mr-auto max-w-md text-xs leading-relaxed text-fg-muted">{t('passwordRules')}</p>
          )}
          <Button type="submit" variant="secondary" className="ml-auto" loading={pending} disabled={!password || !confirm}>
            {t('changePassword')}
          </Button>
        </div>
      </form>
    )
  }

  return (
    <SettingsCard
      title={
        <span className="inline-flex items-center gap-1.5">
          {mode !== 'normal' ? <KeyRound className="size-3.5 text-accent-ink" /> : null}
          {title}
        </span>
      }
      description={description}
      className={mode !== 'normal' ? '[&>div:last-child]:border-accent-mid [&>div:last-child]:ring-3 [&>div:last-child]:ring-accent-mid/15' : undefined}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="divide-y divide-line-soft"
      >
        {/* el correo, para que el gestor de contraseñas guarde la nueva en la entrada correcta */}
        <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
        {mode === 'expired' ? (
          <p role="status" className="rounded-t-xl bg-warning-soft px-5 py-3 text-sm text-fg">
            {t('recoveryExpired')}
          </p>
        ) : null}
        {needCurrent ? (
          <SettingsRow label={t('currentPassword')} htmlFor="p-pw0">
            <Input id="p-pw0" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className="sm:w-72" />
          </SettingsRow>
        ) : null}
        <SettingsRow label={t('newPassword')} description={t('passwordRules')} htmlFor="p-pw">
          <Input
            id="p-pw"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={72}
            autoFocus={mode === 'recovery' || mode === 'temp'}
            className="sm:w-72"
          />
        </SettingsRow>
        <SettingsRow label={t('confirmPassword')} htmlFor="p-pw2">
          <Input id="p-pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={72} className="sm:w-72" />
        </SettingsRow>
        <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-3">
          {error ? (
            <p role="alert" className="mr-auto text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant={mode === 'normal' ? 'secondary' : 'primary'} loading={pending} disabled={!password || !confirm}>
            {mode === 'normal' ? t('changePassword') : t('savePassword')}
          </Button>
        </div>
      </form>
    </SettingsCard>
  )
}

/** Un saludo en cada idioma, para elegirlo viéndolo (no se traduce: es la muestra). */
const SAMPLE: Record<AppLocale, string> = { es: 'Hola, ¿cómo vas?', en: 'Hi, how’s it going?', pt: 'Olá, tudo bem?', fr: 'Bonjour, ça va ?' }

/**
 * Preferencias: se elige viendo. El idioma en tarjetas con un saludo, el tema con una vista previa de la
 * app (claro, oscuro o según el equipo) y la zona horaria con la hora de ahora allí. Todo se aplica al momento.
 */
export function PreferencesSettings() {
  const t = useTranslations('settings.profile')
  const router = useRouter()
  const locale = useLocale() as AppLocale
  const { profile } = useApp()
  const { theme, setTheme } = useTheme()
  const [timezone, setTimezone] = useState(profile.timezone)
  const [switching, startLocale] = useTransition()
  const [picked, setPicked] = useState<AppLocale | null>(null)
  const hydrated = useHydrated()

  // La lista de zonas depende del ICU de cada motor (Node y el navegador difieren): solo se arma en el cliente.
  const zones = useMemo(() => {
    if (!hydrated) return [timezone]
    try {
      const all = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone')
      return all.includes(timezone) ? all : [timezone, ...all]
    } catch {
      return [timezone]
    }
  }, [hydrated, timezone])

  const changeZone = async (tz: string) => {
    setTimezone(tz)
    const res = await updateProfile({ timezone: tz })
    if (res.ok) {
      toast.success(t('saved'))
      router.refresh()
    } else {
      setTimezone(profile.timezone)
      toast.error(t('error'))
    }
  }

  // la hora de ahora en la zona elegida (solo en el navegador: el servidor iría un minuto atrás)
  const now = hydrated ? new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date()) : null
  const head = (title: string, hint: string) => (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>
    </div>
  )
  const tile = (active: boolean) =>
    cn(
      'group/tile relative flex flex-col rounded-2xl bg-panel text-left outline-none ring-1 transition-[box-shadow,transform] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-accent-mid/50',
      active ? 'shadow-card ring-2 ring-accent' : 'ring-line-soft hover:-translate-y-px hover:shadow-card hover:ring-line',
    )

  return (
    <div>
      <h2 className="sr-only">{t('preferences')}</h2>

      <section className="mb-8">
        {head(t('language'), t('languageHint'))}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {locales.map((l) => {
            const active = (picked ?? locale) === l
            return (
              <button
                key={l}
                type="button"
                lang={l}
                aria-pressed={active}
                disabled={switching}
                onClick={() => {
                  if (l === locale) return
                  setPicked(l)
                  startLocale(() => setLocale(l))
                }}
                className={cn(tile(active), 'gap-1 p-4 disabled:cursor-wait')}
              >
                <span className="text-[15px] font-semibold text-fg">{localeNames[l]}</span>
                <span className="text-sm text-fg-muted">{SAMPLE[l]}</span>
                {active ? <Check className="absolute right-3.5 top-3.5 size-4 text-accent" /> : null}
              </button>
            )
          })}
        </div>
      </section>

      <section className="mb-8">
        {head(t('theme'), t('themeHint'))}
        <div className="grid grid-cols-3 gap-3">
          {(['light', 'dark', 'system'] as const).map((id) => {
            const active = hydrated && theme === id
            const Icon = id === 'light' ? Sun : id === 'dark' ? Moon : Monitor
            return (
              <button key={id} type="button" aria-pressed={active} onClick={() => setTheme(id)} className={cn(tile(active), 'p-2.5')}>
                <ThemePreview mode={id} />
                <span className="flex items-center gap-1.5 px-1 pb-0.5 pt-2.5 text-sm font-medium text-fg">
                  <Icon className="size-3.5 text-fg-muted" />
                  {t(`themes.${id}`)}
                  {active ? <Check className="ml-auto size-4 text-accent" /> : null}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <SettingsCard title={t('timezone')} description={t('timezoneHint')}>
        <SettingsRow label={t('timezoneZone')} description={now ? t('nowThere', { time: now }) : undefined} htmlFor="p-tz">
          <Select id="p-tz" value={timezone} onChange={changeZone} options={zones.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))} className="sm:w-72" />
        </SettingsRow>
      </SettingsCard>
    </div>
  )
}

/**
 * La app en miniatura en cada tema (con sus colores fijos, no los del tema actual): el marco ciruela, el
 * menú y la hoja con unas líneas. «Sistema» mitad y mitad.
 */
function ThemePreview({ mode }: { mode: 'light' | 'dark' | 'system' }) {
  const palette = {
    light: { frame: 'oklch(0.33 0.085 312)', sheet: 'oklch(0.975 0.008 75)', card: 'oklch(1 0 0)', line: 'oklch(0.3 0.04 312 / 0.14)', accent: 'oklch(0.62 0.12 312)' },
    dark: { frame: 'oklch(0.19 0.03 312)', sheet: 'oklch(0.235 0.02 312)', card: 'oklch(0.28 0.022 312)', line: 'oklch(1 0 0 / 0.14)', accent: 'oklch(0.72 0.11 312)' },
  }
  const scene = (p: (typeof palette)['light']) => (
    <span className="absolute inset-0 flex gap-1.5 p-1.5" style={{ background: p.frame }}>
      <span className="flex w-[22%] flex-col gap-1 pt-1">
        {[0.9, 0.6, 0.7, 0.5].map((w, i) => (
          <span key={i} className="h-1 rounded-full" style={{ width: `${w * 100}%`, background: i === 0 ? p.accent : 'oklch(1 0 0 / 0.22)' }} />
        ))}
      </span>
      <span className="flex flex-1 flex-col gap-1.5 rounded-md p-2" style={{ background: p.sheet }}>
        <span className="h-1.5 w-1/2 rounded-full" style={{ background: p.line }} />
        <span className="flex flex-1 gap-1.5">
          <span className="flex-1 rounded" style={{ background: p.card, boxShadow: `inset 0 0 0 1px ${p.line}` }} />
          <span className="flex-1 rounded" style={{ background: p.card, boxShadow: `inset 0 0 0 1px ${p.line}` }} />
        </span>
      </span>
    </span>
  )
  return (
    <span className="relative block h-24 overflow-hidden rounded-xl" aria-hidden>
      {mode === 'system' ? (
        <>
          {scene(palette.light)}
          <span className="absolute inset-0 [clip-path:polygon(55%_0,100%_0,100%_100%,45%_100%)]">{scene(palette.dark)}</span>
        </>
      ) : (
        scene(palette[mode])
      )}
    </span>
  )
}
