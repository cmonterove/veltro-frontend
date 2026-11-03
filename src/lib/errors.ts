/** Códigos que lanzan las funciones/triggers SQL (raise exception '<code>'). */
const KNOWN = [
  'plan_limit_workspaces',
  'plan_limit_members',
  'member_not_in_account',
  'cannot_remove_owner',
  'cannot_assign_owner',
  'assignee_not_in_workspace',
  'too_many_assignees',
  'already_in_account',
  'forbidden',
  'doc_parent_cycle',
  'not_authenticated',
  // Google Calendar (la API es la dueña de la conexión)
  'google_not_connected',
  'google_auth_revoked',
  'google_not_configured',
  'google_unreachable',
  'google_error',
  'unknown_calendar',
  'rate_limited',
  'reports_to_cycle',
  'reports_to_self',
  'reports_to_not_member',
  'head_not_member',
  'department_other_account',
  'invalid_statuses',
  'invalid_status',
  // de la API de tareas
  'validation_error',
  'start_after_due',
  'parent_is_subtask',
  'scope_not_allowed',
  'meeting_closed',
  'doc_archived',
  'file_type',
  'file_too_large',
  // adjuntos y bóveda (API)
  'file_empty',
  'file_content_mismatch',
  'file_size_mismatch',
  'file_not_uploaded',
  'invalid_upload_token',
  'upload_failed',
  'already_registered',
  'attachment_other_workspace',
  'chat_attachment_linked',
  // Pasillo (API)
  'group_needs_people',
  'chat_direct_full',
  'chat_is_direct',
  'direct_self',
  'ref_not_found',
  'ref_other_account',
  'reply_not_found',
  'invite_past',
  'not_an_invite',
  // ajustes: personas, contraseña, espacios y suspensión (códigos de la API)
  'owner_only',
  'member_in_other_account',
  'already_member',
  'current_password_required',
  'current_password_wrong',
  'same_password',
  'password_change_required',
  'workspace_archived',
  'user_suspended',
  'account_suspended',
  // soporte: archivos, estados y destino por rol (la API los manda en error.code)
  'duplicate_file',
  'ticket_resolved',
  'status_not_allowed',
  'workspace_not_in_account',
] as const

export type ErrorCode = (typeof KNOWN)[number] | 'generic' | 'email_taken' | 'invalid_email' | 'weak_password' | 'name_too_short' | 'rate_limited'

export function toErrorCode(error: { message?: string } | null | undefined): ErrorCode {
  const msg = error?.message ?? ''
  return KNOWN.find((k) => msg.includes(k)) ?? 'generic'
}
