'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Plus, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/ui/input'
import { StatusIcon } from '@/components/tasks/status-icon'
import { createClient } from '@/lib/supabase/client'
import { TASK_STATUSES } from '@/lib/constants'
import { defaultStatusDefs } from '@/lib/statuses'
import { cn } from '@/lib/utils'
import { SettingsCard } from './ui'
import type { TaskStatus, TaskStatusDef } from '@/lib/database.types'
import type { WorkspaceWithRole } from '@/lib/types'
import { Select } from '@/components/ui/select'
import { useConfirm } from '@/components/ui/confirm'

/**
 * Estados propios de un espacio. Cada estado pertenece a una categoría fija; la categoría es la
 * que entienden Hoy, Mesa y los contadores, así un "En revisión cliente" cuenta como "En curso".
 */
export function StatusEditor({ workspace }: { workspace: WorkspaceWithRole }) {
  const t = useTranslations('settings.workspaces.statuses')
  const tCat = useTranslations('tasks.status')
  const confirm = useConfirm()
  const tConfirm = useTranslations('confirm')
  const router = useRouter()
  const [draft, setDraft] = useState<TaskStatusDef[] | null>(workspace.task_statuses?.length ? workspace.task_statuses : null)
  const [pending, start] = useTransition()
  const custom = draft !== null

  const save = (next: TaskStatusDef[]) =>
    start(async () => {
      const clean = next.map((s) => ({ ...s, name: s.name.trim().slice(0, 40) })).filter((s) => s.name)
      const { error } = await createClient().from('workspaces').update({ task_statuses: clean }).eq('id', workspace.id)
      if (error) {
        toast.error(t('error'))
        return
      }
      toast.success(t('saved'))
      setDraft(clean.length ? clean : null)
      router.refresh()
    })

  const edit = (i: number, patch: Partial<TaskStatusDef>) => setDraft((d) => d && d.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      if (!d) return d
      const next = [...d]
      const [item] = next.splice(i, 1)
      next.splice(i + dir, 0, item)
      return next
    })

  return (
    <SettingsCard title={t('title')} description={t('hint')}>
      <div className="flex flex-col gap-3 p-5">

        {!custom ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {TASK_STATUSES.map((c) => (
              <span key={c} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 text-xs">
                <StatusIcon status={c} className="size-3.5" />
                {tCat(c)}
              </span>
            ))}
            <Button
              variant="secondary"
              size="sm"
              className="ml-auto"
              onClick={() => setDraft(defaultStatusDefs(Object.fromEntries(TASK_STATUSES.map((c) => [c, tCat(c)])) as Record<TaskStatus, string>))}
            >
              {t('customize')}
            </Button>
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-1.5">
              {draft!.map((s, i) => (
                <li key={s.id} className="flex items-center gap-2">
                  <StatusIcon status={s.category} className="size-4 shrink-0" />
                  <input
                    value={s.name}
                    onChange={(e) => edit(i, { name: e.target.value })}
                    placeholder={t('namePlaceholder')}
                    maxLength={40}
                    aria-label={t('namePlaceholder')}
                    className={cn(inputClass, 'h-8 min-w-0 flex-1')}
                  />
                  <Select<TaskStatus>
                    value={s.category}
                    onChange={(v) => edit(i, { category: v })}
                    aria-label={t('category')}
                    options={TASK_STATUSES.map((c) => ({ value: c, label: tCat(c), icon: <StatusIcon status={c} /> }))}
                    className="h-8 w-40 shrink-0"
                  />
                  <span className="flex shrink-0">
                    <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('moveUp')} className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg disabled:opacity-30">
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button type="button" disabled={i === draft!.length - 1} onClick={() => move(i, 1)} aria-label={t('moveDown')} className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg disabled:opacity-30">
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={draft!.length <= 1}
                      onClick={() => setDraft((d) => d && d.filter((_, j) => j !== i))}
                      aria-label={t('remove')}
                      className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={draft!.length >= 30}
                onClick={() => setDraft((d) => [...(d ?? []), { id: `s_${crypto.randomUUID().slice(0, 8)}`, name: '', category: 'in_progress' }])}
              >
                <Plus />
                {t('add')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (!workspace.task_statuses?.length) return setDraft(null)
                  if (await confirm({ title: t('resetConfirm'), danger: true, confirmLabel: tConfirm('reset') })) save([])
                }}
              >
                <RotateCcw />
                {t('reset')}
              </Button>
              <Button variant="primary" size="sm" className="ml-auto" loading={pending} disabled={!draft!.some((s) => s.name.trim())} onClick={() => save(draft!)}>
                {t('save')}
              </Button>
            </div>
          </>
        )}
      </div>
    </SettingsCard>
  )
}
