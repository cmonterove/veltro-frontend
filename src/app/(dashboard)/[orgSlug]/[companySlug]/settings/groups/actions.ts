'use server'

import { createClient } from '@/lib/supabase/server'
import type { CompanyGroup, CompanyGroupMember } from '@/lib/types'

export async function getCompanyGroups(companyId: string): Promise<CompanyGroup[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('company_groups')
    .select(
      `
      id, company_id, name, color, description, created_by, created_at, updated_at,
      company_group_members (
        id, company_group_id, user_id, role, created_at,
        profiles ( id, full_name, avatar_url, email )
      )
    `
    )
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)

  return (data ?? []).map((g) => ({
    id: g.id,
    company_id: g.company_id,
    name: g.name,
    color: g.color,
    description: g.description ?? undefined,
    created_by: g.created_by ?? undefined,
    created_at: g.created_at,
    updated_at: g.updated_at,
    members: ((g.company_group_members as unknown as Array<{
      id: string
      company_group_id: string
      user_id: string
      role: string
      created_at: string
      profiles: { id: string; full_name: string; avatar_url: string | null; email: string } | null
    }>) ?? []).map((m) => ({
      id: m.id,
      company_group_id: m.company_group_id,
      user_id: m.user_id,
      role: m.role as 'lead' | 'member',
      created_at: m.created_at,
      profile: m.profiles
        ? {
            id: m.profiles.id,
            full_name: m.profiles.full_name,
            avatar_url: m.profiles.avatar_url ?? undefined,
            email: m.profiles.email,
          }
        : undefined,
    })) as CompanyGroupMember[],
  }))
}

export async function createCompanyGroup(
  companyId: string,
  name: string,
  color: string,
  description?: string
): Promise<CompanyGroup> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data, error } = await supabase
    .from('company_groups')
    .insert({
      company_id: companyId,
      name: name.trim(),
      color,
      description: description?.trim() || null,
      created_by: user.id,
    })
    .select()
    .single()

  // TODO: If this INSERT fails with RLS error, create a SECURITY DEFINER function
  // public.create_company_group(p_company_id, p_name, p_color, p_description, p_created_by)
  // and call via supabase.rpc('create_company_group', {...}) — see supabase/migrations/003_sprint2_rpc.sql
  if (error) throw new Error(error.message)

  return {
    id: data.id,
    company_id: data.company_id,
    name: data.name,
    color: data.color,
    description: data.description ?? undefined,
    created_by: data.created_by ?? undefined,
    created_at: data.created_at,
    updated_at: data.updated_at,
    members: [],
  }
}

export async function updateCompanyGroup(
  groupId: string,
  data: { name?: string; color?: string; description?: string }
): Promise<void> {
  const supabase = await createClient()
  const update: Record<string, unknown> = {}
  if (data.name !== undefined) update.name = data.name.trim()
  if (data.color !== undefined) update.color = data.color
  if (data.description !== undefined) update.description = data.description.trim() || null
  update.updated_at = new Date().toISOString()

  const { error } = await supabase.from('company_groups').update(update).eq('id', groupId)
  if (error) throw new Error(error.message)
}

export async function deleteCompanyGroup(groupId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('company_groups').delete().eq('id', groupId)
  if (error) throw new Error(error.message)
}

export async function addMemberToGroup(
  groupId: string,
  userId: string,
  role: 'lead' | 'member'
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('company_group_members')
    .upsert({ company_group_id: groupId, user_id: userId, role }, { onConflict: 'company_group_id,user_id' })

  // TODO: If this fails with RLS, apply SECURITY DEFINER pattern:
  // create function public.add_member_to_group(p_group_id, p_user_id, p_role) + GRANT to authenticated
  if (error) throw new Error(error.message)
}

export async function removeMemberFromGroup(groupId: string, userId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('company_group_members')
    .delete()
    .eq('company_group_id', groupId)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}
