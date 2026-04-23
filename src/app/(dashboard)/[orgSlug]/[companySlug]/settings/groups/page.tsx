import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCompanyGroups } from './actions'
import { CompanyGroupsPage } from '@/components/settings/company-groups-page'

interface Props {
  params: { orgSlug: string; companySlug: string }
}

export default async function SettingsGroupsPage({ params }: Props) {
  const { orgSlug, companySlug } = params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('slug', companySlug)
    .single()

  if (!company) redirect(`/${orgSlug}`)

  // Fetch company users for the "add member" dropdown
  const { data: assignments } = await supabase
    .from('user_company_assignments')
    .select('user_id, profiles ( id, full_name, avatar_url, email )')
    .eq('company_id', company.id)

  const companyUsers = (assignments ?? [])
    .map((a) => {
      const p = a.profiles as { id: string; full_name: string; avatar_url: string | null; email: string } | null
      if (!p) return null
      return { id: p.id, full_name: p.full_name, avatar_url: p.avatar_url, email: p.email }
    })
    .filter((u): u is NonNullable<typeof u> => u !== null)

  const groups = await getCompanyGroups(company.id).catch(() => [])

  return (
    <CompanyGroupsPage
      companyId={company.id}
      companyName={company.name}
      orgSlug={orgSlug}
      companySlug={companySlug}
      initialGroups={groups}
      companyUsers={companyUsers}
    />
  )
}
