'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ExternalLink, Hash, Calendar, List, Link2, Plus, Type } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/components/ui/menu'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { TaskFieldDef, TaskFieldType, TaskRow } from '@/lib/database.types'
import type { WorkspaceWithRole } from '@/lib/types'
import { DuePopover } from './pickers'
import { DueDate } from './due-date'

export const FIELD_ICONS: Record<TaskFieldType, typeof Type> = { text: Type, number: Hash, date: Calendar, select: List, url: Link2 }

const cellCls = 'h-7 w-full rounded-md bg-transparent px-2 text-sm outline-none transition-colors hover:bg-hover focus:bg-panel focus:ring-1 focus:ring-accent'
/** variante formulario (página de tarea en modo Editar): campo con borde visible */
const fieldCls = 'h-9 w-full rounded-lg border border-line bg-panel px-2.5 text-sm outline-none transition-colors hover:border-line-strong focus:border-accent data-[popup-open]:border-accent'

/** Editor del valor de un campo propio según su tipo. */
export function FieldValue({
  field,
  value,
  editable,
  onChange,
  compact,
  variant = 'inline',
}: {
  field: TaskFieldDef
  value: string | number | null | undefined
  editable: boolean
  onChange: (v: string | number | null) => void
  compact?: boolean
  /** inline: celda de tabla; form: campo con borde al editar y texto plano al leer */
  variant?: 'inline' | 'form'
}) {
  const t = useTranslations('tasks.fields')
  const locale = useLocale()
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => setDraft(value == null ? '' : String(value)), [value])
  // Los números se muestran con separadores del idioma y se editan en crudo.
  const shown =
    field.type === 'number' && !focused && value != null && value !== '' && !Number.isNaN(Number(value))
      ? new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(value))
      : draft

  const commit = () => {
    const raw = draft.trim()
    if (field.type === 'number') {
      const n = raw === '' ? null : Number(raw.replace(',', '.'))
      if (n !== null && Number.isNaN(n)) return setDraft(value == null ? '' : String(value))
      if (n !== value) onChange(n)
      return
    }
    if ((raw || null) !== (value ?? null)) onChange(raw || null)
  }

  if (variant === 'form' && !editable) {
    if (value == null || value === '') return <span className="flex h-9 items-center text-sm text-fg-subtle">—</span>
    if (field.type === 'select') return <span className="flex h-9 items-center"><span className="rounded-md bg-highlight px-1.5 py-0.5 text-xs font-medium text-highlight-ink">{String(value)}</span></span>
    if (field.type === 'date') return <span className="flex h-9 items-center"><DueDate due={String(value)} withIcon={false} className="text-sm text-fg" /></span>
    if (field.type === 'url')
      return (
        <a href={/^https?:\/\//.test(String(value)) ? String(value) : `https://${value}`} target="_blank" rel="noreferrer" className="flex h-9 min-w-0 items-center gap-1.5 text-sm text-accent-ink hover:underline">
          <span className="truncate">{String(value)}</span>
          <ExternalLink className="size-3.5 shrink-0" />
        </a>
      )
    return <span className="flex h-9 items-center text-sm tabular-nums text-fg">{shown}</span>
  }
  const form = variant === 'form'

  if (field.type === 'select') {
    return (
      <Menu>
        <MenuTrigger
          disabled={!editable}
          className={cn(form ? cn(fieldCls, 'inline-flex items-center gap-1.5') : 'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-sm hover:bg-hover data-[popup-open]:bg-hover', !value && 'text-fg-subtle')}
        >
          {value ? <span className="rounded-md bg-highlight px-1.5 py-0.5 text-xs font-medium text-highlight-ink">{String(value)}</span> : compact ? '' : t('empty')}
        </MenuTrigger>
        <MenuContent className="w-48">
          <MenuRadioGroup value={value == null ? '__none' : String(value)} onValueChange={(v) => onChange(v === '__none' ? null : String(v))}>
            <MenuRadioItem value="__none">{t('none')}</MenuRadioItem>
            {(field.options ?? []).map((o) => (
              <MenuRadioItem key={o} value={o}>
                {o}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
    )
  }

  if (field.type === 'date') {
    return (
      <DuePopover value={value ? String(value) : null} onChange={(d) => onChange(d)} disabled={!editable} className={form ? cn(fieldCls, 'justify-start') : 'h-7 px-2'} aria-label={field.name}>
        {value ? <DueDate due={String(value)} withIcon={false} className="text-sm text-fg" /> : <span className="text-sm text-fg-subtle">{compact ? '' : t('empty')}</span>}
      </DuePopover>
    )
  }

  return (
    <span className="relative flex items-center">
      <input
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          commit()
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        readOnly={!editable}
        inputMode={field.type === 'number' ? 'decimal' : field.type === 'url' ? 'url' : undefined}
        placeholder={compact ? '' : t('empty')}
        className={cn(form ? fieldCls : cellCls, field.type === 'number' && 'tabular-nums', field.type === 'url' && value && 'pr-7 text-accent-ink')}
        aria-label={field.name}
      />
      {field.type === 'url' && value ? (
        <a href={/^https?:\/\//.test(String(value)) ? String(value) : `https://${value}`} target="_blank" rel="noreferrer" className="absolute right-1.5 text-fg-subtle hover:text-fg" aria-label={t('openLink')}>
          <ExternalLink className="size-3.5" />
        </a>
      ) : null}
    </span>
  )
}

/** Filas de campos propios del espacio en la página de la tarea (texto al leer, campos al editar). */
export function CustomFieldRows({ task, ws, editable, onChange }: { task: TaskRow; ws: WorkspaceWithRole; editable: boolean; onChange: (custom: TaskRow['custom']) => void }) {
  const fields = ws.task_fields ?? []
  if (!fields.length) return null
  return (
    <>
      {fields.map((f) => {
        const Icon = FIELD_ICONS[f.type]
        return (
          <div key={f.id} className="contents">
            {/* el tipo va después del nombre para que los nombres queden alineados con los campos fijos */}
            <dt className="flex min-w-0 items-center gap-1.5 text-fg-muted" title={f.name}>
              <span className="line-clamp-2 leading-tight">{f.name}</span>
              <Icon className="size-3 shrink-0 text-fg-subtle" />
            </dt>
            <dd className="min-w-0">
              <FieldValue field={f} value={task.custom?.[f.id]} editable={editable} variant="form" onChange={(v) => onChange({ ...(task.custom ?? {}), [f.id]: v })} />
            </dd>
          </div>
        )
      })}
    </>
  )
}

/** Agregar un campo propio al espacio (solo admins). */
export function AddFieldPopover({ ws }: { ws: WorkspaceWithRole }) {
  const t = useTranslations('tasks.fields')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<TaskFieldType>('text')
  const [options, setOptions] = useState('')
  const [pending, start] = useTransition()

  const save = () =>
    start(async () => {
      const def: TaskFieldDef = {
        id: `f_${crypto.randomUUID().slice(0, 8)}`,
        name: name.trim().slice(0, 40),
        type,
        ...(type === 'select' ? { options: options.split(',').map((o) => o.trim()).filter(Boolean).slice(0, 30) } : {}),
      }
      const { error } = await createClient()
        .from('workspaces')
        .update({ task_fields: [...(ws.task_fields ?? []), def] })
        .eq('id', ws.id)
      if (error) {
        toast.error(t('error'))
        return
      }
      toast.success(t('added', { name: def.name }))
      setOpen(false)
      setName('')
      setOptions('')
      router.refresh()
    })

  const types: TaskFieldType[] = ['text', 'number', 'date', 'select', 'url']

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-sm text-fg-subtle hover:bg-hover hover:text-fg">
        <Plus className="size-3.5" />
        {t('add')}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim() && (type !== 'select' || options.trim())) save()
          }}
          className="flex flex-col gap-2.5"
        >
          <p className="text-xs text-fg-muted">{t('addHint', { workspace: ws.name })}</p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('namePlaceholder')} autoFocus maxLength={40} className="h-8 rounded-md border border-line bg-canvas px-2.5 text-sm outline-none focus:border-accent" />
          <div className="grid grid-cols-5 gap-1">
            {types.map((ty) => {
              const Icon = FIELD_ICONS[ty]
              return (
                <button
                  key={ty}
                  type="button"
                  onClick={() => setType(ty)}
                  aria-pressed={type === ty}
                  className={cn('flex flex-col items-center gap-1 rounded-md py-1.5 text-2xs transition-colors', type === ty ? 'bg-accent-soft text-accent-ink' : 'text-fg-muted hover:bg-hover')}
                >
                  <Icon className="size-3.5" />
                  {t(`types.${ty}`)}
                </button>
              )
            })}
          </div>
          {type === 'select' ? (
            <input value={options} onChange={(e) => setOptions(e.target.value)} placeholder={t('optionsPlaceholder')} className="h-8 rounded-md border border-line bg-canvas px-2.5 text-sm outline-none focus:border-accent" />
          ) : null}
          <Button type="submit" variant="primary" size="sm" loading={pending} disabled={!name.trim() || (type === 'select' && !options.trim())}>
            {t('create')}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
