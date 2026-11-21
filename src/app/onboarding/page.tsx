import { redirect } from 'next/navigation'
import { DEMO_DATA_AVAILABLE, getAppContext } from '@/lib/session'
import { OnboardingScreen } from '@/components/auth/onboarding-form'
import { DemoDataStart } from '@/components/app/demo-data'

export default async function OnboardingPage() {
  const res = await getAppContext()
  if (res.status === 'anonymous') redirect('/auth/expired')
  if (res.status === 'ready') redirect('/home')

  return <OnboardingScreen firstName={res.profile.full_name.split(' ')[0]} demo={DEMO_DATA_AVAILABLE ? <DemoDataStart /> : null} />
}
