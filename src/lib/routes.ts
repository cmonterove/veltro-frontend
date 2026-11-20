// Reglas de rutas que comparten la barra, el armazón y las cargas (aparte, para no armar ciclos).

/** Tus ajustes (los personales): una página tranquila en la hoja común, aparte de los de la cuenta. */
export const PERSONAL_SETTINGS = ['/settings/profile', '/settings/preferences']
export const isPersonalSettings = (pathname: string) => PERSONAL_SETTINGS.includes(pathname)

/** Rutas que arman sus propias hojas (su lista vive sobre el marco): la carga también debe hacerlo (app/loading). */
export function isBareRoute(pathname: string) {
  const settings = (pathname === '/settings' || pathname.startsWith('/settings/')) && !isPersonalSettings(pathname)
  return pathname === '/chat' || pathname.startsWith('/chat/') || settings
}
