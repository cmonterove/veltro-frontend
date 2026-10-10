'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { useApp } from '@/components/app/app-context'
import { Button } from '@/components/ui/button'
import { Field, Input, inputClass } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import { LocaleSelect } from '@/components/app/locale-select'
import { createClient } from '@/lib/supabase/client'
import { updateProfile } from '@/app/actions/settings'
import { cn } from '@/lib/utils'
import { useHydrated } from '@/lib/hooks'
import { SettingsSection } from './section'

export function ProfileSettings() {
  const t = useTranslations('settings.profile')
  const router = useRouter()
  const { profile } = useApp()
  const { theme, setTheme } = useTheme()
  const [name, setName] = useState(profile.full_name)
  const [timezone, setTimezone] = useState(profile.timezone)
  const [saving, start] = useTransition()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwPending, setPwPending] = useState(false)

  // La lista de zonas depende del ICU de cada motor (Node y el navegador difieren): solo se arma en el cliente.
  const hydrated = useHydrated()
  const zones = useMemo(() => {
    if (!hydrated) return [timezone]
    try {
      const all = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone')
      return all.includes(timezone) ? all : [timezone, ...all]
    } catch {
      return [timezone]
    }
  }, [hydrated, timezone])

  const save = () =>
    start(async () => {
      const res = await updateProfile({ full_name: name.trim() || profile.full_name, timezone })
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
      <SettingsSection title={t('title')} description={t('description')}>
        <div className="flex max-w-md flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={name} src={profile.avatar_url} seed={profile.id} size={44} />
            <div className="text-sm text-fg-muted">{profile.email}</div>
          </div>
          <Field label={t('name')} htmlFor="p-name">
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          <Field label={t('timezone')} htmlFor="p-tz" hint={t('timezoneHint')}>
            <select id="p-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <Button variant="primary" onClick={save} loading={saving}>
              {t('save')}
            </Button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t('preferences')}>
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <span className="w-28 text-sm text-fg-muted">{t('language')}</span>
            <LocaleSelect />
          </div>
          <div className="flex items-center gap-4">
            <span className="w-28 text-sm text-fg-muted">{t('theme')}</span>
            <div className="flex rounded-md bg-hover p-0.5">
              {(['light', 'dark', 'system'] as const).map((th) => (
                <button
                  key={th}
                  type="button"
                  onClick={() => setTheme(th)}
                  className={cn('h-7 rounded-sm px-3 text-sm', hydrated && theme === th ? 'bg-panel font-medium shadow-card' : 'text-fg-muted hover:text-fg')}
                >
                  {t(`themes.${th}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('password')}
        description={profile.must_change_password ? t('passwordTemp') : t('passwordDescription')}
      >
        <div className="flex max-w-md flex-col gap-4">
          <Field label={t('newPassword')} htmlFor="p-pw">
            <Input id="p-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label={t('confirmPassword')} htmlFor="p-pw2">
            <Input id="p-pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <div>
            <Button onClick={changePassword} loading={pwPending} disabled={!password}>
              {t('changePassword')}
            </Button>
          </div>
        </div>
      </SettingsSection>
    </div>
  )
}
