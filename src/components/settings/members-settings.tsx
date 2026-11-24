'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, ChevronDown, Copy, DoorOpen, Eye, KeyRound, Layers, Link2, Mail, MailCheck, MoreHorizontal, Search, Send, ShieldCheck, UserPlus, UserRound, X } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { useDateLocale } from '@/lib/dates'
import { useApp } from '@/components/app/app-context'
import { Button, buttonVariants } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { Field, Input } from '@/components/ui/input'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Menu, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/components/ui/menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { inviteMember, previewInvitation, removeMember, resendInvite, revokeInvite, setMemberWorkspaces, updateMemberRole } from '@/app/actions/settings'
import { cn } from '@/lib/utils'
import type { AccountRole, WorkspaceRole } from '@/lib/database.types'
import type { AccountMember, Assignment, Invitation, Usage } from '@/lib/api/ajustes'
import type { ErrorCode } from '@/lib/errors'
import { SettingsHeader, SplitPanel } from './ui'
import { WorkspaceMark } from '@/components/app/marks'
import { Select } from '@/components/ui/select'
import { useConfirm } from '@/components/ui/confirm'
import { useCopy } from '@/lib/clipboard'
import { useDebounced } from '@/lib/hooks'

type Result = { ok: true } | { ok: false; error: ErrorCode }

export function MembersSettings({ members, usage, invitations = [] }: { members: AccountMember[]; usage: Usage | null; invitations?: Invitation[] }) {
  const t = useTranslations('settings.members')
  const te = useTranslations('errors')
  const tConfirm = useTranslations('confirm')
  const router = useRouter()
  const confirm = useConfirm()
  const { workspaces, user, account, accountRole } = useApp()
  const [addOpen, setAddOpen] = useState(false)
  const [, start] = useTransition()
  // las invitaciones vigentes ocupan lugar (igual que en la API)
  const openInvites = invitations.filter((i) => !i.expired).length
  const full = usage?.max_members != null && usage.members_count + openInvites >= usage.max_members

  const qc = useQueryClient()
  const done = () => {
    router.refresh()
    // las listas de asignables por espacio también cambian
    qc.invalidateQueries({ queryKey: ['workspace-members'] })
  }
  const run = (fn: () => Promise<Result & { unassignedTasks?: number }>, success: string) =>
    start(async () => {
      const res = await fn()
      if (res.ok) {
        toast.success(success, { description: res.unassignedTasks ? t('unassignedTasks', { count: res.unassignedTasks }) : undefined })
        done()
      } else toast.error(te(res.error))
    })

  // quitar exige confirmación: sale de sus espacios y de sus tareas abiertas
  // (la confirmación va antes de la transición: dentro, el diálogo no se pintaría hasta que terminara)
  const remove = async (m: AccountMember) => {
    const ok = await confirm({
      title: t('removeConfirm', { name: m.full_name }),
      description: t('removeConfirmHint'),
      danger: true,
      confirmLabel: tConfirm('remove'),
    })
    if (!ok) return
    start(async () => {
      const res = await removeMember(account.id, m.id)
      if (!res.ok) return void toast.error(te(res.error))
      toast.success(t('removed'), { description: res.unassignedTasks ? t('unassignedTasks', { count: res.unassignedTasks }) : undefined })
      done()
    })
  }

  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<RoleFilter>('all')
  const counts: Record<RoleFilter, number> = {
    all: members.length,
    admins: members.filter((m) => inFilter(m, 'admins')).length,
    member: members.filter((m) => m.role === 'member').length,
    guest: members.filter((m) => m.role === 'guest').length,
  }
  const needle = fold(q.trim())
  const shown = members.filter((m) => inFilter(m, filter) && (!needle || fold(`${m.full_name} ${m.email} ${m.title ?? ''}`).includes(needle)))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SettingsHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button variant="primary" size="sm" onClick={() => setAddOpen(true)} disabled={full}>
            <UserPlus />
            {t('add')}
          </Button>
        }
      />

      {full ? <p className="mb-4 rounded-lg bg-warning-soft px-3 py-2 text-sm text-fg">{t('limitReached')}</p> : null}

      {/* la tabla y su columna llegan hasta abajo; con poca gente, el hueco de la tabla invita a sumar a alguien */}
      <SplitPanel
        main={
        <div className="@container flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-4 py-3">
            {/* por rol: quién ve qué es lo que más se mira aquí */}
            <div className="flex gap-1 rounded-lg bg-hover/70 p-1" role="group" aria-label={t('filterLabel')}>
              {ROLE_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  disabled={f !== 'all' && !counts[f]}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid disabled:opacity-40',
                    filter === f ? 'bg-panel font-medium text-fg shadow-card' : 'text-fg-muted enabled:hover:text-fg',
                  )}
                >
                  {t(`filters.${f}`)}
                  <span className="tabular-nums text-fg-subtle">{counts[f]}</span>
                </button>
              ))}
            </div>
            <label className="relative ml-auto w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} aria-label={t('search')} className="h-8 pl-8" />
            </label>
          </div>
          <div className={cn(ROW_GRID, 'hidden border-b border-line-soft bg-sidebar/40 px-5 py-2 text-xs font-medium text-fg-subtle @xl:grid')} aria-hidden>
            <span>{t('cols.person')}</span>
            <span className="hidden @3xl:block">{t('cols.title')}</span>
            <span>{t('cols.spaces')}</span>
            <span>{t('cols.role')}</span>
            <span />
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin">
          <ul className="divide-y divide-line-soft border-b border-line-soft">
            {shown.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                isSelf={m.id === user.id}
                canPromote={accountRole === 'owner'}
                assignments={m.assignments}
                workspaces={workspaces}
                onRole={(role) => run(() => updateMemberRole(account.id, m.id, role), t('roleUpdated'))}
                onRemove={() => remove(m)}
                onWorkspaces={(rows) => run(() => setMemberWorkspaces(account.id, m.id, rows), t('workspacesUpdated'))}
              />
            ))}
          </ul>
          {!shown.length ? (
            <p className="px-5 py-12 text-center text-sm text-fg-muted">{t('noMatches')}</p>
          ) : members.length < 5 && filter === 'all' && !needle ? (
            <InviteNudge onInvite={() => setAddOpen(true)} disabled={full} />
          ) : null}
          </div>
        </div>
        }
        side={
          <>
            <Seats usage={usage} invites={openInvites} />
            <PendingInvites invitations={invitations} onChanged={done} onInvite={() => setAddOpen(true)} disabled={full} />
            <RolesGuide counts={counts} />
          </>
        }
      />

      <InviteDialog open={addOpen} onOpenChange={setAddOpen} canPromote={accountRole === 'owner'} onDone={done} />
    </div>
  )
}

/** Con poca gente, el resto de la tabla invita a sumar al equipo (en vez de quedar en blanco). */
function InviteNudge({ onInvite, disabled }: { onInvite: () => void; disabled?: boolean }) {
  const t = useTranslations('settings.members')
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <span className="flex -space-x-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="flex size-10 items-center justify-center rounded-full border border-dashed border-line-strong bg-canvas text-fg-subtle ring-4 ring-panel">
            {i === 1 ? <UserPlus className="size-4" /> : null}
          </span>
        ))}
      </span>
      <p className="mt-4 text-sm font-semibold text-fg">{t('nudge.title')}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-fg-muted">{t('nudge.hint')}</p>
      <Button size="sm" variant="primary" className="mt-4" onClick={onInvite} disabled={disabled}>
        <UserPlus />
        {t('add')}
      </Button>
    </div>
  )
}

type RoleFilter = 'all' | 'admins' | 'member' | 'guest'
const ROLE_FILTERS: RoleFilter[] = ['all', 'admins', 'member', 'guest']
const inFilter = (m: AccountMember, f: RoleFilter) => f === 'all' || (f === 'admins' ? m.role === 'owner' || m.role === 'admin' : m.role === f)
const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
/** Persona · Cargo · Espacios · Rol · ⋯ (en pantallas chicas, las filas se acomodan solas) */
const ROW_GRID = '@xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_7.5rem_2rem] @3xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.15fr)_7.5rem_2rem] @xl:gap-4'

/** Los lugares del plan: personas, invitaciones que todavía ocupan lugar y los que quedan. */
function Seats({ usage, invites, className }: { usage: Usage | null; invites: number; className?: string }) {
  const t = useTranslations('settings.members.seats')
  if (!usage) return null
  const max = usage.max_members
  const used = usage.members_count
  const free = max == null ? null : Math.max(0, max - used - invites)
  const pct = (n: number) => (max ? `${Math.min(100, (n / max) * 100)}%` : '0%')
  return (
    <section className={cn('border-b border-line-soft px-5 py-4 last:border-b-0', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-fg">{t('title')}</h2>
        <span className="text-sm tabular-nums text-fg-muted">{max == null ? t('unlimited') : t('count', { used: used + invites, max })}</span>
      </div>
      {max != null ? (
        <>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-hover">
            <span className="h-full bg-accent-mid transition-[width] duration-500 ease-out" style={{ width: pct(used) }} />
            <span className="h-full bg-accent-mid/40 transition-[width] duration-500 ease-out" style={{ width: pct(invites) }} />
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
            {[
              { id: 'people', value: used, dot: 'bg-accent-mid' },
              { id: 'invites', value: invites, dot: 'bg-accent-mid/40' },
              { id: 'free', value: free ?? 0, dot: 'bg-hover ring-1 ring-line-strong' },
            ].map((x) => (
              <div key={x.id}>
                <dt className="flex items-center gap-1.5 text-fg-subtle">
                  <span className={cn('size-2 rounded-full', x.dot)} />
                  {t(x.id)}
                </dt>
                <dd className="mt-0.5 pl-3.5 text-base font-semibold tabular-nums text-fg">{x.value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </section>
  )
}

/** Qué ve cada rol (y cuántos hay de cada uno): el modelo de invitados en una mirada. */
function RolesGuide({ counts, className }: { counts: Record<RoleFilter, number>; className?: string }) {
  const t = useTranslations('settings.members')
  const rows = [
    { id: 'admins' as const, icon: ShieldCheck, label: t('roleGroups.admins'), hint: t('adminHint') },
    { id: 'member' as const, icon: UserRound, label: t('roleGroups.member'), hint: t('memberHint') },
    { id: 'guest' as const, icon: DoorOpen, label: t('roleGroups.guest'), hint: t('guestHint') },
  ]
  return (
    <section className={cn('border-b border-line-soft px-5 py-4 last:border-b-0', className)}>
      <h2 className="text-[13px] font-semibold text-fg">{t('rolesTitle')}</h2>
      <ul className="mt-3 flex flex-col gap-3.5">
        {rows.map((r) => (
          <li key={r.id} className="flex gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-hover text-fg-muted">
              <r.icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-2 text-sm font-medium text-fg">
                {r.label}
                <span className="text-xs font-normal tabular-nums text-fg-subtle">{counts[r.id]}</span>
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{r.hint}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function MemberRow({
  member,
  isSelf,
  canPromote,
  assignments,
  workspaces,
  onRole,
  onRemove,
  onWorkspaces,
}: {
  member: AccountMember
  isSelf: boolean
  canPromote: boolean
  assignments: Assignment[]
  workspaces: { id: string; name: string; icon: string; color: string }[]
  onRole: (r: Exclude<AccountRole, 'owner'>) => void
  onRemove: () => void
  onWorkspaces: (rows: { id: string; role: WorkspaceRole }[]) => void
}) {
  const t = useTranslations('settings.members')
  const tRole = useTranslations('roles')
  const isOwner = member.role === 'owner'
  const isAdmin = member.role === 'admin' || isOwner
  const editableRole = !isOwner && !isSelf && (canPromote || member.role !== 'admin')

  return (
    <li className={cn(ROW_GRID, 'flex flex-wrap items-center gap-3 px-5 py-3 transition-colors hover:bg-hover/40 @xl:grid')}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={member.full_name} src={member.avatar_url} seed={member.id} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">
            {member.full_name}
            {isSelf ? <span className="ml-1.5 text-xs font-normal text-fg-subtle">{t('you')}</span> : null}
          </p>
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
            <span className="truncate">{member.email}</span>
            {member.must_change_password ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-soft px-1.5 py-px text-2xs font-medium text-warning" title={t('tempPasswordHint')}>
                <KeyRound className="size-2.5" />
                {t('tempPassword')}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <p className={cn('hidden truncate text-sm @3xl:block', member.title ? 'text-fg' : 'text-fg-subtle')}>{member.title || t('noTitle')}</p>

      <div className="min-w-0">
        {isAdmin ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-fg-muted">
            <Layers className="size-3.5 text-fg-subtle" aria-hidden />
            {t('allWorkspaces')}
          </span>
        ) : (
          <WorkspaceAssignments assignments={assignments} workspaces={workspaces} onSave={onWorkspaces} />
        )}
      </div>

      {editableRole ? (
        <Menu>
          <MenuTrigger className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm text-fg-muted hover:bg-hover hover:text-fg data-[popup-open]:bg-hover">
            {tRole(member.role)}
            <ChevronDown className="size-3.5" />
          </MenuTrigger>
          <MenuContent align="end" className="w-64">
            <MenuRadioGroup value={member.role} onValueChange={(v) => onRole(v as Exclude<AccountRole, 'owner'>)}>
              {canPromote ? (
                <MenuRadioItem value="admin" className="h-auto items-start py-2">
                  <span className="flex flex-col">
                    <span>{tRole('admin')}</span>
                    <span className="text-xs text-fg-muted">{t('adminHint')}</span>
                  </span>
                </MenuRadioItem>
              ) : null}
              <MenuRadioItem value="member" className="h-auto items-start py-2">
                <span className="flex flex-col">
                  <span>{tRole('member')}</span>
                  <span className="text-xs text-fg-muted">{t('memberHint')}</span>
                </span>
              </MenuRadioItem>
              <MenuRadioItem value="guest" className="h-auto items-start py-2">
                <span className="flex flex-col">
                  <span>{tRole('guest')}</span>
                  <span className="text-xs text-fg-muted">{t('guestHint')}</span>
                </span>
              </MenuRadioItem>
            </MenuRadioGroup>
          </MenuContent>
        </Menu>
      ) : (
        <span className="px-2 text-sm text-fg-muted">{tRole(member.role)}</span>
      )}

      {!isOwner && !isSelf && (canPromote || member.role !== 'admin') ? (
        <Menu>
          <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t('more')} />}>
            <MoreHorizontal />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem danger onClick={onRemove}>
              {t('remove')}
            </MenuItem>
          </MenuContent>
        </Menu>
      ) : (
        <span className="size-7" />
      )}
    </li>
  )
}

function WorkspaceAssignments({
  assignments,
  workspaces,
  onSave,
}: {
  assignments: Assignment[]
  workspaces: { id: string; name: string; icon: string; color: string }[]
  onSave: (rows: { id: string; role: WorkspaceRole }[]) => void
}) {
  const t = useTranslations('settings.members')
  const tRole = useTranslations('roles')
  const [draft, setDraft] = useState<Map<string, WorkspaceRole>>(new Map())
  const current = useMemo(() => new Map(assignments.map((a) => [a.workspace_id, a.role])), [assignments])
  const assigned = workspaces.filter((w) => current.has(w.id))

  return (
    <Popover
      onOpenChange={(o) => {
        if (o) setDraft(new Map(current))
        else {
          const same = draft.size === current.size && [...draft].every(([k, v]) => current.get(k) === v)
          if (!same) onSave([...draft].map(([id, role]) => ({ id, role })))
        }
      }}
    >
      <PopoverTrigger className="inline-flex h-7 max-w-64 items-center gap-1.5 rounded-md border border-line px-2 text-sm hover:bg-hover data-[popup-open]:bg-hover">
        {assigned.length ? (
          <>
            <span className="flex -space-x-1">{assigned.slice(0, 4).map((w) => <WorkspaceMark key={w.id} ws={w} size={16} className="ring-2 ring-canvas" />)}</span>
            <span className="truncate text-fg-muted">{assigned.length === 1 ? assigned[0].name : t('workspaceCount', { count: assigned.length })}</span>
          </>
        ) : (
          <span className="text-fg-subtle">{t('noWorkspaces')}</span>
        )}
        <ChevronDown className="size-3.5 text-fg-subtle" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1">
        <p className="px-2 pb-1 pt-1.5 text-2xs font-medium text-fg-subtle">{t('assignTitle')}</p>
        {workspaces.map((w) => {
          const role = draft.get(w.id)
          return (
            <div key={w.id} className="flex h-9 items-center gap-2 rounded-sm px-2 hover:bg-hover">
              <button
                type="button"
                onClick={() => {
                  const next = new Map(draft)
                  if (role) next.delete(w.id)
                  else next.set(w.id, 'editor')
                  setDraft(next)
                }}
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
              >
                <span className={cn('flex size-4 items-center justify-center rounded-xs border border-line-strong', role && 'border-accent bg-accent text-accent-fg')}>
                  {role ? <Check className="size-3" /> : null}
                </span>
                <WorkspaceMark ws={w} size={16} />
                <span className="truncate">{w.name}</span>
              </button>
              {role ? (
                <Select<WorkspaceRole>
                  value={role}
                  onChange={(v) => setDraft(new Map(draft).set(w.id, v))}
                  options={(['admin', 'editor', 'viewer'] as const).map((r) => ({ value: r, label: tRole(`ws_${r}`) }))}
                  className="h-7 w-28 px-2 text-xs"
                />
              ) : null}
            </div>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

/** Invitaciones que todavía no se aceptaron: copiar un enlace nuevo, reenviar el correo o anular. */
function PendingInvites({ invitations, onChanged, onInvite, disabled }: { invitations: Invitation[]; onChanged: () => void; onInvite: () => void; disabled?: boolean }) {
  const t = useTranslations('settings.members.invites')
  const tm = useTranslations('settings.members')
  const te = useTranslations('errors')
  const tRole = useTranslations('roles')
  const tConfirm = useTranslations('confirm')
  const locale = useDateLocale()
  const copy = useCopy()
  const confirm = useConfirm()
  const [, start] = useTransition()

  return (
    <section className="border-b border-line-soft last:border-b-0">
      <h2 className="flex items-center gap-1.5 px-5 pb-1 pt-4 text-[13px] font-semibold text-fg">
        {t('title')}
        <span className="rounded-full bg-hover px-1.5 text-[11px] font-medium leading-[18px] tabular-nums text-fg-muted">{invitations.length}</span>
      </h2>
      {!invitations.length ? (
        <div className="px-5 pb-4">
          <p className="text-xs leading-relaxed text-fg-muted">{t('none')}</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={onInvite} disabled={disabled}>
            <UserPlus />
            {tm('add')}
          </Button>
        </div>
      ) : null}
      <ul className="flex flex-col divide-y divide-line-soft px-2 pb-2">
        {invitations.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-3 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-hover text-fg-muted">
              <Mail className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg">
                {i.fullName ? `${i.fullName} · ` : ''}
                <span className={i.fullName ? 'font-normal text-fg-muted' : undefined}>{i.email}</span>
              </p>
              <p className={cn('truncate text-xs', i.expired ? 'text-danger' : 'text-fg-subtle')}>
                {i.expired
                  ? t('expired')
                  : t('pending', { when: formatDistanceToNowStrict(new Date(i.expiresAt), { locale }) })}
                {' · '}
                {i.role === 'admin' ? tRole('admin') : t('spaces', { count: i.workspaces.length })}
                {i.invitedBy ? ` · ${t('by', { name: i.invitedBy.fullName.split(' ')[0] ?? '' })}` : ''}
              </p>
            </div>
            <Menu>
              <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t('actions')} />}>
                <MoreHorizontal />
              </MenuTrigger>
              <MenuContent align="end" className="w-60">
                <MenuItem
                  onClick={() =>
                    start(async () => {
                      const res = await resendInvite(i.id, false)
                      if (!res.ok) return void toast.error(te(res.error))
                      copy(res.link, t('linkCopied'))
                      onChanged()
                    })
                  }
                >
                  <Link2 />
                  {t('copyLink')}
                </MenuItem>
                <MenuItem
                  onClick={() =>
                    start(async () => {
                      const res = await resendInvite(i.id, true)
                      if (!res.ok) return void toast.error(te(res.error))
                      if (res.emailed) toast.success(t('resent', { email: i.email }))
                      else {
                        copy(res.link, t('noEmailCopied'))
                      }
                      onChanged()
                    })
                  }
                >
                  <Send />
                  {t('resend')}
                </MenuItem>
                <MenuItem
                  danger
                  onClick={async () => {
                    if (!(await confirm({ title: t('revokeConfirm', { email: i.email }), description: t('revokeHint'), danger: true, confirmLabel: tConfirm('remove') }))) return
                    start(async () => {
                      const res = await revokeInvite(i.id)
                      if (!res.ok) return void toast.error(te(res.error))
                      toast.success(t('revoked'))
                      onChanged()
                    })
                  }}
                >
                  <X />
                  {t('revoke')}
                </MenuItem>
              </MenuContent>
            </Menu>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Invitar: a la cuenta (miembro: los espacios de hoy marcados, ve a toda la cuenta), a un espacio
 * (invitado: solo ese espacio y su gente, para clientes o externos) o como admin (solo el dueño).
 * `initialWorkspaceId`: se abrió desde un espacio, así que arranca como invitado a ese espacio.
 */
const INVITE_ROLE_ICON = { member: UserRound, guest: DoorOpen, admin: ShieldCheck } as const

export function InviteDialog({
  open,
  onOpenChange,
  canPromote,
  onDone,
  initialWorkspaceId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  canPromote: boolean
  onDone?: () => void
  initialWorkspaceId?: string
}) {
  const copy = useCopy()
  const t = useTranslations('settings.members.addDialog')
  const te = useTranslations('errors')
  const tRole = useTranslations('roles')
  const { workspaces, account } = useApp()
  const [error, setError] = useState<ErrorCode | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const everyWorkspace = () => new Map(workspaces.map((w) => [w.id, 'editor' as WorkspaceRole]))
  const onlyInitial = () => new Map<string, WorkspaceRole>(initialWorkspaceId ? [[initialWorkspaceId, 'editor']] : [])
  const startRole = initialWorkspaceId ? 'guest' : 'member'
  const [role, setRole] = useState<'admin' | 'member' | 'guest'>(startRole)
  const [selected, setSelected] = useState<Map<string, WorkspaceRole>>(() => (initialWorkspaceId ? onlyInitial() : everyWorkspace()))
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ email: string; link: string; emailed: boolean } | null>(null)
  // el correo tal como le llegaría, con lo que ya se eligió (nombre, rol y espacios)
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)
  const space = initialWorkspaceId ? workspaces.find((w) => w.id === initialWorkspaceId) : undefined
  const roles = canPromote ? (['member', 'guest', 'admin'] as const) : (['member', 'guest'] as const)
  // con muchos espacios, un buscador arriba de la lista
  const [spaceQuery, setSpaceQuery] = useState('')
  const shownSpaces = spaceQuery.trim() ? workspaces.filter((w) => fold(w.name).includes(fold(spaceQuery.trim()))) : workspaces
  const toggleSpace = (id: string, on: boolean) => {
    const next = new Map(selected)
    if (on) next.set(id, 'editor')
    else next.delete(id)
    setSelected(next)
  }
  // el correo en chico, al día con lo elegido: el mismo HTML que se envía (sin el correo de la persona, que no cambia nada)
  const thumbInput = useDebounced(
    JSON.stringify({ fullName: name.trim(), role, workspaces: role === 'admin' ? [] : [...selected].map(([id, r]) => ({ id, role: r })) }),
    450,
  )
  const thumb = useQuery({
    queryKey: ['invite-preview', account.id, thumbInput],
    queryFn: () => previewInvitation(account.id, { email: '', ...JSON.parse(thumbInput) }),
    enabled: open && !result,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    retry: false,
  })
  const thumbData = thumb.data?.ok ? thumb.data : null
  // sin vista previa (p. ej. una API que todavía no la tiene): no se muestra
  const thumbFailed = !thumbData && (thumb.isError || thumb.data?.ok === false)
  const summary =
    role === 'admin'
      ? t('summaryAdmin')
      : role === 'guest' && selected.size === 0
        ? t('summaryGuestNone')
        : t(role === 'guest' ? 'summaryGuest' : 'summaryMember', { count: selected.size })

  // miembro: entra a todos los espacios de hoy (se pueden desmarcar); invitado: solo al elegido
  const pickRole = (r: 'admin' | 'member' | 'guest') => {
    setRole(r)
    if (r === 'member') setSelected(everyWorkspace())
    if (r === 'guest') setSelected(onlyInitial())
  }
  const reset = () => {
    setName('')
    setEmail('')
    setSpaceQuery('')
    pickRole(startRole)
    setResult(null)
    setError(null)
  }
  // cada vez que se abre arranca de cero (desde un espacio, como invitado a ese espacio)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setRole(startRole)
      setSelected(initialWorkspaceId ? onlyInitial() : everyWorkspace())
    }
  }
  // los botones del pie cierran desde afuera (el Dialog no avisa): sin limpiar, al reabrir saldría el enlace anterior
  const close = () => {
    onOpenChange(false)
    reset()
  }

  const submit = () =>
    start(async () => {
      setError(null)
      const res = await inviteMember(account.id, {
        fullName: name,
        email,
        role,
        workspaces: role === 'admin' ? [] : [...selected].map(([id, r]) => ({ id, role: r })),
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setResult({ email: email.trim().toLowerCase(), link: res.link, emailed: res.emailed })
      onDone?.()
    })

  const message = result ? t('shareMessage', { account: account.name, link: result.link }) : ''

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent viewportClassName={result ? undefined : 'pt-[8vh]'} className={result ? undefined : 'max-w-[880px]'}>
        {result ? (
          <>
            <DialogHeader
              title={result.emailed ? t('sentTitle') : t('linkTitle')}
              description={result.emailed ? t('sentBody', { email: result.email }) : t('linkBody', { email: result.email })}
            />
            <DialogBody className="flex flex-col gap-3">
              {result.emailed ? (
                <div className="flex items-center gap-3 rounded-lg bg-done-soft px-3 py-2.5 text-sm text-fg">
                  <MailCheck className="size-4 shrink-0 text-done" />
                  {t('sentHint')}
                </div>
              ) : null}
              <div className="flex items-center gap-2 rounded-lg border border-line bg-sidebar py-1.5 pl-3 pr-1.5">
                <Link2 className="size-4 shrink-0 text-fg-subtle" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted">{result.link}</span>
                <Button size="xs" onClick={() => copy(result.link, t('copied'))}>
                  <Copy />
                  {t('copyLink')}
                </Button>
              </div>
              <p className="text-xs text-fg-muted">{t('expiresHint')}</p>
            </DialogBody>
            <DialogFooter>
              <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'secondary' })}>
                <WhatsAppIcon />
                {t('whatsapp')}
              </a>
              <Button variant="primary" onClick={close}>
                {t('close')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <div className="flex items-start gap-3.5 px-6 pb-5 pr-14 pt-6">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                <UserPlus className="size-5" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-md font-semibold text-fg">{space ? t('titleSpace', { space: space.name }) : t('title')}</DialogTitle>
                <DialogDescription className="mt-0.5 text-sm text-fg-muted">{t('description')}</DialogDescription>
              </div>
            </div>
            <div className="grid border-y border-line-soft md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
              {/* quién es y con qué rol entra */}
              <div className="flex flex-col gap-4 px-6 py-5">
                <Field label={t('email')} htmlFor="m-email">
                  <Input id="m-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                </Field>
                <Field label={t('nameOptional')} htmlFor="m-name">
                  <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
                </Field>
                {/* a qué entra: la cuenta, un espacio puntual o todo (admin, solo lo da el dueño) */}
                <div role="group" aria-labelledby="m-role" className="flex flex-col gap-1.5">
                  <span id="m-role" className="text-sm font-medium text-fg">
                    {t('role')}
                  </span>
                  {roles.map((r) => {
                    const Icon = INVITE_ROLE_ICON[r]
                    const on = role === r
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => pickRole(r)}
                        aria-pressed={on}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none ring-1 ring-inset transition-[background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-accent-mid',
                          on ? 'bg-accent-soft ring-accent-mid' : 'ring-line hover:bg-hover',
                        )}
                      >
                        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors', on ? 'bg-panel text-accent-ink shadow-card' : 'bg-hover text-fg-muted')}>
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-fg">{tRole(r)}</span>
                          <span className="block text-xs leading-snug text-fg-muted">{t(`${r}Hint`)}</span>
                        </span>
                        <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors', on ? 'border-accent bg-accent' : 'border-line-control bg-panel')}>
                          {on ? <span className="size-1.5 rounded-full bg-accent-fg" /> : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {error ? (
                  <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-fg">
                    {te(error)}
                  </p>
                ) : null}
              </div>

              {/* a qué espacios entra, al lado (en el teléfono, debajo), y lo que le llega. En pantallas
                  anchas no estira el diálogo: las fichas se desplazan dentro de la altura de la izquierda. */}
              <div className="relative min-h-72 border-t border-line-soft md:border-l md:border-t-0">
                <div className="flex h-full flex-col md:absolute md:inset-0">
                  <div className="flex items-start gap-3 px-6 pt-5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-fg">{role === 'guest' ? t('guestPick') : t('workspaces')}</p>
                      <p className="mt-0.5 text-xs text-fg-muted">{t(role === 'admin' ? 'spacesHintAdmin' : role === 'guest' ? 'spacesHintGuest' : 'spacesHintMember')}</p>
                    </div>
                    {role === 'member' && workspaces.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setSelected(selected.size === workspaces.length ? new Map() : everyWorkspace())}
                        className="-mr-1.5 shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-accent-ink outline-none transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent-mid"
                      >
                        {selected.size === workspaces.length ? t('noneWorkspaces') : t('allWorkspacesToday')}
                      </button>
                    ) : null}
                  </div>
                  {workspaces.length > 7 ? (
                    <div className="relative mx-6 mt-3">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
                      <Input value={spaceQuery} onChange={(e) => setSpaceQuery(e.target.value)} placeholder={t('spacesSearch')} aria-label={t('spacesSearch')} className="h-8 pl-8 text-sm" />
                    </div>
                  ) : null}
                  {/* una ficha por espacio: se marca con un clic; el permiso, abajo de cada una */}
                  <ul className={cn('mt-3.5 grid min-h-0 grid-cols-2 content-start gap-2.5 overflow-y-auto px-6 pb-5', thumbFailed ? 'flex-1' : 'shrink')}>
                    {shownSpaces.map((w) => {
                      const admin = role === 'admin'
                      const r = admin ? undefined : selected.get(w.id)
                      const on = admin || Boolean(r)
                      return (
                        <li key={w.id} className="relative">
                          <button
                            type="button"
                            onClick={admin ? undefined : () => toggleSpace(w.id, !on)}
                            aria-pressed={on}
                            aria-disabled={admin || undefined}
                            className={cn(
                              'flex h-full w-full flex-col items-start rounded-xl p-3.5 pb-10 text-left outline-none transition-[background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-accent-mid',
                              on ? 'bg-accent-soft/50 ring-[1.5px] ring-inset ring-accent-mid' : 'ring-1 ring-inset ring-line hover:bg-hover',
                              on && !admin && 'hover:bg-accent-soft/80',
                              admin && 'cursor-default',
                            )}
                          >
                            <span className="flex w-full items-start justify-between gap-2">
                              <WorkspaceMark ws={w} size={32} className={cn('transition-opacity duration-150', !on && 'opacity-50')} />
                              <span
                                className={cn(
                                  'flex size-[18px] shrink-0 items-center justify-center rounded-full transition-colors duration-150',
                                  on ? 'bg-accent text-accent-fg' : 'bg-panel ring-1 ring-inset ring-line-control',
                                )}
                              >
                                {on ? <Check className="size-3" strokeWidth={3} /> : null}
                              </span>
                            </span>
                            <span className={cn('mt-3 block w-full truncate text-sm font-medium', on ? 'text-fg' : 'text-fg-muted')}>{w.name}</span>
                          </button>
                          {/* el permiso: dentro de la ficha pero fuera de su botón (no se anidan botones) */}
                          <div className="pointer-events-none absolute inset-x-3.5 bottom-2.5 flex h-6 items-center">
                            {admin ? (
                              <span className="text-xs font-medium text-accent-ink">{tRole('ws_admin')}</span>
                            ) : r ? (
                              <AccessMenu value={r} onChange={(v) => setSelected(new Map(selected).set(w.id, v))} />
                            ) : (
                              <span className="text-xs text-fg-subtle">{t('accessNone')}</span>
                            )}
                          </div>
                        </li>
                      )
                    })}
                    {!workspaces.length || !shownSpaces.length ? (
                      <li className="col-span-2 px-2 py-6 text-center text-xs text-fg-muted">{workspaces.length ? t('spacesNoMatch') : t('spacesEmpty')}</li>
                    ) : null}
                  </ul>
                  {/* lo que le llega: el correo de verdad (el mismo HTML que se envía), en chico y al día con lo
                      elegido. Si la API no tiene vista previa, no se ofrece (mejor nada que un botón que falla). */}
                  {thumbFailed ? null : (
                    <div className="flex min-h-40 flex-1 flex-col gap-2 border-t border-line-soft px-6 pb-5 pt-3.5">
                      <p className="flex items-center gap-2 text-[13px] font-medium text-fg">
                        <Mail className="size-3.5 text-fg-muted" />
                        {t('previewTitle')}
                      </p>
                      <EmailThumb html={thumbData?.html ?? null} onOpen={() => (thumbData ? setPreview({ subject: thumbData.subject, html: thumbData.html }) : undefined)} />
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4">
              {/* lo que va a pasar al enviar */}
              <p className={cn('mr-auto min-w-0 text-xs', role === 'guest' && selected.size === 0 ? 'font-medium text-fg' : 'text-fg-muted')}>{summary}</p>
              <Button variant="ghost" onClick={close}>
                {t('cancel')}
              </Button>
              <Button type="submit" variant="primary" loading={pending} disabled={!email.trim() || (role === 'guest' && selected.size === 0)}>
                <Send />
                {t('submit')}
              </Button>
            </div>
            {/* dentro del diálogo de invitar: al cerrarla se vuelve a él tal como estaba */}
            <EmailPreview preview={preview} to={email.trim()} onClose={() => setPreview(null)} />
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** El permiso en un espacio, como texto con flecha (sin caja): Lector, Editor o Admin, cada uno con lo que puede hacer. */
function AccessMenu({ value, onChange }: { value: WorkspaceRole; onChange: (v: WorkspaceRole) => void }) {
  const t = useTranslations('settings.members.addDialog')
  const tRole = useTranslations('roles')
  return (
    <Menu>
      <MenuTrigger className="pointer-events-auto -ml-1.5 inline-flex h-6 items-center gap-0.5 rounded-md px-1.5 text-xs font-medium text-accent-ink outline-none transition-colors hover:bg-panel focus-visible:ring-2 focus-visible:ring-accent-mid data-[popup-open]:bg-panel">
        {tRole(`ws_${value}`)}
        <ChevronDown className="size-3.5" />
      </MenuTrigger>
      <MenuContent className="w-64">
        <MenuRadioGroup value={value} onValueChange={(v) => onChange(v as WorkspaceRole)}>
          {(['viewer', 'editor', 'admin'] as const).map((x) => (
            <MenuRadioItem key={x} value={x} closeOnClick className="relative h-auto items-start py-1.5">
              <span className="flex min-w-0 flex-col">
                <span className="text-sm text-fg">{tRole(`ws_${x}`)}</span>
                <span className="text-xs leading-snug text-fg-muted">{t(`accessHint.${x}`)}</span>
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  )
}

/** Ancho con que se dibuja el correo antes de achicarlo: el del correo (560) más su margen. */
const EMAIL_WIDTH = 600
/** El margen de arriba del correo que no hace falta en chico. */
const EMAIL_TOP = 26

/**
 * El correo de invitación en chico: el HTML de verdad, dibujado a su ancho y achicado al de la columna,
 * con la parte de arriba a la vista (logo, quién invita, «Únete a…»). Un clic lo abre entero.
 */
function EmailThumb({ html, onOpen }: { html: string | null; onOpen: () => void }) {
  const t = useTranslations('settings.members.addDialog')
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.66)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / EMAIL_WIDTH))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={box} className="group relative h-56 overflow-hidden rounded-lg bg-[#FBF6F2] ring-1 ring-line-soft transition-shadow duration-150 hover:shadow-card md:h-auto md:min-h-0 md:flex-1">
      {html ? (
        <iframe
          title={t('previewTitle')}
          srcDoc={html}
          sandbox="allow-same-origin"
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{ width: EMAIL_WIDTH, height: 1200, transform: `scale(${scale}) translateY(-${EMAIL_TOP}px)` }}
        />
      ) : (
        <span className="absolute inset-x-[12%] top-6 flex flex-col gap-2.5" aria-hidden>
          <span className="h-3 w-16 animate-pulse rounded-full bg-[#EFE3EA]" />
          <span className="h-16 animate-pulse rounded-lg bg-[#F3E8FA]" />
          <span className="h-3 w-2/3 animate-pulse rounded-full bg-[#EFE3EA]" />
        </span>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#FBF6F2] to-transparent" />
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 flex items-end justify-end p-2.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-mid"
      >
        <span className="inline-flex items-center gap-1.5 rounded-md bg-panel px-2.5 py-1 text-xs font-medium text-fg shadow-card ring-1 ring-line-soft transition-colors group-hover:bg-hover">
          <Eye className="size-3.5" />
          {t('preview')}
        </span>
      </button>
    </div>
  )
}

/**
 * El correo de invitación tal como lo recibiría la persona: de quién, para quién, el asunto y el correo
 * mismo (el HTML que arma la API, en un marco sin scripts y con los enlaces apagados).
 */
function EmailPreview({ preview, to, onClose }: { preview: { subject: string; html: string } | null; to: string; onClose: () => void }) {
  const t = useTranslations('settings.members.addDialog')
  const doc = preview ? preview.html.replace('</head>', '<style>a{pointer-events:none;cursor:default}</style></head>') : ''
  const row = (label: string, value: React.ReactNode, strong?: boolean) => (
    <p className="flex gap-3">
      <span className="w-14 shrink-0 text-fg-subtle">{label}</span>
      <span className={cn('min-w-0 truncate', strong ? 'font-medium text-fg' : 'text-fg')}>{value}</span>
    </p>
  )
  return (
    <Dialog open={Boolean(preview)} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent viewportClassName="pt-[4vh]" className="flex max-h-[calc(100dvh-6vh)] flex-col sm:max-w-[680px]">
        <DialogHeader title={t('previewTitle')} description={t('previewNote')} />
        <div className="mx-5 mb-3 flex shrink-0 flex-col gap-1 rounded-lg bg-canvas px-3.5 py-2.5 text-[13px] ring-1 ring-inset ring-line-soft">
          {row(t('previewFrom'), 'Veltro')}
          {row(t('previewTo'), to || t('previewSomeone'))}
          {row(t('previewSubject'), preview?.subject, true)}
        </div>
        <div className="mx-5 mb-5 min-h-0 flex-1 overflow-hidden rounded-xl ring-1 ring-line">
          {/* aislado: sin scripts, formularios ni ventanas; con el origen de la página para que carguen sus imágenes */}
          {/* sin foco al abrir (si no, Escape queda dentro del marco y no cierra); si se hace clic adentro, Escape igual cierra */}
          <iframe
            title={t('previewTitle')}
            srcDoc={doc}
            sandbox="allow-same-origin"
            tabIndex={-1}
            onLoad={(e) => e.currentTarget.contentDocument?.addEventListener('keydown', (ev) => (ev.key === 'Escape' ? onClose() : undefined))}
            className="block h-[min(68vh,760px)] w-full bg-[#FBF6F2]"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="currentColor">
      <path d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5 5.13-1.35A9.9 9.9 0 1 0 12.04 2Zm0 18.06a8.16 8.16 0 0 1-4.16-1.14l-.3-.18-3.04.8.81-2.97-.2-.31a8.17 8.17 0 1 1 6.89 3.8Zm4.48-6.12c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.55.12-.16.25-.63.8-.78.97-.14.16-.29.18-.53.06a6.7 6.7 0 0 1-1.98-1.22 7.4 7.4 0 0 1-1.37-1.7c-.14-.25 0-.38.11-.5.11-.11.25-.29.37-.43.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.31 2.75 2.75 0 0 0-.86 2.04 4.77 4.77 0 0 0 1 2.53 10.9 10.9 0 0 0 4.18 3.7c.58.25 1.04.4 1.4.51.58.19 1.12.16 1.54.1.47-.07 1.46-.6 1.66-1.17.2-.58.2-1.07.15-1.17-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  )
}
