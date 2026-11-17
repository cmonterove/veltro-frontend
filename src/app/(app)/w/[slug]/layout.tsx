import { WorkspaceGate } from '@/components/workspace/workspace-gate'

/** El espacio sale del contexto del navegador: entrar o cambiar de pestaña no espera al servidor. */
export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <WorkspaceGate slug={slug}>{children}</WorkspaceGate>
}
