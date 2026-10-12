import { redirect } from 'next/navigation'

/** Documentos ahora vive en la Bóveda, en la pestaña Escritos. */
export default function DocsPage() {
  redirect('/vault?tab=written')
}
