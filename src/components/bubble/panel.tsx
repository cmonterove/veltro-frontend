'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Camera, Check, ExternalLink, Link2, LogOut, X } from 'lucide-react'
import { LogoMark } from '@/components/app/logo'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { READY_MESSAGE } from './connect'

/*
 * La burbuja de Veltro dentro de otra plataforma. Habla con /burbuja.js (la página que la contiene) por
 * postMessage: recibe de dónde se la llama (plataforma, página, registro, texto sugerido) y la captura de
 * pantalla; pide capturar y cerrar. Con Veltro habla por /api/burbuja (su propio token, en una cookie
 * particionada por el sitio que la contiene).
 */

const MSG = {
  ready: 'veltro-burbuja:listo',
  context: 'veltro-burbuja:contexto',
  capture: 'veltro-burbuja:capturar',
  captured: 'veltro-burbuja:captura',
  close: 'veltro-burbuja:cerrar',
} as const

type Source = { platform: string; url?: string; recordId?: string; recordTitle?: string }
type HostContext = { platform: string; url?: string; record?: { id?: string; title?: string }; text?: string; host?: string }
type Ctx = {
  user: { id: string; fullName: string | null; email: string; avatarUrl: string | null }
  accounts: { id: string; name: string; color: string | null }[]
  account: { id: string; name: string } | null
  workspaces: { id: string; name: string; key: string; color: string | null }[]
  departments: { id: string; name: string }[]
}
type Done = { kind: 'task'; label: string; href: string } | { kind: 'request'; label: string; href: string }
type Prefs = { tab?: 'task' | 'request'; accountId?: string; workspaceId?: string; departmentId?: string }

class HttpError extends Error {
  constructor(public status: number, message: string) {
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

/** Sube la captura con la URL firmada que dio la API (paso 1) y devuelve el sello para el paso 2. */
async function upload(blob: Blob, step1: { uploadUrl: string; headers: Record<string, string>; uploadToken: string }) {
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

export function BubblePanel({ initialPlatform }: { initialPlatform: string }) {
  const t = useTranslations('bubble')
  const [host, setHost] = useState<HostContext>({ platform: initialPlatform })
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'disconnected' | 'connecting' | 'blocked'>('loading')
  const [tab, setTab] = useState<'task' | 'request'>('task')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null)
  const [capture, setCapture] = useState<'idle' | 'busy' | 'failed' | 'unsupported'>('idle')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const verifier = useRef<string | null>(null)
  const popup = useRef<Window | null>(null)
  const [polling, setPolling] = useState(false)
  const platform = host.platform

  const post = (msg: Record<string, unknown>) => window.parent?.postMessage(msg, '*')

  const load = useCallback(
    async (accountId?: string) => {
      try {
        const q = accountId ?? readPrefs(platform).accountId
        const c = await call<Ctx>(`/v1/bubble/context${q ? `?accountId=${q}` : ''}`)
        setCtx(c)
        const prefs = readPrefs(platform)
        setTab(prefs.tab ?? 'task')
        setWorkspaceId(c.workspaces.find((w) => w.id === prefs.workspaceId)?.id ?? c.workspaces[0]?.id ?? '')
        setDepartmentId(c.departments.find((d) => d.id === prefs.departmentId)?.id ?? c.departments[0]?.id ?? '')
        setStatus('ready')
      } catch (e) {
        setStatus(e instanceof HttpError && e.status === 401 ? 'disconnected' : 'ready')
        if (!(e instanceof HttpError && e.status === 401)) setError(t('error'))
      }
    },
    [platform, t],
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

  // mensajes de la página que contiene la burbuja (contexto y captura) y de la ventanita de conectar
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
        if (typeof c.text === 'string' && c.text.trim()) setTitle((v) => v || c.text!.trim().slice(0, 120))
      }
      if (d.type === MSG.captured) {
        if (d.blob instanceof Blob) {
          setShot((old) => {
            if (old) URL.revokeObjectURL(old.url)
            return { blob: d.blob as Blob, url: URL.createObjectURL(d.blob as Blob) }
          })
          setCapture('idle')
        } else setCapture(d.error === 'unsupported' ? 'unsupported' : 'failed')
      }
    }
    window.addEventListener('message', onMessage)
    post({ type: MSG.ready })
    return () => window.removeEventListener('message', onMessage)
  }, [claim])

  useEffect(() => {
    void load()
  }, [load])

  // mientras haya una conexión pendiente se pregunta cada 2 s (si la persona entró con Google, no llega aviso).
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
    setCtx(null)
    setStatus('disconnected')
  }

  const source = (): Source => ({
    platform,
    ...(host.url && /^https?:\/\//i.test(host.url) ? { url: host.url } : {}),
    ...(host.record?.id ? { recordId: String(host.record.id).slice(0, 120) } : {}),
    ...(host.record?.title ? { recordTitle: String(host.record.title).slice(0, 200) } : {}),
  })

  const submit = async () => {
    if (!ctx?.account || !title.trim()) return
    setSaving(true)
    setError(null)
    try {
      if (tab === 'task') {
        const task = await call<{ id: string; ref: string }>(`/v1/workspaces/${workspaceId}/tasks`, {
          method: 'POST',
          body: { title: title.trim().slice(0, 300), ...(details.trim() ? { descriptionText: details.trim() } : {}), source: source() },
        })
        if (shot) {
          const s1 = await call<{ uploadUrl: string; headers: Record<string, string>; uploadToken: string }>(
            `/v1/workspaces/${workspaceId}/attachments/upload-url`,
            { method: 'POST', body: { name: 'captura.png', mimeType: 'image/png', sizeBytes: shot.blob.size } },
          )
          const uploadToken = await upload(shot.blob, s1)
          await call(`/v1/workspaces/${workspaceId}/attachments`, {
            method: 'POST',
            body: { kind: 'file', uploadToken, name: 'captura.png', taskId: task.id },
          })
        }
        savePrefs(platform, { tab, accountId: ctx.account.id, workspaceId })
        setDone({ kind: 'task', label: t('doneTask', { ref: task.ref }), href: `/tasks/${task.ref}` })
      } else {
        const files: { uploadToken: string }[] = []
        if (shot) {
          const s1 = await call<{ uploadUrl: string; headers: Record<string, string>; uploadToken: string }>(
            '/v1/bubble/requests/files/upload-url',
            { method: 'POST', body: { accountId: ctx.account.id, name: 'captura.png', mimeType: 'image/png', sizeBytes: shot.blob.size } },
          )
          files.push({ uploadToken: await upload(shot.blob, s1) })
        }
        const req = await call<{ id: string; code: string }>('/v1/bubble/requests', {
          method: 'POST',
          body: {
            accountId: ctx.account.id,
            departmentId,
            title: title.trim().slice(0, 120),
            body: details.trim().slice(0, 4000),
            urgent,
            files,
            source: source(),
          },
        })
        savePrefs(platform, { tab, accountId: ctx.account.id, departmentId })
        setDone({ kind: 'request', label: t('doneRequest', { code: req.code }), href: `/requests/${req.id}` })
      }
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        setStatus('disconnected')
        return
      }
      setError(e instanceof HttpError && e.message && e.status === 422 ? e.message : t('error'))
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setDone(null)
    setTitle('')
    setDetails('')
    setUrgent(false)
    if (shot) URL.revokeObjectURL(shot.url)
    setShot(null)
  }

  const askCapture = () => {
    setCapture('busy')
    post({ type: MSG.capture })
  }

  const record = host.record?.title || host.record?.id
  const canSubmit = Boolean(title.trim().length >= (tab === 'request' ? 4 : 1) && (tab === 'task' ? workspaceId : departmentId))

  return (
    <div className="flex h-dvh flex-col bg-panel text-fg">
      {/* cabecera: la marca, de dónde se la llama y cerrar */}
      <header className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-highlight">
          <LogoMark className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{t('title')}</p>
          <p className="truncate text-xs text-fg-muted">{t('from', { platform })}</p>
        </div>
        {ctx ? <Avatar name={ctx.user.fullName ?? ctx.user.email} src={ctx.user.avatarUrl} seed={ctx.user.id} size={26} /> : null}
        <Button variant="ghost" size="icon-sm" aria-label={t('close')} onClick={() => post({ type: MSG.close })}>
          <X />
        </Button>
      </header>

      {status === 'loading' ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-fg-muted">
          <Spinner className="size-4" /> {t('loading')}
        </div>
      ) : status !== 'ready' || !ctx ? (
        // sin conectar: un paso, con la cuenta de Veltro
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-highlight">
            <LogoMark className="size-7" />
          </span>
          <h1 className="text-base font-semibold">{t('connectTitle')}</h1>
          <p className="text-sm leading-relaxed text-fg-muted">{t('connectText', { platform })}</p>
          <Button variant="primary" size="lg" className="mt-2 w-full" loading={status === 'connecting'} onClick={connect}>
            {status === 'connecting' ? t('connecting') : t('connect')}
          </Button>
          {status === 'blocked' ? (
            <p className="text-xs text-danger" role="alert">
              {t('popupBlocked')}
            </p>
          ) : null}
        </div>
      ) : !ctx.account ? (
        // entró sin cuenta (se registró desde la burbuja): no se le pide armar una; la cuenta es de su empresa
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-highlight">
            <LogoMark className="size-7" />
          </span>
          <h1 className="text-base font-semibold">{t('noAccountTitle')}</h1>
          <p className="text-sm leading-relaxed text-fg-muted">{t('noAccountText')}</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => void load()}>
            {t('retry')}
          </Button>
          <Button variant="ghost" size="sm" onClick={disconnect}>
            <LogOut /> {t('disconnect')}
          </Button>
        </div>
      ) : done ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-fg">
            <Check className="size-6" />
          </span>
          <p className="text-base font-semibold">{done.label}</p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={reset}>
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
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {/* de dónde viene: queda guardado en la tarea o la solicitud */}
            <div className="flex items-center gap-2 rounded-lg bg-highlight px-3 py-2 text-xs text-highlight-ink">
              <Link2 className="size-3.5 shrink-0" />
              <span className="truncate">
                <strong className="font-semibold">{platform}</strong>
                {record ? ` · ${record}` : host.url ? ` · ${host.url.replace(/^https?:\/\//, '')}` : ''}
              </span>
            </div>

            {/* Tarea o Solicitud */}
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-hover p-1" role="tablist">
              {(['task', 'request'] as const).map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={cn(
                    'h-8 rounded-md text-sm font-medium transition-colors',
                    tab === k ? 'bg-panel text-fg shadow-card' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  {t(k)}
                </button>
              ))}
            </div>

            {ctx.accounts.length > 1 ? (
              <Field label={t('account')}>
                <Select
                  value={ctx.account?.id ?? ''}
                  onChange={(id) => {
                    savePrefs(platform, { accountId: id })
                    void load(id)
                  }}
                  options={ctx.accounts.map((a) => ({ value: a.id, label: a.name }))}
                  aria-label={t('account')}
                />
              </Field>
            ) : null}

            {tab === 'task' ? (
              ctx.workspaces.length ? (
                <Field label={t('space')}>
                  <Select
                    value={workspaceId}
                    onChange={setWorkspaceId}
                    options={ctx.workspaces.map((w) => ({
                      value: w.id,
                      label: w.name,
                      hint: w.key,
                      icon: <span className="size-2.5 rounded-full" style={{ background: w.color ?? 'var(--accent)' }} />,
                    }))}
                    aria-label={t('space')}
                  />
                </Field>
              ) : (
                <p className="text-sm text-fg-muted">{t('noSpaces')}</p>
              )
            ) : ctx.departments.length ? (
              <Field label={t('department')}>
                <Select
                  value={departmentId}
                  onChange={setDepartmentId}
                  options={ctx.departments.map((d) => ({ value: d.id, label: d.name }))}
                  aria-label={t('department')}
                />
              </Field>
            ) : (
              <p className="text-sm text-fg-muted">{t('noDepartments')}</p>
            )}

            <Field label={tab === 'task' ? t('taskTitle') : t('requestTitle')} htmlFor="bb-title">
              <Input id="bb-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={tab === 'task' ? 300 : 120} autoFocus />
            </Field>
            <Field label={t('details')} htmlFor="bb-details">
              <Textarea id="bb-details" value={details} onChange={(e) => setDetails(e.target.value)} rows={4} maxLength={4000} />
            </Field>

            {tab === 'request' ? (
              <label className="flex items-center justify-between gap-3 text-sm">
                {t('urgent')}
                <Switch checked={urgent} onCheckedChange={setUrgent} />
              </label>
            ) : null}

            {/* la captura de la página que contiene la burbuja */}
            {shot ? (
              <div className="relative overflow-hidden rounded-lg border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element -- blob local, sin optimizar */}
                <img src={shot.url} alt="" className="max-h-40 w-full object-cover object-top" />
                <Button
                  variant="secondary"
                  size="icon-xs"
                  className="absolute right-2 top-2"
                  aria-label={t('captureRemove')}
                  onClick={() => {
                    URL.revokeObjectURL(shot.url)
                    setShot(null)
                  }}
                >
                  <X />
                </Button>
              </div>
            ) : (
              <Button variant="subtle" className="w-full" loading={capture === 'busy'} onClick={askCapture}>
                <Camera /> {capture === 'busy' ? t('capturing') : t('capture')}
              </Button>
            )}
            {capture === 'failed' || capture === 'unsupported' ? (
              <p className="text-xs text-danger">{capture === 'failed' ? t('captureFailed') : t('captureUnsupported')}</p>
            ) : null}
            {error ? (
              <p className="text-xs text-danger" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <footer className="flex items-center gap-2 border-t border-line px-4 py-3">
            <Button variant="ghost" size="sm" onClick={disconnect}>
              <LogOut /> {t('disconnect')}
            </Button>
            <Button variant="primary" className="ml-auto" loading={saving} disabled={!canSubmit} onClick={submit}>
              {saving ? t('saving') : tab === 'task' ? t('createTask') : t('createRequest')}
            </Button>
          </footer>
        </>
      )}
    </div>
  )
}
