'use server'

import type { Database } from '@/lib/supabase/types'
import { toSlug } from '@/lib/utils/slug'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

export async function register(_: unknown, formData: FormData) {
  const supabase = await createClient()

  const orgName = formData.get('org') as string
  const fullName = formData.get('fullName') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!orgName || !fullName || !email || !password) {
    return { error: 'All fields are required' }
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters' }
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return { error: 'Server misconfiguration: missing SUPABASE_SERVICE_ROLE_KEY' }
  }

  const adminClient = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: org, error: orgError } = await adminClient
    .from('organizations')
    .insert({ name: orgName, slug: toSlug(orgName), plan: 'free' })
    .select()
    .single()

  let orgId: string

  if (orgError) {
    const { data: org2, error: org2Error } = await adminClient
      .from('organizations')
      .insert({
        name: orgName,
        slug: `${toSlug(orgName)}-${Math.random().toString(36).slice(2, 6)}`,
        plan: 'free',
      })
      .select()
      .single()
    if (org2Error || !org2) return { error: 'Could not create organization. Try again.' }
    orgId = org2.id
  } else {
    if (!org) return { error: 'Could not create organization. Try again.' }
    orgId = org.id
  }

  const { data: company, error: companyError } = await adminClient
    .from('companies')
    .insert({ org_id: orgId, name: orgName, slug: toSlug(orgName) })
    .select()
    .single()

  if (companyError || !company) {
    return { error: 'Could not create default company.' }
  }

  const { data: authUser, error: signUpError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      org_id: orgId,
      role: 'org_owner',
    },
  })

  if (signUpError) {
    return { error: signUpError.message }
  }

  if (!authUser.user) {
    return { error: 'Could not create user.' }
  }

  await adminClient.from('user_company_assignments').insert({
    user_id: authUser.user.id,
    company_id: company.id,
    role_in_company: 'company_admin',
  })

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
  if (signInError) {
    redirect('/login')
  }

  redirect('/dashboard')
}
