import { BoardsPageClient } from './boards-page-client'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

interface Props {
  params: { orgSlug: string; companySlug: string }
  searchParams: { new?: string | string[] }
}

export default async function BoardsPage({ params, searchParams }: Props) {
  const { orgSlug, companySlug } = params
  const rawNew = searchParams.new
  const isNew = Array.isArray(rawNew) ? rawNew[0] : rawNew

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get company by slug
  const { data: company } = await supabase
    .from('companies')
    .select('id, name, slug')
    .eq('slug', companySlug)
    .single()

  if (!company) redirect('/home')

  // Get boards this user can access in this company
  const { data: boards } = await supabase
    .from('boards')
    .select('id, name, color, icon, description, visibility, owner_id, created_at')
    .eq('company_id', company.id)
    .order('created_at', { ascending: false })

  return (
    <BoardsPageClient
      orgSlug={orgSlug}
      companySlug={companySlug}
      companyId={company.id}
      companyName={company.name}
      boards={boards ?? []}
      openCreateModal={isNew === '1'}
    />
  )
}
