'use client'

import { useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Menu as M } from '@base-ui/react/menu'
import {
  CalendarClock,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  Check,
  ChevronDown,
  CircleAlert,
  CircleDashed,
  CircleUser,
  LayoutGrid,
  Rows3,
  Search,
  SignalHigh,
  Sun,
  Tag,
  Users,
  X,
} from 'lucide-react'
import { useApp, useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Avatar } from '@/components/ui/avatar'
import { Menu, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { TASK_PRIORITIES } from '@/lib/constants'
import { DUE_BUCKETS, NO_FILTERS, UNASSIGNED, activeFilterCount, dueBucketOf, matchesTaskFilters, whoKeys, type DueBucket, type FilterKey, type TaskFilters } from '@/lib/task-filters'
import type { TaskRow } from '@/lib/database.types'
import { cn } from '@/lib/utils'
import type { GroupBy } from './my-task-groups'
import { PriorityIcon, StatusIcon } from './status-icon'
import { LIST_STATUS_ORDER } from './task-list'

export type FilterOption = { value: string; label: string; icon?: React.ReactNode; count: number }

/** Un ícono por dimensión: el mismo en el filtro y en "Agrupar por". */
const DIMENSION_ICON = {
  status: CircleDashed,
  due: CalendarDays,
  ws: LayoutGrid,
  who: Users,
  prio: SignalHigh,
  label: Tag,
} satisfies Record<FilterKey, unknown>

const DUE_ICON: Record<DueBucket, React.ReactNode> = {
  overdue: <CircleAlert className="size-3.5 shrink-0 text-danger" />,
  today: <Sun className="size-3.5 shrink-0 text-fg-muted" />,
  week: <CalendarRange className="size-3.5 shrink-0 text-fg-muted" />,
  later: <CalendarClock className="size-3.5 shrink-0 text-fg-muted" />,
  none: <CalendarOff className="size-3.5 shrink-0 text-fg-subtle" />,
}

/**
 * Búsqueda y filtros de la vista Tareas. Cada filtro es un menú de opciones con su cifra, contada con
 * los demás filtros aplicados; activo, se vuelve una ficha con lo elegido y una × para quitarlo.
 */
export function TaskFilterBar({
  tasks,
  universe,
  filters,
  onChange,
  query,
  onQuery,
  showPeople,
  children,
}: {
  /** las tareas del alcance que pasan la búsqueda: sobre ellas se cuentan las opciones */
  tasks: TaskRow[]
  /** todas las del alcance: de ellas salen las opciones, así la barra no cambia mientras se escribe */
  universe: TaskRow[]
  filters: TaskFilters
  /** recibe una función sobre los filtros vigentes, para que dos clicks seguidos no se pisen */
  onChange: (update: (current: TaskFilters) => TaskFilters) => void
  query: string
  onQuery: (q: string) => void
  /** el filtro de responsable solo aparece cuando se mira a más de una persona */
  showPeople: boolean
  /** lo que va a la derecha (agrupar, total) */
  children?: React.ReactNode
}) {
  const t = useTranslations('myTasks.filters')
  const tStatus = useTranslations('tasks.status')
  const tPriority = useTranslations('tasks.priority')
  const tGroups = useTranslations('myTasks.groups')
  const tTasks = useTranslations('tasks')
  const wsMap = useWorkspaceMap()
  const memberMap = useMemberMap()
  const { user } = useApp()

  const options = useMemo(() => {
    const now = new Date()
    const rank = (id: string) => (id === user.id ? 0 : id === UNASSIGNED ? 2 : 1)
    const count = (k: FilterKey, keyOf: (x: TaskRow) => string | string[] | null) => {
      const tally = new Map<string, number>()
      for (const x of tasks) {
        if (!matchesTaskFilters(x, filters, now, k)) continue
        const v = keyOf(x)
        for (const key of v == null ? [] : Array.isArray(v) ? v : [v]) tally.set(key, (tally.get(key) ?? 0) + 1)
      }
      return (value: string) => tally.get(value) ?? 0
    }
    // las opciones salen del alcance (y de lo ya elegido, para poder quitarlo aunque ya no esté)
    const present = (k: FilterKey, keyOf: (x: TaskRow) => string[]) => [...new Set([...universe.flatMap(keyOf), ...filters[k]])]

    const status = count('status', (x) => x.status)
    const due = count('due', (x) => dueBucketOf(x, now))
    const ws = count('ws', (x) => x.workspace_id)
    const who = count('who', whoKeys)
    const prio = count('prio', (x) => x.priority)
    const label = count('label', (x) => x.labels)

    return {
      status: LIST_STATUS_ORDER.map((s) => ({ value: s, label: tStatus(s), icon: <StatusIcon status={s} />, count: status(s) })),
      due: DUE_BUCKETS.map((b) => ({ value: b, label: tGroups(b), icon: DUE_ICON[b], count: due(b) })),
      ws: present('ws', (x) => [x.workspace_id])
        .flatMap((id) => {
          const w = wsMap.get(id)
          return w ? [{ value: id, label: w.name, icon: <WorkspaceMark ws={w} size={16} />, count: ws(id) }] : []
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
      who: present('who', whoKeys)
        .map((id) => {
          if (id === UNASSIGNED) return { value: id, label: tTasks('unassigned'), icon: <CircleUser className="size-[18px] shrink-0 text-fg-subtle" />, count: who(id) }
          const m = memberMap.get(id)
          return { value: id, label: m?.full_name ?? '?', icon: <Avatar name={m?.full_name} src={m?.avatar_url} seed={id} size={18} />, count: who(id) }
        })
        // tú primero, "sin asignar" al final
        .sort((a, b) => rank(a.value) - rank(b.value) || a.label.localeCompare(b.label)),
      prio: TASK_PRIORITIES.map((p) => ({ value: p, label: tPriority(p), icon: <PriorityIcon priority={p} />, count: prio(p) })),
      label: present('label', (x) => x.labels)
        .sort((a, b) => a.localeCompare(b))
        .map((l) => ({ value: l, label: l, icon: <span className="mx-[3px] size-2 shrink-0 rounded-full bg-fg-subtle" />, count: label(l) })),
    } satisfies Record<FilterKey, FilterOption[]>
  }, [tasks, universe, filters, wsMap, memberMap, user.id, tStatus, tPriority, tGroups, tTasks])

  const toggle = (k: FilterKey) => (v: string, on: boolean) =>
    onChange((f) => ({ ...f, [k]: on ? [...f[k].filter((x) => x !== v), v] : f[k].filter((x) => x !== v) }))
  const clear = (k: FilterKey) => () => onChange((f) => ({ ...f, [k]: [] }))
  const active = activeFilterCount(filters)
  const facets: { k: FilterKey; label: string; hint?: string; searchable?: boolean; hidden?: boolean }[] = [
    { k: 'status', label: t('status') },
    { k: 'due', label: t('due'), hint: t('dueHint') },
    { k: 'ws', label: t('space'), searchable: true, hidden: options.ws.length < 2 && !filters.ws.length },
    { k: 'who', label: t('who'), searchable: true, hidden: !showPeople && !filters.who.length },
    { k: 'prio', label: t('priority') },
    { k: 'label', label: t('labels'), searchable: true, hidden: options.label.length === 0 },
  ]

  return (
    <div
      role="search"
      aria-label={t('label')}
      className="@container flex shrink-0 flex-wrap items-start gap-2 border-b border-line px-4 py-2.5 sm:flex-nowrap sm:px-6"
    >
      {/* En el celular: buscador y agrupar arriba, filtros debajo en una fila que se desliza.
          En pantallas anchas: todo en una línea; si no caben, los filtros bajan y agrupar queda arriba a la derecha. */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
        <SearchBox value={query} onChange={onQuery} placeholder={t('search')} clearLabel={t('clearSearch')} />
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden />
      </div>
      <div className="order-last -mx-4 flex w-[calc(100%+2rem)] items-center gap-1.5 overflow-x-auto px-4 scrollbar-none sm:order-none sm:mx-0 sm:w-auto sm:min-w-0 sm:flex-1 sm:flex-wrap sm:overflow-visible sm:px-0">
        {facets
          .filter((f) => !f.hidden)
          .map((f) => {
            const Icon = DIMENSION_ICON[f.k]
            return (
              <FilterFacet
                key={f.k}
                icon={<Icon />}
                label={f.label}
                options={options[f.k]}
                value={filters[f.k]}
                onToggle={toggle(f.k)}
                onClear={clear(f.k)}
                hint={f.hint}
                searchable={f.searchable && options[f.k].length > 7}
              />
            )
          })}
        {active ? (
          <button
            type="button"
            onClick={() => onChange(() => NO_FILTERS)}
            className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg px-2 text-sm text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          >
            {t('clearAll')}
          </button>
        ) : null}
      </div>
      {children ? <div className="flex h-8 shrink-0 items-center gap-1">{children}</div> : null}
    </div>
  )
}

function SearchBox({ value, onChange, placeholder, clearLabel }: { value: string; onChange: (v: string) => void; placeholder: string; clearLabel: string }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="relative flex w-full items-center sm:w-40">
      <Search className="pointer-events-none absolute left-2.5 size-3.5 text-fg-subtle" />
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            if (value) onChange('')
            else ref.current?.blur()
          }
        }}
        placeholder={placeholder}
        className="h-8 w-full rounded-lg border border-line bg-panel pl-8 pr-7 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-fg-subtle hover:border-line-strong focus:border-accent-mid focus:shadow-[0_0_0_3px_color-mix(in_oklch,var(--accent-mid)_14%,transparent)]"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange('')
            ref.current?.focus()
          }}
          className="absolute right-1.5 inline-flex size-5 items-center justify-center rounded text-fg-subtle hover:text-fg"
          aria-label={clearLabel}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

const optionClass =
  'flex h-8 cursor-default select-none items-center gap-2 rounded-sm px-2 text-sm text-fg outline-none data-[highlighted]:bg-hover'

export function FilterFacet({
  icon,
  label,
  options,
  value,
  onToggle,
  onClear,
  hint,
  searchable,
}: {
  icon: React.ReactNode
  label: string
  options: FilterOption[]
  value: string[]
  onToggle: (value: string, on: boolean) => void
  onClear: () => void
  hint?: string
  searchable?: boolean
}) {
  const t = useTranslations('myTasks.filters')
  const [q, setQ] = useState('')
  const active = value.length > 0
  // lo elegido, en el orden del menú
  const selected = options.filter((o) => value.includes(o.value))
  const needle = q.trim().toLowerCase()
  const visible = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options

  return (
    <div
      className={cn(
        'inline-flex h-8 max-w-full shrink-0 items-stretch whitespace-nowrap rounded-lg border text-sm transition-colors',
        active
          ? 'border-accent-mid/35 bg-accent-soft text-accent-ink'
          : 'border-dashed border-line-strong text-fg-muted hover:border-solid hover:bg-hover hover:text-fg has-[[data-popup-open]]:border-solid has-[[data-popup-open]]:bg-hover has-[[data-popup-open]]:text-fg',
      )}
    >
      <Menu onOpenChange={(o) => !o && setQ('')}>
        <MenuTrigger
          className={cn(
            'inline-flex min-w-0 items-center gap-1.5 rounded-[7px] px-2 outline-none focus-visible:ring-2 focus-visible:ring-accent-mid/40',
            active && 'rounded-r-none pr-1.5 hover:bg-accent-mid/10 data-[popup-open]:bg-accent-mid/10',
          )}
        >
          <span className="flex shrink-0 [&_svg]:size-3.5">{icon}</span>
          <span className="shrink-0">{label}</span>
          {active ? (
            <>
              <span className="mx-0.5 h-3.5 w-px shrink-0 bg-current opacity-25" aria-hidden />
              {selected.length === 1 ? (
                <span className="flex min-w-0 items-center gap-1.5 font-medium">
                  {selected[0].icon}
                  <span className="max-w-36 truncate">{selected[0].label}</span>
                </span>
              ) : (
                <span className="max-w-44 truncate font-medium">
                  {selected.length === 2 ? selected.map((o) => o.label).join(', ') : t('andMore', { first: selected[0]?.label ?? '', count: value.length - 1 })}
                </span>
              )}
            </>
          ) : null}
        </MenuTrigger>
        <MenuContent className="w-64 p-1">
          {searchable ? (
            <div className="-mx-1 -mt-1 mb-1 flex items-center gap-2 border-b border-line px-3">
              <Search className="size-3.5 shrink-0 text-fg-subtle" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key !== 'Escape' && e.key !== 'ArrowDown' && e.stopPropagation()}
                placeholder={t('find')}
                className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-fg-subtle"
                autoFocus
              />
            </div>
          ) : null}
          <div className="max-h-72 overflow-y-auto scrollbar-thin">
            {visible.map((o) => {
              const on = value.includes(o.value)
              return (
                <M.CheckboxItem key={o.value} checked={on} onCheckedChange={(next) => onToggle(o.value, next)} closeOnClick={false} className={optionClass}>
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
                      on ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong bg-panel',
                    )}
                    aria-hidden
                  >
                    {on ? <Check className="size-3" strokeWidth={3} /> : null}
                  </span>
                  {o.icon}
                  <span className={cn('min-w-0 flex-1 truncate', !o.count && !on && 'text-fg-muted')}>{o.label}</span>
                  <span className={cn('text-xs tabular-nums', o.count ? 'text-fg-muted' : 'text-fg-subtle/70')}>{o.count}</span>
                </M.CheckboxItem>
              )
            })}
            {visible.length === 0 ? <p className="px-2 py-1.5 text-sm text-fg-subtle">{t('noResults')}</p> : null}
          </div>
          {hint ? <p className="-mx-1 mt-1 border-t border-line px-3 pb-1 pt-2 text-xs leading-snug text-fg-subtle">{hint}</p> : null}
          {active ? (
            <>
              <MenuSeparator />
              <MenuItem onClick={onClear}>
                <X />
                {t('clear')}
              </MenuItem>
            </>
          ) : null}
        </MenuContent>
      </Menu>
      {active ? (
        <button
          type="button"
          onClick={onClear}
          aria-label={t('remove', { filter: label })}
          className="inline-flex w-7 shrink-0 items-center justify-center rounded-r-[7px] border-l border-accent-mid/25 transition-colors hover:bg-accent-mid/10"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

const GROUP_ICON: Record<GroupBy, React.ComponentType<{ className?: string }>> = {
  date: CalendarDays,
  status: CircleDashed,
  space: LayoutGrid,
  assignee: Users,
  priority: SignalHigh,
}

/** "Agrupar por" de la lista. */
export function GroupByMenu({ value, options, onChange }: { value: GroupBy; options: readonly GroupBy[]; onChange: (g: GroupBy) => void }) {
  const t = useTranslations('myTasks.filters')
  return (
    <Menu>
      <MenuTrigger
        aria-label={`${t('groupBy')}: ${t(`groups.${value}`)}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/40 data-[popup-open]:bg-hover">
        <Rows3 className="size-3.5" />
        <span className="hidden @[72rem]:inline">{t('groupBy')}</span>
        <span className="font-medium text-fg">{t(`groups.${value}`)}</span>
        <ChevronDown className="size-3.5 opacity-50" />
      </MenuTrigger>
      <MenuContent align="end" className="w-52">
        <p className="select-none px-2 pb-1 pt-1.5 text-2xs font-medium text-fg-subtle">{t('groupBy')}</p>
        <MenuRadioGroup value={value} onValueChange={(v) => onChange(v as GroupBy)}>
          {options.map((g) => {
            const Icon = GROUP_ICON[g]
            return (
              <MenuRadioItem key={g} value={g} closeOnClick>
                <Icon />
                {t(`groups.${g}`)}
              </MenuRadioItem>
            )
          })}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  )
}
