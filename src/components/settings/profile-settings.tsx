'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import { LocaleSelect } from '@/components/app/locale-select'
import { Select } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { updateProfile } from '@/app/actions/settings'
import { cn } from '@/lib/utils'
import { useHydrated } from '@/lib/hooks'
import { SaveBar, SettingsCard, SettingsHeader, SettingsRow } from './ui'

/** Perfil: cómo te ven los demás y tu contraseña. */
export function ProfileSettings() {
  const t = useTranslations('settings.profile')
  const router = useRouter()
  const { profile } = useApp()
  const [name, setName] = useState(profile.full_name)
  const [saving, start] = useTransition()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwPending, setPwPending] = useState(false)
  const dirty = name.trim() !== profile.full_name

  const save = () =>
    start(async () => {
      const res = await updateProfile({ full_name: name.trim() || profile.full_name })
      if (res.ok) {
        toast.success(t('saved'))
        router.refresh()
      } else toast.error(t('error'))
    })

  const changePassword = async () => {
    if (password.length < 8) return toast.error(t('passwordShort'))
    if (password !== confirm) return toast.error(t('passwordMismatch'))
    setPwPending(true)
    const { error } = await createClient().auth.updateUser({ password })
    setPwPending(false)
    if (error) return toast.error(t('passwordError'))
    await updateProfile({ must_change_password: false })
    setPassword('')
    setConfirm('')
    toast.success(t('passwordChanged'))
    router.refresh()
  }

  return (
    <div>
      <SettingsHeader title={t('title')} description={t('description')} />

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

      <SettingsCard title={t('password')} description={profile.must_change_password ? t('passwordTemp') : t('passwordDescription')}>
        <SettingsRow label={t('newPassword')} htmlFor="p-pw">
          <Input id="p-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="sm:w-72" />
        </SettingsRow>
        <SettingsRow label={t('confirmPassword')} htmlFor="p-pw2">
          <Input id="p-pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="sm:w-72" />
        </SettingsRow>
        <div className="flex justify-end px-5 py-3">
          <Button onClick={changePassword} loading={pwPending} disabled={!password}>
            {t('changePassword')}
          </Button>
        </div>
      </SettingsCard>

      <SaveBar dirty={dirty} pending={saving} onSave={save} onDiscard={() => setName(profile.full_name)} disabled={!name.trim()} />
    </div>
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
    } else toast.error(t('error'))
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
