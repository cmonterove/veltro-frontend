'use client'

import { createContext, use, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { ChevronDown, CircleCheck, CornerLeftUp, MessageSquare, Network, Plus, Rows3, Search, Trash2, X } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { Button, buttonVariants } from '@/components/ui/button'
import { inputClass } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select } from '@/components/ui/select'
import { useConfirm } from '@/components/ui/confirm'
import { createClient } from '@/lib/supabase/client'
import { toErrorCode } from '@/lib/errors'
import { buildOrgTree, departmentMembers, effectiveDepartments, invalidBossesFor, type OrgNode } from '@/lib/org'
import { useChatMutations } from '@/lib/queries/chats'
import { useLocalStorage } from '@/lib/hooks'
import { useScopes } from '@/lib/scope'
import type { WorkspaceColor } from '@/lib/constants'
import type { DepartmentRow } from '@/lib/database.types'
import type { Member } from '@/lib/types'
import { cn } from '@/lib/utils'
import { SettingsSection } from './section'
import { SettingsHeader } from './ui'

type Patch = Partial<Pick<Member, 'title' | 'department_id' | 'reports_to'>>
type DeptInfo = { name: string; color: WorkspaceColor }

/** Color de cada departamento: por orden de creación, para que no se repitan entre los primeros. */
const DEPT_PALETTE: WorkspaceColor[] = ['blue', 'teal', 'mandarina', 'violet', 'pink', 'amber', 'green', 'lavender']
/** Zona para soltar a alguien y dejarlo sin jefe. */
const ROOT = '__root'

type OrgCtx = {
  members: Member[]
  byId: Map<string, Member>
  admin: boolean
  dept: (id: string | null | undefined) => DeptInfo | null
  /** persona → departamento que encabeza */
  headOf: Map<string, string>
  update: (id: string, patch: Patch) => void
  q: string
}
const Ctx = createContext<OrgCtx | null>(null)
const useOrg = () => use(Ctx)!

const firstName = (m: Pick<Member, 'full_name'>) => m.full_name.split(' ')[0]

/** Organigrama de la cuenta: quién reporta a quién, en qué área está cada persona y los departamentos. */
export function OrgSettings() {
  const t = useTranslations('settings.org')
  const te = useTranslations('errors')
  const router = useRouter()
  const { members, departments, account, accountRole } = useApp()
  const admin = accountRole === 'owner' || accountRole === 'admin'
  const [, start] = useTransition()
  const [view, setView] = useLocalStorage<'chart' | 'areas'>('veltro:org-view', 'chart')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  // cambios al instante: valen hasta que llega la lista nueva del servidor (otra identidad de `members`)
  const [overrides, setOverrides] = useState<{ base: Member[]; patches: Record<string, Patch> }>({ base: members, patches: {} })
  const patches = overrides.base === members ? overrides.patches : null
  const live = useMemo(
    () => [...members].map((m) => (patches?.[m.id] ? { ...m, ...patches[m.id] } : m)).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [members, patches],
  )
  const byId = useMemo(() => new Map(live.map((m) => [m.id, m])), [live])
  const deptInfo = useMemo(() => {
    const ordered = [...departments].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    return new Map(ordered.map((d, i) => [d.id, { name: d.name, color: DEPT_PALETTE[i % DEPT_PALETTE.length] }]))
  }, [departments])
  const headOf = useMemo(() => new Map(departments.flatMap((d) => (d.head_id ? [[d.head_id, d.id] as const] : []))), [departments])
  const tree = useMemo(() => buildOrgTree(live), [live])
  // con más de una raíz, las que no tienen equipo son gente que nadie ubicó todavía
  const unplaced = tree.length > 1 ? tree.filter((n) => n.children.length === 0).length : 0

  const update = (id: string, patch: Patch) => {
    setOverrides((o) => ({ base: members, patches: { ...(o.base === members ? o.patches : {}), [id]: { ...(o.base === members ? o.patches[id] : {}), ...patch } } }))
    start(async () => {
      const { error } = await createClient().from('account_members').update(patch).eq('account_id', account.id).eq('user_id', id)
      if (error) {
        toast.error(te(toErrorCode(error)))
        setOverrides({ base: members, patches: {} })
        return
      }
      router.refresh()
    })
  }

  const ctx: OrgCtx = { members: live, byId, admin, dept: (id) => (id ? (deptInfo.get(id) ?? null) : null), headOf, update, q }

  return (
    <Ctx value={ctx}>
      <SettingsHeader title={t('pageTitle')} description={t('chartHint')} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-hover p-0.5" role="group" aria-label={t('viewLabel')}>
          {(
            [
              ['chart', Network, t('viewChart')],
              ['areas', Rows3, t('viewAreas')],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              aria-pressed={view === id}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors [&_svg]:size-3.5',
                view === id ? 'bg-panel font-medium text-fg shadow-card' : 'text-fg-muted hover:text-fg',
              )}
            >
              <Icon />
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-fg-muted">
          {t('people', { count: live.length })} · {t('departmentsCount', { count: departments.length })}
          {unplaced ? <span className="ml-1.5 rounded-full bg-warning-soft px-1.5 py-0.5 font-medium text-warning">{t('unplaced', { count: unplaced })}</span> : null}
        </p>
        <div className="relative ml-auto flex w-full items-center sm:w-60">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-fg-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder={t('search')}
            aria-label={t('search')}
            className={cn(inputClass, 'h-8 pl-8 pr-7')}
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} className="absolute right-1.5 inline-flex size-5 items-center justify-center rounded-sm text-fg-subtle hover:text-fg" aria-label={t('clearSearch')}>
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {view === 'chart' ? <OrgChart tree={tree} /> : <OrgAreas departments={departments} />}
      {!admin ? <p className="mt-3 text-xs text-fg-subtle">{t('readOnly')}</p> : null}

      <DepartmentsSection />
    </Ctx>
  )
}

// --- vista de árbol ---

function OrgChart({ tree }: { tree: OrgNode<Member>[] }) {
  const t = useTranslations('settings.org')
  const { admin, byId, members, update } = useOrg()
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [dragId, setDragId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  // mientras arrastras a alguien no puede caer sobre sí mismo ni sobre su propia gente
  const blocked = useMemo(() => (dragId ? invalidBossesFor(dragId, members) : null), [dragId, members])
  const dragged = dragId ? byId.get(dragId) : undefined

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragId(null)
    const m = byId.get(String(active.id))
    if (!m || !over) return
    const boss = over.id === ROOT ? null : String(over.id)
    if (boss === m.reports_to || (boss && invalidBossesFor(m.id, members).has(boss))) return
    update(m.id, { reports_to: boss })
    // si el nuevo jefe tenía su equipo plegado, se abre para ver dónde quedó
    if (boss) setCollapsed((prev) => (prev.has(boss) ? new Set([...prev].filter((x) => x !== boss)) : prev))
    toast.success(boss ? t('moved', { name: firstName(m), boss: byId.get(boss)?.full_name ?? '' }) : t('movedRoot', { name: firstName(m) }))
  }

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setDragId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
      <div className="relative overflow-hidden rounded-xl border border-line bg-[radial-gradient(var(--line)_1px,transparent_1px)] [background-size:18px_18px]">
        {admin && dragged?.reports_to ? <RootDrop /> : null}
        <div className="overflow-x-auto px-6 pb-8 pt-7 scrollbar-thin">
          <div className="org-tree mx-auto w-max">
            <ul>
              {tree.map((n) => (
                <Branch key={n.member.id} node={n} collapsed={collapsed} onToggle={toggle} blocked={blocked} dragId={dragId} />
              ))}
            </ul>
          </div>
        </div>
        {admin ? (
          <p className="flex items-center gap-1.5 border-t border-line bg-panel px-4 py-2 text-xs text-fg-muted">
            <CornerLeftUp className="size-3.5 shrink-0 text-fg-subtle" />
            {t('dragHint')}
          </p>
        ) : null}
      </div>
      <DragOverlay dropAnimation={null}>{dragged ? <CardFace m={dragged} lifted /> : null}</DragOverlay>
    </DndContext>
  )
}

function RootDrop() {
  const t = useTranslations('settings.org')
  const { setNodeRef, isOver } = useDroppable({ id: ROOT })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'absolute inset-x-3 top-3 z-10 flex h-10 items-center justify-center rounded-lg border border-dashed text-xs font-medium backdrop-blur-sm transition-colors',
        isOver ? 'border-accent-mid bg-accent-soft text-accent-ink' : 'border-line-strong bg-panel/80 text-fg-muted',
      )}
    >
      {t('dropRoot')}
    </div>
  )
}

function Branch({
  node,
  collapsed,
  onToggle,
  blocked,
  dragId,
}: {
  node: OrgNode<Member>
  collapsed: Set<string>
  onToggle: (id: string) => void
  blocked: Set<string> | null
  dragId: string | null
}) {
  const { q } = useOrg()
  const id = node.member.id
  // buscando se ve todo: lo plegado podría esconder a quien buscas
  const folded = collapsed.has(id) && !q
  return (
    <li>
      <PersonNode m={node.member} reports={node.children.length} folded={folded} onToggle={() => onToggle(id)} blocked={blocked?.has(id) ?? false} dragging={dragId === id} />
      {node.children.length && !folded ? (
        <ul>
          {node.children.map((c) => (
            <Branch key={c.member.id} node={c} collapsed={collapsed} onToggle={onToggle} blocked={blocked} dragId={dragId} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function PersonNode({ m, reports, folded, onToggle, blocked, dragging }: { m: Member; reports: number; folded: boolean; onToggle: () => void; blocked: boolean; dragging: boolean }) {
  const t = useTranslations('settings.org')
  const { admin, q, dept } = useOrg()
  const drag = useDraggable({ id: m.id, disabled: !admin })
  const drop = useDroppable({ id: m.id, disabled: !admin || blocked })
  const hit = q ? matches(m, q, dept(m.department_id)?.name) : null
  return (
    <div ref={drop.setNodeRef} className="relative flex flex-col items-center">
      <PersonPopover
        m={m}
        trigger={
          <button
            ref={drag.setNodeRef}
            type="button"
            {...(admin ? { ...drag.attributes, ...drag.listeners } : {})}
            className={cn(
              'rounded-xl text-left outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-accent-mid/50',
              admin && 'cursor-grab active:cursor-grabbing',
              dragging && 'opacity-30',
              blocked && 'opacity-35',
              hit === false && 'opacity-30',
              (drop.isOver || hit) && 'ring-2 ring-accent-mid ring-offset-2 ring-offset-canvas',
            )}
          >
            <CardFace m={m} />
          </button>
        }
      />
      {reports ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!folded}
          aria-label={folded ? t('expandTeam', { count: reports }) : t('collapseTeam')}
          className="relative z-[1] -mt-2.5 inline-flex h-5 items-center gap-0.5 rounded-full border border-line bg-panel pl-1.5 pr-1 text-2xs font-semibold tabular-nums text-fg-muted shadow-card transition-colors hover:border-line-strong hover:text-fg"
        >
          {reports}
          <ChevronDown className={cn('size-3 transition-transform duration-200 ease-out-quart', !folded && 'rotate-180')} />
        </button>
      ) : null}
    </div>
  )
}

/** La tarjeta de una persona: cara, nombre, cargo y su área. */
function CardFace({ m, lifted }: { m: Member; lifted?: boolean }) {
  const t = useTranslations('settings.org')
  const { user } = useApp()
  const { dept, headOf } = useOrg()
  const headed = headOf.get(m.id)
  const d = dept(headed ?? m.department_id)
  return (
    <span
      className={cn(
        'flex w-48 flex-col gap-2.5 rounded-xl border border-line bg-panel p-3 shadow-card transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-lift',
        lifted && 'rotate-2 border-accent-mid shadow-lift',
      )}
    >
      <span className="flex items-center gap-2.5">
        <Avatar name={m.full_name} src={m.avatar_url} seed={m.id} size={34} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-fg">{m.full_name}</span>
            {m.id === user.id ? <span className="shrink-0 rounded bg-accent-soft px-1 text-2xs font-medium text-accent-ink">{t('you')}</span> : null}
          </span>
          <span className={cn('block truncate text-xs', m.title ? 'text-fg-muted' : 'italic text-fg-subtle')}>{m.title || t('noTitle')}</span>
        </span>
      </span>
      {d ? <DeptChip info={d} head={Boolean(headed)} /> : <span className="text-2xs text-fg-subtle">{t('noDepartment')}</span>}
    </span>
  )
}

function DeptChip({ info, head }: { info: DeptInfo; head?: boolean }) {
  const t = useTranslations('settings.org')
  return (
    <span
      className={cn(
        `ws-${info.color}`,
        'inline-flex max-w-full items-center gap-1.5 self-start rounded-full px-2 py-0.5 text-2xs font-medium text-fg [background:color-mix(in_oklch,var(--ws-color)_16%,transparent)]',
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-[var(--ws-color)]" aria-hidden />
      <span className="truncate">{head ? t('headOf', { name: info.name }) : info.name}</span>
    </span>
  )
}

function matches(m: Member, q: string, deptName?: string) {
  return [m.full_name, m.title ?? '', m.email, deptName ?? ''].some((s) => s.toLowerCase().includes(q))
}

// --- ficha de una persona (clic en su tarjeta o fila) ---

function PersonPopover({ m, trigger }: { m: Member; trigger: React.ReactElement<Record<string, unknown>> }) {
  const t = useTranslations('settings.org')
  const router = useRouter()
  const { user, departments } = useApp()
  const { admin, byId, members, update, dept } = useOrg()
  const { openDirect } = useChatMutations()
  const { options } = useScopes()
  const boss = m.reports_to ? byId.get(m.reports_to) : undefined
  const tasksHref = m.id === user.id ? '/tasks' : options.some((o) => o.id === `person:${m.id}`) ? `/tasks?scope=person:${m.id}` : null
  const invalid = useMemo(() => invalidBossesFor(m.id, members), [m.id, members])

  return (
    <Popover>
      <PopoverTrigger render={trigger} />
      <PopoverContent side="bottom" align="center" sideOffset={8} className="w-80 overflow-hidden p-0">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Avatar name={m.full_name} src={m.avatar_url} seed={m.id} size={40} />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-fg">{m.full_name}</span>
            <span className="block truncate text-xs text-fg-muted">{m.email}</span>
          </span>
        </div>

        {admin ? (
          <div className="flex flex-col gap-3 px-4 py-3">
            <Field label={t('title')}>
              <input
                key={`${m.id}-${m.title}`}
                defaultValue={m.title ?? ''}
                placeholder={t('titlePlaceholder')}
                maxLength={80}
                aria-label={t('title')}
                onBlur={(e) => {
                  const v = e.target.value.trim() || null
                  if (v !== (m.title ?? null)) update(m.id, { title: v })
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className={cn(inputClass, 'h-8')}
              />
            </Field>
            <Field label={t('department')}>
              <Select
                value={m.department_id ?? ''}
                aria-label={t('department')}
                onChange={(v) => update(m.id, { department_id: v || null })}
                options={[{ value: '', label: t('noDepartment') }, ...departments.map((d) => ({ value: d.id, label: d.name, icon: <DeptDot id={d.id} /> }))]}
                className="h-8"
              />
            </Field>
            <Field label={t('reportsTo')}>
              <Select
                value={m.reports_to ?? ''}
                aria-label={t('reportsTo')}
                onChange={(v) => update(m.id, { reports_to: v || null })}
                options={[
                  { value: '', label: t('noBoss') },
                  ...members
                    .filter((b) => !invalid.has(b.id))
                    .map((b) => ({ value: b.id, label: b.full_name, icon: <Avatar name={b.full_name} seed={b.id} src={b.avatar_url} size={18} />, hint: b.title ?? undefined })),
                ]}
                className="h-8"
              />
            </Field>
          </div>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-4 py-3 text-sm">
            <dt className="text-fg-muted">{t('title')}</dt>
            <dd className="truncate text-fg">{m.title || '—'}</dd>
            <dt className="text-fg-muted">{t('department')}</dt>
            <dd className="truncate text-fg">{dept(m.department_id)?.name ?? t('noDepartment')}</dd>
            <dt className="text-fg-muted">{t('reportsTo')}</dt>
            <dd className="truncate text-fg">{boss?.full_name ?? t('noBoss')}</dd>
          </dl>
        )}

        {m.id !== user.id || tasksHref ? (
          <div className="flex gap-2 border-t border-line bg-sidebar/50 px-4 py-2.5">
            {m.id !== user.id ? (
              <Button size="sm" loading={openDirect.isPending} onClick={() => openDirect.mutate(m.id, { onSuccess: (chatId) => router.push(`/chat/${chatId}`) })}>
                <MessageSquare />
                {t('message')}
              </Button>
            ) : null}
            {tasksHref ? (
              <Link href={tasksHref} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                <CircleCheck />
                {t('viewTasks')}
              </Link>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      {children}
    </label>
  )
}

function DeptDot({ id }: { id: string }) {
  const { dept } = useOrg()
  const d = dept(id)
  return d ? <span className={cn(`ws-${d.color}`, 'size-2 rounded-full bg-[var(--ws-color)]')} aria-hidden /> : null
}

// --- vista por área ---

function OrgAreas({ departments }: { departments: DepartmentRow[] }) {
  const t = useTranslations('settings.org')
  const { members, dept, q, byId } = useOrg()
  const { options } = useScopes()
  const eff = useMemo(() => effectiveDepartments(members), [members])
  const groups = useMemo(() => {
    const list = [...departments]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((d) => ({ id: d.id as string | null, info: dept(d.id), head: d.head_id ? byId.get(d.head_id) : undefined, people: members.filter((m) => eff.get(m.id) === d.id || d.head_id === m.id) }))
    const loose = members.filter((m) => !eff.get(m.id) && !departments.some((d) => d.head_id === m.id))
    if (loose.length) list.push({ id: null, info: null, head: undefined, people: loose })
    return list
      .map((g) => ({ ...g, people: q ? g.people.filter((m) => matches(m, q, g.info?.name)) : g.people }))
      .filter((g) => g.people.length || !q)
  }, [departments, members, eff, dept, byId, q])

  if (!groups.length) return <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-fg-muted">{t('noMatches', { q })}</p>

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.id ?? 'none'} className="overflow-hidden rounded-xl border border-line bg-panel">
          <header className="flex items-center gap-2 border-b border-line bg-sidebar/50 px-4 py-2.5">
            {g.info ? <span className={cn(`ws-${g.info.color}`, 'size-2.5 rounded-full bg-[var(--ws-color)]')} aria-hidden /> : null}
            <h3 className="text-sm font-semibold text-fg">{g.info?.name ?? t('noDepartment')}</h3>
            <span className="shrink-0 whitespace-nowrap text-xs text-fg-subtle">{t('people', { count: g.people.length })}</span>
            {g.head ? (
              <span className="ml-auto hidden min-w-0 items-center gap-1.5 text-xs text-fg-muted sm:flex">
                <Avatar name={g.head.full_name} src={g.head.avatar_url} seed={g.head.id} size={18} />
                <span className="truncate">{t('headLabel', { name: g.head.full_name })}</span>
              </span>
            ) : null}
            {g.id && options.some((o) => o.id === `dept:${g.id}`) ? (
              <Link href={`/tasks?scope=dept:${g.id}`} className={cn(buttonVariants({ variant: 'ghost', size: 'xs' }), 'shrink-0', !g.head && 'ml-auto')}>
                {t('areaTasks')}
              </Link>
            ) : null}
          </header>
          <ul className="divide-y divide-line">
            {g.people.map((m) => {
              const boss = m.reports_to ? byId.get(m.reports_to) : undefined
              return (
                <li key={m.id}>
                  <PersonPopover
                    m={m}
                    trigger={
                      <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-hover/60 focus-visible:bg-hover">
                        <Avatar name={m.full_name} src={m.avatar_url} seed={m.id} size={30} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-fg">{m.full_name}</span>
                          <span className={cn('block truncate text-xs', m.title ? 'text-fg-muted' : 'italic text-fg-subtle')}>{m.title || t('noTitle')}</span>
                        </span>
                        <span className="hidden min-w-0 max-w-[45%] items-center gap-1.5 truncate text-xs text-fg-muted sm:flex">
                          {boss ? (
                            <>
                              <CornerLeftUp className="size-3.5 shrink-0 text-fg-subtle" />
                              <span className="truncate">{t('reportsToName', { name: boss.full_name })}</span>
                            </>
                          ) : (
                            <span className="text-fg-subtle">{t('noBoss')}</span>
                          )}
                        </span>
                      </button>
                    }
                  />
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

// --- departamentos ---

function DepartmentsSection() {
  const t = useTranslations('settings.org')
  const te = useTranslations('errors')
  const tConfirm = useTranslations('confirm')
  const confirm = useConfirm()
  const router = useRouter()
  const { departments, account } = useApp()
  const { admin, members, byId, dept } = useOrg()
  const [pending, start] = useTransition()
  const [newDept, setNewDept] = useState('')

  const run = (fn: () => PromiseLike<{ error: unknown }>, success?: string) =>
    start(async () => {
      const { error } = await fn()
      if (error) {
        toast.error(te(toErrorCode(error)))
        return
      }
      if (success) toast.success(success)
      router.refresh()
    })

  const sorted = [...departments].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <SettingsSection title={t('departmentsTitle')} description={t('departmentsHint')} className="mt-10">
      {sorted.length ? (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
          {sorted.map((d) => {
            const info = dept(d.id)
            const people = [...departmentMembers(d, members)].flatMap((id) => byId.get(id) ?? [])
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                {info ? <span className={cn(`ws-${info.color}`, 'size-2.5 shrink-0 rounded-full bg-[var(--ws-color)]')} aria-hidden /> : null}
                <input
                  defaultValue={d.name}
                  key={`${d.id}-${d.name}`}
                  disabled={!admin || pending}
                  maxLength={80}
                  aria-label={t('departmentName')}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v && v !== d.name) run(() => createClient().from('departments').update({ name: v }).eq('id', d.id))
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  className="-ml-2 h-8 min-w-36 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm font-medium text-fg outline-none hover:border-line focus:border-accent-mid disabled:hover:border-transparent"
                />
                <Select
                  value={d.head_id ?? ''}
                  disabled={!admin || pending}
                  aria-label={t('head')}
                  onChange={(v) => run(() => createClient().from('departments').update({ head_id: v || null }).eq('id', d.id))}
                  options={[
                    { value: '', label: t('noHead') },
                    ...members.map((m) => ({ value: m.id, label: m.full_name, icon: <Avatar name={m.full_name} seed={m.id} src={m.avatar_url} size={18} />, hint: m.title ?? undefined })),
                  ]}
                  className="h-8 w-44 shrink-0"
                />
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  {people.length ? <AvatarStack people={people} size={22} max={4} ring="panel" /> : null}
                  <span className="text-xs text-fg-muted">{t('people', { count: people.length })}</span>
                </span>
                {admin ? (
                  <button
                    type="button"
                    onClick={async () => {
                      if (await confirm({ title: t('deleteConfirm', { name: d.name }), danger: true, confirmLabel: tConfirm('delete') }))
                        run(() => createClient().from('departments').delete().eq('id', d.id), t('deleted'))
                    }}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-danger-soft hover:text-danger"
                    aria-label={t('delete')}
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-fg-subtle">{t('noDepartments')}</p>
      )}
      {admin ? (
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const name = newDept.trim()
            if (!name) return
            run(() => createClient().from('departments').insert({ account_id: account.id, name }), t('created'))
            setNewDept('')
          }}
        >
          <input value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder={t('newDepartment')} maxLength={80} aria-label={t('newDepartment')} className={cn(inputClass, 'h-8 max-w-xs')} />
          <Button type="submit" variant="secondary" size="sm" disabled={!newDept.trim()}>
            <Plus />
            {t('addDepartment')}
          </Button>
        </form>
      ) : null}
    </SettingsSection>
  )
}
