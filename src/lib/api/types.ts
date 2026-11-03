/**
 * Formas de las respuestas de la API (veltro-backend, camelCase). La referencia completa está
 * en http://localhost:4000/docs (openapi.json). Acá solo lo que la web usa.
 */

import type { AccountRole, TaskFieldDef, TaskStatusDef, WorkspaceRole } from '@/lib/database.types'

export type ApiProfile = {
  id: string
  email: string
  fullName: string
  avatarUrl: string | null
  locale: string
  timezone: string
  mustChangePassword: boolean
  suspended: boolean
  createdAt: string
}

export type ApiUsage = {
  planId: string
  planName: string
  maxWorkspaces: number | null
  maxMembers: number | null
  workspacesCount: number
  membersCount: number
}

export type ApiAccount = {
  id: string
  name: string
  planId: string
  ownerId: string
  role: AccountRole
  status: 'active' | 'suspended'
  createdAt: string
  usage: ApiUsage
}

export type ApiAccountBrief = { id: string; name: string; planId: string; role: AccountRole; status: 'active' | 'suspended'; createdAt: string }

export type ApiWorkspace = {
  id: string
  accountId: string
  name: string
  slug: string
  key: string
  icon: string
  color: string
  description: string | null
  taskFields: TaskFieldDef[]
  taskStatuses?: TaskStatusDef[]
  role: WorkspaceRole
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ApiOrgPerson = {
  id: string
  email: string
  fullName: string
  avatarUrl: string | null
  role: AccountRole
  title: string | null
  departmentId: string | null
  reportsTo: string | null
  joinedAt: string
}

export type ApiDepartment = { id: string; accountId: string; name: string; headId: string | null; createdAt: string; updatedAt: string }

export type ApiContext = {
  status: 'onboarding' | 'ready'
  user: ApiProfile
  accounts: ApiAccountBrief[]
  account: ApiAccount | null
  workspaces: ApiWorkspace[]
  observedWorkspaces: ApiWorkspace[]
  members: ApiOrgPerson[]
  departments: ApiDepartment[]
  visibleMemberIds: string[]
  google: { configured: boolean; connected: boolean; email: string | null; selectedCalendarIds: string[] }
}

export type ApiSessionUser = { id: string; email: string; fullName: string; locale: string; timezone: string; mustChangePassword: boolean }

export type ApiSessionResponse = { accessToken: string; refreshToken: string; expiresIn: number; user: ApiSessionUser }
