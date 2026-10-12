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

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor" aria-hidden>
      <path d="M16.37 1.43c0 1.14-.42 2.2-1.24 3.03-.86.88-1.9 1.39-3 1.3a3.15 3.15 0 0 1-.02-.38c0-1.1.48-2.27 1.27-3.07.4-.41.9-.75 1.5-1.02.6-.27 1.17-.42 1.7-.45.02.2.03.4.03.59ZM20.6 17.13c-.4.93-.88 1.78-1.43 2.57-.75 1.07-1.37 1.8-1.84 2.22-.74.68-1.53 1.03-2.38 1.05-.61 0-1.35-.17-2.21-.53-.86-.35-1.65-.53-2.37-.53-.76 0-1.57.18-2.44.53-.87.36-1.57.54-2.11.56-.82.04-1.63-.32-2.44-1.08-.52-.45-1.16-1.21-1.94-2.3-.83-1.16-1.5-2.5-2.04-4.03C.88 13.95.6 12.36.6 10.82c0-1.76.38-3.28 1.14-4.55a6.7 6.7 0 0 1 2.39-2.42 6.43 6.43 0 0 1 3.23-.91c.64 0 1.47.2 2.5.58 1.03.39 1.7.58 1.99.58.22 0 .96-.23 2.22-.69 1.19-.43 2.19-.6 3.01-.53 2.23.18 3.9 1.06 5.01 2.64-1.99 1.21-2.98 2.9-2.96 5.07.02 1.69.63 3.1 1.83 4.22.55.52 1.16.92 1.84 1.2-.15.43-.3.84-.47 1.24Z" />
    </svg>
  )
}

const PROVIDERS: { id: OAuthProvider; label: string; Logo: () => React.ReactElement }[] = [
  { id: 'google', label: 'Google', Logo: GoogleLogo },
  { id: 'apple', label: 'Apple', Logo: AppleLogo },
]

/** Botones para entrar con Google o Apple. Si el proveedor no está activo en Supabase, avisa con un error. */
export function OAuthButtons({ next, onError }: { next?: string; onError: (code: string) => void }) {
  const t = useTranslations('auth.oauth')
  const [pending, start] = useTransition()
  const [active, setActive] = useState<OAuthProvider | null>(null)

  return (
    <div className="grid grid-cols-2 gap-2.5">
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
          aria-label={t('continueWith', { provider: label })}
          className={cn(
            'inline-flex h-12 short:h-11 items-center justify-center gap-2.5 rounded-xl border border-line bg-panel text-[15px] font-medium text-fg transition-[border-color,background-color,transform] duration-150 hover:border-line-strong hover:bg-hover active:scale-[0.99] disabled:opacity-70',
          )}
        >
          {pending && active === id ? <Spinner className="size-4" /> : <Logo />}
          {label}
        </button>
      ))}
    </div>
  )
}
