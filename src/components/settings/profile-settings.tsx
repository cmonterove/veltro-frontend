'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { KeyRound, Monitor, Moon, Sun } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import { LocaleSelect } from '@/components/app/locale-select'
import { Select } from '@/components/ui/select'
import { changePassword, updateProfile } from '@/app/actions/settings'
import { passwordProblem } from '@/lib/api/ajustes'
import { cn } from '@/lib/utils'
import { useHydrated } from '@/lib/hooks'
import { SaveBar, SettingsCard, SettingsHeader, SettingsRow } from './ui'

/** active: llegó por el enlace de recuperación y aún vale; expired: llegó por el enlace pero ya venció. */
export type RecoveryState = 'active' | 'expired' | null

/** Perfil: cómo te ven los demás y tu contraseña. */
export function ProfileSettings({ recovery = null }: { recovery?: RecoveryState }) {
  const t = useTranslations('settings.profile')
  const te = useTranslations('errors')
  const router = useRouter()
  const { profile } = useApp()
  const [name, setName] = useState(profile.full_name)
  const [saving, start] = useTransition()
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
    <div>
      <SettingsHeader title={t('title')} description={t('description')} />

      {urgent ? <PasswordCard recovery={recovery} /> : null}

      <SettingsCard>
        <SettingsRow label={t('photo')} description={t('photoHint')}>
          <Avatar name={name} src={profile.avatar_url} seed={profile.id} size={44} />
        </SettingsRow>
        <SettingsRow label={t('name')} htmlFor="p-name">
          <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="sm:w-72" />
        </SettingsRow>
        <SettingsRow label={t('email')} description={t('emailHint')}>
          <span className="truncate text-sm text-fg-muted">{profile.email}</span>
        </SettingsRow>
      </SettingsCard>

      {urgent ? null : <PasswordCard recovery={null} />}

      <SaveBar dirty={dirty} pending={saving} onSave={save} onDiscard={() => setName(profile.full_name)} disabled={name.trim().length < 2} />
    </div>
  )
}

/**
 * Cambiar la contraseña. Pide la actual salvo con contraseña temporal o recién llegado del
 * enlace de recuperación (la API lo vuelve a comprobar: si la ventana venció, la pide).
 */
function PasswordCard({ recovery }: { recovery: RecoveryState }) {
  const t = useTranslations('settings.profile')
  const te = useTranslations('errors')
  const router = useRouter()
  const { profile } = useApp()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pending, start] = useTransition()
  // la API puede pedir la actual aunque llegue por el enlace (si pasaron más de 15 minutos)
  const [needCurrent, setNeedCurrent] = useState(recovery !== 'active' && !profile.must_change_password)
  const [error, setError] = useState<string | null>(null)

  const mode = recovery === 'active' && !needCurrent ? 'recovery' : recovery === 'expired' || (recovery === 'active' && needCurrent) ? 'expired' : profile.must_change_password ? 'temp' : 'normal'
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
      // sin ?reset=1: el enlace ya se usó
      if (recovery) router.replace('/settings/profile')
      router.refresh()
    })
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
        <input type="email" name="email" autoComplete="username" value={profile.email} readOnly hidden />
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

/** Preferencias: idioma, tema y zona horaria. Se aplican al momento, sin guardar. */
export function PreferencesSettings() {
  const t = useTranslations('settings.profile')
  const router = useRouter()
  const { profile } = useApp()
  const { theme, setTheme } = useTheme()
  const [timezone, setTimezone] = useState(profile.timezone)
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

  const themes = [
    { id: 'light', icon: Sun },
    { id: 'dark', icon: Moon },
    { id: 'system', icon: Monitor },
  ] as const

  return (
    <div>
      <SettingsHeader title={t('preferences')} description={t('preferencesDescription')} />
      <SettingsCard>
        <SettingsRow label={t('language')} description={t('languageHint')}>
          <LocaleSelect />
        </SettingsRow>
        <SettingsRow label={t('theme')} description={t('themeHint')}>
          <div className="flex rounded-lg bg-hover p-0.5">
            {themes.map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTheme(id)}
                aria-pressed={hydrated && theme === id}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors',
                  hydrated && theme === id ? 'bg-panel font-medium text-fg shadow-card' : 'text-fg-muted hover:text-fg',
                )}
              >
                <Icon className="size-3.5" />
                {t(`themes.${id}`)}
              </button>
            ))}
          </div>
        </SettingsRow>
        <SettingsRow label={t('timezone')} description={t('timezoneHint')} htmlFor="p-tz">
          <Select id="p-tz" value={timezone} onChange={changeZone} options={zones.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))} className="sm:w-72" />
        </SettingsRow>
      </SettingsCard>
    </div>
  )
}
