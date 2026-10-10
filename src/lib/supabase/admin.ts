import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { DEMO } from '@/lib/demo/config'
import { createServerDemoClient } from '@/lib/demo/server'

/**
 * Cliente con service_role: ignora RLS. Usar SOLO en el servidor y solo para
 * operaciones privilegiadas (crear usuarios, tokens de Google, API tokens),
 * después de validar permisos explícitamente.
 */
export function createAdminClient(): SupabaseClient<Database> {
  if (DEMO) return createServerDemoClient() as unknown as SupabaseClient<Database>
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
