import { redirect } from 'next/navigation'

// «Ajustes» son los de la cuenta (la empresa); los tuyos (Perfil, Preferencias) se abren desde tu nombre
export default function SettingsIndex() {
  redirect('/settings/account')
}
