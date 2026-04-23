'use client'

import type { CompanyGroup, CompanyGroupMember } from '@/lib/types'
import { useTranslations } from 'next-intl'
import { useId, useState, useTransition } from 'react'
import {
  addMemberToGroup,
  createCompanyGroup,
  deleteCompanyGroup,
  removeMemberFromGroup,
  updateCompanyGroup,
} from '@/app/(dashboard)/[orgSlug]/[companySlug]/settings/groups/actions'

const COLORS = [
  '#1a3a2e', '#2d8a6a', '#1d4ed8', '#7c3aed',
  '#db2777', '#d97706', '#dc2626', '#0891b2',
  '#059669', '#4f46e5', '#ea580c', '#0f172a',
]

interface CompanyUser {
  id: string
  full_name: string
  avatar_url: string | null
  email: string
}

interface Props {
  companyId: string
  companyName: string
  orgSlug: string
  companySlug: string
  initialGroups: CompanyGroup[]
  companyUsers: CompanyUser[]
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

export function CompanyGroupsPage({
  companyId,
  companyName,
  initialGroups,
  companyUsers,
}: Props) {
  const t = useTranslations('settings.groups')
  const [groups, setGroups] = useState<CompanyGroup[]>(initialGroups)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<CompanyGroup | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function toggleExpand(groupId: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  function handleCreate(name: string, color: string, description: string) {
    startTransition(async () => {
      try {
        const newGroup = await createCompanyGroup(companyId, name, color, description || undefined)
        setGroups((prev) => [...prev, newGroup])
        setModalOpen(false)
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error creating group')
      }
    })
  }

  function handleUpdate(groupId: string, name: string, color: string, description: string) {
    startTransition(async () => {
      try {
        await updateCompanyGroup(groupId, { name, color, description: description || undefined })
        setGroups((prev) =>
          prev.map((g) => (g.id === groupId ? { ...g, name, color, description: description || undefined } : g))
        )
        setEditingGroup(null)
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error updating group')
      }
    })
  }

  function handleDelete(groupId: string) {
    startTransition(async () => {
      try {
        await deleteCompanyGroup(groupId)
        setGroups((prev) => prev.filter((g) => g.id !== groupId))
        setConfirmDeleteId(null)
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error deleting group')
      }
    })
  }

  function handleAddMember(groupId: string, userId: string, role: 'lead' | 'member') {
    const user = companyUsers.find((u) => u.id === userId)
    if (!user) return
    startTransition(async () => {
      try {
        await addMemberToGroup(groupId, userId, role)
        const newMember: CompanyGroupMember = {
          id: `tmp-${Date.now()}`,
          company_group_id: groupId,
          user_id: userId,
          role,
          created_at: new Date().toISOString(),
          profile: {
            id: user.id,
            full_name: user.full_name,
            avatar_url: user.avatar_url ?? undefined,
            email: user.email,
          },
        }
        setGroups((prev) =>
          prev.map((g) =>
            g.id === groupId ? { ...g, members: [...(g.members ?? []), newMember] } : g
          )
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error adding member')
      }
    })
  }

  function handleRemoveMember(groupId: string, userId: string) {
    startTransition(async () => {
      try {
        await removeMemberFromGroup(groupId, userId)
        setGroups((prev) =>
          prev.map((g) =>
            g.id === groupId
              ? { ...g, members: (g.members ?? []).filter((m) => m.user_id !== userId) }
              : g
          )
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error removing member')
      }
    })
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: '800px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            {t('title')}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{companyName}</p>
        </div>
        <button
          type="button"
          onClick={() => { setEditingGroup(null); setModalOpen(true) }}
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
          {t('newGroup')}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: 'hsl(0 86% 97%)', color: 'hsl(0 72% 51%)', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)', fontSize: '14px' }}>
          {t('noMembers')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              expanded={expandedGroups.has(group.id)}
              companyUsers={companyUsers}
              onToggle={() => toggleExpand(group.id)}
              onEdit={() => { setEditingGroup(group); setModalOpen(true) }}
              onDelete={() => setConfirmDeleteId(group.id)}
              onAddMember={handleAddMember}
              onRemoveMember={handleRemoveMember}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <GroupModal
          group={editingGroup}
          onClose={() => { setModalOpen(false); setEditingGroup(null) }}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
        />
      )}

      {/* Confirm Delete Dialog */}
      {confirmDeleteId && (
        <ConfirmDialog
          message={t('confirmDelete')}
          onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}

// ── Group Card ──────────────────────────────────────────────────────────────

function GroupCard({
  group,
  expanded,
  companyUsers,
  onToggle,
  onEdit,
  onDelete,
  onAddMember,
  onRemoveMember,
}: {
  group: CompanyGroup
  expanded: boolean
  companyUsers: CompanyUser[]
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onAddMember: (groupId: string, userId: string, role: 'lead' | 'member') => void
  onRemoveMember: (groupId: string, userId: string) => void
}) {
  const t = useTranslations('settings.groups')
  const [addOpen, setAddOpen] = useState(false)

  const memberCount = group.members?.length ?? 0
  const availableUsers = companyUsers.filter(
    (u) => !(group.members ?? []).some((m) => m.user_id === u.id)
  )

  return (
    <div style={{
      background: 'var(--bg-base)',
      border: '0.5px solid var(--border-default)',
      borderRadius: '10px',
      overflow: 'hidden',
      borderLeft: `4px solid ${group.color}`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px' }}>
        <button
          type="button"
          onClick={onToggle}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}
        >
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5"
            style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .15s' }}
            aria-hidden
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: group.color, flexShrink: 0 }} />
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{group.name}</span>
        {group.description && (
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{group.description}</span>
        )}
        <span style={{
          fontSize: '11px', padding: '2px 8px', borderRadius: '8px',
          background: 'var(--bg-surface)', color: 'var(--text-secondary)',
        }}>
          {memberCount} {t('members')}
        </span>
        <button
          type="button" onClick={onEdit}
          style={{ padding: '4px 10px', borderRadius: '6px', border: '0.5px solid var(--border-default)', background: 'none', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}
        >
          {t('editGroup')}
        </button>
        <button
          type="button" onClick={onDelete}
          style={{ padding: '4px 10px', borderRadius: '6px', border: '0.5px solid var(--border-default)', background: 'none', fontSize: '12px', color: 'hsl(0 72% 51%)', cursor: 'pointer' }}
        >
          {t('deleteGroup')}
        </button>
      </div>

      {/* Members */}
      {expanded && (
        <div style={{ borderTop: '0.5px solid var(--border-default)', padding: '12px 16px', background: 'var(--bg-sunken)' }}>
          {(group.members ?? []).length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '0 0 10px' }}>{t('noMembers')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
              {(group.members ?? []).map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  groupId={group.id}
                  onRemove={onRemoveMember}
                />
              ))}
            </div>
          )}

          {availableUsers.length > 0 && (
            <div style={{ position: 'relative' }}>
              {addOpen ? (
                <AddMemberDropdown
                  users={availableUsers}
                  onSelect={(userId, role) => {
                    onAddMember(group.id, userId, role)
                    setAddOpen(false)
                  }}
                  onClose={() => setAddOpen(false)}
                />
              ) : (
                <button
                  type="button" onClick={() => setAddOpen(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '6px', border: '0.5px dashed var(--border-medium)', background: 'none', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  {t('addMember')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MemberRow({
  member,
  groupId,
  onRemove,
}: {
  member: CompanyGroupMember
  groupId: string
  onRemove: (groupId: string, userId: string) => void
}) {
  const t = useTranslations('settings.groups')
  const p = member.profile
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' }}>
      <div style={{
        width: '26px', height: '26px', borderRadius: '50%',
        background: 'var(--primary-light)', color: 'hsl(var(--primary))',
        fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {p?.avatar_url ? (
          <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          getInitials(p?.full_name ?? '?')
        )}
      </div>
      <span style={{ fontSize: '13px', color: 'var(--text-primary)', flex: 1 }}>{p?.full_name}</span>
      <span style={{
        fontSize: '11px', padding: '2px 7px', borderRadius: '6px',
        background: member.role === 'lead' ? 'var(--primary-light)' : 'var(--bg-surface)',
        color: member.role === 'lead' ? 'hsl(var(--primary))' : 'var(--text-secondary)',
      }}>
        {member.role === 'lead' ? t('lead') : t('member')}
      </span>
      <button
        type="button"
        onClick={() => onRemove(groupId, member.user_id)}
        style={{ padding: '3px 8px', borderRadius: '5px', border: '0.5px solid var(--border-default)', background: 'none', fontSize: '11px', color: 'var(--text-tertiary)', cursor: 'pointer' }}
      >
        {t('removeMember')}
      </button>
    </div>
  )
}

function AddMemberDropdown({
  users,
  onSelect,
  onClose,
}: {
  users: CompanyUser[]
  onSelect: (userId: string, role: 'lead' | 'member') => void
  onClose: () => void
}) {
  const t = useTranslations('settings.groups')
  const [selectedRole, setSelectedRole] = useState<'lead' | 'member'>('member')

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={onClose} aria-hidden />
      <div style={{
        position: 'absolute', top: '100%', left: 0, zIndex: 50,
        background: 'var(--bg-base)', border: '0.5px solid var(--border-medium)',
        borderRadius: '10px', padding: '8px', minWidth: '240px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)', marginTop: '4px',
      }}>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
          {(['member', 'lead'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setSelectedRole(r)}
              style={{
                padding: '3px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 500,
                background: selectedRole === r ? 'var(--primary-light)' : 'var(--bg-surface)',
                color: selectedRole === r ? 'hsl(var(--primary))' : 'var(--text-secondary)',
              }}
            >
              {r === 'lead' ? t('lead') : t('member')}
            </button>
          ))}
        </div>
        {users.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => onSelect(u.id, selectedRole)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              width: '100%', padding: '6px 8px', borderRadius: '6px',
              background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-surface)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
          >
            <div style={{
              width: '22px', height: '22px', borderRadius: '50%',
              background: 'var(--primary-light)', color: 'hsl(var(--primary))',
              fontSize: '9px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {u.avatar_url ? (
                <img src={u.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              ) : getInitials(u.full_name)}
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{u.full_name}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{u.email}</div>
            </div>
          </button>
        ))}
      </div>
    </>
  )
}

// ── Group Modal ─────────────────────────────────────────────────────────────

function GroupModal({
  group,
  onClose,
  onCreate,
  onUpdate,
}: {
  group: CompanyGroup | null
  onClose: () => void
  onCreate: (name: string, color: string, description: string) => void
  onUpdate: (groupId: string, name: string, color: string, description: string) => void
}) {
  const t = useTranslations('settings.groups')
  const id = useId()
  const [name, setName] = useState(group?.name ?? '')
  const [color, setColor] = useState(group?.color ?? COLORS[1])
  const [description, setDescription] = useState(group?.description ?? '')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    startTransition(() => {
      if (group) {
        onUpdate(group.id, name, color, description)
      } else {
        onCreate(name, color, description)
      }
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
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {group ? t('editGroup') : t('newGroup')}
          </h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '4px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ height: '4px', background: color, borderRadius: '2px', marginBottom: '20px', transition: 'background .2s' }} />

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor={`${id}-name`} style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {t('groupName')} *
            </label>
            <input
              id={`${id}-name`}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '8px', border: '0.5px solid var(--border-medium)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              onFocus={(e) => { e.target.style.borderColor = 'var(--primary-mid)' }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--border-medium)' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {t('groupColor')}
            </label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{
                    width: '26px', height: '26px', borderRadius: '6px', background: c, border: 'none', cursor: 'pointer',
                    outline: color === c ? `3px solid hsl(var(--primary))` : 'none',
                    outlineOffset: '1px',
                  }}
                  title={c}
                />
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label htmlFor={`${id}-desc`} style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {t('groupDescription')}
            </label>
            <textarea
              id={`${id}-desc`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '0.5px solid var(--border-medium)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              onFocus={(e) => { e.target.style.borderColor = 'var(--primary-mid)' }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--border-medium)' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button" onClick={onClose}
              style={{ flex: 1, height: '38px', borderRadius: '8px', border: '0.5px solid var(--border-medium)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}
            >
              {/* Cancel */}
              ✕
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isPending}
              style={{
                flex: 2, height: '38px', borderRadius: '8px',
                background: !name.trim() || isPending ? 'var(--border-default)' : 'hsl(var(--primary))',
                color: 'white', border: 'none', fontSize: '13px', fontWeight: 600,
                cursor: !name.trim() || isPending ? 'not-allowed' : 'pointer',
              }}
            >
              {group ? t('editGroup') : t('newGroup')}
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
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
