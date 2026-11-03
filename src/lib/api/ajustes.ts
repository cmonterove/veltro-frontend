/**
 * Ajustes (perfil, cuenta, personas, organigrama y espacios): las formas de la API que usan
 * esas pantallas y su paso a las filas snake_case de siempre. Lo común está en types.ts y adapters.ts.
 */

import { toErrorCode, type ErrorCode } from '@/lib/errors'
import type { AccountRole, WorkspaceRole } from '@/lib/database.types'
import type { AppContextValue, Member } from '@/lib/types'
import { ApiError } from './shared'
import type { ApiDepartment, ApiOrgPerson, ApiUsage, ApiWorkspace } from './types'

// ---------- formas de la API ----------

/** GET /v1/accounts/{id}/members: persona de la cuenta con sus espacios. */
export type ApiAccountMember = {
  id: string
  email: string
  fullName: string
  avatarUrl: string | null
  role: AccountRole
  mustChangePassword: boolean
  joinedAt: string
  title: string | null
  departmentId: string | null
  reportsTo: string | null
  workspaces: { workspaceId: string; role: WorkspaceRole }[]
}

/** GET /v1/workspaces/{ws}/members: quién entra al espacio (los admins de la cuenta, por la cuenta). */
export type ApiWorkspaceMember = { id: string; email: string; fullName: string; avatarUrl: string | null; role: WorkspaceRole; viaAccount: boolean }

export type ApiWorkspaceCounts = { openTasks: number; overdueTasks: number; members: number; docs: number; upcomingMeetings: number }
export type ApiWorkspaceWithCounts = ApiWorkspace & { counts: ApiWorkspaceCounts }

export type ApiOrg = { members: ApiOrgPerson[]; departments: ApiDepartment[]; visibleMemberIds: string[] }

export type ApiAddMember = { member: ApiAccountMember; existing: boolean; tempPassword: string | null }

export type ApiToken = {
  id: string
  name: string
  prefix: string
  scopes: ('read' | 'write')[]
  workspaceIds: string[] | null
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

// ---------- filas que usan las pantallas ----------

export type Usage = {
  plan_id: string
  plan_name: string
  max_workspaces: number | null
  max_members: number | null
  workspaces_count: number
  members_count: number
}

export type Assignment = { workspace_id: string; user_id: string; role: WorkspaceRole }

export type AccountMember = Member & { must_change_password: boolean; joined_at: string; assignments: Assignment[] }

export type WorkspacePerson = { id: string; email: string; full_name: string; avatar_url: string | null; role: WorkspaceRole; via_account: boolean }

export function toUsage(u: ApiUsage): Usage {
  return {
    plan_id: u.planId,
    plan_name: u.planName,
    max_workspaces: u.maxWorkspaces,
    max_members: u.maxMembers,
    workspaces_count: u.workspacesCount,
    members_count: u.membersCount,
  }
}

export function toAccountMember(m: ApiAccountMember): AccountMember {
  return {
    id: m.id,
    email: m.email,
    full_name: m.fullName,
    avatar_url: m.avatarUrl,
    role: m.role,
    title: m.title,
    department_id: m.departmentId,
    reports_to: m.reportsTo,
    must_change_password: m.mustChangePassword,
    joined_at: m.joinedAt,
    assignments: m.workspaces.map((w) => ({ workspace_id: w.workspaceId, user_id: m.id, role: w.role })),
  }
}

export function toWorkspacePerson(p: ApiWorkspaceMember): WorkspacePerson {
  return { id: p.id, email: p.email, full_name: p.fullName, avatar_url: p.avatarUrl, role: p.role, via_account: p.viaAccount }
}

/** Cargo, departamento y jefe en la forma de la web → cuerpo de PATCH …/members/{userId}/org. */
export function toOrgPatch(p: Partial<Pick<Member, 'title' | 'department_id' | 'reports_to'>>) {
  return {
    ...(p.title !== undefined ? { title: p.title } : {}),
    ...(p.department_id !== undefined ? { departmentId: p.department_id } : {}),
    ...(p.reports_to !== undefined ? { reportsTo: p.reports_to } : {}),
  }
}

// ---------- errores ----------

/**
 * Código conocido (clave de `errors.*`) para un error de la API. Los de validación (422
 * validation_error) se traducen por el campo que falló.
 */
export function ajustesError(e: unknown): ErrorCode {
  if (e instanceof ApiError && e.code === 'validation_error') {
    const fields = Array.isArray(e.details) ? (e.details as { field?: string }[]).map((d) => d.field ?? '') : []
    if (fields.includes('email')) return 'invalid_email'
    if (fields.includes('newPassword')) return 'weak_password'
    if (fields.includes('fullName')) return 'name_too_short'
    return 'generic'
  }
  if (e instanceof ApiError && e.status === 429) return 'rate_limited'
  return toErrorCode(e instanceof Error ? e : null)
}

// ---------- contraseña y suspensión ----------

/** Mismas reglas que la API: de 8 a 72 caracteres y tres de: minúscula, mayúscula, número, símbolo. */
export function passwordProblem(pw: string): 'passwordShort' | 'passwordLong' | 'passwordWeak' | null {
  if (pw.length < 8) return 'passwordShort'
  if (pw.length > 72) return 'passwordLong'
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length
  return kinds < 3 ? 'passwordWeak' : null
}

/** La persona o la cuenta actual están suspendidas: la API responde 403 a casi todo. */
export function isSuspended(ctx: Pick<AppContextValue, 'profile' | 'account'>) {
  return Boolean(ctx.profile.suspended_at) || ctx.account.status === 'suspended'
}

/** Evento del navegador cuando la API responde 403 por suspensión (lo escucha el shell para recargar el contexto). */
export const SUSPENDED_EVENT = 'veltro:suspended'
export const SUSPENSION_CODES = ['user_suspended', 'account_suspended'] as const
