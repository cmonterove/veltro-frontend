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
import { Field, Input, Textarea } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import { Select } from '@/components/ui/select'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '@/components/ui/menu'
import { updateWorkspace, archiveWorkspace, unarchiveWorkspace, setWorkspaceAccess } from '@/app/actions/settings'
import { WORKSPACE_COLORS } from '@/lib/constants'
import { WorkspaceMark, monogramOf } from '@/components/app/marks'
import { LogoField } from '@/components/app/logo-picker'
import { cn } from '@/lib/utils'
import { shortDate, useDateLocale } from '@/lib/dates'
import type { WorkspaceRole } from '@/lib/database.types'
import type { WorkspaceWithRole } from '@/lib/types'
import { SaveBar, SettingsCard, SettingsHeader, SideSection, SplitPanel } from './ui'
import { StatusEditor } from './status-editor'
import { FieldsEditor } from './fields-editor'
import { useConfirm } from '@/components/ui/confirm'
import type { Usage, WorkspacePerson } from '@/lib/api/ajustes'
import { CoverBackdrop } from '@/components/app/cover'

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

// ---------------- un espacio ----------------

const TABS = ['general', 'statuses', 'fields', 'people'] as const
type Tab = (typeof TABS)[number]

export function WorkspaceSettings({ workspace, people, tab }: { workspace: WorkspaceWithRole; people: WorkspacePerson[]; tab: string }) {
  const t = useTranslations('settings.workspaces')
  const ts = useTranslations('settings')
  const active: Tab = TABS.includes(tab as Tab) ? (tab as Tab) : 'general'
  const base = `/settings/workspaces/${workspace.slug}`
  // el contador es el de la lista "Personas con acceso": los admins de la cuenta van aparte
  const peopleCount = people.filter((p) => !p.via_account).length

  const tabs = [
    { id: 'general' as const, label: t('tabs.general'), href: base, count: undefined },
    { id: 'statuses' as const, label: t('tabs.statuses'), href: `${base}?tab=statuses`, count: workspace.task_statuses?.length || undefined },
    { id: 'fields' as const, label: t('tabs.fields'), href: `${base}?tab=fields`, count: workspace.task_fields?.length || undefined },
    { id: 'people' as const, label: t('tabs.people'), href: `${base}?tab=people`, count: peopleCount || undefined },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* el espacio sobre la portada ciruela (su color va en su marca), compacto y con sus pestañas adentro: el
          alto queda para el panel, que se monta sobre el borde de abajo de la portada */}
      <header className="on-frame relative mb-4 flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3">
        <CoverBackdrop className="-inset-x-2.5 -top-4 -bottom-[76px] sm:-inset-x-5 sm:-top-5" />
        <WorkspaceMark ws={workspace} size={40} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold leading-tight tracking-[-0.015em] text-fg">{workspace.name}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
            <span className="rounded bg-fg/[0.07] px-1.5 font-mono text-fg">{workspace.key}</span>
            <span aria-hidden>·</span>
            <span className="font-mono">/w/{workspace.slug}</span>
            <span aria-hidden>·</span>
            <span>{t('peopleCount', { count: peopleCount })}</span>
          </p>
        </div>
        <nav className="flex gap-1 rounded-xl bg-panel/70 p-1 ring-1 ring-line-soft max-sm:max-w-full max-sm:overflow-x-auto scrollbar-none" aria-label={ts('tabs')}>
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={tab.href}
              scroll={false}
              aria-current={tab.id === active ? 'page' : undefined}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid',
                tab.id === active ? 'bg-panel font-medium text-fg shadow-card' : 'text-fg-muted hover:text-fg',
              )}
            >
              {tab.label}
              {tab.count ? <span className="rounded-full bg-hover px-1.5 text-2xs tabular-nums text-fg-muted">{tab.count}</span> : null}
            </Link>
          ))}
        </nav>
        <Link href={`/w/${workspace.slug}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          {t('open')}
          <ArrowUpRight />
        </Link>
      </header>

      {active === 'general' ? <GeneralTab key={workspace.id + workspace.name + workspace.color} workspace={workspace} /> : null}
      {active === 'statuses' ? <StatusEditor key={workspace.id} workspace={workspace} /> : null}
      {active === 'fields' ? <FieldsEditor key={workspace.id} workspace={workspace} /> : null}
      {active === 'people' ? <PeopleTab workspace={workspace} people={people} /> : null}
    </div>
  )
}

type Identity = { name: string; icon: string; color: string; description: string }

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

  const monogram = form.icon.trim() || monogramOf({ name: form.name || 'V' })
  const live = { icon: monogram, name: form.name || workspace.name, color: form.color }
  // la vista previa con el logo, si tiene (las baldosas de color siguen mostrando el monograma)
  const withLogo = { ...live, id: workspace.id, logo_updated_at: workspace.logo_updated_at }

  return (
    <SplitPanel
      main={
        <div className={cn('flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-5 scrollbar-thin sm:p-6', dirty && 'pb-20 sm:pb-20')}>
          <Field label={t('name')} hint={t('nameHint')} htmlFor="ws-name">
            <Input id="ws-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={80} />
          </Field>
          {/* la marca del espacio: el logo del cliente o del proyecto y, si no hay, el monograma sobre su color */}
          <div>
            <p className="text-sm font-medium text-fg">{t('mark')}</p>
            <div className="mt-2">
              <LogoField
                kind="workspace"
                id={workspace.id}
                hasLogo={!!workspace.logo_updated_at}
                size={56}
                radius={16}
                extra={
                  <label className="ml-1 flex items-center gap-2 text-xs text-fg-muted">
                    {t('monogramOr')}
                    <Input
                      id="ws-mono"
                      value={form.icon}
                      onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() }))}
                      placeholder={monogramOf({ name: form.name || 'V' })}
                      maxLength={2}
                      aria-label={t('icon')}
                      title={t('iconHint')}
                      className="h-7 w-12 px-1 text-center text-sm font-semibold uppercase"
                    />
                  </label>
                }
              >
                <WorkspaceMark ws={withLogo} size={56} />
              </LogoField>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-fg">{t('color')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {WORKSPACE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  aria-label={c}
                  aria-pressed={form.color === c}
                  className={cn(
                    'rounded-[13px] p-1 ring-offset-2 ring-offset-panel transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-accent-mid',
                    form.color === c && 'ring-2 ring-accent',
                  )}
                >
                  <WorkspaceMark ws={{ ...live, color: c }} size={36} />
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-fg-muted">{t('colorHint')}</p>
          </div>
          {/* la descripción crece hasta abajo: el panel queda lleno sin cajas vacías */}
          <div className="flex min-h-36 flex-1 flex-col gap-1.5">
            <label htmlFor="ws-desc" className="text-sm font-medium text-fg">
              {t('descriptionLabel')}
            </label>
            <Textarea
              id="ws-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              maxLength={300}
              placeholder={t('descriptionHint')}
              className="min-h-24 flex-1 resize-none"
            />
          </div>
          <SaveBar floating dirty={dirty} pending={pending} onSave={save} onDiscard={() => setForm(initial)} disabled={!form.name.trim()} />
        </div>
      }
      side={
        <>
          <SideSection title={t('previewTitle')}>
            <p className="text-2xs font-medium text-fg-subtle">{t('previewSidebar')}</p>
            <div className="mt-1.5 flex items-center gap-2.5 rounded-xl bg-panel px-3 py-2.5 shadow-card ring-1 ring-line-soft">
              <WorkspaceMark ws={withLogo} size={22} />
              <span className="truncate text-sm font-medium text-fg">{live.name}</span>
            </div>
            <p className="mt-3 text-2xs font-medium text-fg-subtle">{t('previewTask')}</p>
            <div className="mt-1.5 flex items-center gap-2.5 rounded-xl bg-panel px-3 py-2.5 shadow-card ring-1 ring-line-soft">
              <span className="size-3.5 shrink-0 rounded-full border-2 border-line-strong" aria-hidden />
              <span className="shrink-0 font-mono text-xs text-fg-subtle">{workspace.key}-12</span>
              <span className="truncate text-sm text-fg">{t('previewTaskSample')}</span>
              <span className="ml-auto shrink-0">
                <WorkspaceMark ws={withLogo} size={16} />
              </span>
            </div>
          </SideSection>
          <SideSection title={t('dataTitle')}>
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="flex items-center justify-between gap-3 text-fg">
                  {t('key')}
                  <span className="rounded-md bg-panel px-2 py-0.5 font-mono text-xs text-fg ring-1 ring-line-soft">{workspace.key}</span>
                </dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-fg-muted">{t('keyHint', { key: workspace.key })}</dd>
              </div>
              <div>
                <dt className="flex items-center justify-between gap-3 text-fg">
                  {t('address')}
                  <span className="truncate font-mono text-xs text-fg-muted">/w/{workspace.slug}</span>
                </dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-fg-muted">{t('addressHint')}</dd>
              </div>
            </dl>
          </SideSection>
          {/* archivar, abajo y en voz baja: se usa poco y no debe competir */}
          <SideSection className="mt-auto">
            <div className="flex items-start gap-3">
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-fg-muted">{t('archiveHint')}</p>
              <Button variant="danger-ghost" size="sm" onClick={archive} disabled={pending}>
                <Archive />
                {t('archive')}
              </Button>
            </div>
          </SideSection>
        </>
      }
    />
  )
}

/**
 * Quién tiene acceso a este espacio y con qué rol (izquierda) y, al lado, los admins de la cuenta (ven
 * todos los espacios) y qué puede hacer cada rol. Una sola superficie que llena la pantalla.
 */
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
  const outside = members.filter((m) => (m.role === 'member' || m.role === 'guest') && !insideIds.has(m.id))
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
  const addMenu = (primary?: boolean) => (
    <Menu>
      <MenuTrigger render={<Button variant={primary ? 'primary' : 'secondary'} size="sm" disabled={pending} />}>
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
  )

  return (
    <SplitPanel
      main={
        <>
          <div className="flex shrink-0 items-center gap-3 border-b border-line-soft px-5 py-3">
            <div className="min-w-0 flex-1">
              <h2 className="flex items-baseline gap-2 text-sm font-semibold text-fg">
                {t('peopleTitle')}
                <span className="text-xs font-normal tabular-nums text-fg-subtle">{inside.length}</span>
              </h2>
              <p className="truncate text-xs text-fg-muted">{t('peopleHint')}</p>
            </div>
            {inside.length ? addMenu() : null}
          </div>
          {inside.length ? (
            <ul className="min-h-0 flex-1 divide-y divide-line-soft overflow-y-auto scrollbar-thin">
              {inside.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-hover/40">
                  <Avatar name={m.full_name} src={m.avatar_url} seed={m.id} size={32} />
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
                </li>
              ))}
            </ul>
          ) : (
            // nadie con acceso propio: el panel enseña quién lo ve hoy y cómo sumar a alguien
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <span className="flex -space-x-2" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="flex size-10 items-center justify-center rounded-full border border-dashed border-line-strong bg-canvas text-fg-subtle ring-4 ring-panel">
                    {i === 1 ? <UserPlus className="size-4" /> : null}
                  </span>
                ))}
              </span>
              <p className="mt-4 text-sm font-semibold text-fg">{t('noPeopleTitle')}</p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-fg-muted">{t('noPeopleHint')}</p>
              <div className="mt-4">{addMenu(true)}</div>
            </div>
          )}
        </>
      }
      side={
        <>
          <SideSection title={t('adminsTitle')}>
            <p className="-mt-1.5 mb-3 text-xs leading-relaxed text-fg-muted">{t('adminsHint')}</p>
            <ul className="flex flex-col gap-2">
              {accountAdmins.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5">
                  <Avatar name={m.full_name} src={m.avatar_url} seed={m.id} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">{m.full_name}</span>
                    <span className="block truncate text-xs text-fg-subtle">{titleOf(m.id) || m.email}</span>
                  </span>
                  <span className="text-xs text-fg-subtle">{tRole(members.find((x) => x.id === m.id)?.role ?? 'admin')}</span>
                </li>
              ))}
            </ul>
          </SideSection>
          <SideSection title={t('rolesTitle')}>
            <ul className="flex flex-col gap-3">
              {roles.map((r) => (
                <li key={r} className="flex gap-3">
                  <span className="mt-0.5 rounded-md bg-panel px-1.5 py-0.5 text-2xs font-medium text-fg ring-1 ring-line-soft">{tRole(`ws_${r}`)}</span>
                  <span className="text-xs leading-relaxed text-fg-muted">{t(`roleHints.${r}`)}</span>
                </li>
              ))}
            </ul>
          </SideSection>
        </>
      }
    />
  )
}
