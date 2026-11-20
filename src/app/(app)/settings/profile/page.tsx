import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { cookies } from 'next/headers'
import { ACCESS_COOKIE } from '@/lib/api/session-cookies'
import { recoveryActive } from '@/lib/recovery'
import { googleRedirectUri } from '@/lib/google/config'
import { PersonalSettings } from '@/components/settings/profile-settings'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.profile')} · ${t('title')}` }
}

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const [{ reset }, jar] = await Promise.all([searchParams, cookies()])
  const recovery = reset === '1' ? (recoveryActive(jar.get(ACCESS_COOKIE)?.value) ? 'active' : 'expired') : null
  return <PersonalSettings tab="profile" recovery={recovery} redirectUri={googleRedirectUri()} />
}
