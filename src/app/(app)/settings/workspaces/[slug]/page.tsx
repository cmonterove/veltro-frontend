import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { requireAppContext } from '@/lib/session'
import { WorkspaceSettingsPage as WorkspaceSettingsView } from '@/components/settings/settings-pages'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const [ctx, t] = await Promise.all([requireAppContext(), getTranslations('settings')])
  const ws = ctx.workspaces.find((w) => w.slug === slug)
  return { title: `${ws?.name ?? t('nav.workspaces')} · ${t('title')}` }
}

export default async function WorkspaceSettingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ slug }, { tab }] = await Promise.all([params, searchParams])
  return <WorkspaceSettingsView slug={slug} tab={tab} />
}
