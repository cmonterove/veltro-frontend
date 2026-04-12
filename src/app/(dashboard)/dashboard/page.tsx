import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function DashboardRootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, organizations(slug)')
    .eq('id', user.id)
    .single()

  const { data: assignment } = await supabase
    .from('user_company_assignments')
    .select('companies(slug)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  const orgSlug = (profile?.organizations as { slug: string } | null)?.slug
  const companySlug = (assignment?.companies as { slug: string } | null)?.slug

  if (orgSlug && companySlug) {
    redirect(`/${orgSlug}/${companySlug}/boards`)
  }

  redirect('/home')
}
