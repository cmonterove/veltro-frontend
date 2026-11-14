import { redirect } from 'next/navigation'
import { DEMO_DATA_AVAILABLE, getAppContext } from '@/lib/session'
import { OnboardingForm } from '@/components/auth/onboarding-form'
import { Logo } from '@/components/app/logo'
import { DemoDataStart } from '@/components/app/demo-data'

export default async function OnboardingPage() {
  const res = await getAppContext()
  if (res.status === 'anonymous') redirect('/login')
  if (res.status === 'ready') redirect('/home')

  return (
    <div className="flex min-h-dvh flex-col px-6 py-6 sm:px-10">
      <Logo />
      <main className="flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-md">
          <OnboardingForm firstName={res.profile.full_name.split(' ')[0]} />
          {DEMO_DATA_AVAILABLE ? (
            <div className="mt-6">
              <DemoDataStart />
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
