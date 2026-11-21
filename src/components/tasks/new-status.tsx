'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { api, ApiError } from '@/lib/api/client'
import type { ApiTaskStatuses } from '@/lib/api/tareas'
import { TASK_STATUSES } from '@/lib/constants'
import { workspaceStatuses } from '@/lib/statuses'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { TaskStatus } from '@/lib/database.types'
import type { WorkspaceWithRole } from '@/lib/types'
import { StatusIcon } from './status-icon'

/**
 * Dónde va el estado nuevo: después del último de su categoría (así «En revisión» queda junto a
 * «En progreso» y no al final, después de «Hecha»); si la categoría no tiene ninguno, después de los
 * de las categorías anteriores.
 */
function positionFor(list: { category: TaskStatus }[], category: TaskStatus) {
  let at = -1
  list.forEach((s, i) => {
    if (s.category === category) at = i
  })
  if (at === -1) {
    const rank = TASK_STATUSES.indexOf(category)
    list.forEach((s, i) => {
      if (TASK_STATUSES.indexOf(s.category) < rank) at = i
    })
  }
  return at + 1
}

/** Quién crea estados desde Tareas: los admins del espacio (lo mismo que pide la API). */
export const canCreateStatus = (ws: Pick<WorkspaceWithRole, 'my_role'> | undefined) => ws?.my_role === 'admin'

/**
 * Crear un estado sin ir a Ajustes: nombre y categoría (la que entienden Pulso y los contadores).
 * Se guarda al momento; si el espacio usaba los estándar, la API los copia y agrega el nuevo.
 */
export function NewStatus({
  ws,
  variant,
  defaultCategory = 'in_progress',
  onCreated,
}: {
  ws: WorkspaceWithRole
  /** «lane»: tira angosta al final del Tablero · «pill»: ficha en el pie de la Lista */
  variant: 'lane' | 'pill'
  defaultCategory?: TaskStatus
  onCreated?: () => void
}) {
  const t = useTranslations('tasks.newStatus')
  const tCat = useTranslations('tasks.status')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<TaskStatus>(defaultCategory)
  const [pending, start] = useTransition()
  const existing = workspaceStatuses(ws)
  const clean = name.trim().slice(0, 40)
  const duplicate = clean !== '' && existing.some((s) => (s.name ?? tCat(s.category)).trim().toLowerCase() === clean.toLowerCase())

  const create = () => {
    if (!clean || duplicate || pending) return
    start(async () => {
      try {
        await api<ApiTaskStatuses>(`/v1/workspaces/${ws.id}/task-statuses`, { method: 'POST', body: { name: clean, category, position: positionFor(existing, category) } })
      } catch (e) {
        const details = e instanceof ApiError && Array.isArray(e.details) ? (e.details as { problem?: string }[]).map((d) => d.problem).filter(Boolean).join(' · ') : ''
        toast.error(t('error'), { description: details || (e instanceof ApiError ? e.text : undefined) })
        return
      }
      toast.success(t('created', { name: clean }))
      setOpen(false)
      setName('')
      onCreated?.()
      // los estados viven en el espacio (contexto de la app): se recarga para que aparezca ya
      router.refresh()
    })
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setName('')
      }}
    >
      <PopoverTrigger
        render={
          variant === 'lane' ? (
            <button
              type="button"
              title={t('title')}
              className="group/new flex w-12 flex-none flex-col items-center gap-2.5 rounded-[22px] border border-dashed border-line-strong py-3.5 text-fg-subtle outline-none transition-colors hover:border-accent-mid hover:bg-accent-soft/40 hover:text-accent-ink focus-visible:ring-2 focus-visible:ring-accent-mid/40 data-[popup-open]:border-accent-mid data-[popup-open]:bg-accent-soft/40 data-[popup-open]:text-accent-ink"
            />
          ) : (
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-2.5 text-[13px] text-fg-muted outline-none transition-colors hover:border-accent-mid hover:text-accent-ink focus-visible:ring-2 focus-visible:ring-accent-mid/40 data-[popup-open]:border-accent-mid data-[popup-open]:text-accent-ink"
            />
          )
        }
      >
        <Plus className="size-4 shrink-0" />
        <span className={cn(variant === 'lane' && 'rotate-180 whitespace-nowrap text-[13px] font-medium [writing-mode:vertical-rl]')}>{t('title')}</span>
      </PopoverTrigger>
      <PopoverContent side={variant === 'lane' ? 'left' : 'top'} align={variant === 'lane' ? 'start' : 'start'} className="w-80 p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            create()
          }}
        >
          <p className="text-sm font-semibold text-fg">{t('title')}</p>
          <label className="mt-3 block text-xs font-medium text-fg-muted" htmlFor="new-status-name">
            {t('name')}
          </label>
          <input
            id="new-status-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder={t('placeholder')}
            className={cn(
              'mt-1.5 h-9 w-full rounded-lg border bg-panel px-3 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-accent-mid',
              duplicate ? 'border-danger' : 'border-line',
            )}
          />
          {duplicate ? <p className="mt-1 text-xs text-danger">{t('duplicate')}</p> : null}

          <p className="mt-3 text-xs font-medium text-fg-muted">{t('category')}</p>
          {/* la categoría: cuenta como «Por hacer», «En progreso»… en Pulso y en los contadores */}
          <div role="radiogroup" aria-label={t('category')} className="mt-1.5 grid grid-cols-2 gap-1">
            {TASK_STATUSES.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={category === c}
                onClick={() => setCategory(c)}
                className={cn(
                  'flex h-8 items-center gap-2 rounded-lg px-2 text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid/40',
                  category === c ? 'bg-accent-soft font-medium text-accent-ink ring-1 ring-inset ring-accent-mid/30' : 'text-fg-muted hover:bg-hover hover:text-fg',
                )}
              >
                <StatusIcon status={c} className="size-3.5 shrink-0" />
                <span className="truncate">{tCat(c)}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] leading-snug text-fg-subtle">{t('hint')}</p>

          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={!clean || duplicate} loading={pending}>
              {t('create')}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
