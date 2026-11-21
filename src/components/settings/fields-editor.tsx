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
import { StatusIcon } from '@/components/tasks/status-icon'
import { api } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { SaveBar, SideSection, SplitPanel } from './ui'
import type { TaskFieldDef, TaskFieldType } from '@/lib/database.types'
import type { WorkspaceWithRole } from '@/lib/types'

const TYPES: TaskFieldType[] = ['text', 'number', 'date', 'select', 'url']
/** Ideas para empezar (vacío): un clic y queda el campo con su tipo (y sus opciones, si tiene). */
const SUGGESTIONS: { key: string; type: TaskFieldType; options?: boolean }[] = [
  { key: 'chain', type: 'select', options: true },
  { key: 'store', type: 'text' },
  { key: 'sprint', type: 'select', options: true },
  { key: 'budget', type: 'number' },
  { key: 'delivery', type: 'date' },
  { key: 'brief', type: 'url' },
]

/** En edición, las opciones de un campo "Opciones" se escriben separadas por coma. */
type DraftField = TaskFieldDef & { optionsText?: string }

/**
 * Campos propios de las tareas de un espacio (Cadena, Tiendas, Sprint…): la lista a la izquierda y, al
 * lado, cómo se ven en una tarea y como columnas en la vista Tabla, con lo que estás escribiendo.
 */
export function FieldsEditor({ workspace }: { workspace: WorkspaceWithRole }) {
  const t = useTranslations('settings.workspaces.fields')
  const tType = useTranslations('tasks.fields.types')
  const tCat = useTranslations('tasks.status')
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
      let fields: TaskFieldDef[]
      try {
        // los campos nuevos reciben su id en la API
        fields = (await api<{ fields: TaskFieldDef[] }>(`/v1/workspaces/${workspace.id}/task-fields`, { method: 'PUT', body: { fields: clean(draft) } })).fields
      } catch {
        toast.error(t('error'))
        return
      }
      toast.success(t('saved'))
      setDraft(fields.map((f) => ({ ...f, optionsText: (f.options ?? []).join(', ') })))
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
  const add = (preset?: Partial<DraftField>) => {
    const id = `f_${crypto.randomUUID().slice(0, 8)}`
    setJustAdded(preset ? null : id)
    setDraft((d) => [...d, { id, name: '', type: 'text', optionsText: '', ...preset }])
  }

  const named = draft.filter((f) => f.name.trim())
  const sample = (f: DraftField) =>
    f.type === 'select' ? (f.optionsText ?? '').split(',')[0]?.trim() || t('samples.select') : t(`samples.${f.type}`)

  return (
    <SplitPanel
      main={
        <>
          <div className="flex shrink-0 items-center gap-3 border-b border-line-soft px-5 py-3">
            <div className="min-w-0 flex-1">
              <h2 className="flex items-baseline gap-2 text-sm font-semibold text-fg">
                {t('title')}
                <span className="text-xs font-normal tabular-nums text-fg-subtle">{draft.length}</span>
              </h2>
              <p className="truncate text-xs text-fg-muted">{t('short')}</p>
            </div>
            {draft.length ? (
              <Button variant="secondary" size="sm" disabled={draft.length >= 30} onClick={() => add()}>
                <Plus />
                {t('add')}
              </Button>
            ) : null}
          </div>

          {draft.length ? (
            <ul className={cn('min-h-0 flex-1 divide-y divide-line-soft overflow-y-auto scrollbar-thin', dirty && 'pb-16')}>
              {draft.map((f, i) => {
                const Icon = FIELD_ICONS[f.type]
                return (
                  <li key={f.id} className="flex flex-col gap-2 px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-hover text-fg-muted">
                        <Icon className="size-4" />
                      </span>
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
                        <IconButton label={t('moveUp')} disabled={i === 0} onClick={() => move(i, -1)}>
                          <ArrowUp />
                        </IconButton>
                        <IconButton label={t('moveDown')} disabled={i === draft.length - 1} onClick={() => move(i, 1)}>
                          <ArrowDown />
                        </IconButton>
                        <IconButton label={t('remove')} danger onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}>
                          <X />
                        </IconButton>
                      </span>
                    </div>
                    {f.type === 'select' ? (
                      <input
                        value={f.optionsText ?? ''}
                        onChange={(e) => edit(i, { optionsText: e.target.value })}
                        placeholder={t('optionsPlaceholder')}
                        aria-label={t('optionsPlaceholder')}
                        className={cn(inputClass, 'ml-[2.625rem] h-8 w-auto text-xs')}
                      />
                    ) : null}
                  </li>
                )
              })}
              {draft.length < (workspace.task_fields ?? []).length && dirty ? <li className="px-5 py-3 text-xs text-fg-muted">{t('removeHint')}</li> : null}
            </ul>
          ) : (
            // sin campos: ideas a un clic (o uno en blanco), en vez de una línea suelta
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <span className="flex gap-2" aria-hidden>
                {(['select', 'number', 'date'] as const).map((ty) => {
                  const Icon = FIELD_ICONS[ty]
                  return (
                    <span key={ty} className="flex size-10 items-center justify-center rounded-xl border border-dashed border-line-strong bg-canvas text-fg-subtle">
                      <Icon className="size-4" />
                    </span>
                  )
                })}
              </span>
              <p className="mt-4 text-sm font-semibold text-fg">{t('emptyTitle')}</p>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-fg-muted">{t('hint')}</p>
              <div className="mt-5 flex max-w-lg flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((sg) => {
                  const Icon = FIELD_ICONS[sg.type]
                  return (
                    <button
                      key={sg.key}
                      type="button"
                      onClick={() => add({ name: t(`suggestions.${sg.key}`), type: sg.type, optionsText: sg.options ? t(`suggestionOptions.${sg.key}`) : '' })}
                      className="flex h-8 items-center gap-1.5 rounded-lg bg-panel px-3 text-[13px] text-fg shadow-card ring-1 ring-line outline-none transition-colors hover:ring-accent-mid focus-visible:ring-2 focus-visible:ring-accent-mid"
                    >
                      <Icon className="size-3.5 text-fg-subtle" />
                      {t(`suggestions.${sg.key}`)}
                    </button>
                  )
                })}
              </div>
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => add()}>
                <Plus />
                {t('addBlank')}
              </Button>
            </div>
          )}
          <SaveBar floating dirty={dirty} pending={pending} onSave={save} onDiscard={() => setDraft(initial())} disabled={invalid} />
        </>
      }
      side={
        <>
          <SideSection title={t('previewTitle')}>
            {/* una tarea de ejemplo con sus propiedades: las de siempre y, debajo, las de este espacio */}
            <div className="rounded-xl bg-panel p-3 shadow-card ring-1 ring-line-soft">
              <p className="truncate text-sm font-semibold text-fg">{t('previewTask')}</p>
              <dl className="mt-2.5 flex flex-col gap-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <dt className="w-24 shrink-0 text-fg-subtle">{t('statusLabel')}</dt>
                  <dd className="flex items-center gap-1.5 text-fg">
                    <StatusIcon status="in_progress" className="size-3.5" />
                    {tCat('in_progress')}
                  </dd>
                </div>
                {named.map((f) => {
                  const Icon = FIELD_ICONS[f.type]
                  return (
                    <div key={f.id} className="flex items-center gap-2">
                      <dt className="flex w-24 shrink-0 items-center gap-1 truncate text-fg-subtle">
                        <Icon className="size-3 shrink-0" />
                        <span className="truncate">{f.name}</span>
                      </dt>
                      <dd className="min-w-0 truncate">
                        {f.type === 'select' ? <span className="rounded-md bg-hover px-1.5 py-0.5 text-fg">{sample(f)}</span> : <span className="text-fg">{sample(f)}</span>}
                      </dd>
                    </div>
                  )
                })}
                {!named.length ? <div className="mt-1 rounded-md border border-dashed border-line-strong px-2 py-1.5 text-fg-subtle">{t('previewEmpty')}</div> : null}
              </dl>
            </div>
          </SideSection>
          <SideSection title={t('tableTitle')}>
            <div className="overflow-hidden rounded-xl bg-panel shadow-card ring-1 ring-line-soft">
              <div className="flex divide-x divide-line-soft border-b border-line-soft bg-sidebar/50 text-2xs font-medium text-fg-subtle">
                <span className="w-24 shrink-0 truncate px-2 py-1.5">{t('tableTask')}</span>
                {named.slice(0, 3).map((f) => (
                  <span key={f.id} className="min-w-0 flex-1 truncate px-2 py-1.5">
                    {f.name}
                  </span>
                ))}
                {named.length > 3 ? <span className="shrink-0 px-2 py-1.5">+{named.length - 3}</span> : null}
                {!named.length ? <span className="min-w-0 flex-1 px-2 py-1.5">…</span> : null}
              </div>
              {[60, 44].map((w, r) => (
                <div key={r} className="flex divide-x divide-line-soft border-b border-line-soft last:border-b-0">
                  <span className="w-24 shrink-0 px-2 py-2">
                    <span className="block h-1.5 rounded-full bg-fg/15" style={{ width: `${w}%` }} />
                  </span>
                  {(named.length ? named.slice(0, 3) : [null]).map((_, c) => (
                    <span key={c} className="min-w-0 flex-1 px-2 py-2">
                      <span className="block h-1.5 rounded-full bg-fg/10" style={{ width: `${70 - c * 15}%` }} />
                    </span>
                  ))}
                  {named.length > 3 ? <span className="w-8 shrink-0" /> : null}
                </div>
              ))}
            </div>
          </SideSection>
        </>
      }
    />
  )
}

function IconButton({ label, danger, disabled, onClick, children }: { label: string; danger?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md text-fg-subtle outline-none disabled:opacity-30 [&_svg]:size-3.5',
        danger ? 'hover:bg-danger-soft hover:text-danger' : 'hover:bg-hover hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}
