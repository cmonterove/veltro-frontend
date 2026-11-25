// El buzón de correo (Gmail) tal como lo devuelve la API: /v1/mail/… (veltro-backend, modules/buzon).
// Nada del correo se guarda en Veltro: la API lo lee de Google en el momento.

export type MailPerson = { name: string | null; email: string; me: boolean }

export type ApiMailbox = {
  id: string
  provider: 'google' | 'microsoft'
  email: string
  isDefault: boolean
  /** dio permiso para leer (si no, solo sirve para «Avisar por correo») */
  canRead: boolean
  /** dio permiso para sugerir de sus contactos de Google */
  canContacts: boolean
  /** dio permiso para ver sus archivos de Drive (insertarlos en un correo) */
  canDrive: boolean
  /** dio permiso para bajarlos (copiarlos a la Bóveda); se pide aparte */
  canDriveFiles: boolean
  /** hilos sin leer en Recibidos (null si no se pudo leer) */
  unread: number | null
  /** sin leer en la pestaña Principal (con pestañas como en Gmail, es lo que se cuenta) */
  unreadPrimary: number | null
  /** si Gmail no respondió: mail_auth_revoked, gmail_api_disabled… */
  problem: string | null
}
export type ApiMailboxes = {
  googleConfigured: boolean
  /** el ID de cliente de OAuth de Veltro (público): quien administra un Workspace lo marca como de confianza */
  googleClientId: string | null
  items: ApiMailbox[]
}

export type ApiMailFolder = { id: string; unread: number; total: number }

/** Las pestañas de Recibidos en Gmail, en su orden: Principal, Promociones, Social, Notificaciones y Foros. */
export const MAIL_CATEGORIES = ['primary', 'promotions', 'social', 'updates', 'forums'] as const
export type MailCategory = (typeof MAIL_CATEGORIES)[number]
export const isMailCategory = (v: string | null | undefined): v is MailCategory => (MAIL_CATEGORIES as readonly string[]).includes(v ?? '')
export type ApiMailLabel = { id: string; name: string; unread: number; color: { background: string; text: string } | null }
export type ApiMailLabels = { system: ApiMailFolder[]; categories: (Omit<ApiMailFolder, 'id'> & { id: MailCategory })[]; labels: ApiMailLabel[] }

export type ApiMailThreadSummary = {
  id: string
  subject: string
  snippet: string
  participants: MailPerson[]
  to: MailPerson[]
  date: string
  count: number
  unread: boolean
  starred: boolean
  hasAttachments: boolean
  labelIds: string[]
  /** el último mensaje es mío (si no, quizá espera respuesta) */
  lastFromMe: boolean
}
export type ApiMailThreadPage = { items: ApiMailThreadSummary[]; nextPageToken: string | null; total: number }

export type ApiMailAttachment = {
  id: string | null
  filename: string
  mimeType: string
  size: number
  contentId: string | null
  inline: boolean
  /** los muy chicos vienen adentro (base64) */
  data?: string
}

export type ApiMailMessage = {
  id: string
  threadId: string
  labelIds: string[]
  unread: boolean
  from: MailPerson
  to: MailPerson[]
  cc: MailPerson[]
  replyTo: { name: string | null; email: string }[]
  subject: string
  date: string
  snippet: string
  messageId: string
  references: string
  html: string | null
  text: string | null
  attachments: ApiMailAttachment[]
}
export type ApiMailThread = { id: string; subject: string; labelIds: string[]; messages: ApiMailMessage[] }

export type MailAddress = { name?: string | null; email: string }

/** Un contacto de Google (Mis contactos u Otros contactos) para sugerir a quién escribir. */
export type ApiGoogleContact = { name: string | null; email: string; photo: string | null }

/** Un archivo (o carpeta) de Drive: su enlace; `shared`, si alguien más puede abrirlo; `size`, en bytes (los de Google no tienen). */
export type ApiDriveFile = {
  id: string
  name: string
  mimeType: string
  link: string
  modified: string | null
  owner: string | null
  shared: boolean
  size: number | null
  folder: boolean
}
export type ApiDrivePage = { items: ApiDriveFile[]; nextPageToken: string | null }

/**
 * Los archivos de Google se copian convertidos (como hace la API): Documentos y Presentaciones a PDF,
 * Hojas a Excel y Dibujos a PNG. El resto de los de Google (Formularios, Sites…) no se puede copiar.
 */
export const DRIVE_EXPORT: Record<string, { mime: string; ext: string }> = {
  'application/vnd.google-apps.document': { mime: 'application/pdf', ext: 'pdf' },
  'application/vnd.google-apps.presentation': { mime: 'application/pdf', ext: 'pdf' },
  'application/vnd.google-apps.spreadsheet': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
  'application/vnd.google-apps.drawing': { mime: 'image/png', ext: 'png' },
}
export const isGoogleNative = (mime: string) => mime.startsWith('application/vnd.google-apps.')
export type ApiMailSend = {
  to: MailAddress[]
  cc?: MailAddress[]
  bcc?: MailAddress[]
  subject: string
  text: string
  threadId?: string
  inReplyTo?: string
  references?: string
}

/** Dónde bajar (o mostrar, si es una imagen de dentro del correo) un adjunto: por el puente de la web, con la sesión. */
export function attachmentUrl(box: string, messageId: string, a: Pick<ApiMailAttachment, 'id' | 'filename' | 'mimeType'>, inline = false) {
  if (!a.id) return null
  const q = new URLSearchParams({ name: a.filename, type: a.mimeType, ...(inline ? { inline: '1' } : {}) })
  return `/api/veltro/v1/mail/mailboxes/${box}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(a.id)}?${q}`
}

/**
 * Conectar Google desde la web: todo de una vez (leer y enviar el correo, contactos, Drive y
 * calendario; en Google se destilda lo que no se quiera). Vuelve a `returnTo` con ?mail=connected o
 * el motivo.
 */
export const connectMailHref = (returnTo = '/mail') => `/api/integrations/google/mail-connect?returnTo=${encodeURIComponent(returnTo)}`
