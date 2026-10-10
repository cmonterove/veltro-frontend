import { NextResponse } from 'next/server'
import { getUser } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/crypto'
import { revokeToken } from '@/lib/google/oauth'
import { DEMO } from '@/lib/demo/config'
import { connectDemoGoogle } from '@/lib/demo/calendar'

export async function POST() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (DEMO) {
    connectDemoGoogle(false)
    return NextResponse.json({ ok: true })
  }

  const admin = createAdminClient()
  const { data: conn } = await admin.from('google_connections').select('refresh_token').eq('user_id', user.id).maybeSingle()
  if (conn) {
    try {
      await revokeToken(decrypt(conn.refresh_token))
    } catch {
      // token ilegible o ya revocado: igual se elimina la conexión
    }
    await admin.from('google_connections').delete().eq('user_id', user.id)
  }
  return NextResponse.json({ ok: true })
}
