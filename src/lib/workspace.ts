import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { requireAppContext } from '@/lib/session'
import { DEMO } from '@/lib/demo/config'
import { api } from '@/lib/api/server'
import type { ApiWorkspace } from '@/lib/api/types'

/** Resuelve el espacio de la URL dentro del contexto actual; cambia de cuenta si hace falta. */
export async function requireWorkspace(slug: string) {
  const ctx = await requireAppContext()
  const ws = ctx.workspaces.find((w) => w.slug === slug)
  if (ws) return { ctx, ws }
  if (DEMO) notFound()

  // ¿Es de otra de mis cuentas? (la API solo lo devuelve si lo puedo ver)
  const other = await api<ApiWorkspace>(`/v1/workspaces/${encodeURIComponent(slug)}`).catch(() => null)
  if (other && other.accountId !== ctx.account.id) {
    redirect(`/auth/switch?account=${other.accountId}&next=${encodeURIComponent(`/w/${slug}`)}`)
  }
  notFound()
}
