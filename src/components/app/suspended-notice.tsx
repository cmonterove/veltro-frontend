'use client'

import Link from 'next/link'
import { useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Ban, KeyRound, LogOut } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { setCurrentAccount } from '@/app/actions/preferences'
import { SUSPENDED_EVENT } from '@/lib/api/ajustes'
import { cn } from '@/lib/utils'
import { Logo } from './logo'
import { useApp } from './app-context'

/** Rutas que siguen sirviendo con la cuenta suspendida (no dependen de ella). */
export const SUSPENDED_ALLOWED = ['/settings/profile', '/settings/preferences']

/** Si una llamada a la API responde 403 por suspensión, se vuelve a pedir el contexto para mostrar el aviso. */
export function useSuspensionWatcher() {
  const router = useRouter()
  const last = useRef(0)
  useEffect(() => {
    const onSuspended = () => {
      // varias llamadas fallan juntas: una sola recarga
      if (Date.now() - last.current < 5000) return
      last.current = Date.now()
      router.refresh()
    }
    window.addEventListener(SUSPENDED_EVENT, onSuspended)
    return () => window.removeEventListener(SUSPENDED_EVENT, onSuspended)
  }, [router])
}

function SignOutButton({ variant = 'ghost' }: { variant?: 'ghost' | 'secondary' }) {
  const t = useTranslations('suspension')
  return (
    <form action="/auth/signout" method="post">
      <Button type="submit" variant={variant}>
        <LogOut />
        {t('signOut')}
      </Button>
    </form>
  )
}

function NoticeCard({ icon, tone, title, children, actions }: { icon: React.ReactNode; tone: 'danger' | 'warning'; title: string; children: React.ReactNode; actions: React.ReactNode }) {
  return (
    <div role="alert" className="w-full max-w-md rounded-2xl border border-line bg-panel p-7 shadow-card sm:p-8">
      <span className={cn('mb-5 inline-flex size-10 items-center justify-center rounded-full [&_svg]:size-5', tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
        {icon}
      </span>
      <h1 className="text-lg font-semibold tracking-[-0.01em] text-fg">{title}</h1>
      <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-fg-muted">{children}</div>
      <div className="mt-6 flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  )
}

/** Persona suspendida desde la consola: la API solo le deja ver su perfil y salir. Pantalla completa, sin la app. */
export function UserSuspendedScreen({ email }: { email: string }) {
  const t = useTranslations('suspension')
  return (
    <div className="flex min-h-dvh flex-col bg-canvas px-6 py-6 sm:px-10">
      <Logo />
      <main className="flex flex-1 items-center justify-center py-12">
        <NoticeCard icon={<Ban />} tone="danger" title={t('userTitle')} actions={<SignOutButton variant="secondary" />}>
          <p>{t('userBody')}</p>
          <p>{t('userContact')}</p>
          <p className="text-xs text-fg-subtle">{t('signedInAs', { email })}</p>
        </NoticeCard>
      </main>
    </div>
  )
}

/** Cuenta suspendida: en lugar de la página, qué pasa y qué se puede hacer (otra cuenta, el perfil o salir). */
export function AccountSuspendedNotice() {
  const t = useTranslations('suspension')
  const router = useRouter()
  const { account, accounts } = useApp()
  const others = accounts.filter((a) => a.id !== account.id && a.status !== 'suspended')
  const [pending, start] = useTransition()

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-12">
      <NoticeCard
        icon={<Ban />}
        tone="danger"
        title={t('accountTitle', { name: account.name })}
        actions={
          <>
            {others.map((a) => (
              <Button
                key={a.id}
                variant="primary"
                loading={pending}
                onClick={() =>
                  start(async () => {
                    await setCurrentAccount(a.id)
                    router.push('/home')
                  })
                }
              >
                {t('switchTo', { name: a.name })}
              </Button>
            ))}
            <Link href="/settings/profile" className={buttonVariants({ variant: others.length ? 'ghost' : 'secondary' })}>
              {t('openProfile')}
            </Link>
            <SignOutButton />
          </>
        }
      >
        <p>{t('accountBody')}</p>
        <p>{t('accountContact')}</p>
      </NoticeCard>
    </div>
  )
}

/** Con contraseña temporal la API solo deja cambiarla: antes de seguir, a elegir una propia. */
export function TempPasswordGate() {
  const t = useTranslations('suspension')
  return (
    <div className="flex min-h-full items-center justify-center px-6 py-12">
      <NoticeCard
        icon={<KeyRound />}
        tone="warning"
        title={t('tempTitle')}
        actions={
          <>
            <Link href="/settings/profile" className={buttonVariants({ variant: 'primary' })}>
              {t('tempAction')}
            </Link>
            <SignOutButton />
          </>
        }
      >
        <p>{t('tempBody')}</p>
      </NoticeCard>
    </div>
  )
}
