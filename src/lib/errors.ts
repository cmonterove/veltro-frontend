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
  'reports_to_cycle',
  'reports_to_self',
  'reports_to_not_member',
  'head_not_member',
  'department_other_account',
  'invalid_statuses',
  'invalid_status',
] as const

export type ErrorCode = (typeof KNOWN)[number] | 'generic' | 'email_taken' | 'invalid_email'

export function toErrorCode(error: { message?: string } | null | undefined): ErrorCode {
  const msg = error?.message ?? ''
  return KNOWN.find((k) => msg.includes(k)) ?? 'generic'
}
