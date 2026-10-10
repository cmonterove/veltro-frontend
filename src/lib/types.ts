import type {
  AccountRole,
  AccountRow,
  DocRow,
  ProfileRow,
  TaskRow,
  WorkspaceRole,
  WorkspaceRow,
} from './database.types'

export type Member = Pick<ProfileRow, 'id' | 'email' | 'full_name' | 'avatar_url'> & {
  role: AccountRole
}

export type WorkspaceWithRole = WorkspaceRow & { my_role: WorkspaceRole }

export type AppContextValue = {
  user: { id: string; email: string }
  profile: ProfileRow
  account: AccountRow
  accounts: AccountRow[]
  accountRole: AccountRole
  workspaces: WorkspaceWithRole[]
  members: Member[]
  google: { email: string; selectedCalendarIds: string[] } | null
  googleConfigured: boolean
}

export type Task = TaskRow
export type DocSummary = Pick<
  DocRow,
  'id' | 'workspace_id' | 'parent_id' | 'title' | 'icon' | 'position' | 'source' | 'meeting_id' | 'updated_at' | 'created_at' | 'created_by' | 'excerpt'
>

export type CalendarEvent = {
  id: string
  calendarId: string
  title: string
  start: string
  end: string
  allDay: boolean
  location: string | null
  description: string | null
  conferenceUrl: string | null
  htmlLink: string | null
  attendees: { email: string; name: string | null; responseStatus: string | null; self: boolean; organizer: boolean }[]
  color: string | null
  status: string | null
  /** id de la serie (recurringEventId de Google) para reuniones recurrentes */
  seriesKey: string | null
  /** reuniones de Veltro enlazadas a este evento (una por espacio) */
  links: { meetingId: string; workspaceId: string; docId: string | null; phase: 'prep' | 'live' | 'closed' }[]
}
