'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, ChevronDown, Copy, KeyRound, MoreHorizontal, UserPlus } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/switch'
import { Avatar } from '@/components/ui/avatar'
import { Field, Input } from '@/components/ui/input'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Menu, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/components/ui/menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { addMember, removeMember, setMemberWorkspaces, updateMemberRole } from '@/app/actions/settings'
import { cn } from '@/lib/utils'
import type { AccountRole, WorkspaceRole } from '@/lib/database.types'
import type { AccountMember, Assignment, Usage } from '@/lib/api/ajustes'
import type { ErrorCode } from '@/lib/errors'
import { SettingsHeader } from './ui'
import { WorkspaceMark } from '@/components/app/marks'
import { Select } from '@/components/ui/select'
import { useConfirm } from '@/components/ui/confirm'
import { useCopy } from '@/lib/clipboard'

type Result = { ok: true } | { ok: false; error: ErrorCode }

export function MembersSettings({ members, usage }: { members: AccountMember[]; usage: Usage | null }) {
  const t = useTranslations('settings.members')
  const te = useTranslations('errors')
  const tConfirm = useTranslations('confirm')
  const router = useRouter()
  const confirm = useConfirm()
  const { workspaces, user, account, accountRole } = useApp()
  const [addOpen, setAddOpen] = useState(false)
  const [, start] = useTransition()
  const full = usage?.max_members != null && usage.members_count >= usage.max_members

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
      </div>

      <AddMemberDialog open={addOpen} onOpenChange={setAddOpen} canPromote={accountRole === 'owner'} onDone={done} />
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

function AddMemberDialog({
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
  const [result, setResult] = useState<{ email: string; password: string | null; existing: boolean } | null>(null)

  const reset = () => {
    setName('')
    setEmail('')
    setRole('member')
    setSelected(new Map())
    setResult(null)
    setError(null)
  }
  // los botones del pie cierran desde afuera (el Dialog no avisa): sin limpiar, al reabrir saldría la contraseña anterior
  const close = () => {
    onOpenChange(false)
    reset()
  }

  const submit = () =>
    start(async () => {
      setError(null)
      const res = await addMember(account.id, {
        fullName: name,
        email,
        role,
        workspaces: role === 'admin' ? [] : [...selected].map(([id, r]) => ({ id, role: r })),
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setResult({ email: email.trim().toLowerCase(), password: res.tempPassword, existing: res.existing })
      onDone()
    })

  const credentials = result
    ? `${t('shareIntro')}\n${window.location.origin}/login\n${t('emailLabel')}: ${result.email}${result.password ? `\n${t('passwordLabel')}: ${result.password}` : ''}`
    : ''

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
            <DialogHeader title={t('doneTitle')} description={result.existing ? t('doneExisting') : t('doneNew')} />
            <DialogBody>
              <pre className="whitespace-pre-wrap rounded-lg border border-line bg-sidebar p-3 font-mono text-sm text-fg">{credentials}</pre>
              {result.password ? <p className="mt-2 text-xs text-fg-muted">{t('onceWarning')}</p> : null}
            </DialogBody>
            <DialogFooter>
              <Button
                onClick={() => copy(credentials, t('copied'))}
              >
                <Copy />
                {t('copy')}
              </Button>
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
              <Field label={t('name')} htmlFor="m-name">
                <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus maxLength={120} />
              </Field>
              <Field label={t('email')} htmlFor="m-email">
                <Input id="m-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
              <Button type="submit" variant="primary" loading={pending} disabled={name.trim().length < 2 || !email.trim()}>
                {t('submit')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
