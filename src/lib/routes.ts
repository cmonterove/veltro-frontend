// Reglas de rutas que comparten la barra, el armazón y las cargas (aparte, para no armar ciclos).

/** Tus ajustes (los personales): una página tranquila en la hoja común, aparte de los de la cuenta. */
export const PERSONAL_SETTINGS = ['/settings/profile', '/settings/preferences']
export const isPersonalSettings = (pathname: string) => PERSONAL_SETTINGS.includes(pathname)

/** Los ajustes de la cuenta: ahí la barra principal se transforma en el menú de Ajustes. */
export const isAccountSettings = (pathname: string) => (pathname === '/settings' || pathname.startsWith('/settings/')) && !isPersonalSettings(pathname)

/**
 * Rutas que arman sus propias hojas (su lista vive sobre el marco): la carga también debe hacerlo
 * (app/loading). Pasillo y el Correo: la lista sobre el marco y la conversación abierta en la hoja.
 */
export function isBareRoute(pathname: string) {
  return pathname === '/chat' || pathname.startsWith('/chat/') || pathname === '/mail' || pathname.startsWith('/mail/')
}
