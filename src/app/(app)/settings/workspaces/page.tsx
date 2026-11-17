import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { WorkspacesOverviewPage } from '@/components/settings/settings-pages'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('nav.workspaces')} · ${t('title')}` }
}

export default async function WorkspacesSettingsPage({ searchParams }: { searchParams: Promise<{ new?: string; edit?: string }> }) {
  // enlaces de antes: ?new=1 y ?edit=<id>
  const { new: isNew, edit } = await searchParams
  if (isNew === '1') redirect('/settings/workspaces/new')
  return <WorkspacesOverviewPage edit={edit} />
}
