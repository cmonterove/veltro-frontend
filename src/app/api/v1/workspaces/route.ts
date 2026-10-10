import { NextResponse } from 'next/server'
import { authenticateApiToken } from '@/lib/api-auth'

// GET /api/v1/workspaces → espacios donde el dueño del token puede escribir
export async function GET(request: Request) {
  const auth = await authenticateApiToken(request)
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { admin, userId } = auth

  const { data: memberships } = await admin.from('account_members').select('account_id, role').eq('user_id', userId)
  const adminAccounts = (memberships ?? []).filter((m) => m.role !== 'member').map((m) => m.account_id)
  const { data: wsRoles } = await admin.from('workspace_members').select('workspace_id, role').eq('user_id', userId)

  const ids = new Set((wsRoles ?? []).filter((r) => r.role !== 'viewer').map((r) => r.workspace_id))
  const { data: workspaces } = await admin
    .from('workspaces')
    .select('id, name, slug, key, account_id')
    .is('archived_at', null)
    .or([adminAccounts.length ? `account_id.in.(${adminAccounts.join(',')})` : '', ids.size ? `id.in.(${[...ids].join(',')})` : ''].filter(Boolean).join(',') || 'id.is.null')

  return NextResponse.json({
    workspaces: (workspaces ?? []).map(({ id, name, slug, key }) => ({ id, name, slug, key })),
  })
}
