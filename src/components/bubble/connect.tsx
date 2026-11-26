'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, ShieldCheck } from 'lucide-react'
import { Logo } from '@/components/app/logo'
import { Button } from '@/components/ui/button'
import { connectBubble } from '@/app/actions/bubble'

/** Aviso a la burbuja (si el vínculo sigue vivo) de que ya puede retirar su token. */
export const READY_MESSAGE = 'veltro-burbuja:conectada'

export function ConnectBubble({ platform, host, email, challenge }: { platform: string; host: string | null; email: string; challenge: string | null }) {
  const t = useTranslations('bubble')
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'no-opener' | 'error'>('idle')

  const connect = async () => {
    setState('saving')
    if (!challenge) return setState('no-opener')
    const res = await connectBubble({ platform, host, challenge })
    if (!res.ok) return setState('error')
    // la burbuja también pregunta sola cada poco; si el vínculo sigue vivo (sin pasar por Google), se le avisa ya.
    // Solo un aviso: el token no viaja por acá.
    ;(window.opener as Window | null)?.postMessage({ type: READY_MESSAGE }, window.location.origin)
    setState('done')
    setTimeout(() => window.close(), 1200)
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm rounded-xl bg-panel p-6 shadow-card">
        <Logo />
        {state === 'done' || state === 'no-opener' ? (
          <div className="mt-6 flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
              <Check className="size-4" />
            </span>
            <p className="text-sm text-fg">{state === 'done' ? t('authorized', { platform }) : t('noOpener', { platform })}</p>
          </div>
        ) : (
          <>
            <h1 className="mt-6 text-lg font-semibold text-fg">{t('authorizeTitle', { platform })}</h1>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">{t('authorizeText', { platform, email })}</p>
            {host ? (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-subtle">
                <ShieldCheck className="size-3.5" />
                {t('authorizeHost', { host })}
              </p>
            ) : null}
            {state === 'error' ? (
              <p className="mt-3 text-xs text-danger" role="alert">
                {t('error')}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => window.close()}>
                {t('cancel')}
              </Button>
              <Button variant="primary" loading={state === 'saving'} onClick={connect}>
                {t('authorize')}
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
