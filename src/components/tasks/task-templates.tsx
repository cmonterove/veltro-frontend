'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { addDays, format } from 'date-fns'
import { toast } from 'sonner'
import { LayoutTemplate, ListChecks } from 'lucide-react'
import { canEdit, useApp, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/switch'
import { useCreateTask, useSubtasks } from '@/lib/queries/tasks'
import { useTemplateMutations, useTemplates, type Template } from '@/lib/queries/templates'
import { useOpenTask } from '@/lib/use-open-task'
import { track } from '@/lib/telemetry'
import type { TaskRow } from '@/lib/database.types'
import { cn } from '@/lib/utils'
import { PriorityIcon } from './status-icon'

/** Guardar una tarea como plantilla: título, descripción, prioridad, etiquetas y (si se quiere) sus subtareas. */
export function SaveTaskTemplateDialog({ task, open, onOpenChange }: { task: TaskRow; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('templates.task')
  const wsMap = useWorkspaceMap()
  const ws = wsMap.get(task.workspace_id)
  const { data: subtasks = [] } = useSubtasks(task.id)
  const { create } = useTemplateMutations()
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'workspace' | 'account'>('workspace')
  const [withSubtasks, setWithSubtasks] = useState(true)
  const [withDue, setWithDue] = useState(true)
  useEffect(() => {
    if (!open) return
    setName(task.title.slice(0, 80))
    setScope('workspace')
    setWithSubtasks(true)
    setWithDue(true)
  }, [open, task.title])
  // el plazo: cuántos días después de crearla vencía
  const dueInDays = task.due_date ? Math.max(0, Math.round((new Date(`${task.due_date}T12:00:00`).getTime() - new Date(task.created_at).getTime()) / 86_400_000)) : null

  const submit = () => {
    if (!name.trim()) return
    create.mutate(
      {
        kind: 'task',
        name: name.trim(),
        workspaceId: scope === 'workspace' ? task.workspace_id : null,
        data: {
          title: task.title,
          description: task.description_text ?? '',
          priority: task.priority,
          labels: task.labels,
          subtasks: withSubtasks ? subtasks.map((s) => s.title).slice(0, 50) : [],
          dueInDays: withDue ? dueInDays : null,
        },
      },
      {
        onSuccess: (tpl) => {
          toast.success(t('saved', { name: tpl.name }))
          track('feature.template_save_task')
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <DialogHeader title={t('saveTitle')} description={t('saveHint')} />
          <DialogBody className="flex flex-col gap-4">
            <Field label={t('name')} htmlFor="tpl-name">
              <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
            </Field>
            <Field label={t('scope')} htmlFor="tpl-scope">
              <Select
                id="tpl-scope"
                value={scope}
                onChange={(v) => setScope(v as 'workspace' | 'account')}
                options={[
                  { value: 'workspace', label: t('scopeWorkspace', { name: ws?.name ?? '' }), icon: ws ? <WorkspaceMark ws={ws} size={16} /> : undefined },
                  { value: 'account', label: t('scopeAccount') },
                ]}
              />
            </Field>
            {subtasks.length ? (
              <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                <Checkbox checked={withSubtasks} onCheckedChange={(v) => setWithSubtasks(Boolean(v))} />
                {t('withSubtasks', { count: subtasks.length })}
              </label>
            ) : null}
            {dueInDays !== null ? (
              <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                <Checkbox checked={withDue} onCheckedChange={(v) => setWithDue(Boolean(v))} />
                {t('withDue', { count: dueInDays })}
              </label>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={!name.trim()} loading={create.isPending}>
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Crear una tarea desde una plantilla (con sus subtareas): se elige la plantilla, el espacio y el título. */
export function UseTaskTemplateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('templates.task')
  const { workspaces } = useApp()
  const wsMap = useWorkspaceMap()
  const editable = useMemo(() => workspaces.filter((w) => canEdit(w)), [workspaces])
  const { data: templates = [], isLoading } = useTemplates('task')
  const usable = templates.filter((x) => !x.workspaceId || editable.some((w) => w.id === x.workspaceId))
  const create = useCreateTask()
  const { open: openTask } = useOpenTask()
  const [pick, setPick] = useState<Template<'task'> | null>(null)
  const [ws, setWs] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setPick(null)
    setTitle('')
  }, [open])
  const choose = (x: Template<'task'>) => {
    setPick(x)
    setTitle(x.data.title)
    setWs(x.workspaceId ?? (editable.some((w) => w.id === ws) ? ws : (editable[0]?.id ?? '')))
  }

  const submit = async () => {
    if (!pick || !ws || !title.trim()) return
    setBusy(true)
    try {
      const d = pick.data
      const [task] = await create.mutateAsync({
        workspace_id: ws,
        title: title.trim().slice(0, 500),
        description_text: d.description || undefined,
        priority: d.priority,
        labels: d.labels,
        status: 'todo',
        due_date: d.dueInDays != null ? format(addDays(new Date(), d.dueInDays), 'yyyy-MM-dd') : null,
      })
      if (task && d.subtasks.length) {
        await create.mutateAsync(d.subtasks.map((s, i) => ({ workspace_id: ws, parent_id: task.id, title: s, status: 'todo' as const, position: (i + 1) * 1000 })))
      }
      toast.success(t('created'))
      track('feature.template_use_task')
      onOpenChange(false)
      if (task) openTask(task.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader title={t('useTitle')} description={t('useHint')} />
        <DialogBody className="flex flex-col gap-4">
          {isLoading ? null : !usable.length ? (
            <div className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center">
              <LayoutTemplate className="mx-auto size-6 text-fg-subtle" />
              <p className="mt-2 text-sm font-medium text-fg">{t('empty')}</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-fg-muted">{t('emptyHint')}</p>
            </div>
          ) : (
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto scrollbar-thin" role="listbox" aria-label={t('useTitle')}>
              {usable.map((x) => {
                const w = x.workspaceId ? wsMap.get(x.workspaceId) : undefined
                const on = pick?.id === x.id
                return (
                  <li key={x.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => choose(x)}
                      className={cn('flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors', on ? 'border-accent-mid bg-accent-soft/60' : 'border-line hover:bg-hover/50')}
                    >
                      <PriorityIcon priority={x.data.priority} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">{x.name}</span>
                        <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                          {w ? <WorkspaceMark ws={w} size={12} /> : null}
                          <span className="truncate">{w ? w.name : t('scopeAccount')}</span>
                          {x.data.subtasks.length ? (
                            <span className="inline-flex items-center gap-0.5 text-fg-subtle">
                              · <ListChecks className="size-3" /> {x.data.subtasks.length}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {pick ? (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <Field label={t('workspace')} htmlFor="tpl-ws">
                <Select
                  id="tpl-ws"
                  value={ws}
                  onChange={setWs}
                  disabled={Boolean(pick.workspaceId)}
                  options={editable.map((w) => ({ value: w.id, label: w.name, icon: <WorkspaceMark ws={w} size={16} /> }))}
                />
              </Field>
              <Field label={t('taskTitle')} htmlFor="tpl-title">
                <Input id="tpl-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} />
              </Field>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button variant="primary" onClick={submit} disabled={!pick || !ws || !title.trim()} loading={busy}>
            {t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
