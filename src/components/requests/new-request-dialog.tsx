'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { CalendarDays, X } from 'lucide-react'
import { useApp, useIsAccountAdmin } from '@/components/app/app-context'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { MiniCalendar } from '@/components/tasks/pickers'
import { useDateLocale } from '@/lib/dates'
import { REQUEST_KINDS, useRequestMutations, type RequestKind } from '@/lib/queries/requests'
import { track } from '@/lib/telemetry'
import { cn } from '@/lib/utils'
import { DeptMark, KIND_ICON, useDepartmentPeople } from './request-bits'

/**
 * Pedirle algo a un departamento: a cuál, qué tipo de pedido, qué y para cuándo. Le llega a su
 * jefe (o a quien la tome) y queda en la bandeja del departamento.
 */
export function NewRequestDialog({ open, onOpenChange, defaultDepartment }: { open: boolean; onOpenChange: (o: boolean) => void; defaultDepartment?: string }) {
  const t = useTranslations('requests.create')
  const tk = useTranslations('requests.kind')
  const router = useRouter()
  const locale = useDateLocale()
  const { departments, members, user } = useApp()
  const isAdmin = useIsAccountAdmin()
  const people = useDepartmentPeople()
  const { create } = useRequestMutations()
  const myDept = members.find((m) => m.id === user.id)?.department_id ?? null
  // a otro departamento, primero; el mío al final (también se puede)
  const sorted = useMemo(() => [...departments].sort((a, b) => Number(a.id === myDept) - Number(b.id === myDept) || a.name.localeCompare(b.name)), [departments, myDept])

  const [dept, setDept] = useState('')
  const [kind, setKind] = useState<RequestKind>('request')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [due, setDue] = useState<string | null>(null)
  const [urgent, setUrgent] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setDept(defaultDepartment ?? '')
    setKind('request')
    setTitle('')
    setBody('')
    setDue(null)
    setUrgent(false)
  }, [open, defaultDepartment])

  const head = (id: string) => {
    const d = departments.find((x) => x.id === id)
    return d?.head_id ? members.find((m) => m.id === d.head_id) : undefined
  }
  const chosen = departments.find((d) => d.id === dept)
  const ready = Boolean(dept) && title.trim().length >= 4 && !create.isPending

  const submit = () => {
    if (!ready) return
    create.mutate(
      { departmentId: dept, title: title.trim(), body: body.trim(), kind, urgent, dueDate: due },
      {
        onSuccess: (r) => {
          toast.success(t('created', { code: r.code, department: chosen?.name ?? '' }))
          track('feature.request_create')
          onOpenChange(false)
          router.push(`/requests/${r.id}`)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <DialogHeader title={t('title')} description={t('description')} />
          {departments.length === 0 ? (
            <DialogBody>
              <div className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center">
                <p className="text-sm font-medium text-fg">{t('noDepartments')}</p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-fg-muted">{isAdmin ? t('noDepartmentsAdmin') : t('noDepartmentsHint')}</p>
                {isAdmin ? (
                  <Link href="/settings/org" className="mt-3 inline-block text-xs font-medium text-accent-ink hover:underline" onClick={() => onOpenChange(false)}>
                    {t('createDepartments')}
                  </Link>
                ) : null}
              </div>
            </DialogBody>
          ) : (
            <DialogBody className="flex flex-col gap-4">
              <Field label={t('to')} htmlFor="rq-dept" hint={chosen ? hintFor(chosen.id) : undefined}>
                <Select
                  id="rq-dept"
                  value={dept}
                  onChange={setDept}
                  placeholder={t('pickDepartment')}
                  options={sorted.map((d) => ({
                    value: d.id,
                    label: d.name,
                    icon: <DeptMark name={d.name} size={18} />,
                    hint: d.id === myDept ? t('mine') : t('people', { count: people.get(d.id)?.length ?? 0 }),
                  }))}
                />
              </Field>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{t('kind')}</span>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('kind')}>
                  {REQUEST_KINDS.map((k) => {
                    const Icon = KIND_ICON[k]
                    return (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={kind === k}
                        onClick={() => setKind(k)}
                        className={cn(
                          'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm transition-colors',
                          kind === k ? 'border-accent-mid bg-accent-soft font-medium text-accent-ink' : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                        )}
                      >
                        <Icon className="size-3.5" />
                        {tk(k)}
                      </button>
                    )
                  })}
                </div>
              </div>

              <Field label={t('what')} htmlFor="rq-title">
                <Input id="rq-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={t(`placeholder.${kind}`)} autoFocus />
              </Field>
              <Field label={t('details')} htmlFor="rq-body" hint={t('detailsHint')}>
                <Textarea id="rq-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={4} />
              </Field>

              <div className="flex flex-wrap items-end gap-4">
                <Field label={t('due')} htmlFor="rq-due" className="min-w-44 flex-1">
                  <div className="flex items-center gap-1">
                    <Popover open={dateOpen} onOpenChange={setDateOpen}>
                      <PopoverTrigger
                        id="rq-due"
                        className="flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-panel px-2.5 text-left text-sm outline-none transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent-mid/40 data-[popup-open]:border-accent-mid"
                      >
                        <CalendarDays className="size-4 shrink-0 text-fg-subtle" />
                        <span className={cn('truncate first-letter:uppercase', !due && 'text-fg-subtle')}>{due ? format(parseISO(due), 'EEE d MMM', { locale }) : t('noDue')}</span>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2">
                        <MiniCalendar
                          selected={due ? parseISO(due) : null}
                          onSelect={(d) => {
                            setDue(format(d, 'yyyy-MM-dd'))
                            setDateOpen(false)
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    {due ? (
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setDue(null)} aria-label={t('clearDue')}>
                        <X />
                      </Button>
                    ) : null}
                  </div>
                </Field>
                <label className="flex h-9 cursor-pointer items-center gap-2.5 text-sm">
                  <Switch checked={urgent} onCheckedChange={setUrgent} />
                  <span>{t('urgent')}</span>
                </label>
              </div>
            </DialogBody>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            {departments.length ? (
              <Button type="submit" variant="primary" disabled={!ready} loading={create.isPending}>
                {t('send')}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )

  function hintFor(id: string) {
    const h = head(id)
    return h ? t('reaches', { name: h.full_name }) : t('reachesAdmins')
  }
}
