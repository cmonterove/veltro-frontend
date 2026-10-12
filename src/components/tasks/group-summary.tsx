'use client'

import { useTranslations } from 'next-intl'
import { CircleAlert, Sun } from 'lucide-react'
import { useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { AvatarStack } from '@/components/ui/avatar'
import { assigneesOf } from '@/lib/assignees'
import { toDateKey } from '@/lib/dates'
import { dueBucketOf } from '@/lib/task-filters'
import type { TaskRow } from '@/lib/database.types'
import { cn } from '@/lib/utils'
import { StatusIcon } from './status-icon'
import { DueDate } from './due-date'

/** Lo que un grupo puede callar porque ya lo dice su nombre (agrupado por fecha, estado, espacio o persona). */
export type SummaryPart = 'due' | 'status' | 'spaces' | 'people'

/**
 * Lo que dice un grupo plegado: qué urge (vencidas, para hoy, bloqueadas), qué avanza, la próxima
 * fecha y quiénes y dónde. Solo aparece lo que tiene algo que contar.
 */
export function GroupSummary({ tasks, omit = [] }: { tasks: TaskRow[]; omit?: SummaryPart[] }) {
  const t = useTranslations('tasks.groupSummary')
  const memberMap = useMemberMap()
  const wsMap = useWorkspaceMap()
  const now = new Date()
  const today = toDateKey(now)
  const open = tasks.filter((x) => x.status !== 'done')
  const due = !omit.includes('due')
  const status = !omit.includes('status')

  const overdue = due ? open.filter((x) => dueBucketOf(x, now) === 'overdue').length : 0
  const dueToday = due ? open.filter((x) => x.due_date === today).length : 0
  const blocked = status ? open.filter((x) => x.status === 'blocked').length : 0
  const moving = status ? open.filter((x) => x.status === 'in_progress').length : 0
  const next = due ? open.flatMap((x) => (x.due_date && x.due_date > today ? [x.due_date] : [])).sort()[0] : undefined
  const people = omit.includes('people') ? [] : [...new Set(tasks.flatMap(assigneesOf))].flatMap((id) => memberMap.get(id) ?? [])
  const spaces = omit.includes('spaces') ? [] : [...new Set(tasks.map((x) => x.workspace_id))].flatMap((id) => wsMap.get(id) ?? [])

  return (
    <span className="ml-auto flex min-w-0 items-center gap-3 pl-3">
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        {overdue ? (
          <Chip tone="danger">
            <CircleAlert className="size-3" />
            {t('overdue', { count: overdue })}
          </Chip>
        ) : null}
        {blocked ? (
          <Chip tone="danger">
            <StatusIcon status="blocked" className="size-3" />
            {t('blocked', { count: blocked })}
          </Chip>
        ) : null}
        {dueToday ? (
          <Chip>
            <Sun className="size-3 text-fg-muted" />
            {t('today', { count: dueToday })}
          </Chip>
        ) : null}
        {moving ? (
          <Chip>
            <StatusIcon status="in_progress" className="size-3" />
            {t('moving', { count: moving })}
          </Chip>
        ) : null}
        {next ? (
          <span className="hidden shrink-0 items-center gap-1 text-xs text-fg-subtle lg:inline-flex">
            {t('next')}
            <DueDate due={next} withIcon={false} />
          </span>
        ) : null}
      </span>
      {spaces.length ? (
        <span className="hidden shrink-0 items-center md:flex" title={spaces.map((w) => w.name).join(', ')}>
          {spaces.slice(0, 4).map((w, i) => (
            <WorkspaceMark key={w.id} ws={w} size={16} className={cn('ring-2 ring-sidebar', i > 0 && '-ml-1')} />
          ))}
        </span>
      ) : null}
      {people.length ? <AvatarStack people={people} size={18} max={4} ring="sidebar" className="hidden md:flex" /> : null}
    </span>
  )
}

function Chip({ tone, children }: { tone?: 'danger'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-2xs font-medium',
        tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-hover text-fg-muted',
      )}
    >
      {children}
    </span>
  )
}
