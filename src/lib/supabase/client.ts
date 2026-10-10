import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { DEMO } from '@/lib/demo/config'
import { createBrowserDemoClient } from '@/lib/demo/browser'

let browserClient: SupabaseClient<Database> | undefined

export function createClient(): SupabaseClient<Database> {
  if (!browserClient) {
    browserClient = DEMO
      ? (createBrowserDemoClient() as unknown as SupabaseClient<Database>)
      : createBrowserClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  }
  return browserClient
}
