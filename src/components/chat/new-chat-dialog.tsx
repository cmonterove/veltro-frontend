'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, Search } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useChatMutations } from '@/lib/queries/chats'
import { cn } from '@/lib/utils'

/**
 * Elegir personas de la cuenta:
 * - `direct`: una sola, abre (o retoma) el directo con ella;
 * - `group`: varias y un nombre, crea el grupo;
 * - `add`: varias, para sumarlas a un grupo existente (`onDone`).
 */
export function PeopleDialog({
  open,
  onOpenChange,
  mode,
  exclude = [],
  preselected = [],
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  mode: 'direct' | 'group' | 'add'
  exclude?: string[]
  preselected?: string[]
  onDone?: (ids: string[]) => void
}) {
  const t = useTranslations('pasillo.people')
  const router = useRouter()
  const { members, user } = useApp()
  const { openDirect, createGroup } = useChatMutations()
  const [picked, setPicked] = useState<string[]>([])
  const [name, setName] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!open) return
    setPicked(preselected)
    setName('')
    setQ('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const people = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return members
      .filter((m) => m.id !== user.id && (mode !== 'add' || !exclude.includes(m.id)))
      .filter((m) => !needle || m.full_name.toLowerCase().includes(needle) || m.email.toLowerCase().includes(needle))
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
  }, [members, user.id, mode, exclude, q])

  const choose = (id: string) => {
    if (mode === 'direct') {
      openDirect.mutate(id, {
        onSuccess: (chatId) => {
          onOpenChange(false)
          router.push(`/chat/${chatId}`)
        },
      })
      return
    }
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  // sin nombre, el grupo se llama como sus primeras personas
  const fallbackName = picked
    .slice(0, 3)
    .map((id) => members.find((m) => m.id === id)?.full_name.split(' ')[0])
    .filter(Boolean)
    .join(', ')

  const submit = () => {
    if (mode === 'add') {
      onDone?.(picked)
      onOpenChange(false)
      return
    }
    if (mode === 'group' && picked.length) {
      createGroup.mutate(
        { name: name.trim() || fallbackName, userIds: picked },
        {
          onSuccess: (chatId) => {
            onOpenChange(false)
            router.push(`/chat/${chatId}`)
          },
        },
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader title={t(`title.${mode}`)} description={t(`description.${mode}`)} />
        <DialogBody className="flex flex-col gap-3 pt-1">
          {mode === 'group' ? <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={fallbackName || t('namePlaceholder')} maxLength={80} aria-label={t('name')} /> : null}
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 size-3.5 text-fg-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('search')}
              autoFocus={mode !== 'group'}
              className="h-9 w-full rounded-lg border border-line bg-panel pl-8 pr-3 text-sm outline-none placeholder:text-fg-subtle focus:border-accent-mid"
            />
          </div>
          <ul className="-mx-2 flex max-h-72 flex-col overflow-y-auto scrollbar-thin">
            {people.map((m) => {
              const on = picked.includes(m.id)
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => choose(m.id)}
                    disabled={openDirect.isPending}
                    aria-pressed={mode === 'direct' ? undefined : on}
                    className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-hover', on && 'bg-accent-soft hover:bg-accent-soft')}
                  >
                    <Avatar name={m.full_name} src={m.avatar_url} seed={m.id} size={30} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm text-fg">{m.full_name}</span>
                      <span className="truncate text-xs text-fg-subtle">{m.title ?? m.email}</span>
                    </span>
                    {mode === 'direct' ? null : (
                      <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors', on ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong')}>
                        {on ? <Check className="size-3" strokeWidth={3} /> : null}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
            {people.length === 0 ? <li className="px-2 py-3 text-sm text-fg-subtle">{t('nobody')}</li> : null}
          </ul>
        </DialogBody>
        {mode === 'direct' ? null : (
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button variant="primary" size="sm" onClick={submit} disabled={!picked.length} loading={createGroup.isPending}>
              {mode === 'add' ? t('add', { count: picked.length }) : t('create')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
