import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getOrgMembers, getPendingInvitations } from './actions'
import { MembersPage } from '@/components/settings/members-page'

interface Props {
  params: { orgSlug: string }
}

export default async function SettingsMembersPage({ params }: Props) {
  const { orgSlug } = params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, organization_id, organizations ( id, name )')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const orgRaw = profile.organizations
  const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as { id: string; name: string } | null
  if (!org) redirect('/login')

  // Fetch company list for the invite modal
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, slug')
    .eq('org_id', org.id)
    .order('name')

  const [members, invitations] = await Promise.all([
    getOrgMembers(org.id).catch(() => []),
    getPendingInvitations(org.id).catch(() => []),
  ])

  return (
    <MembersPage
      organizationId={org.id}
      orgSlug={orgSlug}
      currentUserRole={profile.role}
      members={members}
      invitations={invitations}
      companies={companies ?? []}
    />
  )
}
