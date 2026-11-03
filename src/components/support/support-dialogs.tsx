'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Check, TriangleAlert } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { WorkspaceMark } from '@/components/app/marks'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import { Dialog, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { toErrorCode } from '@/lib/errors'
import { useCreateRequest, useCreateTicket, useMyDestination } from '@/lib/queries/support'
import { IMPACTS, LIMITS, REQUEST_STEPS, TICKET_CATEGORIES, type RequestImpact, type TicketCategory } from '@/lib/support'
import { cn } from '@/lib/utils'
import { CATEGORY_ICON, IMPACT_ICON, PeopleOrVeltro, VeltroTile, useDestinationText } from './support-bits'
import { FileDropzone, useDropTarget, useFileQueue } from './support-files'

/**
 * Los dos formularios de Soporte en diálogo, para abrirlos desde cualquier parte (la página de
 * Soporte, Pulso): `const { openTicket, openRequest, dialogs } = useSupportDialogs()` y `{dialogs}`.
 * Al enviar, lleva al detalle de lo creado.
 */
export function useSupportDialogs() {
  const [open, setOpen] = useState<'ticket' | 'request' | null>(null)
  return {
    openTicket: () => setOpen('ticket'),
    openRequest: () => setOpen('request'),
    dialogs: (
      <>
        <NewTicketDialog open={open === 'ticket'} onOpenChange={(o) => setOpen(o ? 'ticket' : null)} />
        <NewRequestDialog open={open === 'request'} onOpenChange={(o) => setOpen(o ? 'request' : null)} />
      </>
    ),
  }
}

const len = (s: string) => [...s.trim()].length

/** Cuántos caracteres van y, si falta para el mínimo, cuánto. */
function Counter({ value, min, max }: { value: string; min?: number; max: number }) {
  const n = len(value)
  return (
    <span className={cn('text-2xs tabular-nums', n > max ? 'text-danger' : 'text-fg-subtle')}>
      {min && n > 0 && n < min ? `${n}/${min}+` : `${n}/${max}`}
    </span>
  )
}

function FieldLabel({ htmlFor, label, optional, counter }: { htmlFor?: string; label: string; optional?: boolean; counter?: React.ReactNode }) {
  const t = useTranslations('support')
  return (
    <div className="flex h-5 items-center gap-2">
      <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
        {label}
      </label>
      {optional ? <span className="text-xs text-fg-subtle">{t('optional')}</span> : null}
      {counter ? <span className="ml-auto">{counter}</span> : null}
    </div>
  )
}

// ---------------- ticket ----------------

function NewTicketDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('ticket')
  const ts = useTranslations('support')
  const te = useTranslations('errors')
  const router = useRouter()
  const confirm = useConfirm()
  const { workspaces } = useApp()
  const destination = useMyDestination(open)
  const destinationText = useDestinationText()
  const create = useCreateTicket()
  const queue = useFileQueue()
  const drop = useDropTarget(queue.add)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [where, setWhere] = useState('')
  const [category, setCategory] = useState<TicketCategory>('error')
  const [workspaceId, setWorkspaceId] = useState('none')
  const [urgent, setUrgent] = useState(false)
  const [tried, setTried] = useState(false)

  const titleShort = len(title) < LIMITS.title.min
  const bodyShort = len(body) < LIMITS.description.min
  const ready = !titleShort && !bodyShort && !queue.uploading
  const dirty = len(title) > 0 || len(body) > 0 || len(where) > 0 || queue.items.length > 0

  const reset = () => {
    setTitle('')
    setBody('')
    setWhere('')
    setCategory('error')
    setWorkspaceId('none')
    setUrgent(false)
    setTried(false)
    queue.clear()
  }

  const close = async () => {
    if (create.isPending) return
    if (dirty && !(await confirm({ title: t('discardTitle'), description: t('discardBody'), confirmLabel: t('discard'), danger: true }))) return
    reset()
    onOpenChange(false)
  }

  const send = () => {
    setTried(true)
    if (queue.uploading) return toast.info(t('waitUploads'))
    if (!ready || create.isPending) return
    create.mutate(
      {
        title: title.trim(),
        description: body.trim(),
        category,
        urgent,
        workspaceId: workspaceId === 'none' ? null : workspaceId,
        whereText: where.trim() || null,
        files: queue.payload(),
      },
      {
        onSuccess: (ticket) => {
          toast.success(t('sent'), { description: ticket.code })
          reset()
          onOpenChange(false)
          router.push(`/support/tickets/${ticket.id}`)
        },
        onError: (e) => toast.error(t('sendError'), { description: te(toErrorCode(e)) }),
      },
    )
  }

  const d = destination.data
  const people = d?.recipients ?? null
  const routeText = !d ? '' : d.destination === 'veltro' ? t('route.veltro') : d.onlyYou ? t('route.onlyYou') : t('route.people', { to: destinationText(d.destination, people) })

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : void close())}>
      <DialogContent className="max-w-xl" onPaste={queue.onPaste} {...drop.props}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              send()
            }
          }}
          noValidate
        >
          <DialogHeader title={t('newTitle')} />

          {/* a quién llega: lo dice antes de escribir nada */}
          <div className="mx-5 mt-1 flex items-center gap-3 rounded-lg bg-highlight/70 px-3 py-2.5" aria-live="polite">
            {d ? <PeopleOrVeltro people={d.destination === 'veltro' ? null : people} size={20} /> : <Skeleton className="size-6 rounded-full" />}
            <div className="min-w-0 flex-1">
              {d ? (
                <>
                  <p className="text-sm font-medium text-highlight-ink">{routeText}</p>
                  <p className="text-xs text-fg-muted">{t('route.hint', { role: t(`roleLower.${d.role}`) })}</p>
                </>
              ) : (
                <Skeleton className="h-8 w-3/4" />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-5 px-5 pb-2 pt-5">
            <Field error={tried && titleShort ? t('short', { count: LIMITS.title.min - len(title) }) : undefined}>
              <FieldLabel htmlFor="ticket-title" label={t('what')} counter={<Counter value={title} min={LIMITS.title.min} max={LIMITS.title.max} />} />
              <Input
                id="ticket-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={LIMITS.title.max}
                placeholder={t('whatPlaceholder')}
                aria-invalid={tried && titleShort}
                autoFocus
                autoComplete="off"
              />
            </Field>

            <Field hint={t('moreHint')} error={tried && bodyShort ? t('short', { count: LIMITS.description.min - len(body) }) : undefined}>
              <FieldLabel htmlFor="ticket-body" label={t('more')} counter={<Counter value={body} min={LIMITS.description.min} max={LIMITS.description.max} />} />
              <Textarea
                id="ticket-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={LIMITS.description.max}
                placeholder={t('morePlaceholder')}
                aria-invalid={tried && bodyShort}
                className="min-h-28 resize-y"
              />
            </Field>

            <div className="flex flex-col gap-1.5">
              <FieldLabel label={t('kind')} />
              <div role="radiogroup" aria-label={t('kind')} className="flex flex-wrap gap-1.5">
                {TICKET_CATEGORIES.map((k) => {
                  const Icon = CATEGORY_ICON[k]
                  const on = category === k
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setCategory(k)}
                      className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
                        on ? 'border-accent-mid bg-accent-soft font-medium text-accent-ink' : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                      )}
                    >
                      <Icon className="size-3.5" aria-hidden />
                      {ts(`category.${k}`)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {workspaces.length ? (
                <div className="flex flex-col gap-1.5">
                  <FieldLabel htmlFor="ticket-ws" label={t('workspace')} optional />
                  <Select
                    id="ticket-ws"
                    value={workspaceId}
                    onChange={setWorkspaceId}
                    options={[{ value: 'none', label: t('noWorkspace') }, ...workspaces.map((w) => ({ value: w.id, label: w.name, icon: <WorkspaceMark ws={w} size={16} /> }))]}
                  />
                </div>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="ticket-where" label={t('where')} optional counter={where ? <Counter value={where} max={LIMITS.where} /> : null} />
                <Input id="ticket-where" value={where} onChange={(e) => setWhere(e.target.value)} maxLength={LIMITS.where} placeholder={t('wherePlaceholder')} autoComplete="off" />
              </div>
            </div>

            <label
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                urgent ? 'border-danger/40 bg-danger-soft' : 'border-line hover:border-line-strong',
              )}
            >
              <TriangleAlert className={cn('size-4 shrink-0', urgent ? 'text-danger' : 'text-fg-subtle')} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-fg">{t('urgent')}</span>
                <span className="block text-xs text-fg-muted">{t('urgentHint')}</span>
              </span>
              <Switch checked={urgent} onCheckedChange={setUrgent} aria-label={t('urgent')} className="data-[checked]:bg-danger" />
            </label>

            <div className="flex flex-col gap-1.5">
              <FieldLabel label={t('files')} optional />
              <FileDropzone queue={queue} />
            </div>
          </div>

          <DialogFooter className="border-t border-line-soft">
            <span className="mr-auto hidden items-center gap-1 text-xs text-fg-subtle sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd>
              {t('sendShortcut')}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void close()}>
              {ts('cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={create.isPending} disabled={(tried && !ready) || queue.failed}>
              {queue.uploading ? t('uploading') : ts('send')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- requerimiento ----------------

function NewRequestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('request')
  const tt = useTranslations('ticket')
  const ts = useTranslations('support')
  const te = useTranslations('errors')
  const router = useRouter()
  const confirm = useConfirm()
  const { workspaces } = useApp()
  const create = useCreateRequest()

  const [title, setTitle] = useState('')
  const [need, setNeed] = useState('')
  const [why, setWhy] = useState('')
  const [impact, setImpact] = useState<RequestImpact>('saves_time')
  const [workspaceId, setWorkspaceId] = useState('none')
  const [tried, setTried] = useState(false)

  const titleShort = len(title) < LIMITS.title.min
  const needShort = len(need) < LIMITS.need.min
  const ready = !titleShort && !needShort
  const dirty = len(title) > 0 || len(need) > 0 || len(why) > 0

  const reset = () => {
    setTitle('')
    setNeed('')
    setWhy('')
    setImpact('saves_time')
    setWorkspaceId('none')
    setTried(false)
  }

  const close = async () => {
    if (create.isPending) return
    if (dirty && !(await confirm({ title: t('discardTitle'), description: tt('discardBody'), confirmLabel: tt('discard'), danger: true }))) return
    reset()
    onOpenChange(false)
  }

  const send = () => {
    setTried(true)
    if (!ready || create.isPending) return
    create.mutate(
      { title: title.trim(), need: need.trim(), why: why.trim() || null, impact, workspaceId: workspaceId === 'none' ? null : workspaceId },
      {
        onSuccess: (r) => {
          toast.success(t('sent'), { description: r.code })
          reset()
          onOpenChange(false)
          router.push(`/support/requests/${r.id}`)
        },
        onError: (e) => toast.error(tt('sendError'), { description: te(toErrorCode(e)) }),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : void close())}>
      <DialogContent className="max-w-xl">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              send()
            }
          }}
          noValidate
        >
          <DialogHeader title={t('newTitle')} />

          {/* quién lo ve y cómo avanza */}
          <div className="mx-5 mt-1 flex items-start gap-3 rounded-lg bg-highlight/70 px-3 py-2.5">
            <VeltroTile size={28} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-highlight-ink">{t('intro')}</p>
              <ol className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-fg-muted" aria-label={t('progress')}>
                {REQUEST_STEPS.map((st, i) => (
                  <li key={st} className="flex items-center gap-1.5">
                    {i > 0 ? <span className="h-px w-3 bg-line-strong" aria-hidden /> : null}
                    {ts(`requestStatus.${st}`)}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="flex flex-col gap-5 px-5 pb-2 pt-5">
            <Field error={tried && titleShort ? tt('short', { count: LIMITS.title.min - len(title) }) : undefined}>
              <FieldLabel htmlFor="request-title" label={t('title')} counter={<Counter value={title} min={LIMITS.title.min} max={LIMITS.title.max} />} />
              <Input
                id="request-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={LIMITS.title.max}
                placeholder={t('titlePlaceholder')}
                aria-invalid={tried && titleShort}
                autoFocus
                autoComplete="off"
              />
            </Field>

            <Field hint={t('needHint')} error={tried && needShort ? tt('short', { count: LIMITS.need.min - len(need) }) : undefined}>
              <FieldLabel htmlFor="request-need" label={t('need')} counter={<Counter value={need} min={LIMITS.need.min} max={LIMITS.need.max} />} />
              <Textarea
                id="request-need"
                value={need}
                onChange={(e) => setNeed(e.target.value)}
                maxLength={LIMITS.need.max}
                placeholder={t('needPlaceholder')}
                aria-invalid={tried && needShort}
                className="min-h-24 resize-y"
              />
            </Field>

            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="request-why" label={t('why')} optional counter={why ? <Counter value={why} max={LIMITS.why} /> : null} />
              <Textarea id="request-why" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={LIMITS.why} placeholder={t('whyPlaceholder')} className="min-h-16 resize-y" />
            </div>

            <div className="flex flex-col gap-1.5">
              <FieldLabel label={t('impact')} />
              <div role="radiogroup" aria-label={t('impact')} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {IMPACTS.map((k) => {
                  const Icon = IMPACT_ICON[k]
                  const on = impact === k
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setImpact(k)}
                      className={cn(
                        'relative flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors',
                        on ? 'border-accent-mid bg-accent-soft' : 'border-line hover:border-line-strong',
                      )}
                    >
                      <span className={cn('flex items-center gap-1.5 pr-4 text-sm font-medium', on ? 'text-accent-ink' : 'text-fg')}>
                        <Icon className="size-3.5" aria-hidden />
                        {ts(`impact.${k}`)}
                      </span>
                      <span className="text-xs leading-snug text-fg-muted">{t(`impactHint.${k}`)}</span>
                      {on ? <Check className="absolute right-2 top-2 size-3.5 text-accent-ink" aria-hidden /> : null}
                    </button>
                  )
                })}
              </div>
            </div>

            {workspaces.length ? (
              <div className="flex flex-col gap-1.5 sm:w-1/2">
                <FieldLabel htmlFor="request-ws" label={t('workspace')} optional />
                <Select
                  id="request-ws"
                  value={workspaceId}
                  onChange={setWorkspaceId}
                  options={[{ value: 'none', label: tt('noWorkspace') }, ...workspaces.map((w) => ({ value: w.id, label: w.name, icon: <WorkspaceMark ws={w} size={16} /> }))]}
                />
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-t border-line-soft">
            <span className="mr-auto hidden items-center gap-1 text-xs text-fg-subtle sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd>
              {tt('sendShortcut')}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void close()}>
              {ts('cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={create.isPending} disabled={tried && !ready}>
              {ts('send')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
