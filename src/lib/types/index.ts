import type {
  BoardMemberRole,
  BoardVisibility,
  ColumnType,
  SupportedLocale,
  UserRole,
} from './enums'

export type {
  UserRole,
  ColumnType,
  BoardView,
  NotificationType,
  InvitationStatus,
  SupportedLocale,
  BoardVisibility,
  BoardMemberRole,
} from './enums'

export interface CompanyGroup {
  id: string
  company_id: string
  name: string
  color: string
  description?: string
  created_by?: string
  created_at: string
  updated_at: string
  members?: CompanyGroupMember[]
}

export interface CompanyGroupMember {
  id: string
  company_group_id: string
  user_id: string
  role: 'lead' | 'member'
  created_at: string
  profile?: {
    id: string
    full_name: string
    avatar_url?: string
    email: string
  }
}

export interface Invitation {
  id: string
  organization_id: string
  company_id?: string
  email: string
  role: 'org_owner' | 'admin' | 'member' | 'guest'
  token: string
  invited_by?: string
  accepted_at?: string
  expires_at: string
  created_at: string
}

export interface UserGroupMembership {
  user_id: string
  group_id: string
  added_by: string | null
  added_at: string
}

export interface BoardMember {
  id: string
  board_id: string
  user_id: string | null
  group_id: string | null
  role: BoardMemberRole
  invited_by: string | null
  invited_at: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  logo_url: string | null
  plan: 'free' | 'pro' | 'enterprise'
  created_at: string
}

export interface Company {
  id: string
  org_id: string
  name: string
  slug: string
  logo_url: string | null
  created_at: string
}

export interface UserProfile {
  id: string
  org_id: string
  email: string
  full_name: string
  avatar_url: string | null
  role: UserRole
  locale: SupportedLocale
  created_at: string
}

export interface UserCompanyAssignment {
  user_id: string
  company_id: string
  role_in_company: UserRole
}

export interface Board {
  id: string
  company_id: string
  name: string
  color: string
  icon: string | null
  description: string | null
  visibility: BoardVisibility
  is_private: boolean
  owner_id: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface BoardWithMembers extends Board {
  owner: Pick<UserProfile, 'id' | 'full_name' | 'avatar_url'>
  members: Array<
    BoardMember & {
      profile?: Pick<UserProfile, 'id' | 'full_name' | 'avatar_url'>
      group?: Pick<CompanyGroup, 'id' | 'name' | 'color'>
    }
  >
}

export interface BoardGroup {
  id: string
  board_id: string
  name: string
  color: string
  position: number
}

export interface Item {
  id: string
  group_id: string
  board_id: string
  name: string
  position: number
  created_by: string
  created_at: string
}

export interface ColumnDefinition {
  id: string
  board_id: string
  type: ColumnType
  title: string
  position: number
  settings: Record<string, unknown>
}

export interface ItemColumnValue {
  id: string
  item_id: string
  column_id: string
  value: unknown
}
