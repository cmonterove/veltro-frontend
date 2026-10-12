import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { VaultView } from '@/components/vault/vault-view'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('vault') }
}

export default function VaultPage() {
  return <VaultView />
}
