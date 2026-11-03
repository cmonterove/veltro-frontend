'use server'

import { revalidatePath } from 'next/cache'
import { api } from '@/lib/api/server'
import { ajustesError, type ApiAddMember, type ApiToken, type ApiWorkspaceWithCounts } from '@/lib/api/ajustes'
import type { ErrorCode } from '@/lib/errors'
import type { AccountRole, WorkspaceRole } from '@/lib/database.types'

/**
 * Ajustes por la API (veltro-backend): ella valida, aplica los permisos (admin, dueño) y los
 * límites del plan. Cada acción devuelve { ok } o { ok: false, error } con un código de `errors.*`.
 */

type Fail = { ok: false; error: ErrorCode }

async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | Fail> {
  try {
    const data = await fn()
    revalidatePath('/', 'layout')
    return { ok: true, data }
  } catch (e) {
    const error = ajustesError(e)
    // suspendida: el contexto nuevo hace que el shell muestre el aviso
    if (error === 'user_suspended' || error === 'account_suspended') revalidatePath('/', 'layout')
    return { ok: false, error }
  }
}

// ---------- personas ----------

export type AddMemberInput = {
  fullName: string
  email: string
  role: Exclude<AccountRole, 'owner'>
  workspaces: { id: string; role: WorkspaceRole }[]
}

/**
 * Crea la persona en la cuenta (o agrega a alguien que ya usa Veltro sin cuenta) y le asigna
 * espacios. La contraseña temporal llega una sola vez para que el admin la comparta.
 */
export async function addMember(accountId: string, input: AddMemberInput): Promise<{ ok: true; tempPassword: string | null; existing: boolean } | Fail> {
  const res = await attempt(() =>
    api<ApiAddMember>(`/v1/accounts/${accountId}/members`, {
      method: 'POST',
      body: { fullName: input.fullName.trim(), email: input.email.trim().toLowerCase(), role: input.role, workspaces: input.role === 'admin' ? [] : input.workspaces },
    }),
  )
  return res.ok ? { ok: true, tempPassword: res.data.tempPassword, existing: res.data.existing } : res
}

export async function updateMemberRole(accountId: string, userId: string, role: Exclude<AccountRole, 'owner'>) {
  const res = await attempt(() => api(`/v1/accounts/${accountId}/members/${userId}`, { method: 'PATCH', body: { role } }))
  return res.ok ? { ok: true as const } : res
}

/** Quita a la persona de la cuenta: sale de sus espacios y de sus tareas abiertas (devuelve cuántas). */
export async function removeMember(accountId: string, userId: string) {
  const res = await attempt(() =>
    api<{ ok: true; unassignedTasks: number }>(`/v1/accounts/${accountId}/members/${userId}`, { method: 'DELETE', body: { confirm: true } }),
  )
  return res.ok ? { ok: true as const, unassignedTasks: res.data.unassignedTasks } : res
}

/** Deja exactamente esos espacios activos (con su rol) a una persona; en los que pierde, sale de sus tareas abiertas. */
export async function setMemberWorkspaces(accountId: string, userId: string, rows: { id: string; role: WorkspaceRole }[]) {
  const res = await attempt(() =>
    api<{ unassignedTasks?: number }>(`/v1/accounts/${accountId}/members/${userId}/workspaces`, { method: 'PUT', body: { workspaces: rows } }),
  )
  return res.ok ? { ok: true as const, unassignedTasks: res.data.unassignedTasks ?? 0 } : res
}

/** Acceso de una persona a un espacio: con rol lo da o lo cambia; null lo quita (y la saca de sus tareas abiertas ahí). */
export async function setWorkspaceAccess(workspaceId: string, userId: string, role: WorkspaceRole | null) {
  const res = await attempt(() =>
    role
      ? api(`/v1/workspaces/${workspaceId}/members/${userId}`, { method: 'PUT', body: { role } })
      : api(`/v1/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' }),
  )
  return res.ok ? { ok: true as const } : res
}

// ---------- espacios ----------

export async function createWorkspace(accountId: string, input: { name: string; icon: string; color: string; description?: string }) {
  const res = await attempt(() =>
    api<ApiWorkspaceWithCounts>('/v1/workspaces', {
      method: 'POST',
      body: { accountId, name: input.name.trim(), icon: input.icon, color: input.color, ...(input.description?.trim() ? { description: input.description.trim() } : {}) },
    }),
  )
  return res.ok ? { ok: true as const, slug: res.data.slug, id: res.data.id } : res
}

export async function updateWorkspace(id: string, patch: { name?: string; icon?: string; color?: string; description?: string | null }) {
  const body = {
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
    ...(patch.color !== undefined ? { color: patch.color } : {}),
    ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
  }
  const res = await attempt(() => api(`/v1/workspaces/${id}`, { method: 'PATCH', body }))
  return res.ok ? { ok: true as const } : res
}

export async function archiveWorkspace(id: string) {
  const res = await attempt(() => api(`/v1/workspaces/${id}/archive`, { method: 'POST' }))
  return res.ok ? { ok: true as const } : res
}

/** Vuelve a contar para el límite del plan: la API responde plan_limit_workspaces si no cabe. */
export async function unarchiveWorkspace(id: string) {
  const res = await attempt(() => api<{ slug: string }>(`/v1/workspaces/${id}/unarchive`, { method: 'POST' }))
  return res.ok ? { ok: true as const, slug: res.data.slug } : res
}

// ---------- cuenta y perfil ----------

export async function updateAccountName(accountId: string, name: string) {
  const res = await attempt(() => api(`/v1/accounts/${accountId}`, { method: 'PATCH', body: { name: name.trim() } }))
  return res.ok ? { ok: true as const } : res
}

export async function updateProfile(patch: { full_name?: string; timezone?: string }) {
  const body = {
    ...(patch.full_name !== undefined ? { fullName: patch.full_name.trim() } : {}),
    ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
  }
  const res = await attempt(() => api('/v1/me', { method: 'PATCH', body }))
  return res.ok ? { ok: true as const } : res
}

/**
 * Cambia la contraseña (y cierra las demás sesiones). La actual no hace falta con contraseña
 * temporal ni recién llegado del enlace de recuperación: eso lo decide la API.
 */
export async function changePassword(input: { currentPassword?: string; newPassword: string }) {
  const res = await attempt(() =>
    api('/v1/me/password', { method: 'PUT', body: { newPassword: input.newPassword, ...(input.currentPassword ? { currentPassword: input.currentPassword } : {}) } }),
  )
  return res.ok ? { ok: true as const } : res
}

// ---------- tokens de API (Claude / integraciones) ----------

export async function listApiTokens() {
  try {
    const { items } = await api<{ items: ApiToken[] }>('/v1/api-tokens')
    return items.map((t) => ({ id: t.id, name: t.name, token_prefix: t.prefix, last_used_at: t.lastUsedAt, created_at: t.createdAt }))
  } catch {
    return []
  }
}

export async function createApiToken(name: string) {
  const res = await attempt(() => api<ApiToken & { token: string }>('/v1/api-tokens', { method: 'POST', body: { name: name.trim().slice(0, 80) || 'Claude' } }))
  return res.ok ? { ok: true as const, token: res.data.token } : res
}

export async function revokeApiToken(id: string) {
  const res = await attempt(() => api(`/v1/api-tokens/${id}`, { method: 'DELETE' }))
  return res.ok ? { ok: true as const } : res
}
