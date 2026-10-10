import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { AuthScreen } from '@/components/auth/auth-screen'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.tabs')
  return { title: t('login') }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams
  return <AuthScreen initialMode="login" next={next} linkError={error === 'link_expired'} />
}
