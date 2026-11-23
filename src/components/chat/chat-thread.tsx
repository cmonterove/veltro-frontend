'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { addDays, differenceInMinutes, format, isSameDay, isToday, isYesterday } from 'date-fns'
import {
  ArrowLeft,
  AtSign,
  Ban,
  CalendarDays,
  CalendarPlus,
  CircleCheck,
  Copy,
  FileText,
  LogOut,
  MessagesSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Reply,
  Search,
  SendHorizontal,
  Trash2,
  Upload,
  UserPlus,
  Vault,
  Video,
  X,
} from 'lucide-react'
import { useApp, useMemberMap, useWorkspaceMap } from '@/components/app/app-context'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import { goToAccount } from '@/lib/switch-account'
import { DocMark } from '@/components/app/marks'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { MentionTextarea, mentionIds, type MentionCandidate } from '@/components/mentions/mention-textarea'
import { RichText } from '@/components/mentions/rich-text'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { StatusIcon } from '@/components/tasks/status-icon'
import { NewMeetingDialog } from '@/components/calendar/new-meeting-dialog'
import { FileKindIcon, fileTitle } from '@/components/vault/file-visual'
import { sendTyping, useChatMessages, useChatMutations, useChats, useThreadMessages, type ChatSummary, type NewMessage } from '@/lib/queries/chats'
import { ChatSearchBar, PinsButton, ReactionBar, ReactionPicker, ThreadSummary } from './chat-extras'
import { useRealtimeLive, useTypingIn } from '@/lib/realtime'
import { useAttachmentMutations, useVaultFiles } from '@/lib/queries/attachments'
import { useTasks } from '@/lib/queries/tasks'
import { useDocsIn } from '@/lib/queries/docs'
import { useCalendarEvents } from '@/lib/queries/calendar'
import { useDateLocale } from '@/lib/dates'
import { track } from '@/lib/telemetry'
import type { ChatMessageRow, MeetingInvite } from '@/lib/database.types'
import type { CalendarEvent } from '@/lib/types'
import { cn, taskRef } from '@/lib/utils'
import { ChatAvatar, useChatName } from './chat-bits'
import { ChatContextToggle } from './chat-context'
import { DocCard, FileCard, InviteCard, TaskCard } from './message-cards'
import { PeopleDialog } from './new-chat-dialog'
import { inviteFrom, useMeetNow } from './meet-now'
import { useConfirm } from '@/components/ui/confirm'
import { useCopy } from '@/lib/clipboard'

/** Mensajes seguidos de la misma persona dentro de estos minutos van juntos, sin repetir nombre. */
const GROUP_MINUTES = 7

export function ChatThread({ chatId }: { chatId: string }) {
  const t = useTranslations('pasillo')
  const router = useRouter()
  const { user, account } = useApp()
  const { data: chats, isLoading: loadingChats } = useChats({ fast: true })
  const chat = chats?.find((c) => c.id === chatId)
  // no está entre los chats de esta cuenta: puede ser de otra de mis cuentas (un enlace, un aviso)
  const elsewhere = useQuery({
    queryKey: ['chat-elsewhere', chatId],
    enabled: !loadingChats && !!chats && !chat,
    staleTime: 30_000,
    queryFn: () => api<{ accountId: string }>(`/v1/chats/${chatId}`).catch(() => null),
  })
  const otherAccount = elsewhere.data && elsewhere.data.accountId !== account.id ? elsewhere.data.accountId : null
  useEffect(() => {
    if (otherAccount) goToAccount(otherAccount, `/chat/${chatId}`)
  }, [otherAccount, chatId])
  const { data: messages, isLoading, hasOlder, loadOlder, loadingOlder } = useChatMessages(chatId)
  const { markRead } = useChatMutations()
  const scrollRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [replyTo, setReplyTo] = useState<ChatMessageRow | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // el hilo abierto (a la derecha) y la búsqueda dentro del chat
  const [threadId, setThreadId] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  useEffect(() => {
    setThreadId(null)
    setSearching(false)
  }, [chatId])

  // llegar a un mensaje desde un aviso (?m=…): se centra y se ilumina un momento; ?t=… abre su hilo
  const search = useSearchParams()
  const target = search.get('m')
  const threadParam = search.get('t')
  useEffect(() => {
    if (threadParam) setThreadId(threadParam)
  }, [threadParam])
  const [flash, setFlash] = useState<string | null>(null)
  const loaded = Boolean(messages?.length)
  useEffect(() => {
    if (!target || !loaded) return
    const el = document.getElementById(`msg-${target}`)
    if (!el) return
    stick.current = false
    el.scrollIntoView({ block: 'center' })
    setFlash(target)
    router.replace(`/chat/${chatId}`, { scroll: false })
  }, [target, loaded, chatId, router])

  // "Nuevos": dónde estaba la última lectura al abrir el chat (no se mueve mientras se lee)
  const [readMark, setReadMark] = useState<string | null | undefined>(undefined)
  const myRead = chat?.members.find((m) => m.user_id === user.id)?.last_read_at
  useEffect(() => {
    if (chat && readMark === undefined) setReadMark(myRead ?? '')
  }, [chat, myRead, readMark])

  // leer = marcar leído cuando llega algo nuevo con el chat abierto
  const lastId = messages?.at(-1)?.id
  const unread = chat?.unread ?? 0
  useEffect(() => {
    if (lastId && unread > 0 && document.visibilityState === 'visible') markRead.mutate(chatId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, lastId, unread])

  // abajo de todo al abrir y cuando llega algo, salvo que estés leyendo más arriba. Las tarjetas cargan
  // después y cambian el alto: mientras estés abajo, se acompaña ese crecimiento.
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages?.length, chatId])
  useEffect(() => {
    const el = scrollRef.current
    const content = contentRef.current
    if (!el || !content) return
    const observer = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [chat?.id, isLoading])

  if (!chat) {
    return loadingChats || elsewhere.isLoading || otherAccount ? (
      <div className="flex flex-1 flex-col gap-3 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-16" />
      </div>
    ) : (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-fg-muted">{t('notFound')}</div>
    )
  }

  const firstNew = readMark ? messages?.find((m) => m.created_at > readMark && m.user_id !== user.id && m.kind !== 'system')?.id : undefined

  // ir a un mensaje (búsqueda, fijados): si es de un hilo, se abre el hilo; si no está cargado, se
  // traen páginas anteriores hasta encontrarlo
  const jumpTo = async (m: ChatMessageRow) => {
    setSearching(false)
    if (m.thread_id) {
      setThreadId(m.thread_id)
      return
    }
    for (let i = 0; i < 15 && !document.getElementById(`msg-${m.id}`); i++) {
      if (!hasOlder) break
      await loadOlder()
      await new Promise((r) => requestAnimationFrame(r))
    }
    const el = document.getElementById(`msg-${m.id}`)
    if (!el) return
    stick.current = false
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setFlash(null)
    requestAnimationFrame(() => setFlash(m.id))
  }
  const threadRoot = threadId ? messages?.find((m) => m.id === threadId) : undefined

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ThreadHeader chat={chat} onBack={() => router.push('/chat')} onSearch={() => setSearching((v) => !v)} searching={searching} onJump={jumpTo} />
        {searching ? <ChatSearchBar chatId={chat.id} onClose={() => setSearching(false)} onJump={jumpTo} /> : null}
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
          }}
          className="min-h-0 flex-1 overflow-y-auto pb-4 pt-2 scrollbar-thin"
        >
          <div ref={contentRef} className="flex min-h-full flex-col">
            {isLoading ? (
              <div className="flex flex-col gap-4 p-5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : messages?.length ? (
              <>
                {hasOlder ? (
                  <div className="flex justify-center pb-1 pt-3">
                    <Button
                      variant="ghost"
                      size="xs"
                      loading={loadingOlder}
                      onClick={async () => {
                        // lo anterior entra arriba: se conserva lo que se estaba viendo
                        const el = scrollRef.current
                        const before = el?.scrollHeight ?? 0
                        await loadOlder()
                        requestAnimationFrame(() => {
                          if (el) el.scrollTop += el.scrollHeight - before
                        })
                      }}
                    >
                      {t('loadOlder')}
                    </Button>
                  </div>
                ) : null}
                <MessageList
                  messages={messages}
                  firstNew={firstNew}
                  flash={flash}
                  editingId={editingId}
                  onEdit={setEditingId}
                  onReply={setReplyTo}
                  onThread={(m) => setThreadId(m.id)}
                />
              </>
            ) : (
              <EmptyThread chat={chat} />
            )}
          </div>
        </div>
        <Composer
          chat={chat}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          onSent={() => {
            stick.current = true
          }}
          onEditLast={() => {
            // ↑ con el cuadro vacío: editar mi último mensaje (como en Slack)
            const mine = [...(messages ?? [])].reverse().find((m) => m.user_id === user.id && m.kind !== 'system' && !m.deleted_at && !m.id.startsWith('temp-'))
            if (!mine) return false
            setEditingId(mine.id)
            return true
          }}
        />
      </div>
      {threadId ? <ThreadPanel chat={chat} rootId={threadId} root={threadRoot} onClose={() => setThreadId(null)} /> : null}
    </div>
  )
}

function ThreadHeader({
  chat,
  onBack,
  onSearch,
  searching,
  onJump,
}: {
  chat: ChatSummary
  onBack: () => void
  onSearch: () => void
  searching: boolean
  onJump: (m: ChatMessageRow) => void
}) {
  const t = useTranslations('pasillo')
  const { user, members, google } = useApp()
  const { send } = useChatMutations()
  // sin Google no hay Meet al instante: el botón arma una reunión de Veltro para ahora y la avisa en el chat
  const [nativeOpen, setNativeOpen] = useState(false)
  const memberMap = useMemberMap()
  const chatName = useChatName()
  const { rename, addMembers, leave } = useChatMutations()
  const confirm = useConfirm()
  const tConfirm = useTranslations('confirm')
  const router = useRouter()
  const [renaming, setRenaming] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const people = chat.members.flatMap((m) => memberMap.get(m.user_id) ?? [])
  const other = chat.kind === 'direct' ? people.find((p) => p.id !== user.id) : undefined
  const otherRole = other ? members.find((m) => m.id === other.id) : undefined
  const meet = useMeetNow(chat)

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-5 md:h-[68px] md:px-6">
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onBack} aria-label={t('back')}>
        <ArrowLeft />
      </Button>
      <ChatAvatar chat={chat} size={40} />
      <div className="min-w-0">
        <h1 className="truncate text-sm font-semibold text-fg md:text-[17px] md:tracking-[-0.01em]">{chatName(chat)}</h1>
        <p className="truncate text-xs text-fg-muted">
          {chat.kind === 'group'
            ? t('membersList', { count: people.length, names: people.map((p) => (p.id === user.id ? t('you') : p.full_name.split(' ')[0])).join(', ') })
            : (otherRole?.title ?? other?.email ?? '')}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {chat.kind === 'group' ? <AvatarStack people={people} size={26} max={4} className="hidden sm:flex" /> : null}
        <PinsButton
          chatId={chat.id}
          onJump={onJump}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-fg-muted outline-none hover:bg-hover hover:text-fg data-[popup-open]:bg-hover"
        />
        <Tooltip content={t('extras.search')} shortcut={['⌘', 'F']}>
          <Button variant={searching ? 'secondary' : 'ghost'} size="icon-sm" onClick={onSearch} aria-label={t('extras.search')} aria-pressed={searching}>
            <Search />
          </Button>
        </Tooltip>
        <Tooltip content={google ? t('meetNow.hint') : t('meetNow.hintNative')}>
          <Button
            variant="primary"
            size="sm"
            onClick={google ? meet.start : () => setNativeOpen(true)}
            loading={meet.pending}
            aria-label={google ? t('meetNow.label') : t('meetNow.labelNative')}
          >
            {meet.pending ? null : google ? <Video /> : <CalendarPlus />}
            <span className="hidden lg:inline">{google ? t('meetNow.label') : t('meetNow.labelNative')}</span>
          </Button>
        </Tooltip>
        {google ? null : (
          <NewMeetingDialog
            open={nativeOpen}
            onOpenChange={setNativeOpen}
            defaults={{
              title: chat.kind === 'group' ? t('meetNow.titleGroup', { name: chatName(chat) }) : '',
              // ahora, redondeado a los 5 minutos
              start: new Date(Math.floor(Date.now() / 300_000) * 300_000),
              attendees: people.filter((p) => p.id !== user.id).flatMap((p) => p.email ?? []),
            }}
            onCreated={(event) => send.mutate({ chatId: chat.id, kind: 'meeting', body: '', meta: { invite: inviteFrom(event, user.id) } })}
          />
        )}
        <ChatContextToggle />
        <Menu>
          <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t('more')} />}>
            <MoreHorizontal />
          </MenuTrigger>
          <MenuContent align="end" className="w-56">
            {chat.kind === 'group' ? (
              <>
                <MenuItem
                  onClick={() => {
                    setName(chat.name ?? '')
                    setRenaming(true)
                  }}
                >
                  <Pencil />
                  {t('rename')}
                </MenuItem>
                <MenuItem onClick={() => setAdding(true)}>
                  <UserPlus />
                  {t('addPeople')}
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  danger
                  onClick={async () => {
                    if (!(await confirm({ title: t('leaveConfirm', { name: chatName(chat) }), danger: true, confirmLabel: tConfirm('leave') }))) return
                    leave.mutate(chat.id, { onSuccess: () => router.push('/chat') })
                  }}
                >
                  <LogOut />
                  {t('leave')}
                </MenuItem>
              </>
            ) : (
              <MenuItem onClick={() => setAdding(true)}>
                <UserPlus />
                {t('makeGroup')}
              </MenuItem>
            )}
          </MenuContent>
        </Menu>
      </div>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="max-w-sm">
          <DialogHeader title={t('rename')} />
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim()) return
              rename.mutate({ chatId: chat.id, name })
              setRenaming(false)
            }}
          >
            <DialogBody>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} placeholder={t('groupNamePlaceholder')} />
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setRenaming(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={!name.trim()}>
                {t('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* en un grupo suma personas; en un directo arma un grupo nuevo con quien se elija */}
      <PeopleDialog
        open={adding}
        onOpenChange={setAdding}
        mode={chat.kind === 'group' ? 'add' : 'group'}
        exclude={chat.members.map((m) => m.user_id)}
        preselected={chat.kind === 'direct' ? chat.members.map((m) => m.user_id).filter((id) => id !== user.id) : []}
        onDone={(ids) => {
          if (chat.kind === 'group') addMembers.mutate({ chatId: chat.id, userIds: ids })
        }}
      />
    </header>
  )
}

function dayLabel(d: Date, t: (k: string) => string, locale: Parameters<typeof format>[2]) {
  if (isToday(d)) return t('today')
  if (isYesterday(d)) return t('yesterday')
  return format(d, 'EEEE d MMMM', locale)
}

type ListProps = {
  onThread: (m: ChatMessageRow) => void
  messages: ChatMessageRow[]
  firstNew?: string
  flash: string | null
  editingId: string | null
  onEdit: (id: string | null) => void
  onReply: (m: ChatMessageRow) => void
}

function MessageList({ messages, firstNew, flash, editingId, onEdit, onReply, onThread }: ListProps) {
  const t = useTranslations('pasillo')
  const locale = useDateLocale()
  const { user } = useApp()
  // cuántos mensajes de otros llegaron desde la última lectura
  const from = firstNew ? messages.findIndex((m) => m.id === firstNew) : -1
  const newCount = from < 0 ? 0 : messages.slice(from).filter((m) => m.kind !== 'system' && m.user_id !== user.id).length
  // un bloque por día: así la etiqueta del día queda fija arriba solo mientras se lee ese día
  const days: ChatMessageRow[][] = []
  for (const m of messages) {
    const last = days.at(-1)
    if (last && isSameDay(new Date(last[0].created_at), new Date(m.created_at))) last.push(m)
    else days.push([m])
  }
  return (
    <div className="flex flex-col">
      {days.map((day) => (
        <section key={day[0].id}>
          <div className="sticky top-0 z-[1] flex justify-center py-2">
            <span className="rounded-full border border-line bg-canvas px-2.5 py-0.5 text-2xs font-medium capitalize text-fg-muted shadow-card">
              {dayLabel(new Date(day[0].created_at), t, { locale })}
            </span>
          </div>
          {day.map((m, i) => {
            const prev = day[i - 1]
            const joined =
              prev &&
              prev.kind !== 'system' &&
              m.kind !== 'system' &&
              prev.user_id === m.user_id &&
              !prev.deleted_at &&
              differenceInMinutes(new Date(m.created_at), new Date(prev.created_at)) < GROUP_MINUTES &&
              m.id !== firstNew
            return (
              <Fragment key={m.id}>
                {m.id === firstNew ? (
                  <div className="my-3 flex items-center gap-3 px-5" role="separator" aria-label={t('newMessages')}>
                    <span className="h-px flex-1 bg-line" />
                    <span className="rounded-full bg-accent px-2.5 py-0.5 text-2xs font-semibold text-accent-fg">{t('newCount', { count: newCount })}</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                ) : null}
                {m.kind === 'system' ? (
                  <SystemLine m={m} />
                ) : (
                  <MessageRow
                    m={m}
                    joined={Boolean(joined)}
                    flash={flash === m.id}
                    editing={editingId === m.id}
                    onEdit={(on) => onEdit(on ? m.id : null)}
                    onReply={() => onReply(m)}
                    onThread={() => onThread(m)}
                  />
                )}
              </Fragment>
            )
          })}
        </section>
      ))}
    </div>
  )
}

function SystemLine({ m }: { m: ChatMessageRow }) {
  const t = useTranslations('pasillo.system')
  const { user } = useApp()
  const memberMap = useMemberMap()
  const who = (id: string | null) => (id === user.id ? t('you') : (memberMap.get(id ?? '')?.full_name.split(' ')[0] ?? '?'))
  const others = (m.meta.users ?? []).map(who).join(', ')
  const kind = m.meta.system ?? 'created'
  return <p className="px-5 py-1.5 text-center text-xs text-fg-subtle">{t(kind, { who: who(m.user_id), others, name: m.meta.name ?? '' })}</p>
}

const actionClass = 'inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg'

type RowProps = {
  m: ChatMessageRow
  joined: boolean
  flash: boolean
  editing: boolean
  onEdit: (on: boolean) => void
  /** citar el mensaje en el cuadro de abajo (no en el panel del hilo) */
  onReply?: () => void
  /** abrir su hilo (en la conversación principal) */
  onThread?: () => void
}

function MessageRow({ m, joined, flash, editing, onEdit, onReply, onThread }: RowProps) {
  const copy = useCopy()
  const t = useTranslations('pasillo')
  const tConfirm = useTranslations('confirm')
  const confirm = useConfirm()
  const locale = useDateLocale()
  const { user } = useApp()
  const memberMap = useMemberMap()
  const { remove, react, pin } = useChatMutations()
  const author = memberMap.get(m.user_id ?? '')
  const pinnedLabel = !m.pinned
    ? ''
    : m.pinned.by === user.id
      ? t('extras.pinnedByMe')
      : t('extras.pinnedBy', { name: memberMap.get(m.pinned.by ?? '')?.full_name.split(' ')[0] ?? '?' })
  const at = new Date(m.created_at)
  const sending = m.id.startsWith('temp-')
  const deleted = Boolean(m.deleted_at)
  const mine = m.user_id === user.id
  const quoted = m.meta.replyTo
  const quotedAuthor = quoted ? (quoted.userId === user.id ? t('you') : (memberMap.get(quoted.userId ?? '')?.full_name.split(' ')[0] ?? '?')) : ''
  const mentions = m.mentions.flatMap((id) => {
    const p = memberMap.get(id)
    return p ? [{ id, name: p.full_name }] : []
  })
  const actions = !sending && !deleted && !editing

  const del = async () => {
    if (!(await confirm({ title: t('deleteConfirm'), description: t('deleteConfirmHint'), danger: true, confirmLabel: tConfirm('delete') }))) return
    remove.mutate(m)
  }

  return (
    <div
      id={`msg-${m.id}`}
      className={cn(
        'group/msg relative flex gap-3 px-5 py-0.5 hover:bg-hover/40',
        !joined && 'mt-2.5 pt-1',
        sending && 'opacity-60',
        editing && 'bg-highlight/50 hover:bg-highlight/50',
        flash && 'msg-flash',
      )}
    >
      {actions ? (
        <div className="absolute -top-3 right-5 z-[2] hidden items-center rounded-lg border border-line bg-panel p-0.5 shadow-card group-hover/msg:flex group-focus-within/msg:flex has-[[data-popup-open]]:flex">
          <ReactionPicker label={t('extras.react')} onPick={(emoji) => react.mutate({ message: m, emoji })} className={cn(actionClass, 'data-[popup-open]:bg-hover')} />
          {onThread ? (
            <Tooltip content={t('extras.replyThread')}>
              <button type="button" onClick={onThread} aria-label={t('extras.replyThread')} className={actionClass}>
                <MessagesSquare className="size-4" />
              </button>
            </Tooltip>
          ) : null}
          {onReply ? (
            <Tooltip content={t('reply')}>
              <button type="button" onClick={onReply} aria-label={t('reply')} className={actionClass}>
                <Reply className="size-4" />
              </button>
            </Tooltip>
          ) : null}
          <Tooltip content={m.pinned ? t('extras.unpin') : t('extras.pin')}>
            <button type="button" onClick={() => pin.mutate({ message: m, on: !m.pinned })} aria-label={m.pinned ? t('extras.unpin') : t('extras.pin')} className={actionClass}>
              {m.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
            </button>
          </Tooltip>
          {m.body ? (
            <Tooltip content={t('copyText')}>
              <button type="button" onClick={() => copy(m.body, t('copied'))} aria-label={t('copyText')} className={actionClass}>
                <Copy className="size-4" />
              </button>
            </Tooltip>
          ) : null}
          {mine ? (
            <>
              <Tooltip content={t('edit')} shortcut={['↑']}>
                <button type="button" onClick={() => onEdit(true)} aria-label={t('edit')} className={actionClass}>
                  <Pencil className="size-3.5" />
                </button>
              </Tooltip>
              <Tooltip content={t('delete')}>
                <button type="button" onClick={del} aria-label={t('delete')} className={cn(actionClass, 'hover:text-danger')}>
                  <Trash2 className="size-3.5" />
                </button>
              </Tooltip>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="w-9 shrink-0">
        {joined ? (
          <span className="block pt-0.5 text-right text-2xs tabular-nums text-fg-subtle opacity-0 group-hover/msg:opacity-100">{format(at, 'HH:mm')}</span>
        ) : (
          <Avatar name={author?.full_name} src={author?.avatar_url} seed={m.user_id ?? m.id} size={36} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {joined ? null : (
          <p className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-fg">{mine ? t('you') : (author?.full_name ?? '?')}</span>
            <span className="text-2xs tabular-nums text-fg-subtle">{format(at, 'HH:mm')}</span>
            {m.pinned ? (
              <span className="inline-flex items-center gap-0.5 text-2xs font-medium text-mandarina-ink">
                <Pin className="size-3" />
                {pinnedLabel}
              </span>
            ) : null}
          </p>
        )}
        {joined && m.pinned ? (
          <span className="inline-flex items-center gap-0.5 text-2xs font-medium text-mandarina-ink">
            <Pin className="size-3" />
            {pinnedLabel}
          </span>
        ) : null}
        {deleted ? (
          <p className="flex items-center gap-1.5 py-0.5 text-sm italic text-fg-subtle">
            <Ban className="size-3.5 shrink-0" />
            {mine ? t('deletedMine') : t('deleted')}
          </p>
        ) : (
          <>
            {quoted ? (
              <button
                type="button"
                onClick={() => document.getElementById(`msg-${quoted.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                className="mb-1 mt-0.5 flex max-w-md items-baseline gap-1.5 rounded-md bg-hover/70 px-2 py-1 text-left text-xs text-fg-muted hover:bg-hover"
              >
                <Reply className="size-3 shrink-0 self-center text-fg-subtle" />
                <span className="shrink-0 font-medium text-fg">{quotedAuthor}</span>
                <span className={cn('truncate', m.meta.replyDeleted && 'italic text-fg-subtle')}>
                  {m.meta.replyDeleted ? t('deleted') : quoted.body || t('quotedCard')}
                </span>
              </button>
            ) : null}
            {editing ? (
              <MessageEditor m={m} onDone={() => onEdit(false)} />
            ) : m.body ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">
                <RichText text={m.body} mentions={mentions} me={user.id} />
                {m.edited_at ? (
                  <Tooltip content={format(new Date(m.edited_at), "d MMM, HH:mm", { locale })}>
                    <span className="ml-1.5 select-none text-2xs text-fg-subtle">{t('edited')}</span>
                  </Tooltip>
                ) : null}
              </p>
            ) : null}
            {m.kind === 'task' && m.ref_id ? <TaskCard id={m.ref_id} /> : null}
            {m.kind === 'file' && m.ref_id ? <FileCard id={m.ref_id} /> : null}
            {m.kind === 'doc' && m.ref_id ? <DocCard id={m.ref_id} /> : null}
            {m.kind === 'meeting' ? <InviteCard message={m} /> : null}
            <ReactionBar m={m} />
            {onThread ? <ThreadSummary m={m} onOpen={onThread} /> : null}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * El hilo de un mensaje, a la derecha de la conversación (en el celular, encima): el mensaje, sus
 * respuestas y un cuadro para responder ahí. Las respuestas no salen en la conversación principal.
 */
function ThreadPanel({ chat, rootId, root, onClose }: { chat: ChatSummary; rootId: string; root: ChatMessageRow | undefined; onClose: () => void }) {
  const t = useTranslations('pasillo')
  const { data: replies, isLoading } = useThreadMessages(chat.id, rootId)
  const [editingId, setEditingId] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const count = replies?.length ?? 0
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [count])
  return (
    // un cajón sobre la conversación; en pantallas muy anchas, al lado
    <aside
      className="absolute inset-y-0 right-0 z-10 flex min-h-0 w-full flex-col border-line bg-canvas shadow-popover sm:w-[420px] sm:border-l 2xl:static 2xl:shrink-0 2xl:shadow-none"
      aria-label={t('extras.thread')}
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4 md:h-[68px]">
        <MessagesSquare className="size-4 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">{t('extras.thread')}</p>
          <p className="truncate text-xs text-fg-muted">{t('extras.repliesCount', { count })}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('extras.closeThread')}>
          <X />
        </Button>
      </header>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto pb-3 pt-2 scrollbar-thin">
        {root ? (
          <MessageRow m={root} joined={false} flash={false} editing={false} onEdit={() => undefined} />
        ) : (
          <p className="px-5 py-3 text-xs text-fg-subtle">{t('extras.rootNotLoaded')}</p>
        )}
        <div className="my-2 flex items-center gap-3 px-5">
          <span className="text-2xs font-medium text-fg-subtle">{t('extras.repliesCount', { count })}</span>
          <span className="h-px flex-1 bg-line" />
        </div>
        {isLoading ? (
          <div className="px-5">
            <Skeleton className="h-10" />
          </div>
        ) : (
          (replies ?? []).map((m, i, list) => {
            const prev = list[i - 1]
            const joined = Boolean(prev && prev.user_id === m.user_id && !prev.deleted_at && differenceInMinutes(new Date(m.created_at), new Date(prev.created_at)) < GROUP_MINUTES)
            return <MessageRow key={m.id} m={m} joined={joined} flash={false} editing={editingId === m.id} onEdit={(on) => setEditingId(on ? m.id : null)} />
          })
        )}
      </div>
      <ThreadComposer chat={chat} rootId={rootId} />
    </aside>
  )
}

/** Responder en el hilo: texto con menciones. Enter envía; Mayús+Enter, otra línea. */
function ThreadComposer({ chat, rootId }: { chat: ChatSummary; rootId: string }) {
  const t = useTranslations('pasillo')
  const { send } = useChatMutations()
  const candidates = useMentionables(chat)
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<MentionCandidate[]>([])
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => ref.current?.focus(), [rootId])
  const submit = () => {
    if (!text.trim()) return
    send.mutate({ chatId: chat.id, kind: 'text', body: text.trim(), mentions: mentionIds(text, picked), threadId: rootId })
    track('feature.chat_thread_reply')
    setText('')
    setPicked([])
  }
  return (
    <div className="shrink-0 px-3 pb-3">
      <div className="flex items-end gap-2 rounded-xl border border-line bg-panel p-2 shadow-card focus-within:border-accent-mid">
        <MentionTextarea
          ref={ref}
          value={text}
          onValueChange={setText}
          candidates={chat.kind === 'group' ? candidates : []}
          picked={picked}
          onPickedChange={setPicked}
          maxLength={4000}
          placeholder={t('extras.replyInThread')}
          aria-label={t('extras.replyInThread')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          className="max-h-40 min-h-9 flex-1 bg-transparent px-1.5 py-1.5 text-sm leading-relaxed outline-none placeholder:text-fg-subtle"
        />
        <Button variant="primary" size="icon-sm" onClick={submit} disabled={!text.trim()} aria-label={t('composer.send')}>
          <SendHorizontal />
        </Button>
      </div>
    </div>
  )
}

/** Gente del chat que se puede mencionar (todas menos yo), con su cargo. */
function useMentionables(chat: ChatSummary | undefined): MentionCandidate[] {
  const { user, members } = useApp()
  const memberMap = useMemberMap()
  return useMemo(
    () =>
      (chat?.members ?? []).flatMap((cm) => {
        if (cm.user_id === user.id) return []
        const p = memberMap.get(cm.user_id)
        if (!p) return []
        return [{ id: p.id, name: p.full_name, avatarUrl: p.avatar_url, sub: members.find((x) => x.id === p.id)?.title ?? undefined }]
      }),
    [chat?.members, user.id, memberMap, members],
  )
}

/** Editar un mensaje en su lugar: Enter guarda, Esc cancela. Un texto vacío no se guarda (para eso, borrar). */
function MessageEditor({ m, onDone }: { m: ChatMessageRow; onDone: () => void }) {
  const t = useTranslations('pasillo')
  const { data: chats } = useChats()
  const chat = chats?.find((c) => c.id === m.chat_id)
  const candidates = useMentionables(chat)
  const memberMap = useMemberMap()
  const { edit } = useChatMutations()
  const [text, setText] = useState(m.body)
  const [picked, setPicked] = useState<MentionCandidate[]>(() =>
    m.mentions.flatMap((id) => {
      const p = memberMap.get(id)
      return p ? [{ id, name: p.full_name, avatarUrl: p.avatar_url }] : []
    }),
  )
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])
  const empty = m.kind === 'text' && !text.trim()
  const save = () => {
    if (empty) return
    const body = text.trim()
    if (body !== m.body) edit.mutate({ message: m, body, mentions: mentionIds(body, picked) })
    onDone()
  }
  return (
    <div className="mt-0.5 rounded-lg border border-accent-mid bg-panel shadow-card">
      <MentionTextarea
        ref={ref}
        value={text}
        onValueChange={setText}
        candidates={chat?.kind === 'group' ? candidates : []}
        picked={picked}
        onPickedChange={setPicked}
        placement="bottom"
        maxLength={4000}
        aria-label={t('edit')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            save()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            onDone()
          }
        }}
        className="max-h-60 bg-transparent px-3 pb-1 pt-2 text-sm leading-relaxed outline-none"
      />
      <div className="flex items-center gap-2 px-2 pb-2">
        <span className="ml-1 text-2xs text-fg-subtle">{t('editHint')}</span>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="xs" onClick={onDone}>
            {t('cancel')}
          </Button>
          <Button variant="primary" size="xs" onClick={save} disabled={empty}>
            {t('save')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** «Ana está escribiendo…» sobre el compositor; el alto queda reservado para que nada salte. */
function TypingLine({ chatId }: { chatId: string }) {
  const t = useTranslations('pasillo')
  const memberMap = useMemberMap()
  const ids = useTypingIn(chatId)
  const names = ids.map((id) => memberMap.get(id)?.full_name.split(' ')[0] ?? '').filter(Boolean)
  return (
    <div className="flex h-5 items-center gap-1.5 px-1 text-2xs text-fg-muted" aria-live="polite">
      {names.length ? (
        <>
          <span className="flex items-center gap-[3px]" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="typing-dot size-1 rounded-full bg-accent-mid" style={{ animationDelay: `${i * 160}ms` }} />
            ))}
          </span>
          <span className="truncate">{names.length === 1 ? t('typingOne', { name: names[0] }) : t('typingMany', { names: names.join(', ') })}</span>
        </>
      ) : null}
    </div>
  )
}

function EmptyThread({ chat }: { chat: ChatSummary }) {
  const t = useTranslations('pasillo')
  const chatName = useChatName()
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <ChatAvatar chat={chat} size={56} />
      <p className="text-sm font-medium text-fg">{chat.kind === 'group' ? t('emptyGroup', { name: chatName(chat) }) : t('emptyDirect', { name: chatName(chat) })}</p>
      <p className="max-w-sm text-sm text-fg-muted">{t('emptyHint')}</p>
    </div>
  )
}

// ---------------- compositor ----------------

type Pending = { kind: NonNullable<NewMessage['kind']>; refId?: string; title: string; meta?: ChatMessageRow['meta']; icon: React.ReactNode }
type PickerKind = 'task' | 'file' | 'doc' | 'meeting'

type ComposerProps = {
  chat: ChatSummary
  onSent: () => void
  replyTo: ChatMessageRow | null
  onClearReply: () => void
  /** ↑ con el cuadro vacío; devuelve si había algo para editar */
  onEditLast: () => boolean
}

function Composer({ chat, onSent, replyTo, onClearReply, onEditLast }: ComposerProps) {
  const t = useTranslations('pasillo.composer')
  const tp = useTranslations('pasillo')
  const { google, user } = useApp()
  const memberMap = useMemberMap()
  const chatName = useChatName()
  const { send } = useChatMutations()
  const { upload } = useAttachmentMutations()
  const [text, setText] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [picker, setPicker] = useState<PickerKind | null>(null)
  const [meetingOpen, setMeetingOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const live = useRealtimeLive()
  const candidates = useMentionables(chat)
  const [picked, setPicked] = useState<MentionCandidate[]>([])
  const can = text.trim().length > 0 || pending !== null

  const submit = () => {
    if (!can) return
    // la cita la guarda el servidor (con replyToId); la de aquí solo se ve mientras se envía
    const reply = replyTo ? { replyTo: { id: replyTo.id, userId: replyTo.user_id, body: replyTo.body.slice(0, 140) } } : {}
    send.mutate({
      chatId: chat.id,
      kind: pending?.kind ?? 'text',
      body: text.trim(),
      refId: pending?.refId ?? null,
      meta: { ...pending?.meta, ...reply },
      replyToId: replyTo?.id ?? null,
      mentions: mentionIds(text, picked),
    })
    track(`feature.chat_send_${pending?.kind ?? 'text'}`)
    setText('')
    setPicked([])
    setPending(null)
    onClearReply()
    onSent()
  }

  // al elegir "Responder" el foco va al cuadro de texto
  useEffect(() => {
    if (replyTo) textRef.current?.focus()
  }, [replyTo])
  const replyAuthor = replyTo ? (replyTo.user_id === user.id ? tp('you') : (memberMap.get(replyTo.user_id ?? '')?.full_name.split(' ')[0] ?? '?')) : ''

  const toInvite = (e: CalendarEvent): MeetingInvite => inviteFrom(e, user.id)
  const meet = useMeetNow(chat)

  const pick = (p: Pending) => {
    setPending(p)
    setPicker(null)
    textRef.current?.focus()
  }

  const attendees = chat.members.filter((m) => m.user_id !== user.id).flatMap((m) => memberMap.get(m.user_id)?.email ?? [])

  return (
    <div className="shrink-0 px-3 pb-3 sm:px-5 sm:pb-4">
      <TypingLine chatId={chat.id} />
      {picker ? <PickerPanel kind={picker} onPick={pick} onClose={() => setPicker(null)} toInvite={toInvite} /> : null}
      <div className="rounded-xl border border-line bg-panel shadow-card transition-[border-color,box-shadow] focus-within:border-accent-mid md:rounded-[16px] md:shadow-[0_12px_28px_-20px_oklch(0.3_0.09_312/0.45)] md:focus-within:shadow-[0_0_0_4px_color-mix(in_oklch,var(--accent)_12%,transparent),0_12px_28px_-20px_oklch(0.3_0.09_312/0.45)]">
        {replyTo ? (
          <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm">
            <Reply className="size-4 shrink-0 text-fg-subtle" />
            <span className="shrink-0 text-xs text-fg-muted">{tp('replyingTo', { name: replyAuthor })}</span>
            <span className="min-w-0 truncate text-fg-muted">{replyTo.body || tp('quotedCard')}</span>
            <button
              type="button"
              onClick={onClearReply}
              className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
              aria-label={tp('cancelReply')}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}
        {pending ? (
          <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm">
            <span className="flex shrink-0">{pending.icon}</span>
            <span className="shrink-0 text-xs text-fg-muted">{t(`attached.${pending.kind}`)}</span>
            <span className="min-w-0 truncate font-medium text-fg">{pending.title}</span>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
              aria-label={t('removeAttached')}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}
        <MentionTextarea
          ref={textRef}
          value={text}
          onValueChange={(v) => {
            setText(v)
            if (live && v.trim()) sendTyping(chat.id)
          }}
          candidates={chat.kind === 'group' ? candidates : []}
          picked={picked}
          onPickedChange={setPicked}
          aria-label={t('placeholder', { name: chatName(chat) })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
            if (e.key === 'ArrowUp' && !text && !pending && !e.shiftKey && onEditLast()) e.preventDefault()
            if (e.key === 'Escape' && picker) setPicker(null)
            else if (e.key === 'Escape' && replyTo) onClearReply()
          }}
          placeholder={pending ? t('commentPlaceholder') : t('placeholder', { name: chatName(chat) })}
          maxLength={4000}
          className="max-h-40 bg-transparent px-3.5 pb-1 pt-3 text-sm leading-relaxed outline-none placeholder:text-fg-subtle"
        />
        <div className="flex items-center gap-0.5 px-2 pb-2">
          <ToolButton label={t('shareTask')} active={picker === 'task'} onClick={() => setPicker(picker === 'task' ? null : 'task')}>
            <CircleCheck />
          </ToolButton>
          <Menu>
            <Tooltip content={t('shareFile')}>
              <MenuTrigger className={toolClass(picker === 'file')} aria-label={t('shareFile')}>
                <Paperclip />
              </MenuTrigger>
            </Tooltip>
            <MenuContent side="top" className="w-56">
              <MenuItem onClick={() => setPicker('file')}>
                <Vault />
                {t('fromVault')}
              </MenuItem>
              <MenuItem onClick={() => fileInput.current?.click()}>
                <Upload />
                {t('fromDevice')}
              </MenuItem>
            </MenuContent>
          </Menu>
          <ToolButton label={t('shareDoc')} active={picker === 'doc'} onClick={() => setPicker(picker === 'doc' ? null : 'doc')}>
            <FileText />
          </ToolButton>
          {chat.kind === 'group' ? (
            <ToolButton
              label={t('mention')}
              active={false}
              onClick={() => {
                // escribe «@» donde está el cursor y abre la lista de gente
                const el = textRef.current
                if (!el) return
                const at = el.selectionStart ?? text.length
                const lead = at > 0 && !/\s/.test(text[at - 1] ?? '') ? ' @' : '@'
                setText(text.slice(0, at) + lead + text.slice(at))
                requestAnimationFrame(() => {
                  el.focus()
                  el.setSelectionRange(at + lead.length, at + lead.length)
                  el.dispatchEvent(new Event('select', { bubbles: true }))
                })
              }}
            >
              <AtSign />
            </ToolButton>
          ) : null}
          {/* sin Google se puede invitar igual: la reunión se crea en Veltro (Meet al instante y el calendario piden Google) */}
          <Menu>
            <Tooltip content={t('invite')}>
              <MenuTrigger className={toolClass(picker === 'meeting')} aria-label={t('invite')}>
                <CalendarPlus />
              </MenuTrigger>
            </Tooltip>
            <MenuContent side="top" className="w-60">
              {google ? (
                <MenuItem onClick={meet.start} disabled={meet.pending}>
                  <Video />
                  {tp('meetNow.label')}
                </MenuItem>
              ) : null}
              <MenuItem onClick={() => setMeetingOpen(true)}>
                <CalendarPlus />
                {t('newMeeting')}
              </MenuItem>
              {google ? (
                <MenuItem onClick={() => setPicker('meeting')}>
                  <CalendarDays />
                  {t('fromCalendar')}
                </MenuItem>
              ) : null}
            </MenuContent>
          </Menu>
          <span className="ml-auto mr-2 hidden text-2xs text-fg-subtle sm:inline">{t('hint')}</span>
          <Tooltip content={t('send')} shortcut={['↵']}>
            <Button variant="primary" size="icon-sm" onClick={submit} disabled={!can} aria-label={t('send')}>
              <SendHorizontal />
            </Button>
          </Tooltip>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const list = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (!list.length) return
          // se suben a la bóveda (sueltos) y cada uno sale como tarjeta; el texto escrito acompaña al primero
          upload.mutate(
            { parent: { chatId: chat.id }, files: list },
            {
              onSuccess: (rows) => {
                rows.forEach((row, i) => send.mutate({ chatId: chat.id, kind: 'file', refId: row.id, body: i === 0 ? text.trim() : '' }))
                setText('')
                onSent()
              },
            },
          )
        }}
      />
      <NewMeetingDialog
        open={meetingOpen}
        onOpenChange={setMeetingOpen}
        defaults={{ title: chat.kind === 'group' ? (chat.name ?? '') : '', attendees }}
        onCreated={(event) => {
          send.mutate({ chatId: chat.id, kind: 'meeting', body: text.trim(), meta: { invite: toInvite(event) } })
          setText('')
          onSent()
        }}
      />
    </div>
  )
}

const toolClass = (active: boolean) =>
  cn(
    'inline-flex size-8 items-center justify-center rounded-lg text-fg-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-mid/40 data-[popup-open]:bg-hover [&_svg]:size-4',
    active && 'bg-accent-soft text-accent-ink hover:bg-accent-soft',
  )

function ToolButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip content={label}>
      <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} className={toolClass(active)}>
        {children}
      </button>
    </Tooltip>
  )
}

type PickRow = { id: string; label: string; sub: string; icon: React.ReactNode; pending: Pending }

/** Buscador sobre el compositor para elegir qué compartir: tarea, archivo, doc o reunión del calendario. */
function PickerPanel({ kind, onPick, onClose, toInvite }: { kind: PickerKind; onPick: (p: Pending) => void; onClose: () => void; toInvite: (e: CalendarEvent) => MeetingInvite }) {
  const t = useTranslations('pasillo.composer')
  const td = useTranslations('docs')
  const locale = useDateLocale()
  const { workspaces, observedWorkspaces, google } = useApp()
  const wsMap = useWorkspaceMap()
  const wsIds = useMemo(() => [...workspaces, ...observedWorkspaces].map((w) => w.id), [workspaces, observedWorkspaces])
  const [q, setQ] = useState('')
  const { data: tasks } = useTasks(kind === 'task' ? { kind: 'workspaces', workspaceIds: wsIds } : null)
  const { data: files } = useVaultFiles()
  const { data: docs } = useDocsIn(kind === 'doc' ? wsIds : [])
  const range = useMemo(() => ({ from: new Date(), to: addDays(new Date(), 21) }), [])
  const { data: events } = useCalendarEvents(range.from, range.to, kind === 'meeting' && Boolean(google))

  const rows: PickRow[] = useMemo(() => {
    if (kind === 'task') {
      return (tasks ?? [])
        .filter((x) => x.status !== 'done')
        .map((x) => {
          const w = wsMap.get(x.workspace_id)
          const ref = w ? taskRef(w.key, x.number) : ''
          return {
            id: x.id,
            label: x.title,
            sub: `${ref} · ${w?.name ?? ''}`,
            icon: <StatusIcon status={x.status} />,
            pending: { kind: 'task', refId: x.id, title: `${ref} ${x.title}`, icon: <StatusIcon status={x.status} /> },
          }
        })
    }
    if (kind === 'file') {
      return (files ?? []).map((f) => {
        const w = wsMap.get(f.workspace_id ?? '')
        return {
          id: f.id,
          label: fileTitle(f),
          sub: w?.name ?? t('loose'),
          icon: <FileKindIcon a={f} />,
          pending: { kind: 'file', refId: f.id, title: fileTitle(f), icon: <FileKindIcon a={f} /> },
        }
      })
    }
    if (kind === 'doc') {
      return (docs ?? []).map((d) => ({
        id: d.id,
        label: d.title || td('untitled'),
        sub: wsMap.get(d.workspace_id)?.name ?? '',
        icon: <DocMark source={d.source} />,
        pending: { kind: 'doc', refId: d.id, title: d.title || td('untitled'), icon: <DocMark source={d.source} /> },
      }))
    }
    return (events ?? [])
      .filter((e) => !e.allDay && new Date(e.end) > new Date())
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((e) => ({
        id: e.id,
        label: e.title || t('untitledMeeting'),
        sub: format(new Date(e.start), 'EEE d MMM · HH:mm', { locale }),
        icon: <CalendarDays className="size-4 text-accent-mid" />,
        pending: { kind: 'meeting', title: e.title, meta: { invite: toInvite(e) }, icon: <CalendarDays className="size-4 text-accent-mid" /> },
      }))
  }, [kind, tasks, files, docs, events, wsMap, t, td, locale, toInvite])

  const needle = q.trim().toLowerCase()
  const shown = (needle ? rows.filter((r) => r.label.toLowerCase().includes(needle) || r.sub.toLowerCase().includes(needle)) : rows).slice(0, 40)

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-line bg-panel shadow-popover">
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Search className="size-3.5 shrink-0 text-fg-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && shown[0]) {
              e.preventDefault()
              onPick(shown[0].pending)
            }
          }}
          autoFocus
          placeholder={t(`search.${kind}`)}
          className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-fg-subtle"
        />
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
          aria-label={t('closePicker')}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto p-1 scrollbar-thin">
        {shown.map((r) => (
          <button key={r.id} type="button" onClick={() => onPick(r.pending)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-hover">
            <span className="flex shrink-0">{r.icon}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-fg">{r.label}</span>
            <span className="shrink-0 truncate text-xs text-fg-subtle">{r.sub}</span>
          </button>
        ))}
        {shown.length === 0 ? <p className="px-2 py-3 text-sm text-fg-subtle">{t('nothing')}</p> : null}
      </div>
    </div>
  )
}
