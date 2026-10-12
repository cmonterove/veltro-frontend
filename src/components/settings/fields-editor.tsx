'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { FIELD_ICONS } from '@/components/tasks/custom-fields'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { SettingsCard } from './ui'
import type { TaskFieldDef, TaskFieldType } from '@/lib/database.types'
import type { WorkspaceWithRole } from '@/lib/types'

const TYPES: TaskFieldType[] = ['text', 'number', 'date', 'select', 'url']

/** En edición, las opciones de un campo "Opciones" se escriben separadas por coma. */
type DraftField = TaskFieldDef & { optionsText?: string }

/**
 * Campos propios de las tareas de un espacio (Cadena, Tiendas, Sprint…). Cada espacio tiene los
 * suyos: aparecen en la página de la tarea y como columnas en la vista Tabla.
 */
export function FieldsEditor({ workspace }: { workspace: WorkspaceWithRole }) {
  const t = useTranslations('settings.workspaces.fields')
  const tType = useTranslations('tasks.fields.types')
  const router = useRouter()
  const initial = (): DraftField[] => (workspace.task_fields ?? []).map((f) => ({ ...f, optionsText: (f.options ?? []).join(', ') }))
  const [draft, setDraft] = useState<DraftField[]>(initial)
  const [pending, start] = useTransition()
  // el campo recién agregado toma el foco para escribir su nombre de una vez
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const saved = JSON.stringify(workspace.task_fields ?? [])
  const clean = (list: DraftField[]): TaskFieldDef[] =>
    list
      .map(({ optionsText, ...f }) => ({
        ...f,
        name: f.name.trim().slice(0, 40),
        ...(f.type === 'select'
          ? { options: [...new Set((optionsText ?? '').split(',').map((o) => o.trim()).filter(Boolean))].slice(0, 30) }
          : { options: undefined }),
      }))
      .filter((f) => f.name)
      .map((f) => (f.options === undefined ? { id: f.id, name: f.name, type: f.type } : f))
  const dirty = JSON.stringify(clean(draft)) !== saved
  const invalid = draft.some((f) => f.name.trim() && f.type === 'select' && !(f.optionsText ?? '').trim())

  const save = () =>
    start(async () => {
      const { error } = await createClient().from('workspaces').update({ task_fields: clean(draft) }).eq('id', workspace.id)
      if (error) {
        toast.error(t('error'))
        return
      }
      toast.success(t('saved'))
      router.refresh()
    })

  const edit = (i: number, patch: Partial<DraftField>) => setDraft((d) => d.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const next = [...d]
      const [item] = next.splice(i, 1)
      next.splice(i + dir, 0, item)
      return next
    })

  return (
    <SettingsCard title={t('title')} description={t('hint')}>
      <div className="flex flex-col gap-3 p-5">

        {draft.length ? (
          <ul className="flex flex-col gap-2">
            {draft.map((f, i) => {
              const Icon = FIELD_ICONS[f.type]
              return (
                <li key={f.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 shrink-0 text-fg-subtle" />
                    <input
                      autoFocus={f.id === justAdded}
                      value={f.name}
                      onChange={(e) => edit(i, { name: e.target.value })}
                      placeholder={t('namePlaceholder')}
                      maxLength={40}
                      aria-label={t('namePlaceholder')}
                      className={cn(inputClass, 'h-8 min-w-0 flex-1')}
                    />
                    <Select<TaskFieldType>
                      value={f.type}
                      onChange={(type) => edit(i, { type })}
                      aria-label={t('type')}
                      options={TYPES.map((ty) => {
                        const TypeIcon = FIELD_ICONS[ty]
                        return { value: ty, label: tType(ty), icon: <TypeIcon className="size-3.5" /> }
                      })}
                      className="h-8 w-36 shrink-0"
                    />
                    <span className="flex shrink-0">
                      <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('moveUp')} className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg disabled:opacity-30">
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button type="button" disabled={i === draft.length - 1} onClick={() => move(i, 1)} aria-label={t('moveDown')} className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg disabled:opacity-30">
                        <ArrowDown className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}
                        aria-label={t('remove')}
                        className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-danger-soft hover:text-danger"
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  </div>
                  {f.type === 'select' ? (
                    <input
                      value={f.optionsText ?? ''}
                      onChange={(e) => edit(i, { optionsText: e.target.value })}
                      placeholder={t('optionsPlaceholder')}
                      aria-label={t('optionsPlaceholder')}
                      className={cn(inputClass, 'ml-6 h-8 w-[calc(100%-1.5rem-6.5rem)] text-xs')}
                    />
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-xs text-fg-subtle">{t('empty')}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={draft.length >= 30}
            onClick={() => {
              const id = `f_${crypto.randomUUID().slice(0, 8)}`
              setJustAdded(id)
              setDraft((d) => [...d, { id, name: '', type: 'text', optionsText: '' }])
            }}
          >
            <Plus />
            {t('add')}
          </Button>
          {dirty ? (
            <>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setDraft(initial())}>
                {t('discard')}
              </Button>
              <Button variant="primary" size="sm" loading={pending} disabled={invalid} onClick={save}>
                {t('save')}
              </Button>
            </>
          ) : null}
        </div>
        {draft.length < (workspace.task_fields ?? []).length && dirty ? <p className="text-xs text-fg-muted">{t('removeHint')}</p> : null}
      </div>
    </SettingsCard>
  )
}
