'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { FlaskConical, RotateCcw } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { useConfirm } from '@/components/ui/confirm'

/** Aviso de modo demo con opción de reiniciar los datos de prueba. */
export function DemoBadge({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('demo')
  const [pending, setPending] = useState(false)
  const confirm = useConfirm()
  const tConfirm = useTranslations('confirm')
  const reset = async () => {
    if (!(await confirm({ title: t('resetConfirm'), danger: true, confirmLabel: tConfirm('reset') }))) return
    setPending(true)
    await fetch('/api/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'reset' }) })
    window.location.href = '/home'
  }
  // en el riel colapsado: el matraz avisa del modo demo y reinicia los datos
  if (compact)
    return (
      <Tooltip content={`${t('badge')} · ${t('reset')}`} side="right">
        <button
          type="button"
          disabled={pending}
          onClick={reset}
          aria-label={t('reset')}
          className="mb-0.5 inline-flex size-8 items-center justify-center rounded-lg bg-warning-soft text-warning transition-colors hover:brightness-95 disabled:opacity-50"
        >
          {pending ? <RotateCcw className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
        </button>
      </Tooltip>
    )
  return (
    <div className="mb-1 flex items-center gap-2 rounded-md bg-warning-soft px-2 py-1.5 text-xs text-fg">
      <FlaskConical className="size-3.5 shrink-0 text-warning" />
      <span className="min-w-0 flex-1 truncate">{t('badge')}</span>
      <Tooltip content={t('reset')}>
        <button
          type="button"
          disabled={pending}
          aria-label={t('reset')}
          onClick={reset}
          className="inline-flex size-5 items-center justify-center rounded-sm text-fg-muted hover:bg-panel hover:text-fg disabled:opacity-50"
        >
          <RotateCcw className={pending ? 'size-3 animate-spin' : 'size-3'} />
        </button>
      </Tooltip>
    </div>
  )
}
