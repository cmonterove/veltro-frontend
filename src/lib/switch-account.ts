/**
 * Abrir algo que es de otra de mis cuentas (un espacio, un chat, una tarea): se cambia la cuenta activa
 * (/auth/switch pone la cookie) y se vuelve a la misma dirección con una carga completa. Una navegación
 * interna no sirve: el layout de la app no se vuelve a pintar y seguiría con la cuenta de antes.
 */
export function goToAccount(accountId: string, next = typeof window === 'undefined' ? '/home' : window.location.pathname + window.location.search) {
  const url = `/auth/switch?account=${encodeURIComponent(accountId)}&next=${encodeURIComponent(next)}`
  window.location.replace(url)
}
