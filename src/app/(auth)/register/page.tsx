import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { AuthScreen } from '@/components/auth/auth-screen'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.tabs')
  return { title: t('register') }
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  return <AuthScreen initialMode="register" next={next} />
}
