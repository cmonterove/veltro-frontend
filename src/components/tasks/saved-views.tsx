'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Bookmark, BookmarkCheck, BookmarkPlus, ChevronDown, Pencil, RefreshCw, Settings2, Trash2, UsersRound } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Switch } from '@/components/ui/switch'
import { Tooltip } from '@/components/ui/tooltip'
import { useConfirm } from '@/components/ui/confirm'
import { normalizeViewQuery, useSavedViewMutations, useSavedViews, type SavedView } from '@/lib/queries/views'
import { track } from '@/lib/telemetry'
import { cn } from '@/lib/utils'

/**
 * Vistas guardadas de Tareas: lo que se está mirando (alcance, filtros, pestaña y agrupación) con
 * un nombre, para volver de un clic. Personales o compartidas con la cuenta.
 */
export function SavedViewsMenu({ groupBy, onApply }: { groupBy: string; onApply: (query: string, groupBy: string | null) => void }) {
  const t = useTranslations('views')
  const params = useSearchParams()
  const { data: views = [] } = useSavedViews()
  const { update } = useSavedViewMutations()
  const [saving, setSaving] = useState(false)
  const [managing, setManaging] = useState(false)

  const current = normalizeViewQuery(params.toString())
  // la vista que coincide con lo que se ve (la agrupación cuenta si la vista la guardó)
  const active = views.find((v) => normalizeViewQuery(v.query) === current && (!v.groupBy || v.groupBy === groupBy))
  const mine = views.filter((v) => v.mine)
  const shared = views.filter((v) => !v.mine)

  const apply = (v: SavedView) => {
    onApply(v.query, v.groupBy)
    track('feature.saved_view_apply')
  }

  return (
    <>
      <Menu>
        <MenuTrigger
          className={cn(
            'inline-flex h-8 max-w-56 items-center gap-1.5 rounded-full border px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-mid/40',
            active ? 'border-accent-mid/40 bg-accent-soft font-medium text-accent-ink' : 'border-line text-fg-muted hover:bg-hover hover:text-fg',
          )}
        >
          {active ? <BookmarkCheck className="size-3.5 shrink-0" /> : <Bookmark className="size-3.5 shrink-0" />}
          <span className="truncate">{active ? active.name : t('views')}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-70" />
        </MenuTrigger>
        <MenuContent align="end" className="w-72">
          {mine.length ? (
            <>
              <MenuLabel>{t('mine')}</MenuLabel>
              {mine.map((v) => (
                <ViewItem key={v.id} view={v} active={v.id === active?.id} onClick={() => apply(v)} />
              ))}
            </>
          ) : null}
          {shared.length ? (
            <>
              {mine.length ? <MenuSeparator /> : null}
              <MenuLabel>{t('shared')}</MenuLabel>
              {shared.map((v) => (
                <ViewItem key={v.id} view={v} active={v.id === active?.id} onClick={() => apply(v)} />
              ))}
            </>
          ) : null}
          {!views.length ? <p className="px-2.5 py-2 text-xs leading-relaxed text-fg-muted">{t('empty')}</p> : null}
          <MenuSeparator />
          {active?.mine ? null : (
            <MenuItem onClick={() => setSaving(true)}>
              <BookmarkPlus />
              {t('save')}
            </MenuItem>
          )}
          {mine.length ? (
            <MenuItem onClick={() => setManaging(true)}>
              <Settings2 />
              {t('manage')}
            </MenuItem>
          ) : null}
        </MenuContent>
      </Menu>
      <SaveViewDialog
        open={saving}
        onOpenChange={setSaving}
        query={params.toString()}
        groupBy={groupBy}
        views={mine}
        onReplace={(v) =>
          update.mutate(
            { id: v.id, patch: { query: params.toString(), groupBy } },
            { onSuccess: () => toast.success(t('updated', { name: v.name })) },
          )
        }
      />
      <ManageViewsDialog open={managing} onOpenChange={setManaging} views={mine} />
    </>
  )
}

function ViewItem({ view: v, active, onClick }: { view: SavedView; active: boolean; onClick: () => void }) {
  const t = useTranslations('views')
  return (
    <MenuItem onClick={onClick}>
      {v.mine ? (
        active ? <BookmarkCheck className="!text-accent" /> : <Bookmark />
      ) : (
        <Avatar name={v.owner.fullName} src={v.owner.avatarUrl} seed={v.owner.id} size={16} />
      )}
      <span className={cn('min-w-0 flex-1 truncate', active && 'font-medium')}>{v.name}</span>
      {v.mine && v.shared ? (
        <Tooltip content={t('sharedHint')}>
          <UsersRound className="!size-3.5 !text-fg-subtle" />
        </Tooltip>
      ) : null}
      {!v.mine ? <span className="max-w-20 truncate text-2xs text-fg-subtle">{v.owner.fullName.split(' ')[0]}</span> : null}
    </MenuItem>
  )
}

/** Guardar lo que se ve: con nombre nuevo o reemplazando una de mis vistas. */
function SaveViewDialog({
  open,
  onOpenChange,
  query,
  groupBy,
  views,
  onReplace,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  query: string
  groupBy: string
  views: SavedView[]
  onReplace: (v: SavedView) => void
}) {
  const t = useTranslations('views')
  const { create } = useSavedViewMutations()
  const [name, setName] = useState('')
  const [shared, setShared] = useState(false)
  useEffect(() => {
    if (open) {
      setName('')
      setShared(false)
    }
  }, [open])
  const same = views.find((v) => v.name.trim().toLowerCase() === name.trim().toLowerCase())

  const submit = () => {
    if (!name.trim()) return
    if (same) {
      onReplace(same)
      onOpenChange(false)
      return
    }
    create.mutate(
      { name: name.trim(), query, groupBy, shared },
      {
        onSuccess: (v) => {
          toast.success(t('saved', { name: v.name }))
          track('feature.saved_view_create')
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <DialogHeader title={t('saveTitle')} description={t('saveHint')} />
          <DialogBody className="flex flex-col gap-4">
            <Field label={t('name')} htmlFor="view-name" hint={same ? t('replaceHint', { name: same.name }) : undefined}>
              <Input id="view-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus placeholder={t('namePlaceholder')} />
            </Field>
            {!same ? (
              <label className="flex cursor-pointer items-start gap-3">
                <Switch checked={shared} onCheckedChange={setShared} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium text-fg">{t('share')}</span>
                  <span className="block text-xs text-fg-muted">{t('shareHint')}</span>
                </span>
              </label>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={!name.trim()} loading={create.isPending}>
              {same ? (
                <>
                  <RefreshCw />
                  {t('replace')}
                </>
              ) : (
                t('saveButton')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Mis vistas: renombrar, compartir o dejar de compartir, borrar. */
function ManageViewsDialog({ open, onOpenChange, views }: { open: boolean; onOpenChange: (o: boolean) => void; views: SavedView[] }) {
  const t = useTranslations('views')
  const tConfirm = useTranslations('confirm')
  const confirm = useConfirm()
  const { update, remove } = useSavedViewMutations()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const sorted = useMemo(() => [...views].sort((a, b) => a.position - b.position), [views])

  const rename = (v: SavedView) => {
    const name = draft.trim()
    setEditing(null)
    if (name && name !== v.name) update.mutate({ id: v.id, patch: { name } })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader title={t('manageTitle')} description={t('manageHint')} />
        <DialogBody>
          {sorted.length ? (
            <ul className="flex flex-col divide-y divide-line-soft rounded-xl border border-line">
              {sorted.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Bookmark className="size-4 shrink-0 text-fg-subtle" />
                  {editing === v.id ? (
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => rename(v)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') rename(v)
                        if (e.key === 'Escape') setEditing(null)
                      }}
                      maxLength={60}
                      autoFocus
                      aria-label={t('name')}
                      className="h-8 min-w-0 flex-1 rounded-md border border-accent-mid bg-panel px-2 text-sm outline-none"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{v.name}</span>
                  )}
                  <Tooltip content={v.shared ? t('unshare') : t('share')}>
                    <span className="flex items-center gap-1.5">
                      <UsersRound className={cn('size-3.5', v.shared ? 'text-accent' : 'text-fg-subtle')} />
                      <Switch checked={v.shared} onCheckedChange={(on) => update.mutate({ id: v.id, patch: { shared: on } })} aria-label={t('share')} />
                    </span>
                  </Tooltip>
                  <Tooltip content={t('rename')}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('rename')}
                      onClick={() => {
                        setDraft(v.name)
                        setEditing(v.id)
                      }}
                    >
                      <Pencil />
                    </Button>
                  </Tooltip>
                  <Tooltip content={t('delete')}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('delete')}
                      onClick={async () => {
                        if (await confirm({ title: t('deleteConfirm', { name: v.name }), danger: true, confirmLabel: tConfirm('delete') })) remove.mutate(v.id)
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </Tooltip>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">{t('empty')}</p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            {t('done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
