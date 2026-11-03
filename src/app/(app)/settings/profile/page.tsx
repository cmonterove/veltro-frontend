import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { cookies } from 'next/headers'
import { ACCESS_COOKIE } from '@/lib/api/session-cookies'
import { ProfileSettings } from '@/components/settings/profile-settings'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.profile')} · ${t('title')}` }
}

/** Ventana en la que la API deja cambiar la contraseña sin la actual tras el enlace de recuperación. */
const RECOVERY_WINDOW_S = 15 * 60

/** ¿La sesión se abrió con el enlace de recuperación hace poco? Solo para la pantalla: quien decide es la API. */
function recoveryActive(token: string | undefined) {
  const part = token?.split('.')[1]
  if (!part) return false
  try {
    const claims = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { amr?: { method?: string; timestamp?: number }[] }
    const now = Date.now() / 1000
    return (claims.amr ?? []).some((m) => (m.method === 'recovery' || m.method === 'otp') && typeof m.timestamp === 'number' && now - m.timestamp < RECOVERY_WINDOW_S)
  } catch {
    return false
  }
}

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const [{ reset }, jar] = await Promise.all([searchParams, cookies()])
  const recovery = reset === '1' ? (recoveryActive(jar.get(ACCESS_COOKIE)?.value) ? 'active' : 'expired') : null
  return <ProfileSettings recovery={recovery} />
}
