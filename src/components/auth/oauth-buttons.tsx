'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { signInWithProvider, type OAuthProvider } from '@/app/(auth)/actions'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.11A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.29 14.29A7.2 7.2 0 0 1 4.91 12c0-.79.14-1.56.38-2.29V6.6H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l4.01-3.11Z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.6l4.01 3.11C6.23 6.86 8.88 4.75 12 4.75Z" />
    </svg>
  )
}

// Por ahora solo Google (Apple queda para más adelante; signInWithProvider ya lo admite).
const PROVIDERS: { id: OAuthProvider; label: string; Logo: () => React.ReactElement }[] = [{ id: 'google', label: 'Google', Logo: GoogleLogo }]

/** Botón para entrar con Google. Si el proveedor no está activo en Supabase, avisa con un error. */
export function OAuthButtons({ next, onError }: { next?: string; onError: (code: string) => void }) {
  const t = useTranslations('auth.oauth')
  const [pending, start] = useTransition()
  const [active, setActive] = useState<OAuthProvider | null>(null)

  return (
    <div className="grid gap-2.5">
      {PROVIDERS.map(({ id, label, Logo }) => (
        <button
          key={id}
          type="button"
          disabled={pending}
          onClick={() => {
            setActive(id)
            start(async () => {
              const res = await signInWithProvider(id, next)
              if (res?.error) onError(res.error)
              setActive(null)
            })
          }}
          className={cn(
            'inline-flex h-12 short:h-11 items-center justify-center gap-2.5 rounded-xl border border-line bg-panel text-[15px] font-medium text-fg transition-[border-color,background-color,transform] duration-150 hover:border-line-strong hover:bg-hover active:scale-[0.99] disabled:opacity-70',
          )}
        >
          {pending && active === id ? <Spinner className="size-4" /> : <Logo />}
          {t('continueWith', { provider: label })}
        </button>
      ))}
    </div>
  )
}
