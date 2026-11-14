import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { api } from '@/lib/api/server'
import { ACCESS_COOKIE } from '@/lib/api/session-cookies'
import type { ApiProfile } from '@/lib/api/types'
import { recoveryActive } from '@/lib/recovery'
import { Logo } from '@/components/app/logo'
import { PasswordCard } from '@/components/settings/profile-settings'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.profile')
  return { title: t('recoveryTitle') }
}

/**
 * Elegir la contraseña nueva tras el enlace de recuperación. Fuera de la app: sirve aunque la
 * persona todavía no tenga cuenta (la app la mandaría al onboarding antes de dejarla cambiarla).
 * Siempre con la sesión real, nunca con la de los datos de prueba.
 */
export default async function ResetPasswordPage() {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value
  const me = token ? await api<{ user: ApiProfile }>('/v1/me', { token }).catch(() => null) : null
  if (!me) redirect('/login?error=link_expired')

  return (
    <div className="flex min-h-dvh flex-col px-6 py-6 sm:px-10">
      <Logo />
      <main className="flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-xl">
          <PasswordCard recovery={recoveryActive(token) ? 'active' : 'expired'} email={me.user.email} mustChange={me.user.mustChangePassword} doneHref="/home" />
        </div>
      </main>
    </div>
  )
}
