'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { FlaskConical, RotateCcw } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'

/** Aviso de modo demo con opción de reiniciar los datos de prueba. */
export function DemoBadge() {
  const t = useTranslations('demo')
  const [pending, setPending] = useState(false)
  return (
    <div className="mb-1 flex items-center gap-2 rounded-md bg-warning-soft px-2 py-1.5 text-xs text-fg">
      <FlaskConical className="size-3.5 shrink-0 text-warning" />
      <span className="min-w-0 flex-1 truncate">{t('badge')}</span>
      <Tooltip content={t('reset')}>
        <button
          type="button"
          disabled={pending}
          aria-label={t('reset')}
          onClick={async () => {
            if (!window.confirm(t('resetConfirm'))) return
            setPending(true)
            await fetch('/api/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'reset' }) })
            window.location.href = '/home'
          }}
          className="inline-flex size-5 items-center justify-center rounded-sm text-fg-muted hover:bg-panel hover:text-fg disabled:opacity-50"
        >
          <RotateCcw className={pending ? 'size-3 animate-spin' : 'size-3'} />
        </button>
      </Tooltip>
    </div>
  )
}
