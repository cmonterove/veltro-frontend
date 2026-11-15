'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { LayoutTemplate, ListChecks, MessagesSquare, Pencil, Trash2 } from 'lucide-react'
import { useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { useConfirm } from '@/components/ui/confirm'
import { Skeleton } from '@/components/ui/skeleton'
import { useTemplateMutations, useTemplates, type Template } from '@/lib/queries/templates'
import { SettingsHeader } from './ui'

/**
 * Plantillas: las de tareas (se usan desde Tareas › ⋯ › Nueva desde plantilla) y las de agenda (desde
 * la sala de una reunión). Se crean desde una tarea o una reunión; aquí se renombran o se borran.
 */
export function TemplatesSettings() {
  const t = useTranslations('settings.templates')
  const tasks = useTemplates('task')
  const agendas = useTemplates('agenda')
  return (
    <div>
      <SettingsHeader title={t('title')} description={t('description')} />
      <Group title={t('tasks')} hint={t('tasksHint')} icon={<ListChecks className="size-4" />} items={tasks.data} loading={tasks.isLoading} />
      <Group title={t('agendas')} hint={t('agendasHint')} icon={<MessagesSquare className="size-4" />} items={agendas.data} loading={agendas.isLoading} />
    </div>
  )
}

function Group({ title, hint, icon, items, loading }: { title: string; hint: string; icon: React.ReactNode; items: Template[] | undefined; loading: boolean }) {
  const t = useTranslations('settings.templates')
  return (
    <section className="mb-8">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
        <span className="text-fg-subtle">{icon}</span>
        {title}
      </h2>
      <p className="mb-3 mt-0.5 text-sm text-fg-muted">{hint}</p>
      {loading ? (
        <Skeleton className="h-14 rounded-xl" />
      ) : items?.length ? (
        <ul className="flex flex-col divide-y divide-line-soft rounded-xl border border-line bg-panel">
          {items.map((x) => (
            <Row key={x.id} tpl={x} />
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-line px-4 py-4 text-sm text-fg-muted">
          <LayoutTemplate className="size-4 shrink-0 text-fg-subtle" />
          {t('empty')}
        </div>
      )}
    </section>
  )
}

function Row({ tpl }: { tpl: Template }) {
  const t = useTranslations('settings.templates')
  const tConfirm = useTranslations('confirm')
  const confirm = useConfirm()
  const wsMap = useWorkspaceMap()
  const ws = tpl.workspaceId ? wsMap.get(tpl.workspaceId) : undefined
  const { update, remove } = useTemplateMutations()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(tpl.name)
  const detail =
    tpl.kind === 'task'
      ? t('taskDetail', { count: (tpl as Template<'task'>).data.subtasks.length })
      : t('agendaDetail', { count: (tpl as Template<'agenda'>).data.items.length })
  const save = () => {
    setEditing(false)
    if (name.trim() && name.trim() !== tpl.name) update.mutate({ id: tpl.id, patch: { name: name.trim() } })
    else setName(tpl.name)
  }
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {ws ? <WorkspaceMark ws={ws} size={20} /> : <LayoutTemplate className="size-5 shrink-0 text-fg-subtle" />}
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') {
                setName(tpl.name)
                setEditing(false)
              }
            }}
            maxLength={80}
            autoFocus
            aria-label={t('name')}
            className="h-8 w-full rounded-md border border-accent-mid bg-panel px-2 text-sm outline-none"
          />
        ) : (
          <p className="truncate text-sm font-medium text-fg">{tpl.name}</p>
        )}
        <p className="truncate text-xs text-fg-muted">
          {ws ? ws.name : t('account')} · {detail}
        </p>
      </div>
      {tpl.canEdit ? (
        <>
          <Tooltip content={t('rename')}>
            <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)} aria-label={t('rename')}>
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
        </>
      ) : null}
    </li>
  )
}
