'use server'

import { createClient } from '@/lib/supabase/server'
import type { Invitation } from '@/lib/types'
import { Resend } from 'resend'

// ── Members ────────────────────────────────────────────────────────────────

export interface OrgMember {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
  role: string
  created_at: string
}

export async function getOrgMembers(organizationId: string): Promise<OrgMember[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url, role, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    avatar_url: p.avatar_url,
    role: p.role,
    created_at: p.created_at,
  }))
}

export async function updateMemberRole(
  userId: string,
  organizationId: string,
  role: string
): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Verify current user is org_owner
  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (currentProfile?.role !== 'org_owner') throw new Error('Only org owners can change roles')

  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId)
    .eq('organization_id', organizationId)

  if (error) throw new Error(error.message)
}

export async function removeMemberFromOrg(userId: string, organizationId: string): Promise<void> {
  const supabase = await createClient()
  // Remove company assignments first (FK constraint)
  await supabase.from('user_company_assignments').delete().eq('user_id', userId)
  // Remove from org (soft-delete not available — hard delete of profile row)
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId)
    .eq('organization_id', organizationId)
  if (error) throw new Error(error.message)
}

// ── Invitations ────────────────────────────────────────────────────────────

export async function sendInvitation(
  organizationId: string,
  email: string,
  role: string,
  companyId?: string
): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // 1. Check for existing pending invitation
  const { data: existing } = await supabase
    .from('invitations')
    .select('id, accepted_at, expires_at')
    .eq('organization_id', organizationId)
    .eq('email', email.toLowerCase().trim())
    .is('accepted_at', null)
    .maybeSingle()

  if (existing) {
    const notExpired = new Date(existing.expires_at) > new Date()
    if (notExpired) throw new Error('A pending invitation already exists for this email')
  }

  // 2. Insert invitation
  const { data: invitation, error } = await supabase
    .from('invitations')
    .insert({
      organization_id: organizationId,
      company_id: companyId ?? null,
      email: email.toLowerCase().trim(),
      role,
      invited_by: user.id,
    })
    .select('token')
    .single()

  if (error) throw new Error(error.message)

  // 3. Get org name for email
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', organizationId)
    .single()
  const orgName = org?.name ?? 'Veltro'

  // 4. Send email via Resend
  // TODO: Set RESEND_API_KEY in env and configure a verified domain in Resend.
  // Until the domain is verified, email sending will fail silently (error is logged, not thrown).
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitation.token}`
    await resend.emails.send({
      from: 'Veltro <noreply@veltro.app>', // TODO: change to verified domain
      to: email,
      subject: `You've been invited to ${orgName} on Veltro`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h1 style="font-size:22px;font-weight:700;margin-bottom:8px">You've been invited</h1>
          <p style="color:#666;margin-bottom:24px">You've been invited to join <strong>${orgName}</strong> on Veltro as a <strong>${role}</strong>.</p>
          <a href="${acceptUrl}" style="display:inline-block;padding:12px 28px;background:#1a3a2e;color:white;border-radius:8px;text-decoration:none;font-weight:600">Accept invitation</a>
          <p style="color:#999;font-size:12px;margin-top:24px">This invitation expires in 7 days. If you didn't expect this, you can ignore this email.</p>
        </div>
      `,
    })
  } catch (emailError) {
    // Email failed — log but don't break the flow. Invitation record is already created.
    console.error('[sendInvitation] Resend error:', emailError)
  }
}

export async function getPendingInvitations(organizationId: string): Promise<Invitation[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('invitations')
    .select('id, organization_id, company_id, email, role, token, invited_by, accepted_at, expires_at, created_at')
    .eq('organization_id', organizationId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map((inv) => ({
    id: inv.id,
    organization_id: inv.organization_id,
    company_id: inv.company_id ?? undefined,
    email: inv.email,
    role: inv.role as Invitation['role'],
    token: inv.token,
    invited_by: inv.invited_by ?? undefined,
    accepted_at: inv.accepted_at ?? undefined,
    expires_at: inv.expires_at,
    created_at: inv.created_at,
  }))
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('invitations').delete().eq('id', invitationId)
  if (error) throw new Error(error.message)
}

export async function resendInvitation(invitationId: string): Promise<void> {
  const supabase = await createClient()

  // Regenerate token and extend expiry
  const newToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: inv, error: updateError } = await supabase
    .from('invitations')
    .update({ token: newToken, expires_at: newExpiry })
    .eq('id', invitationId)
    .select('email, organization_id')
    .single()

  if (updateError) throw new Error(updateError.message)

  // Get org name
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', inv.organization_id)
    .single()
  const orgName = org?.name ?? 'Veltro'

  // Resend email
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${newToken}`
    await resend.emails.send({
      from: 'Veltro <noreply@veltro.app>',
      to: inv.email,
      subject: `You've been invited to ${orgName} on Veltro`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h1 style="font-size:22px;font-weight:700;margin-bottom:8px">You've been invited</h1>
          <p style="color:#666;margin-bottom:24px">You've been invited to join <strong>${orgName}</strong> on Veltro.</p>
          <a href="${acceptUrl}" style="display:inline-block;padding:12px 28px;background:#1a3a2e;color:white;border-radius:8px;text-decoration:none;font-weight:600">Accept invitation</a>
          <p style="color:#999;font-size:12px;margin-top:24px">This invitation expires in 7 days.</p>
        </div>
      `,
    })
  } catch (emailError) {
    console.error('[resendInvitation] Resend error:', emailError)
  }
}
