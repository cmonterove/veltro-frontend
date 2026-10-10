import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { DEMO } from '@/lib/demo/config'
import { createServerDemoClient } from '@/lib/demo/server'

/** Cliente con la sesión del usuario (RLS aplica). Server Components, Actions y Route Handlers. */
export async function createClient(): Promise<SupabaseClient<Database>> {
  if (DEMO) return createServerDemoClient() as unknown as SupabaseClient<Database>
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Server Component: las cookies son de solo lectura; el middleware refresca la sesión.
          }
        },
      },
    },
  )
}
