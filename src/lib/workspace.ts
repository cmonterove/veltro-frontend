import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { requireAppContext } from '@/lib/session'

/** Resuelve el espacio de la URL dentro del contexto actual; cambia de cuenta si hace falta. */
export async function requireWorkspace(slug: string) {
  const ctx = await requireAppContext()
  const ws = ctx.workspaces.find((w) => w.slug === slug)
  if (ws) return { ctx, ws }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data } = await supabase.from('workspaces').select('account_id').eq('slug', slug).maybeSingle()
  if (data && data.account_id !== ctx.account.id) {
    redirect(`/auth/switch?account=${data.account_id}&next=${encodeURIComponent(`/w/${slug}`)}`)
  }
  notFound()
}
