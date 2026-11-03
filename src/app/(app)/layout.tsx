import { cookies } from 'next/headers'
import { requireAppContext } from '@/lib/session'
import { AppProvider } from '@/components/app/app-context'
import { AppShell } from '@/components/app/app-shell'
import { UserSuspendedScreen } from '@/components/app/suspended-notice'
import { SIDEBAR_COOKIE } from '@/lib/constants'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [ctx, jar] = await Promise.all([requireAppContext(), cookies()])
  // persona suspendida: la API le responde 403 a todo, así que en lugar de la app va el aviso
  if (ctx.profile.suspended_at) return <UserSuspendedScreen email={ctx.profile.email} />
  return (
    <AppProvider value={ctx}>
      <AppShell sidebarCollapsed={jar.get(SIDEBAR_COOKIE)?.value === '1'}>{children}</AppShell>
    </AppProvider>
  )
}
