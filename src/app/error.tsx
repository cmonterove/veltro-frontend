'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errors')
  // lo que atrapa esta pantalla no llega solo a Sentry
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])
  return (
    <div className="flex min-h-[60vh] flex-col items-start justify-center gap-3 px-8 py-16 sm:px-16">
      <h1 className="text-xl font-semibold tracking-tight">{t('crashTitle')}</h1>
      <p className="max-w-md text-sm text-fg-muted">{t('crashBody')}</p>
      <Button size="sm" onClick={reset}>
        {t('retry')}
      </Button>
    </div>
  )
}
