'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  nextMonday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ChevronLeft, ChevronRight, CircleUser, Search, X } from 'lucide-react'
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuShortcut, MenuTrigger } from '@/components/ui/menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Avatar } from '@/components/ui/avatar'
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/constants'
import { toDateKey, useDateLocale } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { TaskPriority, TaskStatus } from '@/lib/database.types'
import type { Member } from '@/lib/types'
import { PriorityIcon, StatusIcon } from './status-icon'

type TriggerProps = {
  children: React.ReactNode
  className?: string
  disabled?: boolean
  'aria-label'?: string
}

const triggerBase =
  'inline-flex items-center gap-1.5 rounded-md outline-none transition-colors hover:bg-hover data-[popup-open]:bg-hover disabled:pointer-events-none'

export function StatusMenu({
  value,
  onChange,
  ...trigger
}: { value: TaskStatus; onChange: (s: TaskStatus) => void } & TriggerProps) {
  const t = useTranslations('tasks.status')
  return (
    <Menu>
      <MenuTrigger
        className={cn(triggerBase, trigger.className)}
        disabled={trigger.disabled}
        aria-label={trigger['aria-label'] ?? t(value)}
        onClick={(e) => e.stopPropagation()}
      >
        {trigger.children}
      </MenuTrigger>
      <MenuContent className="w-52" onClick={(e) => e.stopPropagation()}>
        <MenuRadioGroup value={value} onValueChange={(v) => onChange(v as TaskStatus)}>
          {TASK_STATUSES.map((s, i) => (
            <MenuRadioItem key={s} value={s}>
              <StatusIcon status={s} />
              {t(s)}
              <MenuShortcut className="mr-4">{i + 1}</MenuShortcut>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  )
}

export function PriorityMenu({
  value,
  onChange,
  ...trigger
}: { value: TaskPriority; onChange: (p: TaskPriority) => void } & TriggerProps) {
  const t = useTranslations('tasks.priority')
  return (
    <Menu>
      <MenuTrigger
        className={cn(triggerBase, trigger.className)}
        disabled={trigger.disabled}
        aria-label={trigger['aria-label'] ?? t(value)}
        onClick={(e) => e.stopPropagation()}
      >
        {trigger.children}
      </MenuTrigger>
      <MenuContent className="w-48" onClick={(e) => e.stopPropagation()}>
        <MenuRadioGroup value={value} onValueChange={(v) => onChange(v as TaskPriority)}>
          {TASK_PRIORITIES.map((p) => (
            <MenuRadioItem key={p} value={p}>
              <PriorityIcon priority={p} />
              {t(p)}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  )
}

export function AssigneeMenu({
  value,
  members,
  onChange,
  ...trigger
}: { value: string | null; members: Member[]; onChange: (id: string | null) => void } & TriggerProps) {
  const t = useTranslations('tasks')
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? members.filter((m) => m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)) : members
  }, [members, query])

  return (
    <Menu onOpenChange={(o) => !o && setQuery('')}>
      <MenuTrigger
        className={cn(triggerBase, trigger.className)}
        disabled={trigger.disabled}
        aria-label={trigger['aria-label'] ?? t('assignee')}
        onClick={(e) => e.stopPropagation()}
      >
        {trigger.children}
      </MenuTrigger>
      <MenuContent className="w-60" onClick={(e) => e.stopPropagation()}>
        {members.length > 6 ? (
          <div className="flex items-center gap-2 border-b border-line px-2 pb-1.5 pt-0.5">
            <Search className="size-3.5 text-fg-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={t('searchPeople')}
              className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-fg-subtle"
              autoFocus
            />
          </div>
        ) : null}
        <MenuRadioGroup value={value ?? '__none'} onValueChange={(v) => onChange(v === '__none' ? null : String(v))}>
          <MenuRadioItem value="__none">
            <CircleUser />
            {t('unassigned')}
          </MenuRadioItem>
          {filtered.map((m) => (
            <MenuRadioItem key={m.id} value={m.id}>
              <Avatar name={m.full_name} src={m.avatar_url} seed={m.id} size={18} />
              <span className="truncate">{m.full_name}</span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  )
}

export function DuePopover({
  value,
  onChange,
  ...trigger
}: { value: string | null; onChange: (d: string | null) => void } & TriggerProps) {
  const t = useTranslations('dates')
  const locale = useDateLocale()
  const [open, setOpen] = useState(false)
  const pick = (d: string | null) => {
    onChange(d)
    setOpen(false)
  }
  const today = new Date()

  const quick = [
    { label: t('today'), date: today },
    { label: t('tomorrow'), date: addDays(today, 1) },
    { label: t('nextWeek'), date: nextMonday(today) },
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(triggerBase, trigger.className)}
        disabled={trigger.disabled}
        aria-label={trigger['aria-label'] ?? t('dueDate')}
        onClick={(e) => e.stopPropagation()}
      >
        {trigger.children}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col gap-px pb-2">
          {quick.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => pick(toDateKey(q.date))}
              className="flex h-7 items-center justify-between rounded-sm px-2 text-sm hover:bg-hover"
            >
              {q.label}
              <span className="text-xs text-fg-subtle">{format(q.date, 'EEE d', { locale })}</span>
            </button>
          ))}
          {value ? (
            <button
              type="button"
              onClick={() => pick(null)}
              className="flex h-7 items-center gap-2 rounded-sm px-2 text-sm text-fg-muted hover:bg-hover"
            >
              <X className="size-3.5" />
              {t('clear')}
            </button>
          ) : null}
        </div>
        <div className="border-t border-line pt-2">
          <MiniCalendar selected={value ? parseISO(value) : null} onSelect={(d) => pick(toDateKey(d))} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function MiniCalendar({ selected, onSelect }: { selected: Date | null; onSelect: (d: Date) => void }) {
  const locale = useDateLocale()
  const [month, setMonth] = useState(() => startOfMonth(selected ?? new Date()))
  const weekStartsOn = locale.options?.weekStartsOn ?? 1
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn }),
  })
  const weekdays = days.slice(0, 7)

  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-sm font-medium capitalize">{format(month, 'LLLL yyyy', { locale })}</span>
        <div className="flex">
          <button type="button" onClick={() => setMonth(addMonths(month, -1))} className="inline-flex size-6 items-center justify-center rounded-sm text-fg-muted hover:bg-hover">
            <ChevronLeft className="size-3.5" />
          </button>
          <button type="button" onClick={() => setMonth(addMonths(month, 1))} className="inline-flex size-6 items-center justify-center rounded-sm text-fg-muted hover:bg-hover">
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center">
        {weekdays.map((d) => (
          <span key={d.toISOString()} className="py-1 text-2xs font-medium uppercase text-fg-subtle">
            {format(d, 'EEEEEE', { locale })}
          </span>
        ))}
        {days.map((d) => {
          const sel = selected && isSameDay(d, selected)
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onSelect(d)}
              className={cn(
                'mx-auto flex size-7 items-center justify-center rounded-md text-xs tabular-nums transition-colors hover:bg-hover',
                !isSameMonth(d, month) && 'text-fg-subtle/60',
                isToday(d) && !sel && 'font-semibold text-accent-ink',
                sel && 'bg-accent text-accent-fg hover:bg-accent-hover',
              )}
            >
              {format(d, 'd')}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function LabelsPopover({
  value,
  suggestions,
  onChange,
  ...trigger
}: { value: string[]; suggestions: string[]; onChange: (labels: string[]) => void } & TriggerProps) {
  const t = useTranslations('tasks')
  const [draft, setDraft] = useState('')
  const all = useMemo(() => [...new Set([...suggestions, ...value])].sort(), [suggestions, value])
  const filtered = all.filter((l) => l.toLowerCase().includes(draft.trim().toLowerCase()))
  const exact = all.some((l) => l.toLowerCase() === draft.trim().toLowerCase())

  const toggle = (label: string) =>
    onChange(value.includes(label) ? value.filter((l) => l !== label) : [...value, label].slice(0, 8))

  return (
    <Popover onOpenChange={(o) => !o && setDraft('')}>
      <PopoverTrigger
        className={cn(triggerBase, trigger.className)}
        disabled={trigger.disabled}
        aria-label={trigger['aria-label'] ?? t('labels')}
        onClick={(e) => e.stopPropagation()}
      >
        {trigger.children}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" onClick={(e) => e.stopPropagation()}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              e.preventDefault()
              const label = draft.trim().slice(0, 32)
              if (!value.includes(label)) toggle(label)
              setDraft('')
            }
          }}
          placeholder={t('labelPlaceholder')}
          className="h-8 w-full rounded-sm bg-transparent px-2 text-sm outline-none placeholder:text-fg-subtle"
          autoFocus
        />
        <div className="max-h-56 overflow-y-auto border-t border-line pt-1">
          {filtered.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => toggle(l)}
              className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover"
            >
              <span
                className={cn(
                  'flex size-3.5 items-center justify-center rounded-xs border border-line-strong',
                  value.includes(l) && 'border-accent bg-accent',
                )}
              >
                {value.includes(l) ? <span className="size-1.5 rounded-full bg-accent-fg" /> : null}
              </span>
              <span className="truncate">{l}</span>
            </button>
          ))}
          {draft.trim() && !exact ? (
            <button
              type="button"
              onClick={() => {
                toggle(draft.trim().slice(0, 32))
                setDraft('')
              }}
              className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-fg-muted hover:bg-hover"
            >
              {t('createLabel', { label: draft.trim() })}
            </button>
          ) : null}
          {!draft && all.length === 0 ? <p className="px-2 py-1.5 text-xs text-fg-subtle">{t('labelHint')}</p> : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function LabelChip({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 max-w-32 items-center gap-1 rounded-full border border-line px-2 text-2xs font-medium text-fg-muted', className)}>
      <span className="size-1.5 shrink-0 rounded-full bg-fg-subtle" />
      <span className="truncate">{label}</span>
    </span>
  )
}
