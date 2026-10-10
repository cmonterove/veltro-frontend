import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sha256 } from '@/lib/crypto'

/** Autentica una request de la API pública con `Authorization: Bearer vlt_...`. */
export async function authenticateApiToken(request: Request) {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token.startsWith('vlt_')) return null
  const admin = createAdminClient()
  const { data } = await admin.from('api_tokens').select('id, user_id').eq('token_hash', sha256(token)).maybeSingle()
  if (!data) return null
  await admin.from('api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
  return { userId: data.user_id, admin }
}
