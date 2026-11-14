import 'server-only'

/** Ventana en la que la API deja cambiar la contraseña sin la actual tras el enlace de recuperación. */
const RECOVERY_WINDOW_S = 15 * 60

/** ¿La sesión se abrió con el enlace de recuperación hace poco? Solo para la pantalla: quien decide es la API. */
export function recoveryActive(token: string | undefined) {
  const part = token?.split('.')[1]
  if (!part) return false
  try {
    const claims = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { amr?: { method?: string; timestamp?: number }[] }
    const now = Date.now() / 1000
    return (claims.amr ?? []).some((m) => (m.method === 'recovery' || m.method === 'otp') && typeof m.timestamp === 'number' && now - m.timestamp < RECOVERY_WINDOW_S)
  } catch {
    return false
  }
}
