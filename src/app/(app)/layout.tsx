import { requireAppContext } from '@/lib/session'
import { AppProvider } from '@/components/app/app-context'
import { AppShell } from '@/components/app/app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAppContext()
  return (
    <AppProvider value={ctx}>
      <AppShell>{children}</AppShell>
    </AppProvider>
  )
}
