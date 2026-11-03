/**
 * De las respuestas de la API (camelCase) a las filas que ya usan las pantallas (snake_case,
 * `database.types.ts`). Así el cambio a la API queda en la capa de datos y no en cada componente.
 */

import type { AccountRow, DepartmentRow, Locale, ProfileRow, WorkspaceRole } from '@/lib/database.types'
import type { Member, WorkspaceWithRole } from '@/lib/types'
import type { ApiAccount, ApiAccountBrief, ApiDepartment, ApiOrgPerson, ApiProfile, ApiWorkspace } from './types'

export function toProfile(p: ApiProfile): ProfileRow {
  return {
    id: p.id,
    email: p.email,
    full_name: p.fullName,
    avatar_url: p.avatarUrl,
    locale: p.locale as Locale,
    timezone: p.timezone,
    must_change_password: p.mustChangePassword,
    last_seen_at: null,
    // la API solo dice si está suspendida; la web solo lo usa como sí/no
    suspended_at: p.suspended ? p.createdAt : null,
    created_at: p.createdAt,
    updated_at: p.createdAt,
  }
}

export function toAccount(a: ApiAccount | ApiAccountBrief): AccountRow {
  return {
    id: a.id,
    name: a.name,
    plan_id: a.planId,
    owner_id: 'ownerId' in a ? a.ownerId : '',
    status: a.status,
    suspended_at: null,
    suspended_reason: null,
    created_at: a.createdAt,
    updated_at: a.createdAt,
  }
}

export function toWorkspace(w: ApiWorkspace, role?: WorkspaceRole): WorkspaceWithRole {
  return {
    id: w.id,
    account_id: w.accountId,
    name: w.name,
    slug: w.slug,
    key: w.key,
    icon: w.icon,
    color: w.color,
    description: w.description,
    task_seq: 0,
    task_fields: w.taskFields ?? [],
    task_statuses: w.taskStatuses ?? [],
    created_by: null,
    archived_at: w.archivedAt,
    created_at: w.createdAt,
    updated_at: w.updatedAt,
    my_role: role ?? w.role,
  }
}

export function toMember(p: ApiOrgPerson): Member {
  return {
    id: p.id,
    email: p.email,
    full_name: p.fullName,
    avatar_url: p.avatarUrl,
    role: p.role,
    title: p.title,
    department_id: p.departmentId,
    reports_to: p.reportsTo,
  }
}

export function toDepartment(d: ApiDepartment): DepartmentRow {
  return { id: d.id, account_id: d.accountId, name: d.name, head_id: d.headId, created_at: d.createdAt, updated_at: d.updatedAt }
}
