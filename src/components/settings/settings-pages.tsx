'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useApp, useIsAccountAdmin, useWorkspaceBySlug } from '@/components/app/app-context'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api/client'
import { toDepartment, toMember, toWorkspace } from '@/lib/api/adapters'
import {
  isSuspended,
  toAccountMember,
  toUsage,
  toWorkspacePerson,
  type ApiAccountMember,
  type ApiOrg,
  type ApiWorkspaceMember,
  type ApiWorkspaceWithCounts,
  type Invitation,
} from '@/lib/api/ajustes'
import type { ApiUsage } from '@/lib/api/types'
import { AccountSettings } from './account-settings'
import { MembersSettings } from './members-settings'
import { OrgSettings } from './org-settings'
import { TeamsSettings } from './teams-settings'
import { TemplatesSettings } from './templates-settings'
import { NewWorkspace, WorkspaceSettings, WorkspacesOverview } from './workspaces-settings'

/*
 * Ajustes sin esperar al servidor: cada pantalla toma la cuenta del contexto que ya tiene el
 * navegador y pide sus datos con caché (volver a una pantalla es instantáneo). Antes cada página
 * pedía el contexto completo a la API y después sus datos, uno detrás del otro: 3 a 5 s por clic.
 */

/**
 * Datos de una pantalla de Ajustes. Las pantallas, al guardar, llaman a `router.refresh()`: el
 * contexto de la app vuelve como un objeto nuevo y con él se vuelven a pedir estos datos.
 */
function useSettingsData<T>(key: string[], path: string, query?: Record<string, string>, enabled = true) {
  const app = useApp()
  const q = useQuery({
    queryKey: ['settings', app.account.id, ...key],
    queryFn: () => api<T>(path, { query }),
    enabled,
  })
  const seen = useRef(app)
  const { refetch } = q
  useEffect(() => {
    if (seen.current === app) return
    seen.current = app
    if (enabled) void refetch()
  }, [app, enabled, refetch])
  return q
}

function useUsage(enabled = true) {
  const { account } = useApp()
  return useSettingsData<ApiUsage>(['usage'], `/v1/accounts/${account.id}/usage`, undefined, enabled)
}

/** Solo admins: a los demás se los lleva a su perfil (como hacía el servidor). */
function useAdminOnly() {
  const admin = useIsAccountAdmin()
  const router = useRouter()
  useEffect(() => {
    if (!admin) router.replace('/settings/profile')
  }, [admin, router])
  return admin
}

/** Con la cuenta o la persona suspendida, el shell muestra el aviso en lugar de la página. */
function useSuspended() {
  return isSuspended(useApp())
}

export function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy>
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-80" />
      <Skeleton className="mt-4 h-12" />
      <Skeleton className="h-12" />
      <Skeleton className="h-12" />
    </div>
  )
}

export function AccountSettingsPage() {
  const suspended = useSuspended()
  const usage = useUsage(!suspended)
  if (suspended) return null
  if (!usage.data) return <SettingsSkeleton />
  return <AccountSettings usage={toUsage(usage.data)} />
}

export function MembersSettingsPage() {
  const { account } = useApp()
  const admin = useAdminOnly()
  const suspended = useSuspended()
  const on = admin && !suspended
  const members = useSettingsData<{ items: ApiAccountMember[] }>(['members'], `/v1/accounts/${account.id}/members`, undefined, on)
  const usage = useUsage(on)
  // sin permiso (o sin la API nueva) la lista de invitaciones queda vacía
  const invites = useSettingsData<{ items: Invitation[] }>(['invitations'], `/v1/accounts/${account.id}/invitations`, undefined, on)
  if (!on) return null
  if (!members.data || !usage.data || invites.isLoading) return <SettingsSkeleton />
  return <MembersSettings members={members.data.items.map(toAccountMember)} usage={toUsage(usage.data)} invitations={invites.data?.items ?? []} />
}

export function OrgSettingsPage() {
  const { account } = useApp()
  const suspended = useSuspended()
  const org = useSettingsData<ApiOrg>(['org'], `/v1/accounts/${account.id}/org`, undefined, !suspended)
  const members = useMemo(() => org.data?.members.map(toMember).sort((a, b) => a.full_name.localeCompare(b.full_name)), [org.data])
  const departments = useMemo(() => org.data?.departments.map(toDepartment), [org.data])
  if (suspended) return null
  if (!members || !departments) return <SettingsSkeleton />
  return <OrgSettings members={members} departments={departments} />
}

export function TeamsSettingsPage() {
  const admin = useIsAccountAdmin()
  if (useSuspended()) return null
  return <TeamsSettings admin={admin} />
}

export function TemplatesSettingsPage() {
  if (useSuspended()) return null
  return <TemplatesSettings />
}

export function WorkspacesOverviewPage({ edit }: { edit?: string }) {
  const { account, workspaces } = useApp()
  const router = useRouter()
  const admin = useAdminOnly()
  const suspended = useSuspended()
  // enlace de antes: ?edit=<id>
  const editing = edit ? workspaces.find((w) => w.id === edit) : undefined
  useEffect(() => {
    if (editing) router.replace(`/settings/workspaces/${editing.slug}`)
  }, [editing, router])
  const on = admin && !suspended && !editing
  const list = useSettingsData<{ items: ApiWorkspaceWithCounts[] }>(['workspaces'], '/v1/workspaces', { accountId: account.id, archived: 'all' }, on)
  const usage = useUsage(on)
  if (!on) return null
  if (!list.data || !usage.data) return <SettingsSkeleton />
  const items = list.data.items
  return (
    <WorkspacesOverview
      active={items.filter((w) => !w.archivedAt).map((w) => toWorkspace(w))}
      archived={items.filter((w) => w.archivedAt).map((w) => toWorkspace(w))}
      memberCounts={Object.fromEntries(items.map((w) => [w.id, w.counts.members]))}
      usage={toUsage(usage.data)}
    />
  )
}

export function NewWorkspacePage() {
  const admin = useAdminOnly()
  const suspended = useSuspended()
  const usage = useUsage(admin && !suspended)
  if (!admin || suspended) return null
  if (!usage.data) return <SettingsSkeleton />
  return <NewWorkspace usage={toUsage(usage.data)} />
}

export function WorkspaceSettingsPage({ slug, tab }: { slug: string; tab?: string }) {
  const admin = useAdminOnly()
  const suspended = useSuspended()
  // archivado (o de otra cuenta): no está en el contexto; se desarchiva desde la lista de espacios
  const workspace = useWorkspaceBySlug(slug)
  const router = useRouter()
  useEffect(() => {
    if (admin && !workspace) router.replace('/settings/workspaces')
  }, [admin, workspace, router])
  const on = admin && !suspended && Boolean(workspace)
  const people = useSettingsData<{ items: ApiWorkspaceMember[] }>(['workspace-members', workspace?.id ?? ''], `/v1/workspaces/${workspace?.id}/members`, undefined, on)
  if (!on || !workspace) return null
  if (!people.data) return <SettingsSkeleton />
  return <WorkspaceSettings workspace={workspace} people={people.data.items.map(toWorkspacePerson)} tab={tab ?? 'general'} />
}
