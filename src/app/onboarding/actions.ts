'use server'

import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { slugify, workspaceKeyFrom } from '@/lib/utils'
import { toErrorCode } from '@/lib/errors'
import { seedWorkspace } from '@/lib/seed'

export type OnboardingState = { error?: string } | undefined

export async function completeOnboarding(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const accountName = String(formData.get('account_name') ?? '').trim()
  const workspaceName = String(formData.get('workspace_name') ?? '').trim()
  const icon = String(formData.get('icon') ?? '').slice(0, 2)
  const color = String(formData.get('color') ?? 'violet')
  const timezone = String(formData.get('timezone') ?? '')
  if (!accountName || !workspaceName) return { error: 'missing_fields' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account, error: accErr } = await supabase.rpc('create_account', { p_name: accountName })
  if (accErr || !account) {
    if (toErrorCode(accErr) === 'already_in_account') redirect('/home')
    return { error: toErrorCode(accErr) }
  }

  const { data: ws, error: wsErr } = await supabase.rpc('create_workspace', {
    p_account_id: account.id,
    p_name: workspaceName,
    p_slug: slugify(workspaceName),
    p_key: workspaceKeyFrom(workspaceName),
    p_icon: icon,
    p_color: color,
  })
  if (wsErr || !ws) return { error: toErrorCode(wsErr) }

  if (timezone) await supabase.from('profiles').update({ timezone }).eq('id', user.id)

  const t = await getTranslations('seed')
  await seedWorkspace(supabase, ws.id, user.id, t)

  redirect(`/w/${ws.slug}`)
}
