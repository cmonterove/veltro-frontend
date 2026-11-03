'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Archive, ArchiveRestore, ArrowUpRight, ChevronRight, Plus, UserPlus, X } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import { Select } from '@/components/ui/select'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '@/components/ui/menu'
import { createWorkspace, updateWorkspace, archiveWorkspace, unarchiveWorkspace, setWorkspaceAccess } from '@/app/actions/settings'
import { WORKSPACE_COLORS } from '@/lib/constants'
import { WorkspaceMark, monogramOf } from '@/components/app/marks'
import { cn } from '@/lib/utils'
import { shortDate, useDateLocale } from '@/lib/dates'
import type { WorkspaceRole } from '@/lib/database.types'
import type { WorkspaceWithRole } from '@/lib/types'
import { SaveBar, SettingsCard, SettingsHeader, SettingsRow, SettingsTabs } from './ui'
import { StatusEditor } from './status-editor'
import { FieldsEditor } from './fields-editor'
import { useConfirm } from '@/components/ui/confirm'
import type { Usage, WorkspacePerson } from '@/lib/api/ajustes'

// ---------------- todos los espacios ----------------

export function WorkspacesOverview({
  active: workspaces,
  archived,
  memberCounts,
  usage,
}: {
  active: WorkspaceWithRole[]
  archived: WorkspaceWithRole[]
  memberCounts: Record<string, number>
  usage: Usage | null
}) {
  const t = useTranslations('settings.workspaces')
  const te = useTranslations('errors')
  const router = useRouter()
  const [pending, start] = useTransition()
  const [restoring, setRestoring] = useState<string | null>(null)
  const dateLocale = useDateLocale()
  const full = usage?.max_workspaces != null && usage.workspaces_count >= usage.max_workspaces

  const unarchive = (w: WorkspaceWithRole) =>
    start(async () => {
      setRestoring(w.id)
      const res = await unarchiveWorkspace(w.id)
      setRestoring(null)
      if (!res.ok) return void toast.error(te(res.error))
      toast.success(t('unarchived', { name: w.name }))
      router.refresh()
    })

  return (
    <div>
      <SettingsHeader
        title={t('title')}
        description={usage?.max_workspaces != null ? t('descriptionLimit', { used: usage.workspaces_count, max: usage.max_workspaces }) : t('description')}
        actions={
          full ? null : (
            <Link href="/settings/workspaces/new" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              <Plus />
              {t('new')}
            </Link>
          )
        }
      />
      {full ? <p className="mb-6 rounded-lg bg-warning-soft px-3 py-2 text-sm text-fg">{t('limitReached')}</p> : null}
      <SettingsCard>
        {workspaces.map((w) => (
          <Link key={w.id} href={`/settings/workspaces/${w.slug}`} className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-hover/40">
            <WorkspaceMark ws={w} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-fg">{w.name}</span>
              <span className="block truncate text-xs text-fg-muted">{w.description || `/w/${w.slug}`}</span>
            </span>
            <span className="hidden text-xs text-fg-subtle sm:block">
              {t('summary', { statuses: w.task_statuses?.length || 5, fields: w.task_fields?.length ?? 0 })}
            </span>
            <span className="w-24 text-right text-xs text-fg-muted">{t('members', { count: memberCounts[w.id] ?? 0 })}</span>
            <ChevronRight className="size-4 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </SettingsCard>

      {archived.length ? (
        <SettingsCard title={t('archivedTitle')} description={full ? t('archivedFull') : t('archivedHint')}>
          {archived.map((w) => (
            <div key={w.id} className="flex items-center gap-3 px-5 py-3.5">
              <WorkspaceMark ws={w} size={32} className="opacity-60 grayscale" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg-muted">{w.name}</span>
                <span className="block truncate text-xs text-fg-subtle">{t('archivedOn', { date: shortDate(new Date(w.archived_at!), dateLocale) })}</span>
              </span>
              <span className="hidden w-24 text-right text-xs text-fg-subtle sm:block">{t('members', { count: memberCounts[w.id] ?? 0 })}</span>
              <Button variant="secondary" size="sm" onClick={() => unarchive(w)} loading={restoring === w.id} disabled={full || pending}>
                <ArchiveRestore />
                {t('unarchive')}
              </Button>
            </div>
          ))}
        </SettingsCard>
      ) : null}
    </div>
  )
}

// ---------------- nuevo espacio ----------------

export function NewWorkspace({ usage }: { usage: Usage | null }) {
  const t = useTranslations('settings.workspaces')
  const te = useTranslations('errors')
  const router = useRouter()
  const { account } = useApp()
  const [form, setForm] = useState({ name: '', icon: '', color: 'violet', description: '' })
  const [pending, start] = useTransition()
  const full = usage?.max_workspaces != null && usage.workspaces_count >= usage.max_workspaces

  const create = () =>
    start(async () => {
      const res = await createWorkspace(account.id, { ...form, icon: form.icon.trim() || monogramOf({ name: form.name || 'V' }) })
      if (!res.ok) {
        toast.error(te(res.error))
        return
      }
      toast.success(t('created'))
      if ('slug' in res) router.push(`/settings/workspaces/${res.slug}?tab=statuses`)
      router.refresh()
    })

  return (
    <div>
      <SettingsHeader title={t('newTitle')} description={t('newDescription')} />
      {full ? <p className="mb-6 rounded-lg bg-warning-soft px-3 py-2 text-sm text-fg">{t('limitReached')}</p> : null}
      <IdentityCard form={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} autoFocus />
      <div className="flex justify-end gap-2">
        <Link href="/settings/workspaces" className={buttonVariants({ variant: 'ghost' })}>
          {t('cancel')}
        </Link>
        <Button variant="primary" onClick={create} loading={pending} disabled={full || !form.name.trim()}>
          {t('create')}
        </Button>
      </div>
    </div>
  )
}

// ---------------- un espacio ----------------

const TABS = ['general', 'statuses', 'fields', 'people'] as const
type Tab = (typeof TABS)[number]

export function WorkspaceSettings({ workspace, people, tab }: { workspace: WorkspaceWithRole; people: WorkspacePerson[]; tab: string }) {
  const t = useTranslations('settings.workspaces')
  const active: Tab = TABS.includes(tab as Tab) ? (tab as Tab) : 'general'
  const base = `/settings/workspaces/${workspace.slug}`
  // el contador es el de la lista "Personas con acceso": los admins de la cuenta van aparte
  const peopleCount = people.filter((p) => !p.via_account).length

  return (
    <div>
      <SettingsHeader
        leading={<WorkspaceMark ws={workspace} size={40} />}
        title={workspace.name}
        description={workspace.description || t('noDescription')}
        actions={
          <Link href={`/w/${workspace.slug}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            {t('open')}
            <ArrowUpRight />
          </Link>
        }
      >
        <SettingsTabs
          active={active}
          tabs={[
            { id: 'general', label: t('tabs.general'), href: base },
            { id: 'statuses', label: t('tabs.statuses'), href: `${base}?tab=statuses`, count: workspace.task_statuses?.length || undefined },
            { id: 'fields', label: t('tabs.fields'), href: `${base}?tab=fields`, count: workspace.task_fields?.length || undefined },
            { id: 'people', label: t('tabs.people'), href: `${base}?tab=people`, count: peopleCount || undefined },
          ]}
        />
      </SettingsHeader>

      {active === 'general' ? <GeneralTab key={workspace.id + workspace.name + workspace.color} workspace={workspace} /> : null}
      {active === 'statuses' ? <StatusEditor key={workspace.id} workspace={workspace} /> : null}
      {active === 'fields' ? <FieldsEditor key={workspace.id} workspace={workspace} /> : null}
      {active === 'people' ? <PeopleTab workspace={workspace} people={people} /> : null}
    </div>
  )
}

type Identity = { name: string; icon: string; color: string; description: string }

/** Nombre, monograma, color y descripción: lo mismo al crear y al editar. */
function IdentityCard({ form, onChange, autoFocus }: { form: Identity; onChange: (p: Partial<Identity>) => void; autoFocus?: boolean }) {
  const t = useTranslations('settings.workspaces')
  const monogram = form.icon.trim() || monogramOf({ name: form.name || 'V' })
  return (
    <SettingsCard>
      <SettingsRow label={t('name')} description={t('nameHint')} htmlFor="ws-name">
        <Input id="ws-name" value={form.name} onChange={(e) => onChange({ name: e.target.value })} maxLength={80} autoFocus={autoFocus} className="sm:w-72" />
      </SettingsRow>
      <SettingsRow label={t('icon')} description={t('iconHint')} htmlFor="ws-mono">
        <div className="flex items-center gap-3">
          <WorkspaceMark ws={{ icon: monogram, name: form.name || 'V', color: form.color }} size={36} />
          <Input
            id="ws-mono"
            value={form.icon}
            onChange={(e) => onChange({ icon: e.target.value.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() })}
            placeholder={monogramOf({ name: form.name || 'V' })}
            maxLength={2}
            className="w-20 text-center font-semibold uppercase"
          />
        </div>
      </SettingsRow>
      <SettingsRow label={t('color')} description={t('colorHint')}>
        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          {WORKSPACE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ color: c })}
              aria-label={c}
              aria-pressed={form.color === c}
              className={cn('rounded-[9px] p-0.5 ring-offset-2 ring-offset-panel transition-shadow', form.color === c && 'ring-2 ring-accent')}
            >
              <WorkspaceMark ws={{ icon: monogram, name: form.name || 'V', color: c }} size={26} />
            </button>
          ))}
        </div>
      </SettingsRow>
      <SettingsRow label={t('descriptionLabel')} description={t('descriptionHint')} htmlFor="ws-desc" align="start">
        <Textarea id="ws-desc" value={form.description} onChange={(e) => onChange({ description: e.target.value })} maxLength={300} className="min-h-20 sm:w-72" />
      </SettingsRow>
    </SettingsCard>
  )
}

function GeneralTab({ workspace }: { workspace: WorkspaceWithRole }) {
  const t = useTranslations('settings.workspaces')
  const te = useTranslations('errors')
  const router = useRouter()
  const initial: Identity = { name: workspace.name, icon: monogramOf(workspace), color: workspace.color, description: workspace.description ?? '' }
  const [form, setForm] = useState<Identity>(initial)
  const [pending, start] = useTransition()
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  const save = () =>
    start(async () => {
      const res = await updateWorkspace(workspace.id, { ...form, icon: form.icon.trim() || monogramOf({ name: form.name }) })
      if (!res.ok) {
        toast.error(te(res.error))
        return
      }
      toast.success(t('saved'))
      router.refresh()
    })

  const confirm = useConfirm()
  const tConfirm = useTranslations('confirm')
  // la confirmación, antes de la transición: dentro, el diálogo no se pintaría hasta que terminara
  const archive = async () => {
    if (!(await confirm({ title: t('archiveConfirm', { name: workspace.name }), danger: true, confirmLabel: tConfirm('archive') }))) return
    start(async () => {
      const res = await archiveWorkspace(workspace.id)
      if (res.ok) {
        toast.success(t('archived'))
        router.push('/settings/workspaces')
        router.refresh()
      } else toast.error(te(res.error))
    })
  }

  return (
    <div>
      <IdentityCard form={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} />
      <SettingsCard>
        <SettingsRow label={t('key')} description={t('keyHint', { key: workspace.key })}>
          <span className="rounded-md bg-hover px-2 py-1 font-mono text-sm text-fg">{workspace.key}</span>
        </SettingsRow>
        <SettingsRow label={t('address')} description={t('addressHint')}>
          <span className="truncate font-mono text-xs text-fg-muted">/w/{workspace.slug}</span>
        </SettingsRow>
      </SettingsCard>
      <SettingsCard title={t('dangerTitle')} tone="danger">
        <SettingsRow label={t('archiveTitle')} description={t('archiveHint')}>
          <Button variant="danger-ghost" size="sm" onClick={archive} disabled={pending}>
            <Archive />
            {t('archive')}
          </Button>
        </SettingsRow>
      </SettingsCard>
      <SaveBar dirty={dirty} pending={pending} onSave={save} onDiscard={() => setForm(initial)} disabled={!form.name.trim()} />
    </div>
  )
}

/** Quién tiene acceso a este espacio y con qué rol. Los admins de la cuenta ven todos los espacios. */
function PeopleTab({ workspace, people }: { workspace: WorkspaceWithRole; people: WorkspacePerson[] }) {
  const t = useTranslations('settings.workspaces')
  const tRole = useTranslations('roles')
  const te = useTranslations('errors')
  const tConfirm = useTranslations('confirm')
  const confirm = useConfirm()
  const router = useRouter()
  const qc = useQueryClient()
  const { members, user } = useApp()
  const [pending, start] = useTransition()

  const accountAdmins = people.filter((p) => p.via_account)
  const inside = people.filter((p) => !p.via_account)
  const insideIds = new Set(inside.map((p) => p.id))
  const outside = members.filter((m) => m.role === 'member' && !insideIds.has(m.id))
  const titleOf = (id: string) => members.find((m) => m.id === id)?.title

  // dar o cambiar el rol; quitar pide confirmación (deja de ser responsable de sus tareas abiertas aquí)
  const setAccess = async (person: { id: string; full_name: string }, role: WorkspaceRole | null) => {
    if (!role && !(await confirm({ title: t('removeAccessConfirm', { name: person.full_name }), description: t('removeAccessHint'), danger: true, confirmLabel: tConfirm('remove') }))) return
    start(async () => {
      const res = await setWorkspaceAccess(workspace.id, person.id, role)
      if (res.ok) {
        toast.success(t('accessUpdated'))
        router.refresh()
        // cambia a quién se le pueden asignar tareas en el espacio
        qc.invalidateQueries({ queryKey: ['workspace-members', workspace.id] })
      } else toast.error(te(res.error))
    })
  }

  const roles: WorkspaceRole[] = ['admin', 'editor', 'viewer']

  return (
    <div>
      <SettingsCard
        title={t('peopleTitle')}
        description={t('peopleHint')}
        action={
          <Menu>
            <MenuTrigger render={<Button variant="secondary" size="sm" disabled={pending} />}>
              <UserPlus />
              {t('addPerson')}
            </MenuTrigger>
            <MenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
              {outside.length ? (
                <>
                  <MenuLabel>{t('addPersonHint')}</MenuLabel>
                  {outside.map((m) => (
                    <MenuItem key={m.id} onClick={() => setAccess(m, 'editor')}>
                      <Avatar name={m.full_name} src={m.avatar_url} seed={m.id} size={18} />
                      <span className="truncate">{m.full_name}</span>
                    </MenuItem>
                  ))}
                </>
              ) : (
                <p className="px-2 py-2 text-xs text-fg-muted">{t('nobodyToAdd')}</p>
              )}
              <div className="border-t border-line px-2 pb-1 pt-2">
                <Link href="/settings/members" className="text-xs text-accent-ink hover:underline">
                  {t('inviteNew')}
                </Link>
              </div>
            </MenuContent>
          </Menu>
        }
      >
        {inside.length ? (
          inside.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={m.full_name} src={m.avatar_url} seed={m.id} size={28} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">
                  {m.full_name}
                  {m.id === user.id ? <span className="ml-1.5 text-xs font-normal text-fg-subtle">{t('you')}</span> : null}
                </p>
                <p className="truncate text-xs text-fg-muted">{titleOf(m.id) || m.email}</p>
              </div>
              <Select<WorkspaceRole>
                value={m.role}
                onChange={(r) => setAccess(m, r)}
                disabled={pending}
                aria-label={t('role')}
                options={roles.map((r) => ({ value: r, label: tRole(`ws_${r}`), hint: t(`roleHints.${r}`) }))}
                className="h-8 w-36"
              />
              <Button variant="ghost" size="icon-sm" onClick={() => setAccess(m, null)} disabled={pending} aria-label={t('removeAccess')}>
                <X />
              </Button>
            </div>
          ))
        ) : (
          <p className="px-5 py-4 text-sm text-fg-subtle">{t('noPeople')}</p>
        )}
      </SettingsCard>

      <SettingsCard title={t('adminsTitle')} description={t('adminsHint')}>
        {accountAdmins.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-5 py-3">
            <Avatar name={m.full_name} src={m.avatar_url} seed={m.id} size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg">{m.full_name}</p>
              <p className="truncate text-xs text-fg-muted">{titleOf(m.id) || m.email}</p>
            </div>
            <span className="text-xs text-fg-subtle">{tRole(members.find((x) => x.id === m.id)?.role ?? 'admin')}</span>
          </div>
        ))}
      </SettingsCard>
    </div>
  )
}
