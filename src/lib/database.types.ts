// Tipos de la base de datos v2 (supabase/migrations/20261009120000_v2_core.sql).
// Cuando el proyecto esté enlazado, se pueden regenerar con:
//   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Timestamps = { created_at: string; updated_at: string }

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done'
export type TaskPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent'
export type AccountRole = 'owner' | 'admin' | 'member'
export type WorkspaceRole = 'admin' | 'editor' | 'viewer'
export type DocSource = 'manual' | 'meeting' | 'claude' | 'import'
export type Locale = 'en' | 'es' | 'pt' | 'fr'

export type PlanRow = {
  id: string
  name: string
  description: string | null
  max_workspaces: number | null
  max_members: number | null
  price_monthly_cents: number
  price_yearly_cents: number | null
  currency: string
  is_public: boolean
  is_default: boolean
  sort: number
  created_at: string
  updated_at: string
}

export type ProfileRow = Timestamps & {
  id: string
  email: string
  full_name: string
  avatar_url: string | null
  locale: Locale
  timezone: string
  must_change_password: boolean
  last_seen_at: string | null
  suspended_at: string | null
}

export type AccountRow = Timestamps & {
  id: string
  name: string
  plan_id: string
  owner_id: string
  status: 'active' | 'suspended'
  suspended_at: string | null
  suspended_reason: string | null
}

export type AccountMemberRow = {
  account_id: string
  user_id: string
  role: AccountRole
  created_at: string
}

export type WorkspaceRow = Timestamps & {
  id: string
  account_id: string
  name: string
  slug: string
  key: string
  icon: string
  color: string
  description: string | null
  task_seq: number
  task_fields: TaskFieldDef[]
  created_by: string | null
  archived_at: string | null
}

export type TaskFieldType = 'text' | 'number' | 'date' | 'select' | 'url'
export type TaskFieldDef = { id: string; name: string; type: TaskFieldType; options?: string[] }

export type WorkspaceMemberRow = {
  workspace_id: string
  user_id: string
  role: WorkspaceRole
  created_at: string
}

export type MeetingAttendee = {
  email: string
  name?: string | null
  responseStatus?: string | null
  self?: boolean
  organizer?: boolean
}

export type MeetingRow = Timestamps & {
  id: string
  workspace_id: string
  google_event_id: string | null
  google_calendar_id: string | null
  title: string
  starts_at: string
  ends_at: string | null
  attendees: MeetingAttendee[]
  location: string | null
  conference_url: string | null
  html_link: string | null
  created_by: string | null
  series_key: string | null
  phase: MeetingPhase
  summary: string | null
  follow_up: string | null
  closed_at: string | null
}

export type MeetingPhase = 'prep' | 'live' | 'closed'
export type MeetingItemKind = 'agenda' | 'note' | 'decision' | 'action' | 'question'

export type MeetingItemRow = Timestamps & {
  id: string
  meeting_id: string
  workspace_id: string
  kind: MeetingItemKind
  text: string
  assignee_id: string | null
  due_date: string | null
  task_id: string | null
  done: boolean
  source: 'manual' | 'assistant' | 'carry'
  position: number
  created_by: string | null
}

export type DocRow = Timestamps & {
  id: string
  workspace_id: string
  parent_id: string | null
  title: string
  icon: string | null
  content: Json
  content_text: string
  /** generado: primeros 240 caracteres de content_text */
  excerpt: string | null
  import_markdown: string | null
  source: DocSource
  meeting_id: string | null
  position: number
  created_by: string | null
  updated_by: string | null
  archived_at: string | null
}

export type TaskRow = Timestamps & {
  id: string
  workspace_id: string
  number: number
  title: string
  description: Json | null
  description_text: string
  status: TaskStatus
  priority: TaskPriority
  assignee_id: string | null
  due_date: string | null
  start_date: string | null
  estimate_hours: number | null
  custom: Record<string, string | number | null>
  labels: string[]
  position: number
  parent_id: string | null
  doc_id: string | null
  doc_block_id: string | null
  meeting_id: string | null
  created_by: string | null
  completed_at: string | null
}

export type AttachmentRow = {
  id: string
  workspace_id: string
  task_id: string | null
  meeting_id: string | null
  doc_id: string | null
  kind: 'file' | 'link'
  name: string
  storage_path: string | null
  url: string | null
  mime_type: string | null
  size_bytes: number | null
  uploaded_by: string | null
  created_at: string
}

export type TaskCommentRow = Timestamps & {
  id: string
  task_id: string
  workspace_id: string
  user_id: string
  body: string
}

export type GoogleConnectionRow = Timestamps & {
  user_id: string
  google_email: string
  refresh_token: string
  access_token: string | null
  access_token_expires_at: string | null
  scopes: string[]
  selected_calendar_ids: string[]
}

export type ApiTokenRow = {
  id: string
  user_id: string
  name: string
  token_hash: string
  token_prefix: string
  last_used_at: string | null
  created_at: string
}

type Table<Row, Required extends keyof Row, Optional extends keyof Row = Exclude<keyof Row, Required>> = {
  Row: Row
  Insert: Pick<Row, Required> & Partial<Pick<Row, Optional>>
  Update: Partial<Row>
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      plans: Table<PlanRow, 'id' | 'name'>
      profiles: Table<ProfileRow, 'id' | 'email'>
      accounts: Table<AccountRow, 'name' | 'owner_id'>
      account_members: Table<AccountMemberRow, 'account_id' | 'user_id'>
      workspaces: Table<WorkspaceRow, 'account_id' | 'name' | 'slug' | 'key'>
      workspace_members: Table<WorkspaceMemberRow, 'workspace_id' | 'user_id'>
      meetings: Table<MeetingRow, 'workspace_id' | 'starts_at'>
      meeting_items: Table<MeetingItemRow, 'meeting_id' | 'kind'>
      docs: Table<DocRow, 'workspace_id'>
      tasks: Table<TaskRow, 'workspace_id' | 'title'>
      task_comments: Table<TaskCommentRow, 'task_id' | 'body'>
      attachments: Table<AttachmentRow, 'workspace_id' | 'name'>
      google_connections: Table<GoogleConnectionRow, 'user_id' | 'google_email' | 'refresh_token'>
      api_tokens: Table<ApiTokenRow, 'user_id' | 'name' | 'token_hash' | 'token_prefix'>
    }
    Views: Record<string, never>
    Functions: {
      create_account: { Args: { p_name: string }; Returns: AccountRow }
      create_workspace: {
        Args: {
          p_account_id: string
          p_name: string
          p_slug: string
          p_key: string
          p_icon?: string
          p_color?: string
          p_description?: string | null
        }
        Returns: WorkspaceRow
      }
      workspace_role_for: { Args: { p_workspace: string; p_user: string }; Returns: WorkspaceRole | null }
      get_my_google_connection: {
        Args: Record<string, never>
        Returns: { google_email: string; selected_calendar_ids: string[]; connected_at: string }[]
      }
      // telemetría: presencia (conexiones) y eventos de vista/función para la consola
      touch_presence: { Args: { p_client?: { device?: string; browser?: string; os?: string } }; Returns: undefined }
      track_events: {
        Args: { p_events: { event: string; workspace_id?: string | null; account_id?: string | null; props?: Record<string, string | number | boolean> }[] }
        Returns: undefined
      }
      get_account_usage: {
        Args: { p_account: string }
        Returns: {
          plan_id: string
          plan_name: string
          max_workspaces: number | null
          max_members: number | null
          workspaces_count: number
          members_count: number
        }[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
