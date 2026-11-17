import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { NewWorkspacePage as NewWorkspaceView } from '@/components/settings/settings-pages'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings')
  return { title: `${t('workspaces.newTitle')} · ${t('title')}` }
}

export default function NewWorkspacePage() {
  return <NewWorkspaceView />
}
