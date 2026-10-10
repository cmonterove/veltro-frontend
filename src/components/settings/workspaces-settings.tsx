'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Archive, Plus } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { createWorkspace, updateWorkspace, archiveWorkspace } from '@/app/actions/settings'
import { WORKSPACE_COLORS } from '@/lib/constants'
import { WorkspaceMark, monogramOf } from '@/components/app/marks'
import { cn } from '@/lib/utils'
import type { WorkspaceWithRole } from '@/lib/types'
import { SettingsSection } from './section'

type Usage = { max_workspaces: number | null; workspaces_count: number } | null

export function WorkspacesSettings({
  memberCounts,
  usage,
  openNew,
  editId,
}: {
  memberCounts: Record<string, number>
  usage: Usage
  openNew: boolean
  editId: string | null
}) {
  const t = useTranslations('settings.workspaces')
  const { workspaces } = useApp()
  const [creating, setCreating] = useState(openNew)
  const [editing, setEditing] = useState<string | null>(editId)
  const full = usage?.max_workspaces != null && usage.workspaces_count >= usage.max_workspaces

  return (
    <SettingsSection
      title={t('title')}
      description={usage?.max_workspaces != null ? t('descriptionLimit', { used: usage.workspaces_count, max: usage.max_workspaces }) : t('description')}
      action={
        <Button variant="primary" size="sm" onClick={() => setCreating(true)} disabled={full || creating}>
          <Plus />
          {t('new')}
        </Button>
      }
    >
      {full ? <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-fg">{t('limitReached')}</p> : null}
      {creating ? (
        <div className="mb-4 rounded-xl border border-line p-4">
          <WorkspaceForm onDone={() => setCreating(false)} />
        </div>
      ) : null}
      <ul className="flex flex-col divide-y divide-line border-y border-line">
        {workspaces.map((w) => (
          <li key={w.id} className={cn('ws-' + w.color)}>
            <button type="button" onClick={() => setEditing(editing === w.id ? null : w.id)} className="flex w-full items-center gap-3 py-3 text-left">
              <WorkspaceMark ws={w} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{w.name}</span>
                <span className="block truncate text-xs text-fg-muted">{w.description || `/w/${w.slug}`}</span>
              </span>
              <span className="font-mono text-xs text-fg-subtle">{w.key}</span>
              <span className="w-24 text-right text-xs text-fg-muted">{t('members', { count: memberCounts[w.id] ?? 0 })}</span>
            </button>
            {editing === w.id ? (
              <div className="mb-4 rounded-xl border border-line p-4">
                <WorkspaceForm workspace={w} onDone={() => setEditing(null)} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-fg-subtle">{t('membersHint')}</p>
    </SettingsSection>
  )
}

function WorkspaceForm({ workspace, onDone }: { workspace?: WorkspaceWithRole; onDone: () => void }) {
  const t = useTranslations('settings.workspaces')
  const te = useTranslations('errors')
  const router = useRouter()
  const [name, setName] = useState(workspace?.name ?? '')
  const [icon, setIcon] = useState(workspace ? monogramOf(workspace) : '')
  const [color, setColor] = useState<string>(workspace?.color ?? 'violet')
  const monogram = icon.trim() || monogramOf({ name: name || 'V' })
  const [description, setDescription] = useState(workspace?.description ?? '')
  const [pending, start] = useTransition()

  const submit = () =>
    start(async () => {
      const res = workspace
        ? await updateWorkspace(workspace.id, { name, icon: monogram, color, description })
        : await createWorkspace({ name, icon: monogram, color, description })
      if (!res.ok) {
        toast.error(te(res.error))
        return
      }
      toast.success(workspace ? t('saved') : t('created'))
      onDone()
      if (!workspace && 'slug' in res) router.push(`/w/${res.slug}`)
      else router.refresh()
    })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="flex flex-col gap-4"
    >
      <Field label={t('name')} htmlFor={`ws-name-${workspace?.id ?? 'new'}`}>
        <Input id={`ws-name-${workspace?.id ?? 'new'}`} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus />
      </Field>
      <div className="flex items-end gap-4">
        <WorkspaceMark ws={{ icon: monogram, name: name || 'V', color }} size={40} />
        <Field label={t('icon')} hint={t('iconHint')} htmlFor={`ws-mono-${workspace?.id ?? 'new'}`} className="w-40">
          <Input
            id={`ws-mono-${workspace?.id ?? 'new'}`}
            value={icon}
            onChange={(e) => setIcon(e.target.value.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase())}
            placeholder={monogramOf({ name: name || 'V' })}
            maxLength={2}
            className="font-semibold uppercase"
          />
        </Field>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t('color')}</span>
        <div className="flex flex-wrap gap-1.5">
          {WORKSPACE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={c}
              aria-pressed={color === c}
              className={cn('rounded-[9px] p-0.5 ring-offset-2 ring-offset-panel transition-shadow', color === c && 'ring-2 ring-accent')}
            >
              <WorkspaceMark ws={{ icon: monogram, name: name || 'V', color: c }} size={26} />
            </button>
          ))}
        </div>
      </div>
      <Field label={t('descriptionLabel')} htmlFor={`ws-desc-${workspace?.id ?? 'new'}`}>
        <Textarea id={`ws-desc-${workspace?.id ?? 'new'}`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} className="min-h-16" />
      </Field>
      <div className="flex items-center gap-2">
        {workspace ? (
          <Button
            variant="danger-ghost"
            size="sm"
            onClick={() =>
              start(async () => {
                if (!window.confirm(t('archiveConfirm', { name: workspace.name }))) return
                const res = await archiveWorkspace(workspace.id)
                if (res.ok) {
                  toast.success(t('archived'))
                  router.push('/settings/workspaces')
                  router.refresh()
                } else toast.error(te(res.error))
              })
            }
          >
            <Archive />
            {t('archive')}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onDone}>
          {t('cancel')}
        </Button>
        <Button type="submit" variant="primary" size="sm" loading={pending} disabled={!name.trim()}>
          {workspace ? t('save') : t('create')}
        </Button>
      </div>
    </form>
  )
}
