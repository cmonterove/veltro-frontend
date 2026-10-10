// Cliente "tipo Supabase" para el modo demo. Mismo API que usa la app:
// from().select/insert/update/delete/upsert + filtros, rpc, auth y storage.

import { DEMO_USER_EMAIL, DEMO_USER_ID } from './config'
import { DemoQueryBuilder, type Result, type Transport } from './query'

const DEMO_USER = {
  id: DEMO_USER_ID,
  email: DEMO_USER_EMAIL,
  app_metadata: {},
  user_metadata: { full_name: 'Cesar Montero' },
  aud: 'authenticated',
  created_at: new Date(0).toISOString(),
}

type Extra = {
  createUser?: (email: string, meta: Record<string, unknown>) => Promise<{ user: { id: string; email: string } | null; error: { message: string; code?: string } | null }>
  deleteUser?: (id: string) => Promise<void>
  upload?: (path: string, file: Blob) => Promise<{ error: { message: string } | null }>
  signedUrl?: (path: string) => Promise<string | null>
}

export function createDemoClient(transport: Transport, extra: Extra = {}) {
  const ok = <T,>(data: T) => Promise.resolve({ data, error: null })
  return {
    from: (table: string) => new DemoQueryBuilder(table, transport),
    rpc: (name: string, args: Record<string, unknown> = {}): Promise<Result> => transport.rpc(name, args),
    auth: {
      getUser: () => ok({ user: DEMO_USER }),
      getSession: () => ok({ session: { user: DEMO_USER, access_token: 'demo' } }),
      signInWithPassword: () => ok({ user: DEMO_USER, session: { user: DEMO_USER } }),
      signUp: () => ok({ user: DEMO_USER, session: { user: DEMO_USER } }),
      signOut: () => Promise.resolve({ error: null }),
      updateUser: () => ok({ user: DEMO_USER }),
      resetPasswordForEmail: () => ok({}),
      // en el demo, el proveedor "responde" de inmediato y vuelve a la app
      signInWithOAuth: () => ok({ provider: 'demo', url: '/home' }),
      exchangeCodeForSession: () => ok({ session: null }),
      verifyOtp: () => ok({ session: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      admin: {
        createUser: async ({ email, user_metadata }: { email: string; user_metadata?: Record<string, unknown> }) => {
          const res = await extra.createUser!(email, user_metadata ?? {})
          return { data: { user: res.user }, error: res.error }
        },
        deleteUser: async (id: string) => {
          await extra.deleteUser?.(id)
          return { data: null, error: null }
        },
      },
    },
    storage: {
      from: () => ({
        upload: async (path: string, file: Blob) => (extra.upload ? extra.upload(path, file) : { error: { message: 'demo' } }),
        createSignedUrl: async (path: string) => ({ data: { signedUrl: (await extra.signedUrl?.(path)) ?? '' }, error: null }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
  }
}
