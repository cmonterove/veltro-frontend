'use client'

import { useTranslations } from 'next-intl'
import { CloudOff, RotateCw } from 'lucide-react'
import { Button } from './button'
import { EmptyState } from './empty-state'

/** Cuando algo no cargó: lo dice y deja reintentar (en vez de quedarse cargando para siempre). */
export function ErrorState({ onRetry, className }: { onRetry?: () => void; className?: string }) {
  const t = useTranslations('errors')
  return (
    <EmptyState
      icon={<CloudOff />}
      title={t('loadTitle')}
      description={t('loadBody')}
      className={className}
      action={
        onRetry ? (
          <Button size="sm" onClick={onRetry}>
            <RotateCw />
            {t('retry')}
          </Button>
        ) : null
      }
    />
  )
}
