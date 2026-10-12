'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Check, Search } from 'lucide-react'
import { useApp } from '@/components/app/app-context'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { useChatMutations, useChats } from '@/lib/queries/chats'
import type { ChatMessageKind, ChatMessageRow } from '@/lib/database.types'
import { cn } from '@/lib/utils'
import { ChatAvatar, useChatName } from './chat-bits'

/** Lo que se comparte: una tarjeta (tarea, archivo, doc o invitación con `meta`) o un texto armado (`text`, p. ej. el resumen de una reunión). */
export type ShareItem = { kind: Exclude<ChatMessageKind, 'system'>; refId?: string | null; title: string; meta?: ChatMessageRow['meta']; text?: string }

/**
 * Compartir una tarea, un archivo o un doc en Pasillo: se eligen uno o varios chats (o una persona,
 * y si no hay directo con ella se crea) y se puede sumar un comentario.
 */
export function ShareToChatDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item: ShareItem | null }) {
  const t = useTranslations('pasillo.share')
  const router = useRouter()
  const { members, user } = useApp()
  const { data: chats } = useChats()
  const { share, openDirect } = useChatMutations()
  const chatName = useChatName()
  const [picked, setPicked] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  // los chats que ya existen y, al final, las personas con las que todavía no hay directo
  const options = useMemo(() => {
    const withDirect = new Set((chats ?? []).filter((c) => c.kind === 'direct').flatMap((c) => c.members.map((m) => m.user_id)))
    const list = [
      ...(chats ?? []).map((c) => ({
        key: c.id,
        label: chatName(c),
        avatar: <ChatAvatar chat={c} size={28} />,
        hint: c.kind === 'group' ? t('members', { count: c.members.length }) : null,
      })),
      ...members
        .filter((m) => m.id !== user.id && !withDirect.has(m.id))
        .map((m) => ({ key: `user:${m.id}`, label: m.full_name, avatar: <Avatar name={m.full_name} src={m.avatar_url} seed={m.id} size={28} />, hint: t('newDirect') })),
    ]
    const needle = q.trim().toLowerCase()
    return needle ? list.filter((o) => o.label.toLowerCase().includes(needle)) : list
  }, [chats, members, user.id, chatName, q, t])

  const close = (o: boolean) => {
    onOpenChange(o)
    if (!o) {
      setPicked([])
      setQ('')
      setNote('')
    }
  }

  const send = async () => {
    if (!item || !picked.length) return
    setSending(true)
    try {
      const chatIds: string[] = []
      for (const key of picked) chatIds.push(key.startsWith('user:') ? await openDirect.mutateAsync(key.slice(5)) : key)
      const body = [note.trim(), item.text ?? ''].filter(Boolean).join('\n\n')
      await share.mutateAsync({ chatIds, kind: item.kind, refId: item.refId ?? null, body, meta: item.meta })
      toast.success(
        t('sent', { count: chatIds.length }),
        chatIds.length === 1 ? { action: { label: t('goToChat'), onClick: () => router.push(`/chat/${chatIds[0]}`) } } : undefined,
      )
      close(false)
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader title={t('title')} description={item ? t('description', { title: item.title }) : undefined} />
        <DialogBody className="flex flex-col gap-3 pt-1">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 size-3.5 text-fg-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('search')}
              autoFocus
              className="h-9 w-full rounded-lg border border-line bg-panel pl-8 pr-3 text-sm outline-none placeholder:text-fg-subtle focus:border-accent-mid"
            />
          </div>
          <ul className="-mx-2 flex max-h-64 flex-col overflow-y-auto scrollbar-thin" role="listbox" aria-multiselectable>
            {options.map((o) => {
              const on = picked.includes(o.key)
              return (
                <li key={o.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== o.key) : [...p, o.key]))}
                    className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-hover', on && 'bg-accent-soft hover:bg-accent-soft')}
                  >
                    {o.avatar}
                    <span className="min-w-0 flex-1 truncate text-fg">{o.label}</span>
                    {o.hint ? <span className="shrink-0 text-xs text-fg-subtle">{o.hint}</span> : null}
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                        on ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong',
                      )}
                    >
                      {on ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                  </button>
                </li>
              )
            })}
            {options.length === 0 ? <li className="px-2 py-3 text-sm text-fg-subtle">{t('noMatches')}</li> : null}
          </ul>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('notePlaceholder')}
            rows={2}
            className="w-full resize-none rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none placeholder:text-fg-subtle focus:border-accent-mid"
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => close(false)}>
            {t('cancel')}
          </Button>
          <Button variant="primary" size="sm" onClick={send} disabled={!picked.length} loading={sending}>
            {picked.length > 1 ? t('sendMany', { count: picked.length }) : t('send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
