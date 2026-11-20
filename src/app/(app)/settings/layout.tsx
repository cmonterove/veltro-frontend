import { SettingsFrame } from '@/components/settings/settings-nav'

/**
 * Ajustes: los de la cuenta como el Pasillo (el menú sobre el marco y la página elegida unida a la hoja
 * como la pestaña de una carpeta) y los tuyos (Perfil y Preferencias) en una página tranquila aparte.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <SettingsFrame>{children}</SettingsFrame>
}
