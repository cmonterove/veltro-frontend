'use client'

import { useTranslations } from 'next-intl'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Carga de tareas abiertas en tres tramos, siempre en el mismo orden y color (validados con la guía de
 * dataviz): en riesgo (vencidas o bloqueadas) · en curso · por hacer. Cada tramo tiene su tooltip;
 * la cifra total va escrita al lado por quien la usa, así el color nunca es lo único que informa.
 */
export type Load = { risk: number; progress: number; rest: number; overdue?: number; blocked?: number }

export function LoadBar({ load, max, className }: { load: Load; max: number; className?: string }) {
  const t = useTranslations('charts.load')
  const total = load.risk + load.progress + load.rest
  const riskLabel =
    load.overdue != null || load.blocked != null
      ? [load.overdue ? t('overdue', { count: load.overdue }) : '', load.blocked ? t('blocked', { count: load.blocked }) : ''].filter(Boolean).join(' · ')
      : t('risk', { count: load.risk })
  // el riel es la carga de quien más tiene: así se compara a la gente de un vistazo
  return (
    <span className={cn('flex h-2 w-full overflow-hidden rounded-full', className)} style={{ background: 'var(--chart-track)' }}>
      <span className="flex h-full gap-[2px]" style={{ width: total ? `${Math.max(3, (total / Math.max(1, max)) * 100)}%` : 0 }}>
        <Segment n={load.risk} total={total} color="var(--chart-risk)" label={riskLabel} />
        <Segment n={load.progress} total={total} color="var(--chart-progress)" label={t('progress', { count: load.progress })} />
        <Segment n={load.rest} total={total} color="var(--chart-rest)" label={t('rest', { count: load.rest })} />
      </span>
    </span>
  )
}

/** Leyenda de los tres tramos: siempre visible junto a cualquier LoadBar. */
export function LoadLegend({ className }: { className?: string }) {
  const t = useTranslations('charts.load.legend')
  return (
    <div className={cn('flex items-center gap-3 text-xs text-fg-muted', className)}>
      {(['risk', 'progress', 'rest'] as const).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: `var(--chart-${k})` }} />
          {t(k)}
        </span>
      ))}
    </div>
  )
}

/** Tramo con su tooltip; las puntas redondas las pone el riel (overflow-hidden). */
function Segment({ n, total, color, label }: { n: number; total: number; color: string; label: string }) {
  if (!n) return null
  return (
    <Tooltip content={label}>
      <span className="h-full min-w-[4px] last:rounded-r-full" style={{ width: `${(n / total) * 100}%`, background: color }} />
    </Tooltip>
  )
}
