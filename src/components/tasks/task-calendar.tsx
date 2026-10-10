'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCreateTask } from '@/lib/queries/tasks'
import { useTaskPanel } from '@/lib/hooks'
import { toDateKey, useDateLocale } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { TaskRow as Task } from '@/lib/database.types'
import { StatusIcon } from './status-icon'

export function TaskCalendar({ tasks, workspaceId, editable }: { tasks: Task[]; workspaceId: string; editable: boolean }) {
  const t = useTranslations('tasks')
  const locale = useDateLocale()
  const { open } = useTaskPanel()
  const create = useCreateTask()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [adding, setAdding] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const weekStartsOn = locale.options?.weekStartsOn ?? 1

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn }),
  })

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const task of tasks) {
      if (!task.due_date) continue
      if (!map.has(task.due_date)) map.set(task.due_date, [])
      map.get(task.due_date)!.push(task)
    }
    return map
  }, [tasks])

  const noDate = tasks.filter((x) => !x.due_date && x.status !== 'done').length

  return (
    <div className="flex h-full min-h-0 flex-col px-4 pb-6 pt-3">
      <div className="flex items-center gap-2 pb-3">
        <h2 className="text-md font-semibold capitalize">{format(month, 'LLLL yyyy', { locale })}</h2>
        <div className="flex">
          <Button variant="ghost" size="icon-sm" onClick={() => setMonth(addMonths(month, -1))} aria-label={t('prevMonth')}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setMonth(addMonths(month, 1))} aria-label={t('nextMonth')}>
            <ChevronRight />
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
          {t('thisMonth')}
        </Button>
        {noDate ? <span className="ml-auto text-xs text-fg-subtle">{t('noDateCount', { count: noDate })}</span> : null}
      </div>

      <div className="grid grid-cols-7 border-l border-t border-line">
        {days.slice(0, 7).map((d) => (
          <div key={d.toISOString()} className="border-b border-r border-line px-2 py-1.5 text-2xs font-medium uppercase text-fg-subtle">
            {format(d, 'EEE', { locale })}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 border-l border-line">
        {days.map((d) => {
          const key = toDateKey(d)
          const list = byDay.get(key) ?? []
          return (
            <div
              key={key}
              className={cn(
                'group/day flex min-h-24 flex-col gap-0.5 overflow-hidden border-b border-r border-line p-1',
                !isSameMonth(d, month) && 'bg-sidebar/60',
              )}
            >
              <div className="flex items-center justify-between px-1">
                <span
                  className={cn(
                    'inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums',
                    isToday(d) ? 'bg-accent font-semibold text-accent-fg' : isSameMonth(d, month) ? 'text-fg-muted' : 'text-fg-subtle',
                  )}
                >
                  {format(d, 'd')}
                </span>
                {editable ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(key)
                      setDraft('')
                    }}
                    className="inline-flex size-5 items-center justify-center rounded-sm text-fg-subtle opacity-0 hover:bg-hover hover:text-fg group-hover/day:opacity-100 focus-visible:opacity-100"
                    aria-label={t('addOnDay')}
                  >
                    <Plus className="size-3.5" />
                  </button>
                ) : null}
              </div>
              {list.slice(0, 4).map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => open(task.id)}
                  className="flex h-6 min-w-0 items-center gap-1.5 rounded-sm px-1 text-left text-xs hover:bg-hover"
                >
                  <StatusIcon status={task.status} className="size-3" />
                  <span className={cn('truncate', task.status === 'done' ? 'text-fg-subtle line-through' : 'text-fg')}>{task.title}</span>
                </button>
              ))}
              {list.length > 4 ? <span className="px-1 text-2xs text-fg-subtle">{t('moreCount', { count: list.length - 4 })}</span> : null}
              {adding === key ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => setAdding(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setAdding(null)
                    if (e.key === 'Enter' && draft.trim()) {
                      create.mutate({ workspace_id: workspaceId, title: draft.trim(), due_date: key, status: 'todo', position: Date.now() / 1000 })
                      setDraft('')
                    }
                  }}
                  placeholder={t('composerPlaceholder')}
                  className="h-6 w-full rounded-sm border border-accent-mid bg-panel px-1.5 text-xs outline-none"
                />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
