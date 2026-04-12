import { Sidebar } from '@/components/layout/sidebar'
import { SidebarProvider } from '@/components/layout/sidebar-provider'
import { Topbar } from '@/components/layout/topbar'
import { createClient } from '@/lib/supabase/server'
import type { CompanyData, OrgData, ProfileData } from '@/lib/types/layout'
import { redirect } from 'next/navigation'

type CompanyRow = Pick<CompanyData, 'id' | 'name' | 'slug' | 'logo_url'>

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      `
      id, full_name, avatar_url, role, locale,
      organizations ( id, name, slug, logo_url )
    `
    )
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const { data: assignments } = await supabase
    .from('user_company_assignments')
    .select(
      `
      role_in_company,
      companies ( id, name, slug, logo_url )
    `
    )
    .eq('user_id', user.id)

  const companies: CompanyData[] = (assignments ?? [])
    .map((a) => {
      const c = a.companies as CompanyRow | null
      if (!c?.id) return null
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        logo_url: c.logo_url,
        role: a.role_in_company as string,
      }
    })
    .filter((x): x is CompanyData => x !== null)
    .sort((a, b) => a.name.localeCompare(b.name))

  const orgRaw = profile.organizations
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as OrgData | null
  if (!org?.id) redirect('/login')

  const profileData: ProfileData = {
    id: profile.id,
    full_name: profile.full_name,
    avatar_url: profile.avatar_url,
    role: profile.role,
    locale: profile.locale,
  }

  return (
    <SidebarProvider>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        <Topbar profile={profileData} org={org} />
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Sidebar profile={profileData} org={org} companies={companies} />
          <main
            style={{
              flex: 1,
              overflow: 'auto',
              background: 'var(--bg-sunken)',
            }}
          >
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
