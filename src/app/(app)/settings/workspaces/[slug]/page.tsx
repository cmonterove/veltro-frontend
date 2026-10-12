import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAppContext, isAccountAdmin } from '@/lib/session'
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
  const workspace = ctx.workspaces.find((w) => w.slug === slug)
  if (!workspace) notFound()
  // todos los accesos de la cuenta: cambiar el de una persona aquí guarda su lista completa de espacios
  const supabase = await createClient()
  const { data: rows } = await supabase.from('workspace_members').select('workspace_id, user_id, role').in('workspace_id', ctx.workspaces.map((w) => w.id))
  return <WorkspaceSettings workspace={workspace} assignments={rows ?? []} tab={tab ?? 'general'} />
}
