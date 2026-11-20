'use client'

import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { MessageSquare, UserPlus, Users } from 'lucide-react'
import { useApp, useIsAccountAdmin } from '@/components/app/app-context'
import { InviteDialog } from '@/components/settings/members-settings'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChatList } from './chat-list'
import { ChatContext, useChatContextHidden } from './chat-context'
import { PeopleDialog } from './new-chat-dialog'

/**
 * Pasillo: la lista de conversaciones queda fija y a la derecha va el chat abierto. En el celular, una u otro.
 * En escritorio la lista y el contexto viven sobre el marco y el chat es la hoja; el chat elegido de la
 * lista se une a la hoja como la pestaña de una carpeta.
 */
export function PasilloShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const activeId = pathname.startsWith('/chat/') ? pathname.slice('/chat/'.length).split('/')[0] : undefined
  const [contextHidden] = useChatContextHidden()
  return (
    <div className="flex h-full min-h-0">
      {/* encima de la sombra de la hoja: la pestaña del chat elegido se une a ella sin un borde oscuro */}
      <aside className={cn('min-h-0 w-full shrink-0 md:on-frame md:relative md:z-[1] lg:flex lg:w-[324px]', activeId ? 'hidden' : 'flex')}>
        <div className="flex min-h-0 w-full flex-col">
          <ChatList activeId={activeId} />
        </div>
      </aside>
      <main className={cn('min-h-0 min-w-0 flex-1 md:overflow-hidden md:rounded-[20px] md:bg-canvas md:shadow-sheet', activeId ? 'flex' : 'hidden lg:flex')}>{children}</main>
      {activeId && !contextHidden ? <ChatContext chatId={activeId} /> : null}
    </div>
  )
}

/** Sin chat abierto: una invitación a empezar (o, si todavía no hay con quién, a sumar gente). */
export function PasilloWelcome() {
  const t = useTranslations('pasillo')
  const [dialog, setDialog] = useState<'direct' | 'group' | null>(null)
  const { members, user } = useApp()
  if (!members.some((m) => m.id !== user.id)) return <PasilloAlone />
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
        <MessageSquare className="size-7" />
      </span>
      <div>
        <p className="text-base font-semibold text-fg">{t('welcomeTitle')}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">{t('welcomeBody')}</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setDialog('direct')}>
          <MessageSquare />
          {t('newDirect')}
        </Button>
        <Button size="sm" variant="primary" onClick={() => setDialog('group')}>
          <Users />
          {t('newGroup')}
        </Button>
      </div>
      <PeopleDialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)} mode={dialog ?? 'direct'} />
    </div>
  )
}

/**
 * Nadie más en tus espacios: el Pasillo se habilita cuando llega alguien. Quien administra la cuenta
 * invita desde aquí (a la cuenta o a un espacio); los demás saben qué esperar.
 */
function PasilloAlone() {
  const t = useTranslations('pasillo.alone')
  const { accountRole } = useApp()
  const admin = useIsAccountAdmin()
  const [inviting, setInviting] = useState(false)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
        <UserPlus className="size-7" />
      </span>
      <div>
        <p className="text-base font-semibold text-fg">{t('title')}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">{admin ? t('bodyAdmin') : t('body')}</p>
      </div>
      {admin ? (
        <>
          <Button variant="primary" onClick={() => setInviting(true)}>
            <UserPlus />
            {t('invite')}
          </Button>
          <InviteDialog open={inviting} onOpenChange={setInviting} canPromote={accountRole === 'owner'} />
        </>
      ) : null}
    </div>
  )
}
