'use server'

import { redirect } from 'next/navigation'
import { toErrorCode } from '@/lib/errors'
import { api } from '@/lib/api/server'
import type { ApiWorkspace } from '@/lib/api/types'

export type OnboardingState = { error?: string } | undefined

export async function completeOnboarding(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const accountName = String(formData.get('account_name') ?? '').trim()
  const workspaceName = String(formData.get('workspace_name') ?? '').trim()
  const icon = String(formData.get('icon') ?? '').slice(0, 2)
  const color = String(formData.get('color') ?? 'violet')
  const timezone = String(formData.get('timezone') ?? '')
  if (!accountName || !workspaceName) return { error: 'missing_fields' }

  // La API crea la cuenta, el primer espacio y el contenido de bienvenida en una sola transacción.
  let workspace: ApiWorkspace
  try {
    ;({ workspace } = await api<{ workspace: ApiWorkspace }>('/v1/me/onboarding', {
      method: 'POST',
      body: { accountName, workspaceName, icon: icon || undefined, color, timezone: timezone || undefined, seed: true },
    }))
  } catch (e) {
    const code = toErrorCode(e as { message?: string })
    if (code === 'already_in_account') redirect('/home')
    return { error: code }
  }

  redirect(`/w/${workspace.slug}`)
}
