'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { BookmarkPlus, ChevronDown, LayoutTemplate } from 'lucide-react'
import { useWorkspaceMap } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Select } from '@/components/ui/select'
import { useMeetingItemMutations } from '@/lib/queries/meetings'
import { useTemplateMutations, useTemplates } from '@/lib/queries/templates'
import { track } from '@/lib/telemetry'
import type { MeetingItemRow, MeetingRow } from '@/lib/database.types'
import { positionBetween } from '@/lib/utils'

/**
 * Agendas de siempre (comité semanal, revisión con el cliente): cargar una plantilla en la reunión
 * o guardar la agenda de esta como plantilla.
 */
export function AgendaTemplatesMenu({ meeting, agenda }: { meeting: MeetingRow; agenda: MeetingItemRow[] }) {
  const t = useTranslations('templates.agenda')
  const { data: templates = [] } = useTemplates('agenda')
  const usable = templates.filter((x) => !x.workspaceId || x.workspaceId === meeting.workspace_id)
  const { add } = useMeetingItemMutations(meeting.id)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  const apply = async (items: { text: string }[], name: string) => {
    setBusy(true)
    try {
      // en orden, después de lo que ya hay (sin repetir puntos que ya estén)
      const have = new Set(agenda.map((a) => a.text.trim().toLowerCase()))
      let last = agenda.at(-1)?.position
      for (const it of items) {
        if (have.has(it.text.trim().toLowerCase())) continue
        const position = positionBetween(last, null)
        last = position
        await add.mutateAsync({ kind: 'agenda', text: it.text, position })
      }
      toast.success(t('applied', { name }))
      track('feature.template_use_agenda')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Menu>
        <MenuTrigger render={<Button variant="ghost" size="sm" loading={busy} />}>
          {busy ? null : <LayoutTemplate />}
          {t('templates')}
          <ChevronDown className="opacity-60" />
        </MenuTrigger>
        <MenuContent align="end" className="w-64">
          {usable.length ? (
            <>
              <MenuLabel>{t('use')}</MenuLabel>
              {usable.map((x) => (
                <MenuItem key={x.id} onClick={() => apply(x.data.items, x.name)}>
                  <LayoutTemplate />
                  <span className="min-w-0 flex-1 truncate">{x.name}</span>
                  <span className="text-xs tabular-nums text-fg-subtle">{x.data.items.length}</span>
                </MenuItem>
              ))}
            </>
          ) : (
            <p className="px-2.5 py-2 text-xs leading-relaxed text-fg-muted">{t('empty')}</p>
          )}
          {agenda.length ? (
            <>
              <MenuSeparator />
              <MenuItem onClick={() => setSaving(true)}>
                <BookmarkPlus />
                {t('save')}
              </MenuItem>
            </>
          ) : null}
        </MenuContent>
      </Menu>
      <SaveAgendaDialog meeting={meeting} agenda={agenda} open={saving} onOpenChange={setSaving} />
    </>
  )
}

function SaveAgendaDialog({ meeting, agenda, open, onOpenChange }: { meeting: MeetingRow; agenda: MeetingItemRow[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('templates.agenda')
  const ws = useWorkspaceMap().get(meeting.workspace_id)
  const { create } = useTemplateMutations()
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'workspace' | 'account'>('workspace')
  useEffect(() => {
    if (open) {
      setName(meeting.title.slice(0, 80))
      setScope('workspace')
    }
  }, [open, meeting.title])
  const submit = () => {
    if (!name.trim()) return
    create.mutate(
      { kind: 'agenda', name: name.trim(), workspaceId: scope === 'workspace' ? meeting.workspace_id : null, data: { items: agenda.slice(0, 50).map((a) => ({ text: a.text.slice(0, 500) })) } },
      {
        onSuccess: (tpl) => {
          toast.success(t('saved', { name: tpl.name }))
          track('feature.template_save_agenda')
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
          <DialogHeader title={t('saveTitle')} description={t('saveHint', { count: agenda.length })} />
          <DialogBody className="flex flex-col gap-4">
            <Field label={t('name')} htmlFor="agenda-tpl-name">
              <Input id="agenda-tpl-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
            </Field>
            <Field label={t('scope')} htmlFor="agenda-tpl-scope">
              <Select
                id="agenda-tpl-scope"
                value={scope}
                onChange={(v) => setScope(v as 'workspace' | 'account')}
                options={[
                  { value: 'workspace', label: t('scopeWorkspace', { name: ws?.name ?? '' }), icon: ws ? <WorkspaceMark ws={ws} size={16} /> : undefined },
                  { value: 'account', label: t('scopeAccount') },
                ]}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={!name.trim()} loading={create.isPending}>
              {t('saveButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
