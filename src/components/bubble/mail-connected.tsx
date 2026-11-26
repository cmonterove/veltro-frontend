'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Check, X } from 'lucide-react'
import { Logo } from '@/components/app/logo'

export function MailConnected({ ok }: { ok: boolean }) {
  const t = useTranslations('bubble')
  useEffect(() => {
    if (!ok) return
    const id = setTimeout(() => window.close(), 1200)
    return () => clearTimeout(id)
  }, [ok])
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm rounded-xl bg-panel p-6 shadow-card">
        <Logo />
        <div className="mt-6 flex items-start gap-3">
          <span
            className={`flex size-8 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-accent-soft text-accent-ink' : 'bg-danger-soft text-danger'}`}
          >
            {ok ? <Check className="size-4" /> : <X className="size-4" />}
          </span>
          <div>
            <p className="text-sm font-semibold text-fg">{ok ? t('connectedTitle') : t('connectFailed')}</p>
            {ok ? <p className="mt-1 text-sm text-fg-muted">{t('connectedText')}</p> : null}
          </div>
        </div>
      </div>
    </main>
  )
}
