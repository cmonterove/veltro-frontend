/** Códigos que lanzan las funciones/triggers SQL (raise exception '<code>'). */
const KNOWN = [
  'plan_limit_workspaces',
  'plan_limit_members',
  'member_not_in_account',
  'cannot_remove_owner',
  'cannot_assign_owner',
  'assignee_not_in_workspace',
  'already_in_account',
  'forbidden',
  'doc_parent_cycle',
  'not_authenticated',
] as const

export type ErrorCode = (typeof KNOWN)[number] | 'generic' | 'email_taken' | 'invalid_email'

export function toErrorCode(error: { message?: string } | null | undefined): ErrorCode {
  const msg = error?.message ?? ''
  return KNOWN.find((k) => msg.includes(k)) ?? 'generic'
}
