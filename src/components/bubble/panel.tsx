'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, ExternalLink, FileText, Link2, LogOut, Mail, Paperclip, Plus, UserPlus, X } from 'lucide-react'
import { LogoMark } from '@/components/app/logo'
import { AppProvider } from '@/components/app/app-context'
import { QuickTaskDialog } from '@/components/tasks/quick-task-dialog'
import { NewRequestDialog } from '@/components/requests/new-request-dialog'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { Checkbox, Switch } from '@/components/ui/switch'
import { AssigneesMenu } from '@/components/tasks/pickers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { setApiBridge } from '@/lib/api/client'
import { toAccount, toDepartment, toMember, toProfile, toWorkspace } from '@/lib/api/adapters'
import type { ApiContext } from '@/lib/api/types'
import type { TaskRow } from '@/lib/database.types'
import type { AppContextValue } from '@/lib/types'
import { cn } from '@/lib/utils'
import { READY_MESSAGE } from './connect'

/*
 * La burbuja de Veltro dentro de otra plataforma. Habla con /burbuja.js (la página que la contiene) por
 * postMessage: recibe de dónde se la llama (plataforma, página, registro, texto sugerido) y le pide cerrar. Con Veltro habla por /api/burbuja (su propio token, en una cookie
 * particionada por el sitio que la contiene).
 *
 * Los formularios son los de Veltro (nueva tarea y nueva solicitud, con todo lo que tienen): la burbuja les da
 * el mismo contexto que la app y su propio puente; el puente agrega el origen al crear.
 */

const MSG = {
  ready: 'veltro-burbuja:listo',
  context: 'veltro-burbuja:contexto',
  close: 'veltro-burbuja:cerrar',
} as const

type HostContext = { platform: string; url?: string; record?: { id?: string; title?: string }; text?: string; host?: string }
type Done = { label: string; href: string; note?: string | null }
type MailAccount = { id: string; email: string; isDefault: boolean }
type Prefs = { tab?: 'task' | 'request'; accountId?: string; workspaceId?: string; departmentId?: string }
type SignedUpload = { uploadUrl: string; headers: Record<string, string>; uploadToken: string }
type Attachment = { id: string; kind: 'file'; file: File; preview: string | null } | { id: string; kind: 'link'; url: string }

// lo que acepta la API (lib/archivos de la API), hasta 20 MB; si el navegador no da el tipo, por la extensión
const MAX_BYTES = 20 * 1024 * 1024
const TYPE_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  avif: 'image/avif',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  weba: 'audio/webm',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
}
const ALLOWED = new Set(Object.values(TYPE_BY_EXT))
const mimeOf = (f: File) => (f.type && ALLOWED.has(f.type) ? f.type : (TYPE_BY_EXT[f.name.split('.').pop()?.toLowerCase() ?? ''] ?? f.type))

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api/burbuja${path}`, {
    method: init.method ?? 'GET',
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  })
  if (!res.ok) {
    const e = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new HttpError(res.status, e?.error?.message ?? res.statusText)
  }
  return (res.status === 204 ? null : await res.json()) as T
}

/** Sube el archivo con la URL firmada que dio la API (paso 1) y devuelve el sello para el paso 2. */
async function upload(blob: Blob, step1: SignedUpload) {
  const res = await fetch(step1.uploadUrl, { method: 'PUT', headers: step1.headers, body: blob })
  if (!res.ok) throw new HttpError(res.status, 'upload_failed')
  return step1.uploadToken
}

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

// lo último elegido en esta plataforma (el almacenamiento del iframe ya es propio de cada sitio)
const prefsKey = (platform: string) => `veltro-burbuja:${platform}`
function readPrefs(platform: string): Prefs {
  try {
    return JSON.parse(localStorage.getItem(prefsKey(platform)) ?? '{}') as Prefs
  } catch {
    return {}
  }
}
function savePrefs(platform: string, p: Prefs) {
  try {
    localStorage.setItem(prefsKey(platform), JSON.stringify({ ...readPrefs(platform), ...p }))
  } catch {
    /* sin almacenamiento: se elige cada vez */
  }
}

/** El contexto de la app a partir del de la API (como lo arma la web en lib/session). */
function toAppContext(res: ApiContext): AppContextValue | null {
  if (res.status === 'onboarding' || !res.account) return null
  return {
    user: { id: res.user.id, email: res.user.email },
    profile: toProfile(res.user),
    account: toAccount(res.account),
    accounts: res.accounts.map(toAccount),
    accountRole: res.account.role,
    workspaces: res.workspaces.map((w) => toWorkspace(w)),
    observedWorkspaces: res.observedWorkspaces.map((w) => toWorkspace(w, 'viewer')),
    members: res.members.map(toMember).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    departments: res.departments.map(toDepartment),
    teams: res.teams ?? [],
    google: null,
    googleConfigured: false,
    demoData: { available: false, active: false },
  }
}

export function BubblePanel({ initialPlatform }: { initialPlatform: string }) {
  const t = useTranslations('bubble')
  const [host, setHost] = useState<HostContext>({ platform: initialPlatform })
  const [app, setApp] = useState<AppContextValue | null>(null)
  const [me, setMe] = useState<{ id: string; name: string; avatar: string | null } | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'no-account' | 'disconnected' | 'connecting' | 'blocked' | 'error'>('loading')
  const [tab, setTab] = useState<'task' | 'request'>('task')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [linkDraft, setLinkDraft] = useState<string | null>(null)
  const [attachError, setAttachError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  // enviar también por correo, desde el Gmail de la persona (null: todavía no se sabe si tiene)
  const [mailAccounts, setMailAccounts] = useState<MailAccount[] | null>(null)
  const [mailOn, setMailOn] = useState(true)
  const [mailFrom, setMailFrom] = useState('')
  const [mailDept, setMailDept] = useState(false)
  const [mailPeople, setMailPeople] = useState<string[]>([])
  const [mailConnecting, setMailConnecting] = useState(false)
  const [done, setDone] = useState<Done | null>(null)
  const [round, setRound] = useState(0)
  const verifier = useRef<string | null>(null)
  const popup = useRef<Window | null>(null)
  const [polling, setPolling] = useState(false)
  const platform = host.platform

  const post = (msg: Record<string, unknown>) => window.parent?.postMessage(msg, '*')

  // de dónde viene: el puente lo agrega a la tarea o la solicitud al crearla
  const source = useMemo(
    () => ({
      platform,
      ...(host.url && /^https?:\/\//i.test(host.url) ? { url: host.url } : {}),
      ...(host.record?.id ? { recordId: String(host.record.id).slice(0, 120) } : {}),
      ...(host.record?.title ? { recordTitle: String(host.record.title).slice(0, 200) } : {}),
    }),
    [platform, host.url, host.record?.id, host.record?.title],
  )
  useEffect(() => {
    setApiBridge({
      base: '/api/burbuja',
      headers: { 'x-veltro-source': encodeURIComponent(JSON.stringify(source)) },
      onUnauthorized: () => setStatus('disconnected'),
    })
  }, [source])

  async function loadMail() {
    const r = await call<{ items: MailAccount[] }>('/v1/me/mail-accounts').catch(() => null)
    if (!r) return
    setMailAccounts(r.items)
    setMailFrom((f) => (r.items.some((a) => a.id === f) ? f : ((r.items.find((a) => a.isDefault) ?? r.items[0])?.id ?? '')))
    return r.items.length
  }

  // conectar Gmail con lo que ya tiene la web (en una ventanita, con su sesión); al volver la burbuja lo ve sola
  const connectMail = () => {
    const w = window.open('/api/integrations/google/mail-connect?returnTo=/burbuja/listo', 'veltro-burbuja-gmail', 'popup,width=520,height=680')
    if (!w) return
    setMailConnecting(true)
    const started = Date.now()
    const id = setInterval(async () => {
      const n = await loadMail()
      if (n || Date.now() - started > 10 * 60_000) {
        clearInterval(id)
        setMailConnecting(false)
      }
    }, 2000)
  }

  // el aviso por correo, después de crear (el texto lo arma la API): a quien la recibe siempre, y si se pide,
  // a todo el departamento y a las personas elegidas
  const notify = async (itemType: 'task' | 'request', itemId: string) => {
    if (!mailOn || !mailFrom) return null
    try {
      const r = await call<{ to: unknown[] }>('/v1/mail/send', {
        method: 'POST',
        body: { mailAccountId: mailFrom, itemType, itemId, toDepartment: itemType === 'request' && mailDept, extraTo: mailPeople },
      })
      return t('mailSent', { count: r.to.length })
    } catch (e) {
      return e instanceof HttpError && e.status === 422 ? t('mailNoRecipients') : t('mailFailed')
    }
  }

  const load = useCallback(
    async (accountId?: string) => {
      try {
        const q = accountId ?? readPrefs(platform).accountId
        const res = await call<ApiContext>(`/v1/bubble/app-context${q ? `?accountId=${q}` : ''}`)
        setMe({ id: res.user.id, name: res.user.fullName || res.user.email, avatar: res.user.avatarUrl ?? null })
        const ctx = toAppContext(res)
        setApp(ctx)
        if (ctx) void loadMail()
        setTab(readPrefs(platform).tab ?? 'task')
        setStatus(ctx ? 'ready' : 'no-account')
      } catch (e) {
        setStatus(e instanceof HttpError && e.status === 401 ? 'disconnected' : 'error')
      }
    },
    [platform],
  )

  // retirar el token que dejó la ventanita (una sola vez, con el verifier que solo conoce esta burbuja)
  const claim = useCallback(async () => {
    if (!verifier.current) return false
    try {
      await call('/claim', { method: 'POST', body: { verifier: verifier.current } })
      verifier.current = null
      setStatus('loading')
      await load()
      return true
    } catch {
      return false
    }
  }, [load])

  // mensajes de la página que contiene la burbuja (su contexto) y de la ventanita de conectar
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string } & Record<string, unknown>
      if (e.origin === window.location.origin && d?.type === READY_MESSAGE) {
        void claim()
        return
      }
      if (e.source !== window.parent || !d?.type) return
      if (d.type === MSG.context) {
        const c = d as unknown as HostContext
        setHost((h) => ({
          platform: typeof c.platform === 'string' && c.platform.trim() ? c.platform.trim().slice(0, 40) : h.platform,
          url: typeof c.url === 'string' ? c.url.slice(0, 2000) : undefined,
          record: c.record && typeof c.record === 'object' ? c.record : undefined,
          text: typeof c.text === 'string' ? c.text : undefined,
          host: typeof c.host === 'string' ? c.host : undefined,
        }))
      }
    }
    window.addEventListener('message', onMessage)
    post({ type: MSG.ready })
    return () => window.removeEventListener('message', onMessage)
  }, [claim])

  useEffect(() => {
    void load()
  }, [load])

  // mientras haya una conexión pendiente se pregunta cada poco (si la persona entró con Google, no llega aviso).
  // Si cierra la ventanita, el botón vuelve a estar disponible; se sigue preguntando un rato por si sí confirmó
  // (al pasar por Google el navegador da la ventana por cerrada aunque siga abierta).
  useEffect(() => {
    if (!polling) return
    const started = Date.now()
    const id = setInterval(async () => {
      if (Date.now() - started > 10 * 60_000) {
        clearInterval(id)
        setPolling(false)
        setStatus((s) => (s === 'connecting' ? 'disconnected' : s))
        return
      }
      if (popup.current?.closed) setStatus((s) => (s === 'connecting' ? 'disconnected' : s))
      if (await claim()) {
        clearInterval(id)
        setPolling(false)
      }
    }, 1500)
    return () => clearInterval(id)
  }, [polling, claim])

  const connect = async () => {
    const v = b64url(crypto.getRandomValues(new Uint8Array(32)))
    verifier.current = v
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))
    // el sitio real que contiene la burbuja (si el navegador lo dice); si no, el que mandó el script
    const site = window.location.ancestorOrigins?.[0]?.replace(/^https?:\/\//, '') ?? host.host ?? ''
    const q = new URLSearchParams({ platform, c: challenge, ...(site ? { host: site } : {}) })
    const w = window.open(`/burbuja/conectar?${q}`, 'veltro-burbuja-conectar', 'popup,width=460,height=640')
    popup.current = w
    setStatus(w ? 'connecting' : 'blocked')
    setPolling(Boolean(w))
  }

  const disconnect = async () => {
    await call('/session', { method: 'DELETE' }).catch(() => null)
    setApp(null)
    setMe(null)
    setStatus('disconnected')
  }

  // ── adjuntos: archivos (o capturas pegadas con Ctrl+V) y enlaces ──
  const addFiles = (files: File[]) => {
    setAttachError(null)
    const ok: Attachment[] = []
    for (const f of files) {
      if (!ALLOWED.has(mimeOf(f))) setAttachError(t('fileNotAllowed', { name: f.name }))
      else if (f.size > MAX_BYTES) setAttachError(t('fileTooBig', { name: f.name }))
      else ok.push({ id: crypto.randomUUID(), kind: 'file', file: f, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null })
    }
    setAttachments((a) => [...a, ...ok])
  }
  const addLink = () => {
    const url = (linkDraft ?? '').trim()
    const full = /^https?:\/\//i.test(url) ? url : `https://${url}`
    try {
      new URL(full)
    } catch {
      setAttachError(t('linkInvalid'))
      return
    }
    setAttachError(null)
    setAttachments((a) => [...a, { id: crypto.randomUUID(), kind: 'link', url: full }])
    setLinkDraft(null)
  }
  const removeAttachment = (id: string) =>
    setAttachments((a) =>
      a.filter((x) => {
        if (x.id === id && x.kind === 'file' && x.preview) URL.revokeObjectURL(x.preview)
        return x.id !== id
      }),
    )
  const clearAttachments = () => {
    for (const x of attachments) if (x.kind === 'file' && x.preview) URL.revokeObjectURL(x.preview)
    setAttachments([])
    setLinkDraft(null)
    setAttachError(null)
  }
  // una captura copiada (o un archivo) se pega con Ctrl+V en cualquier parte de la burbuja
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])]
      if (!files.length) return
      e.preventDefault()
      addFiles(files.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `captura-${Date.now()}${i ? `-${i}` : ''}.png`, { type: f.type }))))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  // la tarea ya está: se le adjuntan los archivos y enlaces y se muestra el listo
  const taskCreated = async (task: TaskRow) => {
    const ws = app?.workspaces.find((w) => w.id === task.workspace_id)
    savePrefs(platform, { tab: 'task', accountId: app?.account.id, workspaceId: task.workspace_id })
    let failed = false
    for (const x of attachments) {
      try {
        if (x.kind === 'link') {
          await call(`/v1/workspaces/${task.workspace_id}/attachments`, { method: 'POST', body: { kind: 'link', url: x.url, taskId: task.id } })
          continue
        }
        const s1 = await call<SignedUpload>(`/v1/workspaces/${task.workspace_id}/attachments/upload-url`, {
          method: 'POST',
          body: { name: x.file.name, mimeType: mimeOf(x.file), sizeBytes: x.file.size },
        })
        const uploadToken = await upload(x.file, s1)
        await call(`/v1/workspaces/${task.workspace_id}/attachments`, {
          method: 'POST',
          body: { kind: 'file', uploadToken, name: x.file.name, taskId: task.id },
        })
      } catch {
        // la tarea quedó; ese adjunto no: se puede agregar desde Veltro
        failed = true
      }
    }
    setAttachError(failed ? t('attachFailed') : null)
    const ref = ws ? `${ws.key}-${task.number}` : task.id
    const note = await notify('task', task.id)
    setDone({ label: t('doneTask', { ref }), href: `/tasks/${ref}`, note: failed ? t('attachFailed') : note })
  }

  // antes de mandar la solicitud: los archivos subidos van en `files` (hasta 5) y los enlaces, al final del detalle
  const requestExtra = async (draft: { body: string }) => {
    if (!app) return {}
    const files = attachments.filter((x) => x.kind === 'file')
    const links = attachments.filter((x) => x.kind === 'link')
    if (files.length > 5) {
      setAttachError(t('tooManyFiles'))
      throw new Error('too_many_files')
    }
    const uploaded = []
    for (const x of files) {
      const s1 = await call<SignedUpload>(`/v1/accounts/${app.account.id}/requests/files/upload-url`, {
        method: 'POST',
        body: { name: x.file.name, mimeType: mimeOf(x.file), sizeBytes: x.file.size },
      })
      uploaded.push({ uploadToken: await upload(x.file, s1) })
    }
    const extra: Record<string, unknown> = uploaded.length ? { files: uploaded } : {}
    if (links.length) extra.body = [draft.body, links.map((l) => l.url).join('\n')].filter(Boolean).join('\n\n').slice(0, 4000)
    return extra
  }

  const requestCreated = async (r: { id: string; code: string; department?: { id: string } | null }) => {
    savePrefs(platform, { tab: 'request', accountId: app?.account.id, ...(r.department?.id ? { departmentId: r.department.id } : {}) })
    const note = await notify('request', r.id)
    setDone({ label: t('doneRequest', { code: r.code }), href: `/requests/${r.id}`, note })
  }

  const another = () => {
    setDone(null)
    clearAttachments()
    setRound((n) => n + 1)
  }

  // enviar también por correo: desde qué Gmail, a quién siempre, y además todo el departamento o personas elegidas
  const people = app?.members.filter((m) => m.id !== app.user.id) ?? []
  const chosen = people.filter((m) => mailPeople.includes(m.id))
  const mailBox = (
    <div className="mx-4 mb-3 rounded-lg border border-line p-3">
      {mailAccounts === null ? null : mailAccounts.length === 0 ? (
        <div className="flex items-center gap-3">
          <Mail className="size-4 shrink-0 text-fg-subtle" />
          <p className="flex-1 text-xs text-fg-muted">{t('mailConnectText')}</p>
          <Button variant="secondary" size="sm" loading={mailConnecting} onClick={connectMail}>
            {mailConnecting ? t('mailConnecting') : t('mailConnect')}
          </Button>
        </div>
      ) : (
        <>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
            <Checkbox checked={mailOn} onCheckedChange={(v) => setMailOn(Boolean(v))} />
            <Mail className="size-4 text-fg-subtle" />
            {t('mailSend')}
          </label>
          {mailOn ? (
            <div className="mt-3 flex flex-col gap-2.5 pl-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-xs text-fg-muted">{t('mailFrom')}</span>
                {mailAccounts.length > 1 ? (
                  <Select
                    className="h-8 flex-1"
                    value={mailFrom}
                    onChange={setMailFrom}
                    options={mailAccounts.map((a) => ({ value: a.id, label: a.email }))}
                    aria-label={t('mailFrom')}
                  />
                ) : (
                  <span className="truncate">{mailAccounts[0]?.email}</span>
                )}
              </div>
              <div className="flex items-start gap-2">
                <span className="w-16 shrink-0 pt-0.5 text-xs text-fg-muted">{t('mailTo')}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="text-fg">{tab === 'request' ? t('mailHead') : t('mailAssignees')}</span>
                  {tab === 'request' ? (
                    <label className="flex cursor-pointer items-center gap-2 text-fg-muted">
                      <Switch checked={mailDept} onCheckedChange={setMailDept} />
                      {t('mailWholeDept')}
                    </label>
                  ) : null}
                  <AssigneesMenu value={mailPeople} members={people} onChange={setMailPeople} className="h-7 w-fit border border-line px-2 text-sm">
                    {chosen.length ? (
                      <>
                        <AvatarStack people={chosen} size={16} ring="panel" />
                        {chosen.length === 1 ? chosen[0].full_name : t('mailPeopleCount', { count: chosen.length })}
                      </>
                    ) : (
                      <>
                        <UserPlus className="size-3.5 text-fg-subtle" />
                        {t('mailAddPeople')}
                      </>
                    )}
                  </AssigneesMenu>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )

  // adjuntos: archivos, capturas pegadas y enlaces (van dentro del formulario de Veltro, antes del botón)
  const attachBox = (
    <div className="mx-4 mb-3 rounded-lg border border-line p-3">
      <div className="flex items-center gap-2">
        <Paperclip className="size-4 text-fg-subtle" />
        <span className="text-sm font-medium">{t('attachTitle')}</span>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
            <Plus /> {t('attachFile')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setLinkDraft((v) => (v === null ? '' : v))}>
            <Link2 /> {t('attachLink')}
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            addFiles([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </div>
      {linkDraft !== null ? (
        <div className="mt-2 flex gap-2">
          <Input
            autoFocus
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => {
              // dentro del formulario de Veltro: Enter agrega el enlace, no manda la tarea
              if (e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation()
                addLink()
              }
            }}
            placeholder="https://…"
            className="h-8 text-sm"
          />
          <Button variant="secondary" size="md" disabled={!linkDraft.trim()} onClick={addLink}>
            {t('add')}
          </Button>
        </div>
      ) : null}
      {attachments.length ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {attachments.map((x) => (
            <li key={x.id} className="flex items-center gap-2 rounded-lg bg-hover px-2 py-1.5 text-sm">
              {x.kind === 'file' && x.preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- archivo local, sin optimizar
                <img src={x.preview} alt="" className="size-7 shrink-0 rounded object-cover" />
              ) : x.kind === 'file' ? (
                <FileText className="size-4 shrink-0 text-fg-subtle" />
              ) : (
                <Link2 className="size-4 shrink-0 text-fg-subtle" />
              )}
              <span className="min-w-0 flex-1 truncate">{x.kind === 'file' ? x.file.name : x.url.replace(/^https?:\/\//, '')}</span>
              <Button variant="ghost" size="icon-xs" aria-label={t('remove')} onClick={() => removeAttachment(x.id)}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-xs text-fg-subtle">{t('pasteHint')}</p>
      )}
      {attachError ? (
        <p className="mt-2 text-xs text-danger" role="alert">
          {attachError}
        </p>
      ) : null}
    </div>
  )

  const record = host.record?.title || host.record?.id
  const prefs = typeof window === 'undefined' ? {} : readPrefs(platform)

  return (
    <div className="flex h-dvh flex-col bg-canvas text-fg">
      {/* cabecera: la marca, de dónde se la llama y cerrar */}
      <header className="flex items-center gap-2.5 border-b border-line bg-panel px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-highlight">
          <LogoMark className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{t('title')}</p>
          <p className="truncate text-xs text-fg-muted">{t('from', { platform })}</p>
        </div>
        {me ? <Avatar name={me.name} src={me.avatar} seed={me.id} size={26} /> : null}
        <Button variant="ghost" size="icon-sm" aria-label={t('close')} onClick={() => post({ type: MSG.close })}>
          <X />
        </Button>
      </header>

      {status === 'loading' ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-fg-muted">
          <Spinner className="size-4" /> {t('loading')}
        </div>
      ) : status === 'no-account' ? (
        // entró sin cuenta (se registró desde la burbuja): no se le pide armar una; la cuenta es de su empresa
        <Centered title={t('noAccountTitle')} text={t('noAccountText')}>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => void load()}>
            {t('retry')}
          </Button>
          <Button variant="ghost" size="sm" onClick={disconnect}>
            <LogOut /> {t('disconnect')}
          </Button>
        </Centered>
      ) : status === 'error' ? (
        <Centered title={t('error')} text="">
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            {t('retry')}
          </Button>
        </Centered>
      ) : status !== 'ready' || !app ? (
        // sin conectar: un paso, con la cuenta de Veltro
        <Centered title={t('connectTitle')} text={t('connectText', { platform })}>
          <Button variant="primary" size="lg" className="mt-2 w-full" loading={status === 'connecting'} onClick={connect}>
            {status === 'connecting' ? t('connecting') : t('connect')}
          </Button>
          {status === 'blocked' ? (
            <p className="text-xs text-danger" role="alert">
              {t('popupBlocked')}
            </p>
          ) : null}
        </Centered>
      ) : done ? (
        <Centered title={done.label} text={done.note ?? ''} icon={<Check className="size-6" />}>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={another}>
              {t('another')}
            </Button>
            <a
              href={done.href}
              target="_blank"
              rel="noopener"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:bg-accent-hover"
            >
              {t('open')} <ExternalLink className="size-4" />
            </a>
          </div>
        </Centered>
      ) : (
        <AppProvider value={app}>
          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {/* de dónde viene: queda guardado en la tarea o la solicitud */}
            <div className="flex items-center gap-2 rounded-lg bg-highlight px-3 py-2 text-xs text-highlight-ink">
              <Link2 className="size-3.5 shrink-0" />
              <span className="truncate">
                <strong className="font-semibold">{platform}</strong>
                {record ? ` · ${record}` : host.url ? ` · ${host.url.replace(/^https?:\/\//, '')}` : ''}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Tarea o Solicitud */}
              <div className="grid flex-1 grid-cols-2 gap-1 rounded-lg bg-hover p-1" role="tablist">
                {(['task', 'request'] as const).map((k) => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={tab === k}
                    onClick={() => {
                      setTab(k)
                      savePrefs(platform, { tab: k })
                    }}
                    className={cn(
                      'h-8 rounded-md text-sm font-medium transition-colors',
                      tab === k ? 'bg-panel text-fg shadow-card' : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    {t(k)}
                  </button>
                ))}
              </div>
              {app.accounts.length > 1 ? (
                <Select
                  className="w-40"
                  value={app.account.id}
                  onChange={(id) => {
                    savePrefs(platform, { accountId: id })
                    setStatus('loading')
                    void load(id)
                  }}
                  options={app.accounts.map((a) => ({ value: a.id, label: a.name }))}
                  aria-label={t('account')}
                />
              ) : null}
            </div>

            {/* los formularios de Veltro, tal cual */}
            {tab === 'task' ? (
              <QuickTaskDialog
                key={`t-${app.account.id}-${round}`}
                embedded
                open
                onOpenChange={() => {}}
                defaults={{ workspaceId: prefs.workspaceId, ...(host.text ? { title: host.text } : {}) }}
                onCreated={(task) => void taskCreated(task)}
                extra={
                  <>
                    {attachBox}
                    {mailBox}
                  </>
                }
              />
            ) : (
              <NewRequestDialog
                key={`r-${app.account.id}-${round}`}
                embedded
                open
                onOpenChange={() => {}}
                defaultDepartment={prefs.departmentId}
                beforeSend={requestExtra}
                onCreated={(r) => void requestCreated(r)}
                extra={
                  <>
                    {attachBox}
                    {mailBox}
                  </>
                }
              />
            )}
          </div>

          <footer className="flex items-center border-t border-line bg-panel px-4 py-2">
            <Button variant="ghost" size="sm" onClick={disconnect}>
              <LogOut /> {t('disconnect')}
            </Button>
          </footer>
        </AppProvider>
      )}
    </div>
  )
}

function Centered({ title, text, icon, children }: { title: string; text: string; icon?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <span className={cn('flex size-12 items-center justify-center', icon ? 'rounded-full bg-accent text-accent-fg' : 'rounded-2xl bg-highlight')}>
        {icon ?? <LogoMark className="size-7" />}
      </span>
      <h1 className="text-base font-semibold">{title}</h1>
      {text ? <p className="text-sm leading-relaxed text-fg-muted">{text}</p> : null}
      {children}
    </div>
  )
}
