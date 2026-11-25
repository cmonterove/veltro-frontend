'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { CalendarClock, Flag, ListChecks, MessagesSquare, Pencil, Plus, Tag, Trash2, X } from 'lucide-react'
import { useApp, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'
import { useConfirm } from '@/components/ui/confirm'
import { Skeleton } from '@/components/ui/skeleton'
import { useTemplateMutations, useTemplates, type AgendaTemplateData, type TaskTemplateData, type Template } from '@/lib/queries/templates'
import type { TaskPriority } from '@/lib/database.types'
import { cn } from '@/lib/utils'
import { SettingsHeader } from './ui'

type Kind = 'task' | 'agenda'
type Editing = { kind: Kind; tpl: Template | null }

/**
 * Plantillas: las de tareas (se usan desde Tareas › ⋯ › Nueva desde plantilla) y las de agenda (desde
 * la sala de una reunión), en dos carriles. Cada una se ve por dentro (sus subtareas o sus puntos) para
 * reconocerla sin abrirla. Se crean aquí mismo (o desde una tarea o una reunión) y aquí se editan o borran.
 */
export function TemplatesSettings() {
  const t = useTranslations('settings.templates')
  const tt = useTranslations('templates')
  const tasks = useTemplates('task')
  const agendas = useTemplates('agenda')
  const [editing, setEditing] = useState<Editing | null>(null)
  return (
    <div className="flex flex-1 flex-col">
      <SettingsHeader title={t('title')} description={t('description')} />
      {/* dos carriles iguales que llegan hasta abajo: de tareas y de agenda */}
      <div className="grid flex-1 grid-cols-1 gap-6 xl:grid-cols-2">
        <Column
          kind="task"
          title={t('tasks')}
          hint={t('tasksHint')}
          howTo={tt('task.emptyHint')}
          icon={<ListChecks className="size-4" />}
          items={tasks.data}
          loading={tasks.isLoading}
          onNew={() => setEditing({ kind: 'task', tpl: null })}
          onEdit={(tpl) => setEditing({ kind: 'task', tpl })}
        />
        <Column
          kind="agenda"
          title={t('agendas')}
          hint={t('agendasHint')}
          howTo={t('createAgenda')}
          icon={<MessagesSquare className="size-4" />}
          items={agendas.data}
          loading={agendas.isLoading}
          onNew={() => setEditing({ kind: 'agenda', tpl: null })}
          onEdit={(tpl) => setEditing({ kind: 'agenda', tpl })}
        />
      </div>
      {editing ? <TemplateEditor key={editing.tpl?.id ?? `new-${editing.kind}`} kind={editing.kind} tpl={editing.tpl} onClose={() => setEditing(null)} /> : null}
    </div>
  )
}

function Column({
  kind,
  title,
  hint,
  howTo,
  icon,
  items,
  loading,
  onNew,
  onEdit,
}: {
  kind: Kind
  title: string
  hint: string
  howTo: string
  icon: React.ReactNode
  items: Template[] | undefined
  loading: boolean
  onNew: () => void
  onEdit: (tpl: Template) => void
}) {
  const t = useTranslations('settings.templates')
  return (
    <section className="flex min-h-[26rem] min-w-0 flex-col rounded-2xl bg-[color-mix(in_oklch,var(--sidebar)_55%,var(--canvas))] p-4 ring-1 ring-line-soft">
      <div className="flex items-start gap-3 px-1 pb-1">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-panel text-accent-ink shadow-card">{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-baseline gap-2 text-[15px] font-semibold text-fg">
            {title}
            <span className="text-xs font-normal tabular-nums text-fg-subtle">{items?.length ?? 0}</span>
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{hint}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onNew}>
          <Plus />
          {t('new')}
        </Button>
      </div>
      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      ) : items?.length ? (
        <ul className="mt-4 grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
          {items.map((x) => (
            <Card key={x.id} tpl={x} onEdit={() => onEdit(x)} />
          ))}
          {/* al final, siempre: crear otra (aquí o desde una tarea o una reunión) */}
          <li>
            <button
              type="button"
              onClick={onNew}
              className="group flex h-full min-h-44 w-full flex-col justify-center gap-3 rounded-2xl border border-dashed border-line-strong px-5 py-5 text-left outline-none transition-colors hover:border-accent-mid hover:bg-accent-soft/40 focus-visible:border-accent-mid"
            >
              <span className="flex size-9 items-center justify-center rounded-xl bg-panel text-fg-subtle transition-colors group-hover:text-accent-ink">
                <Plus className="size-4" />
              </span>
              <span>
                <span className="block text-sm font-medium text-fg">{t('createAnother')}</span>
                <span className="mt-1 block text-xs leading-relaxed text-fg-muted">{howTo}</span>
              </span>
            </button>
          </li>
        </ul>
      ) : (
        <EmptyLane kind={kind} howTo={howTo} onNew={onNew} />
      )}
    </section>
  )
}

/**
 * Carril vacío: cómo se ve una plantilla (una tarjeta fantasma con su contenido, otra detrás), el botón
 * para crear la primera y la otra forma de hacerlo. Ocupa el carril entero.
 */
function EmptyLane({ kind, howTo, onNew }: { kind: Kind; howTo: string; onNew: () => void }) {
  const t = useTranslations('settings.templates')
  const ghost = (
    <div className="flex h-full flex-col rounded-2xl border border-line bg-panel p-4 shadow-card">
      <span className="h-2.5 w-28 rounded-full bg-fg/15" />
      <span className="mt-1.5 h-2 w-16 rounded-full bg-fg/10" />
      <div className="mt-4 flex flex-1 flex-col gap-2.5 rounded-xl bg-sidebar/60 px-3 py-3">
        {[72, 56, 64, 44].map((w, i) => (
          <span key={i} className="flex items-center gap-2">
            {kind === 'task' ? (
              <span className="size-3 shrink-0 rounded-[4px] border border-line-strong bg-panel" />
            ) : (
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-panel text-[9px] font-semibold text-fg-subtle ring-1 ring-line">{i + 1}</span>
            )}
            <span className="h-2 rounded-full bg-fg/10" style={{ width: `${w}%` }} />
          </span>
        ))}
      </div>
    </div>
  )
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
      <div className="relative h-44 w-56" aria-hidden>
        <div className="absolute inset-0 translate-x-4 translate-y-2 rotate-[5deg] opacity-50">{ghost}</div>
        <div className="absolute inset-0 -rotate-[2deg]">{ghost}</div>
      </div>
      <p className="mt-6 text-sm font-semibold text-fg">{t('empty')}</p>
      <Button size="sm" variant="primary" className="mt-3" onClick={onNew}>
        <Plus />
        {kind === 'task' ? t('newTaskTitle') : t('newAgendaTitle')}
      </Button>
      <p className="mt-3 max-w-xs text-xs leading-relaxed text-fg-muted">
        {t('orElse')} {howTo.charAt(0).toLowerCase() + howTo.slice(1)}
      </p>
    </div>
  )
}

/** Una plantilla como tarjeta: su nombre, de qué espacio es y lo que trae adentro. Se abre para editarla. */
function Card({ tpl, onEdit }: { tpl: Template; onEdit: () => void }) {
  const t = useTranslations('settings.templates')
  const tConfirm = useTranslations('confirm')
  const confirm = useConfirm()
  const wsMap = useWorkspaceMap()
  const ws = tpl.workspaceId ? wsMap.get(tpl.workspaceId) : undefined
  const { remove } = useTemplateMutations()
  return (
    <li className="group flex min-h-44 flex-col rounded-2xl border border-line bg-panel transition-[box-shadow,border-color] duration-200 ease-out hover:border-line-strong hover:shadow-card">
      <div className="flex items-start gap-2 px-4 pb-2 pt-3.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">{tpl.name}</p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
            {ws ? <WorkspaceMark ws={ws} size={14} /> : null}
            <span className="truncate">{ws ? ws.name : t('account')}</span>
          </p>
        </div>
        {tpl.canEdit ? (
          <div className="-mr-1.5 -mt-0.5 flex shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <Tooltip content={t('edit')}>
              <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={t('edit')}>
                <Pencil />
              </Button>
            </Tooltip>
            <Tooltip content={t('delete')}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('delete')}
                onClick={async () => {
                  if (await confirm({ title: t('deleteConfirm', { name: tpl.name }), danger: true, confirmLabel: tConfirm('delete') })) remove.mutate(tpl.id)
                }}
              >
                <Trash2 />
              </Button>
            </Tooltip>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        disabled={!tpl.canEdit}
        onClick={onEdit}
        className="mx-3 mb-3 flex flex-1 flex-col rounded-xl bg-sidebar/60 px-3 py-2.5 text-left outline-none transition-colors enabled:hover:bg-sidebar focus-visible:ring-2 focus-visible:ring-accent-mid disabled:cursor-default"
      >
        {tpl.kind === 'task' ? <TaskPreview tpl={tpl as Template<'task'>} /> : <AgendaPreview tpl={tpl as Template<'agenda'>} />}
      </button>
    </li>
  )
}

const SHOWN = 4

/** Por dentro de una plantilla de tarea: el título, sus primeras subtareas y lo que trae puesto. */
function TaskPreview({ tpl }: { tpl: Template<'task'> }) {
  const t = useTranslations('settings.templates')
  const tp = useTranslations('tasks.priority')
  const d = tpl.data
  const rest = d.subtasks.length - SHOWN
  return (
    <>
      <span className="block truncate text-[13px] font-medium text-fg">{d.title || tpl.name}</span>
      {d.subtasks.length ? (
        <span className="mt-1.5 flex flex-col gap-1">
          {d.subtasks.slice(0, SHOWN).map((s, i) => (
            <span key={i} className="flex min-w-0 items-center gap-2 text-xs text-fg-muted">
              <span className="size-3 shrink-0 rounded-[4px] border border-line-strong bg-panel" aria-hidden />
              <span className="truncate">{s}</span>
            </span>
          ))}
          {rest > 0 ? <span className="pl-5 text-xs text-fg-subtle">{t('moreItems', { count: rest })}</span> : null}
        </span>
      ) : (
        <span className="mt-1.5 block text-xs text-fg-subtle">{t('taskDetail', { count: 0 })}</span>
      )}
      <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2.5 text-2xs text-fg-subtle">
        {d.priority && d.priority !== 'none' ? (
          <span className="inline-flex items-center gap-1">
            <Flag className="size-3" />
            {tp(d.priority)}
          </span>
        ) : null}
        {d.dueInDays != null ? (
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3" />
            {t('dueIn', { count: d.dueInDays })}
          </span>
        ) : null}
        {d.labels.length ? (
          <span className="inline-flex items-center gap-1">
            <Tag className="size-3" />
            {d.labels.slice(0, 2).join(', ')}
            {d.labels.length > 2 ? ` +${d.labels.length - 2}` : ''}
          </span>
        ) : null}
      </span>
    </>
  )
}

/** Por dentro de una plantilla de agenda: sus puntos, numerados como en la sala. */
function AgendaPreview({ tpl }: { tpl: Template<'agenda'> }) {
  const t = useTranslations('settings.templates')
  const items = tpl.data.items
  const rest = items.length - SHOWN - 1
  return (
    <>
      <span className="flex flex-col gap-1.5">
        {items.slice(0, SHOWN + 1).map((it, i) => (
          <span key={i} className="flex min-w-0 items-center gap-2 text-xs text-fg-muted">
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-panel text-[10px] font-semibold tabular-nums text-fg-subtle ring-1 ring-line">{i + 1}</span>
            <span className="truncate">{it.text}</span>
          </span>
        ))}
      </span>
      {rest > 0 ? <span className="mt-1.5 block pl-6 text-xs text-fg-subtle">{t('moreItems', { count: rest })}</span> : null}
      <span className="mt-auto block pt-2.5 text-2xs text-fg-subtle">{t('agendaDetail', { count: items.length })}</span>
    </>
  )
}

const PRIORITIES: TaskPriority[] = ['none', 'low', 'medium', 'high', 'urgent']

/**
 * Crear o editar una plantilla aquí mismo. De tarea: nombre, dónde está disponible, título, prioridad,
 * a cuántos días vence y sus subtareas. De agenda: nombre, dónde está disponible y sus puntos.
 */
function TemplateEditor({ kind, tpl, onClose }: { kind: Kind; tpl: Template | null; onClose: () => void }) {
  const t = useTranslations('settings.templates')
  const tp = useTranslations('tasks.priority')
  const { workspaces } = useApp()
  const { create, update } = useTemplateMutations()
  const task = tpl?.kind === 'task' ? (tpl.data as TaskTemplateData) : null
  const agenda = tpl?.kind === 'agenda' ? (tpl.data as AgendaTemplateData) : null
  const [name, setName] = useState(tpl?.name ?? '')
  const [scope, setScope] = useState<string>(tpl?.workspaceId ?? 'account')
  const [title, setTitle] = useState(task?.title ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'none')
  const [due, setDue] = useState(task?.dueInDays != null ? String(task.dueInDays) : '')
  const [items, setItems] = useState<string[]>(kind === 'task' ? (task?.subtasks ?? []) : (agenda?.items.map((i) => i.text) ?? []))
  const [draft, setDraft] = useState('')

  const all = [...items, draft].map((s) => s.trim()).filter(Boolean)
  const valid = Boolean(name.trim()) && (kind === 'task' || all.length > 0)
  const pending = create.isPending || update.isPending

  const save = () => {
    const data: TaskTemplateData | AgendaTemplateData =
      kind === 'task'
        ? {
            title: title.trim() || name.trim(),
            description: task?.description ?? '',
            priority,
            labels: task?.labels ?? [],
            subtasks: all,
            dueInDays: due.trim() === '' ? null : Math.max(0, Math.min(365, Number.parseInt(due, 10) || 0)),
          }
        : { items: all.map((text) => ({ text })) }
    const done = (msg: string) => () => {
      toast.success(msg)
      onClose()
    }
    if (tpl) update.mutate({ id: tpl.id, patch: { name: name.trim(), data } }, { onSuccess: done(t('saved')) })
    else create.mutate({ kind, name: name.trim(), workspaceId: scope === 'account' ? null : scope, data }, { onSuccess: done(t('created')) })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (valid && !pending) save()
          }}
        >
          <DialogHeader
            title={tpl ? t('editTitle') : kind === 'task' ? t('newTaskTitle') : t('newAgendaTitle')}
            description={kind === 'task' ? t('newTaskHint') : t('newAgendaHint')}
          />
          <DialogBody className="grid gap-x-6 gap-y-4 md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-4">
            <Field label={t('name')} htmlFor="tpl-name">
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                autoFocus
                placeholder={kind === 'task' ? t('namePlaceholderTask') : t('namePlaceholderAgenda')}
              />
            </Field>
            {!tpl ? (
              <Field label={t('scope')} htmlFor="tpl-scope">
                <Select
                  id="tpl-scope"
                  value={scope}
                  onChange={setScope}
                  options={[{ value: 'account', label: t('account') }, ...workspaces.map((w) => ({ value: w.id, label: w.name, icon: <WorkspaceMark ws={w} size={16} /> }))]}
                />
              </Field>
            ) : null}
            {kind === 'task' ? (
              <>
                <Field label={t('taskTitle')} htmlFor="tpl-title">
                  <Input id="tpl-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={name.trim() || t('taskTitlePlaceholder')} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('priority')} htmlFor="tpl-priority">
                    <Select<TaskPriority> id="tpl-priority" value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: tp(p) }))} />
                  </Field>
                  <Field label={t('dueInLabel')} htmlFor="tpl-due" hint={t('dueInHint')}>
                    <Input id="tpl-due" type="number" inputMode="numeric" min={0} max={365} value={due} onChange={(e) => setDue(e.target.value)} placeholder={t('noDue')} />
                  </Field>
                </div>
              </>
            ) : null}
            </div>
            <ItemsEditor
              label={kind === 'task' ? t('subtasks') : t('points')}
              placeholder={kind === 'task' ? t('addSubtask') : t('addPoint')}
              numbered={kind === 'agenda'}
              items={items}
              onChange={setItems}
              draft={draft}
              onDraft={setDraft}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={!valid} loading={pending}>
              {tpl ? t('save') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Lista editable (subtareas o puntos): cada uno se corrige o se quita; Enter en el último agrega otro. */
function ItemsEditor({
  label,
  placeholder,
  numbered,
  items,
  onChange,
  draft,
  onDraft,
}: {
  label: string
  placeholder: string
  numbered: boolean
  items: string[]
  onChange: (items: string[]) => void
  draft: string
  onDraft: (v: string) => void
}) {
  const t = useTranslations('settings.templates')
  const add = () => {
    const v = draft.trim()
    if (!v) return
    onChange([...items, v])
    onDraft('')
  }
  const marker = (i: number, faded?: boolean) =>
    numbered ? (
      <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full bg-hover text-[10px] font-semibold tabular-nums text-fg-subtle', faded && 'opacity-50')}>{i + 1}</span>
    ) : (
      <span className={cn('size-3.5 shrink-0 rounded-[4px] border border-line-strong', faded && 'opacity-50')} aria-hidden />
    )
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-sm font-medium text-fg">{label}</p>
      <ul className="flex max-h-[22rem] flex-col gap-1.5 overflow-y-auto pr-1 scrollbar-thin">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2">
            {marker(i)}
            <Input value={it} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} maxLength={200} className="h-8" aria-label={`${label} ${i + 1}`} />
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t('removeItem')} onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <X />
            </Button>
          </li>
        ))}
        <li className="flex items-center gap-2">
          {marker(items.length, true)}
          <Input
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            maxLength={200}
            placeholder={placeholder}
            className="h-8"
            aria-label={placeholder}
          />
          <Button type="button" variant="ghost" size="icon-sm" aria-label={placeholder} onClick={add} disabled={!draft.trim()}>
            <Plus />
          </Button>
        </li>
      </ul>
    </div>
  )
}
