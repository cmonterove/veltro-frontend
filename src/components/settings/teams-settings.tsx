'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowUpRight, MoreHorizontal, Pencil, Plus, Search, Trash2, UsersRound } from 'lucide-react'
import { useApp, useMemberMap } from '@/components/app/app-context'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/switch'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import { useConfirm } from '@/components/ui/confirm'
import { createTeam, deleteTeam, updateTeam } from '@/app/actions/settings'
import { WORKSPACE_COLORS } from '@/lib/constants'
import type { ErrorCode } from '@/lib/errors'
import type { WorkTeam } from '@/lib/types'
import { cn } from '@/lib/utils'
import { SettingsHeader } from './ui'

/** La marca de un equipo: un cuadrado con su color y el ícono de personas. */
export function TeamMark({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className={cn(`ws-${color}`, 'inline-flex shrink-0 items-center justify-center')}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.31), background: 'var(--ws-color)', color: 'var(--ws-on)' }}
    >
      <UsersRound style={{ width: size * 0.55, height: size * 0.55 }} />
    </span>
  )
}

/**
 * Equipos de trabajo: grupos de personas aparte del organigrama («Equipo Polar», «Trade») para
 * mirar juntas sus tareas en Tareas, Pulso y Mesa. Los ve toda la cuenta; los arman los admins.
 */
export function TeamsSettings({ admin }: { admin: boolean }) {
  const t = useTranslations('settings.teams')
  const te = useTranslations('errors')
  const tConfirm = useTranslations('confirm')
  const { teams } = useApp()
  const memberMap = useMemberMap()
  const router = useRouter()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<WorkTeam | 'new' | null>(null)
  const [, start] = useTransition()

  const remove = async (team: WorkTeam) => {
    if (!(await confirm({ title: t('deleteConfirm', { name: team.name }), description: t('deleteHint'), danger: true, confirmLabel: tConfirm('delete') }))) return
    start(async () => {
      const res = await deleteTeam(team.id)
      if (!res.ok) return void toast.error(te(res.error))
      toast.success(t('deleted'))
      router.refresh()
    })
  }

  return (
    <div>
      <SettingsHeader
        title={t('title')}
        description={t('description')}
        actions={
          admin ? (
            <Button variant="primary" size="sm" onClick={() => setEditing('new')}>
              <Plus />
              {t('new')}
            </Button>
          ) : null
        }
      />
      {teams.length ? (
        <ul className="flex flex-col divide-y divide-line-soft rounded-xl border border-line bg-panel">
          {teams.map((team) => {
            const people = team.memberIds.flatMap((id) => memberMap.get(id) ?? [])
            return (
              <li key={team.id} className="flex items-center gap-3 px-4 py-3">
                <TeamMark color={team.color} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{team.name}</p>
                  <p className="truncate text-xs text-fg-muted">
                    {people.length ? people.map((p) => p.full_name.split(' ')[0]).join(', ') : t('noMembers')}
                  </p>
                </div>
                {people.length ? <AvatarStack people={people} size={24} max={5} className="hidden sm:flex" /> : null}
                <Link
                  href={`/tasks?scope=${encodeURIComponent(`group:${team.id}`)}`}
                  className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-accent-ink hover:bg-hover"
                >
                  {t('viewTasks')}
                  <ArrowUpRight className="size-3.5" />
                </Link>
                {admin ? (
                  <Menu>
                    <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t('actions', { name: team.name })} />}>
                      <MoreHorizontal />
                    </MenuTrigger>
                    <MenuContent align="end" className="w-48">
                      <MenuItem onClick={() => setEditing(team)}>
                        <Pencil />
                        {t('edit')}
                      </MenuItem>
                      <MenuItem danger onClick={() => remove(team)}>
                        <Trash2 />
                        {t('delete')}
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-12 text-center">
          <TeamMark color="violet" size={40} />
          <p className="mt-4 text-sm font-medium text-fg">{t('emptyTitle')}</p>
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-fg-muted">{admin ? t('emptyHint') : t('emptyHintMember')}</p>
          {admin ? (
            <Button variant="primary" size="sm" className="mt-4" onClick={() => setEditing('new')}>
              <Plus />
              {t('new')}
            </Button>
          ) : null}
        </div>
      )}

      {editing ? (
        <TeamDialog
          key={editing === 'new' ? 'new' : editing.id}
          team={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function TeamDialog({ team, onClose, onSaved }: { team: WorkTeam | null; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('settings.teams')
  const te = useTranslations('errors')
  const { account, members } = useApp()
  const [name, setName] = useState(team?.name ?? '')
  const [color, setColor] = useState(team?.color ?? 'violet')
  const [picked, setPicked] = useState<Set<string>>(new Set(team?.memberIds ?? []))
  const [q, setQ] = useState('')
  const [error, setError] = useState<ErrorCode | null>(null)
  const [pending, start] = useTransition()

  const needle = q.trim().toLowerCase()
  const shown = useMemo(
    () => members.filter((m) => !needle || m.full_name.toLowerCase().includes(needle) || (m.title ?? '').toLowerCase().includes(needle)),
    [members, needle],
  )

  const submit = () =>
    start(async () => {
      setError(null)
      const input = { name, color, memberIds: [...picked] }
      const res = team ? await updateTeam(team.id, input) : await createTeam(account.id, input)
      if (!res.ok) return void setError(res.error)
      toast.success(team ? t('saved') : t('created'))
      onSaved()
    })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <DialogHeader title={team ? t('editTitle') : t('newTitle')} description={t('dialogHint')} />
          <DialogBody className="flex flex-col gap-4">
            <Field label={t('name')} htmlFor="team-name">
              <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus placeholder={t('namePlaceholder')} />
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t('color')}</span>
              <div className="flex flex-wrap gap-1.5">
                {WORKSPACE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={t(`colors.${c}`)}
                    aria-pressed={color === c}
                    className={cn('rounded-[9px] p-0.5 ring-offset-2 ring-offset-panel transition-shadow', color === c && 'ring-2 ring-accent')}
                  >
                    <TeamMark color={c} size={26} />
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between text-sm font-medium">
                {t('members')}
                <span className="text-xs font-normal text-fg-subtle">{t('picked', { count: picked.size })}</span>
              </span>
              <div className="rounded-lg border border-line">
                <label className="flex items-center gap-2 border-b border-line px-2.5">
                  <Search className="size-3.5 shrink-0 text-fg-subtle" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t('searchPeople')}
                    aria-label={t('searchPeople')}
                    className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-fg-subtle"
                  />
                </label>
                <div className="max-h-60 overflow-y-auto p-1 scrollbar-thin">
                  {shown.map((m) => (
                    <label key={m.id} className="flex h-10 cursor-pointer items-center gap-2.5 rounded-md px-2 hover:bg-hover">
                      <Checkbox
                        checked={picked.has(m.id)}
                        onCheckedChange={(on) => {
                          const next = new Set(picked)
                          if (on) next.add(m.id)
                          else next.delete(m.id)
                          setPicked(next)
                        }}
                      />
                      <Avatar name={m.full_name} src={m.avatar_url} seed={m.id} size={22} />
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">{m.full_name}</span>
                      {m.title ? <span className="truncate text-xs text-fg-subtle">{m.title}</span> : null}
                    </label>
                  ))}
                  {shown.length === 0 ? <p className="px-2 py-3 text-sm text-fg-subtle">{t('noMatches')}</p> : null}
                </div>
              </div>
            </div>
            {error ? (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-fg">
                {te(error)}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={pending} disabled={!name.trim()}>
              {team ? t('save') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
