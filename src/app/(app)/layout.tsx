import { cookies } from 'next/headers'
import { requireAppContext } from '@/lib/session'
import { AppProvider } from '@/components/app/app-context'
import { AppShell } from '@/components/app/app-shell'
import { SIDEBAR_COOKIE } from '@/lib/constants'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [ctx, jar] = await Promise.all([requireAppContext(), cookies()])
  return (
    <AppProvider value={ctx}>
      <AppShell sidebarCollapsed={jar.get(SIDEBAR_COOKIE)?.value === '1'}>{children}</AppShell>
    </AppProvider>
  )
}
