import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { requireAppContext, isAccountAdmin } from '@/lib/session'
import { api } from '@/lib/api/server'
import { isSuspended, toWorkspacePerson, type ApiWorkspaceMember } from '@/lib/api/ajustes'
import { WorkspaceSettings } from '@/components/settings/workspaces-settings'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const [ctx, t] = await Promise.all([requireAppContext(), getTranslations('settings')])
  const ws = ctx.workspaces.find((w) => w.slug === slug)
  return { title: `${ws?.name ?? t('nav.workspaces')} · ${t('title')}` }
}

export default async function WorkspaceSettingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ slug }, { tab }, ctx] = await Promise.all([params, searchParams, requireAppContext()])
  if (!isAccountAdmin(ctx.accountRole)) redirect('/settings/profile')
  if (isSuspended(ctx)) return null
  const workspace = ctx.workspaces.find((w) => w.slug === slug)
  // archivado (o de otra cuenta): se desarchiva desde la lista de espacios
  if (!workspace) notFound()
  const { items } = await api<{ items: ApiWorkspaceMember[] }>(`/v1/workspaces/${workspace.id}/members`)
  return <WorkspaceSettings workspace={workspace} people={items.map(toWorkspacePerson)} tab={tab ?? 'general'} />
}
