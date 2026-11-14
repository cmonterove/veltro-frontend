'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, ChevronDown, Copy, KeyRound, Link2, Mail, MailCheck, MoreHorizontal, Send, UserPlus, X } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { useDateLocale } from '@/lib/dates'
import { useApp } from '@/components/app/app-context'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/switch'
import { Avatar } from '@/components/ui/avatar'
import { Field, Input } from '@/components/ui/input'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Menu, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/components/ui/menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { inviteMember, removeMember, resendInvite, revokeInvite, setMemberWorkspaces, updateMemberRole } from '@/app/actions/settings'
import { cn } from '@/lib/utils'
import type { AccountRole, WorkspaceRole } from '@/lib/database.types'
import type { AccountMember, Assignment, Invitation, Usage } from '@/lib/api/ajustes'
import type { ErrorCode } from '@/lib/errors'
import { SettingsHeader } from './ui'
import { WorkspaceMark } from '@/components/app/marks'
import { Select } from '@/components/ui/select'
import { useConfirm } from '@/components/ui/confirm'
import { useCopy } from '@/lib/clipboard'

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

  return (
    <div>
      <SettingsHeader
        title={t('title')}
        description={usage?.max_members != null ? t('descriptionLimit', { used: usage.members_count, max: usage.max_members }) : t('description')}
        actions={
          <Button variant="primary" size="sm" onClick={() => setAddOpen(true)} disabled={full}>
            <UserPlus />
            {t('add')}
          </Button>
        }
      />
      <div>
        {full ? <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-fg">{t('limitReached')}</p> : null}
        <ul className="flex flex-col divide-y divide-line-soft rounded-xl border border-line bg-panel">
          {members.map((m) => (
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
        {invitations.length ? <PendingInvites invitations={invitations} onChanged={done} /> : null}
      </div>

      <InviteDialog open={addOpen} onOpenChange={setAddOpen} canPromote={accountRole === 'owner'} onDone={done} />
    </div>
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
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <Avatar name={member.full_name} src={member.avatar_url} seed={member.id} size={28} />
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

      {isAdmin ? (
        <span className="text-xs text-fg-subtle">{t('allWorkspaces')}</span>
      ) : (
        <WorkspaceAssignments assignments={assignments} workspaces={workspaces} onSave={onWorkspaces} />
      )}

      {editableRole ? (
        <Menu>
          <MenuTrigger className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm text-fg-muted hover:bg-hover hover:text-fg data-[popup-open]:bg-hover">
            {tRole(member.role)}
            <ChevronDown className="size-3.5" />
          </MenuTrigger>
          <MenuContent align="end" className="w-64">
            <MenuRadioGroup value={member.role} onValueChange={(v) => onRole(v as 'admin' | 'member')}>
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
function PendingInvites({ invitations, onChanged }: { invitations: Invitation[]; onChanged: () => void }) {
  const t = useTranslations('settings.members.invites')
  const te = useTranslations('errors')
  const tRole = useTranslations('roles')
  const tConfirm = useTranslations('confirm')
  const locale = useDateLocale()
  const copy = useCopy()
  const confirm = useConfirm()
  const [, start] = useTransition()

  return (
    <section className="mt-8">
      <h2 className="mb-2.5 flex items-center gap-1.5 text-[13.5px] font-semibold text-fg">
        {t('title')}
        <span className="rounded-full bg-hover px-1.5 text-[11px] font-medium leading-[18px] tabular-nums text-fg-muted">{invitations.length}</span>
      </h2>
      <ul className="flex flex-col divide-y divide-line-soft rounded-xl border border-line bg-panel">
        {invitations.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-4 py-3">
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

function InviteDialog({
  open,
  onOpenChange,
  canPromote,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  canPromote: boolean
  onDone: () => void
}) {
  const copy = useCopy()
  const t = useTranslations('settings.members.addDialog')
  const te = useTranslations('errors')
  const tRole = useTranslations('roles')
  const { workspaces, account } = useApp()
  const [error, setError] = useState<ErrorCode | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [selected, setSelected] = useState<Map<string, WorkspaceRole>>(new Map())
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ email: string; link: string; emailed: boolean } | null>(null)

  const reset = () => {
    setName('')
    setEmail('')
    setRole('member')
    setSelected(new Map())
    setResult(null)
    setError(null)
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
      onDone()
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
      <DialogContent>
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
            <DialogHeader title={t('title')} description={t('description')} />
            <DialogBody className="flex flex-col gap-4">
              <Field label={t('email')} htmlFor="m-email">
                <Input id="m-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </Field>
              <Field label={t('nameOptional')} htmlFor="m-name">
                <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
              </Field>
              {canPromote ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">{t('role')}</span>
                  <div className="grid grid-cols-2 gap-2">
                    {(['member', 'admin'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        aria-pressed={role === r}
                        className={cn(
                          'flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors',
                          role === r ? 'border-accent-mid bg-accent-soft' : 'border-line hover:bg-hover',
                        )}
                      >
                        <span className="text-sm font-medium">{tRole(r)}</span>
                        <span className="text-xs text-fg-muted">{t(`${r}Hint`)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {role === 'member' ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">{t('workspaces')}</span>
                  <div className="flex flex-col rounded-lg border border-line p-1">
                    {workspaces.map((w) => {
                      const r = selected.get(w.id)
                      return (
                        <div key={w.id} className="flex h-9 items-center gap-2 rounded-sm px-2 hover:bg-hover">
                          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                            <Checkbox
                              checked={Boolean(r)}
                              onCheckedChange={(on) => {
                                const next = new Map(selected)
                                if (on) next.set(w.id, 'editor')
                                else next.delete(w.id)
                                setSelected(next)
                              }}
                            />
                            <WorkspaceMark ws={w} size={16} />
                            <span className="truncate">{w.name}</span>
                          </label>
                          {r ? (
                            <Select<WorkspaceRole>
                              value={r}
                              onChange={(v) => setSelected(new Map(selected).set(w.id, v))}
                              options={(['admin', 'editor', 'viewer'] as const).map((x) => ({ value: x, label: tRole(`ws_${x}`) }))}
                              className="h-7 w-28 px-2 text-xs"
                            />
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}
              {error ? (
                <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-fg">
                  {te(error)}
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost" onClick={close}>
                {t('cancel')}
              </Button>
              <Button type="submit" variant="primary" loading={pending} disabled={!email.trim()}>
                <Send />
                {t('submit')}
              </Button>
            </DialogFooter>
          </form>
        )}
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
