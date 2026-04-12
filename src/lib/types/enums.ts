export type UserRole =
  | 'org_owner'
  | 'org_admin'
  | 'company_admin'
  | 'member'
  | 'guest'

export type ColumnType =
  | 'text'
  | 'status'
  | 'person'
  | 'date'
  | 'number'
  | 'timeline'
  | 'checkbox'
  | 'tags'
  | 'dropdown'
  | 'link'
  | 'file'
  | 'rating'
  | 'formula'

export type BoardView =
  | 'table'
  | 'kanban'
  | 'calendar'
  | 'gantt'
  | 'gallery'
  | 'chart'

export type NotificationType =
  | 'mention'
  | 'assignment'
  | 'due_date'
  | 'status_change'
  | 'comment'
  | 'automation'

export type InvitationStatus = 'pending' | 'accepted' | 'expired'

export type SupportedLocale = 'en' | 'es' | 'pt' | 'fr'

export type BoardVisibility = 'private' | 'company' | 'groups'

export type BoardMemberRole = 'admin' | 'member' | 'viewer'
