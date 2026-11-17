'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowUpRight, MoreHorizontal, Pencil, Plus, Search, Trash2, UserPlus, UsersRound } from 'lucide-react'
import { useApp, useMemberMap } from '@/components/app/app-context'
import { Avatar } from '@/components/ui/avatar'
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
import { useTaskStats } from '@/lib/queries/tasks'
import { cn } from '@/lib/utils'
import { SettingsHeader } from './ui'

type TeamInput = { name: string; color: string; memberIds: string[] }
type TeamOp = { kind: 'create'; row: WorkTeam } | { kind: 'patch'; id: string; patch: Partial<TeamInput> } | { kind: 'delete'; id: string }

const applyTeamOp = (list: WorkTeam[], op: TeamOp): WorkTeam[] =>
  op.kind === 'create' ? [...list, op.row] : op.kind === 'delete' ? list.filter((x) => x.id !== op.id) : list.map((x) => (x.id === op.id ? { ...x, ...op.patch } : x))

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
  const { teams: serverTeams, account } = useApp()
  const router = useRouter()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<WorkTeam | 'new' | null>(null)
  const [, start] = useTransition()

  // crear, editar o borrar se ve al instante; la API confirma detrás y, si falla, se deshace con aviso.
  // (antes: guardar ~2 s y recargar el contexto de la app ~2,5 s antes de verlo)
  const [overlay, setOverlay] = useState<{ base: WorkTeam[]; ops: TeamOp[] }>({ base: serverTeams, ops: [] })
  const teams = useMemo(() => (overlay.base === serverTeams ? overlay.ops : []).reduce(applyTeamOp, serverTeams), [serverTeams, overlay])
  const optimistic = (op: TeamOp, call: () => Promise<{ ok: true } | { ok: false; error: ErrorCode }>, success: string) => {
    setOverlay((o) => ({ base: serverTeams, ops: [...(o.base === serverTeams ? o.ops : []), op] }))
    toast.success(success)
    start(async () => {
      const res = await call()
      if (!res.ok) {
        toast.error(te(res.error))
        setOverlay({ base: serverTeams, ops: [] })
        return
      }
      router.refresh()
    })
  }

  const save = (team: WorkTeam | null, input: TeamInput) => {
    setEditing(null)
    if (team) optimistic({ kind: 'patch', id: team.id, patch: input }, () => updateTeam(team.id, input), t('saved'))
    else optimistic({ kind: 'create', row: { id: `tmp-${crypto.randomUUID()}`, ...input } }, () => createTeam(account.id, input), t('created'))
  }

  const remove = async (team: WorkTeam) => {
    if (!(await confirm({ title: t('deleteConfirm', { name: team.name }), description: t('deleteHint'), danger: true, confirmLabel: tConfirm('delete') }))) return
    optimistic({ kind: 'delete', id: team.id }, () => deleteTeam(team.id), t('deleted'))
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
      {teams.length || admin ? (
        // una tarjeta por equipo: su color, su gente y cómo van sus tareas (y una más para crear otro)
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} admin={admin && !team.id.startsWith('tmp-')} onEdit={() => setEditing(team)} onRemove={() => remove(team)} />
          ))}
          {admin ? (
            <li>
              <button
                type="button"
                onClick={() => setEditing('new')}
                className="flex h-full min-h-44 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong text-sm text-fg-muted transition-colors hover:border-accent-mid hover:bg-accent-soft/40 hover:text-accent-ink"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-hover">
                  <Plus className="size-5" />
                </span>
                <span className="font-medium">{t('new')}</span>
                {!teams.length ? <span className="max-w-60 text-center text-xs leading-relaxed text-fg-subtle">{t('emptyHint')}</span> : null}
              </button>
            </li>
          ) : null}
        </ul>
      ) : (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-12 text-center">
          <TeamMark color="violet" size={40} />
          <p className="mt-4 text-sm font-medium text-fg">{t('emptyTitle')}</p>
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-fg-muted">{t('emptyHintMember')}</p>
        </div>
      )}

      {editing ? (
        <TeamDialog
          key={editing === 'new' ? 'new' : editing.id}
          team={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
    </div>
  )
}

/** Un equipo: su banda de color, quiénes son y cómo van sus tareas (abiertas, vencidas, en curso). */
function TeamCard({ team, admin, onEdit, onRemove }: { team: WorkTeam; admin: boolean; onEdit: () => void; onRemove: () => void }) {
  const t = useTranslations('settings.teams')
  const memberMap = useMemberMap()
  const people = team.memberIds.flatMap((id) => memberMap.get(id) ?? [])
  // recién creado (id provisorio): las cifras se piden cuando vuelve de la API
  const { data: stats } = useTaskStats(`group:${team.id}`, { enabled: people.length > 0 && !team.id.startsWith('tmp-') })
  const c = stats?.counters
  const figures = [
    { id: 'open', label: t('stats.open'), value: c?.open, tone: 'text-fg' },
    { id: 'overdue', label: t('stats.overdue'), value: c?.overdue, tone: c?.overdue ? 'text-danger' : 'text-fg' },
    { id: 'progress', label: t('stats.progress'), value: c?.inProgress, tone: c?.inProgress ? 'text-mandarina-ink' : 'text-fg' },
  ]
  return (
    <li className={cn(`ws-${team.color}`, 'flex flex-col overflow-hidden rounded-2xl border border-line bg-panel')}>
      <div className="flex items-start gap-3 px-4 pb-3 pt-4" style={{ background: 'color-mix(in oklch, var(--ws-color) 9%, var(--panel))' }}>
        <TeamMark color={team.color} size={40} />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-base font-semibold tracking-[-0.01em] text-fg">{team.name}</p>
          <p className="truncate text-xs text-fg-muted">{people.length ? t('membersCount', { count: people.length }) : t('noMembers')}</p>
        </div>
        {admin ? (
          <Menu>
            <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t('actions', { name: team.name })} />}>
              <MoreHorizontal />
            </MenuTrigger>
            <MenuContent align="end" className="w-48">
              <MenuItem onClick={onEdit}>
                <Pencil />
                {t('edit')}
              </MenuItem>
              <MenuItem danger onClick={onRemove}>
                <Trash2 />
                {t('delete')}
              </MenuItem>
            </MenuContent>
          </Menu>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-4 px-4 pb-4 pt-3">
        {people.length ? (
          <>
            <ul className="flex flex-wrap gap-x-3 gap-y-2">
              {people.slice(0, 6).map((m) => (
                <li key={m.id} className="flex min-w-0 items-center gap-1.5 text-xs text-fg">
                  <Avatar name={m.full_name} src={m.avatar_url} seed={m.id} size={22} />
                  <span className="max-w-28 truncate">{m.full_name.split(' ')[0]}</span>
                </li>
              ))}
              {people.length > 6 ? <li className="flex items-center text-xs text-fg-subtle">{t('more', { count: people.length - 6 })}</li> : null}
            </ul>
            <dl className="grid grid-cols-3 gap-2">
              {figures.map((f) => (
                <div key={f.id} className="rounded-lg bg-sidebar/60 px-2.5 py-2">
                  <dt className="text-2xs text-fg-subtle">{f.label}</dt>
                  <dd className={cn('mt-0.5 text-lg font-semibold leading-none tabular-nums', f.tone)}>{f.value ?? '·'}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-start justify-center gap-2 rounded-xl border border-dashed border-line px-3 py-4">
            <p className="text-xs leading-relaxed text-fg-muted">{t('emptyTeam')}</p>
            {admin ? (
              <Button size="sm" variant="secondary" onClick={onEdit}>
                <UserPlus />
                {t('addPeople')}
              </Button>
            ) : null}
          </div>
        )}
        <Link
          href={`/tasks?scope=${encodeURIComponent(`group:${team.id}`)}`}
          className="mt-auto inline-flex items-center gap-1 self-start text-xs font-medium text-accent-ink hover:underline"
        >
          {t('viewTasks')}
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
    </li>
  )
}

function TeamDialog({ team, onClose, onSave }: { team: WorkTeam | null; onClose: () => void; onSave: (team: WorkTeam | null, input: TeamInput) => void }) {
  const t = useTranslations('settings.teams')
  const te = useTranslations('errors')
  const { members } = useApp()
  const [name, setName] = useState(team?.name ?? '')
  const [color, setColor] = useState(team?.color ?? 'violet')
  const [picked, setPicked] = useState<Set<string>>(new Set(team?.memberIds ?? []))
  const [q, setQ] = useState('')
  const [error, setError] = useState<ErrorCode | null>(null)

  const needle = q.trim().toLowerCase()
  const shown = useMemo(
    () => members.filter((m) => !needle || m.full_name.toLowerCase().includes(needle) || (m.title ?? '').toLowerCase().includes(needle)),
    [members, needle],
  )

  // los errores de la API (nombre repetido, etc.) llegan como aviso y el cambio se deshace
  const submit = () => {
    setError(null)
    if (name.trim().length < 2) return void setError('name_too_short')
    onSave(team, { name: name.trim(), color, memberIds: [...picked] })
  }

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
            <Button type="submit" variant="primary" disabled={!name.trim()}>
              {team ? t('save') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
