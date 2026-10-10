import { requireWorkspace } from '@/lib/workspace'
import { WorkspaceHeader } from '@/components/workspace/workspace-header'

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await requireWorkspace(slug)
  return (
    <div className="flex min-h-full flex-col">
      <WorkspaceHeader slug={slug} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
