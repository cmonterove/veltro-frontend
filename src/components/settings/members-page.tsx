'use client'

import type { Invitation } from '@/lib/types'
import { useTranslations } from 'next-intl'
import { useId, useState, useTransition } from 'react'
import {
  cancelInvitation,
  removeMemberFromOrg,
  resendInvitation,
  sendInvitation,
  updateMemberRole,
  type OrgMember,
} from '@/app/(dashboard)/[orgSlug]/settings/members/actions'

interface Company {
  id: string
  name: string
  slug: string
}

interface Props {
  organizationId: string
  orgSlug: string
  currentUserRole: string
  members: OrgMember[]
  invitations: Invitation[]
  companies: Company[]
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

const ROLES = ['org_owner', 'admin', 'member', 'guest'] as const

export function MembersPage({
  organizationId,
  currentUserRole,
  members: initialMembers,
  invitations: initialInvitations,
  companies,
}: Props) {
  const t = useTranslations('settings.members')
  const [members, setMembers] = useState<OrgMember[]>(initialMembers)
  const [invitations, setInvitations] = useState<Invitation[]>(initialInvitations)
  const [search, setSearch] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const isOwner = currentUserRole === 'org_owner'

  const filteredMembers = members.filter(
    (m) =>
      m.full_name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase())
  )

  function handleRoleChange(userId: string, role: string) {
    startTransition(async () => {
      try {
        await updateMemberRole(userId, organizationId, role)
        setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, role } : m)))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error updating role')
      }
    })
  }

  function handleRemove(userId: string) {
    startTransition(async () => {
      try {
        await removeMemberFromOrg(userId, organizationId)
        setMembers((prev) => prev.filter((m) => m.id !== userId))
        setConfirmRemoveId(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error removing member')
      }
    })
  }

  function handleSendInvite(email: string, role: string, companyId?: string) {
    startTransition(async () => {
      try {
        await sendInvitation(organizationId, email, role, companyId)
        // Reload invitations
        const { getPendingInvitations } = await import('@/app/(dashboard)/[orgSlug]/settings/members/actions')
        const fresh = await getPendingInvitations(organizationId)
        setInvitations(fresh)
        setInviteOpen(false)
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error sending invitation')
      }
    })
  }

  function handleCancelInvite(invId: string) {
    startTransition(async () => {
      try {
        await cancelInvitation(invId)
        setInvitations((prev) => prev.filter((i) => i.id !== invId))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error cancelling invitation')
      }
    })
  }

  function handleResendInvite(invId: string) {
    startTransition(async () => {
      try {
        await resendInvitation(invId)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error resending invitation')
      }
    })
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: '900px' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>{t('title')}</h1>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            padding: '8px 16px', borderRadius: '8px',
            background: 'hsl(var(--primary))', color: 'white',
            border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('invite')}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: 'hsl(0 86% 97%)', color: 'hsl(0 72% 51%)', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '16px', maxWidth: '320px' }}>
        <svg style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }}
          width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`${t('title')}...`}
          style={{ width: '100%', height: '36px', paddingLeft: '32px', paddingRight: '12px', borderRadius: '8px', border: '0.5px solid var(--border-medium)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {/* Members table */}
      <div style={{ background: 'var(--bg-base)', border: '0.5px solid var(--border-default)', borderRadius: '10px', overflow: 'hidden', marginBottom: '32px' }}>
        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 120px 80px', padding: '10px 16px', borderBottom: '0.5px solid var(--border-default)', background: 'var(--bg-sunken)' }}>
          {['Name', 'Email', 'Role', ''].map((col) => (
            <div key={col} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{col}</div>
          ))}
        </div>

        {filteredMembers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>{t('noMembers')}</div>
        ) : (
          filteredMembers.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              isOwner={isOwner}
              onRoleChange={handleRoleChange}
              onRemove={() => setConfirmRemoveId(member.id)}
            />
          ))
        )}
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>{t('pendingInvitations')}</h2>
          <div style={{ background: 'var(--bg-base)', border: '0.5px solid var(--border-default)', borderRadius: '10px', overflow: 'hidden' }}>
            {invitations.map((inv, i) => (
              <InvitationRow
                key={inv.id}
                invitation={inv}
                isLast={i === invitations.length - 1}
                onResend={() => handleResendInvite(inv.id)}
                onCancel={() => handleCancelInvite(inv.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Invite modal */}
      {inviteOpen && (
        <InviteModal
          companies={companies}
          onClose={() => setInviteOpen(false)}
          onSend={handleSendInvite}
        />
      )}

      {/* Confirm remove */}
      {confirmRemoveId && (
        <ConfirmDialog
          message={t('confirmRemove')}
          onConfirm={() => handleRemove(confirmRemoveId)}
          onCancel={() => setConfirmRemoveId(null)}
        />
      )}
    </div>
  )
}

// ── Member Row ──────────────────────────────────────────────────────────────

function MemberRow({
  member,
  isOwner,
  onRoleChange,
  onRemove,
}: {
  member: OrgMember
  isOwner: boolean
  onRoleChange: (userId: string, role: string) => void
  onRemove: () => void
}) {
  const t = useTranslations('settings.members')
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 200px 120px 80px',
      padding: '10px 16px', borderBottom: '0.5px solid var(--border-default)', alignItems: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '50%',
          background: 'var(--primary-light)', color: 'hsl(var(--primary))',
          fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {member.avatar_url ? (
            <img src={member.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
          ) : getInitials(member.full_name)}
        </div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{member.full_name}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
            {t('joinedAt')} {new Date(member.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.email}</div>
      <div>
        {isOwner ? (
          <select
            value={member.role}
            onChange={(e) => onRoleChange(member.id, e.target.value)}
            style={{
              padding: '4px 8px', borderRadius: '6px', border: '0.5px solid var(--border-default)',
              background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer',
            }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{t(`roles.${r}`)}</option>
            ))}
          </select>
        ) : (
          <RoleBadge role={member.role} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {isOwner && (
          <button
            type="button"
            onClick={onRemove}
            title={t('remove')}
            style={{ padding: '4px 8px', borderRadius: '6px', border: '0.5px solid var(--border-default)', background: 'none', fontSize: '11px', color: 'hsl(0 72% 51%)', cursor: 'pointer' }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const t = useTranslations('settings.members')
  const roleKey = ROLES.includes(role as (typeof ROLES)[number]) ? (role as (typeof ROLES)[number]) : 'member'
  return (
    <span style={{
      display: 'inline-block', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 500,
      background: role === 'org_owner' ? 'var(--primary-light)' : 'var(--bg-surface)',
      color: role === 'org_owner' ? 'hsl(var(--primary))' : 'var(--text-secondary)',
    }}>
      {t(`roles.${roleKey}`)}
    </span>
  )
}

// ── Invitation Row ──────────────────────────────────────────────────────────

function InvitationRow({
  invitation,
  isLast,
  onResend,
  onCancel,
}: {
  invitation: Invitation
  isLast: boolean
  onResend: () => void
  onCancel: () => void
}) {
  const t = useTranslations('settings.members')
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '10px 16px',
      borderBottom: isLast ? 'none' : '0.5px solid var(--border-default)',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{invitation.email}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
          {t('invitedAt')} {new Date(invitation.created_at).toLocaleDateString()} ·{' '}
          {t('expiresAt')} {new Date(invitation.expires_at).toLocaleDateString()}
        </div>
      </div>
      <RoleBadge role={invitation.role} />
      <button type="button" onClick={onResend}
        style={{ padding: '4px 10px', borderRadius: '6px', border: '0.5px solid var(--border-default)', background: 'none', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
        {t('resend')}
      </button>
      <button type="button" onClick={onCancel}
        style={{ padding: '4px 10px', borderRadius: '6px', border: '0.5px solid var(--border-default)', background: 'none', fontSize: '12px', color: 'hsl(0 72% 51%)', cursor: 'pointer' }}>
        {t('cancel')}
      </button>
    </div>
  )
}

// ── Invite Modal ────────────────────────────────────────────────────────────

function InviteModal({
  companies,
  onClose,
  onSend,
}: {
  companies: Company[]
  onClose: () => void
  onSend: (email: string, role: string, companyId?: string) => void
}) {
  const t = useTranslations('settings.members')
  const id = useId()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>('member')
  const [companyId, setCompanyId] = useState<string>('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    startTransition(() => {
      onSend(email, role, companyId || undefined)
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: '420px',
        background: 'var(--bg-base)', borderRadius: '14px',
        border: '0.5px solid var(--border-default)',
        padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{t('invite')}</h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '4px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label htmlFor={`${id}-email`} style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {t('inviteEmail')} *
            </label>
            <input
              id={`${id}-email`}
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '8px', border: '0.5px solid var(--border-medium)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              onFocus={(e) => { e.target.style.borderColor = 'var(--primary-mid)' }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--border-medium)' }}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label htmlFor={`${id}-role`} style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {t('inviteRole')}
            </label>
            <select
              id={`${id}-role`}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '8px', border: '0.5px solid var(--border-medium)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {companies.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <label htmlFor={`${id}-company`} style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {t('inviteCompany')}
              </label>
              <select
                id={`${id}-company`}
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '8px', border: '0.5px solid var(--border-medium)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}
              >
                <option value="">— {t('inviteCompany')} —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, height: '38px', borderRadius: '8px', border: '0.5px solid var(--border-medium)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={!email.trim() || isPending}
              style={{
                flex: 2, height: '38px', borderRadius: '8px',
                background: !email.trim() || isPending ? 'var(--border-default)' : 'hsl(var(--primary))',
                color: 'white', border: 'none', fontSize: '13px', fontWeight: 600,
                cursor: !email.trim() || isPending ? 'not-allowed' : 'pointer',
              }}
            >
              {t('sendInvite')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Confirm Dialog ──────────────────────────────────────────────────────────

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        width: '100%', maxWidth: '360px', background: 'var(--bg-base)',
        borderRadius: '12px', padding: '24px',
        border: '0.5px solid var(--border-default)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
      }}>
        <p style={{ fontSize: '14px', color: 'var(--text-primary)', marginBottom: '20px', lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}
            style={{ padding: '7px 16px', borderRadius: '7px', border: '0.5px solid var(--border-medium)', background: 'none', fontSize: '13px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm}
            style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'hsl(0 72% 51%)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}
