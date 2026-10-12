'use client'

import { createContext, useContext, useMemo } from 'react'
import type { AppContextValue, WorkspaceWithRole } from '@/lib/types'

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ value, children }: { value: AppContextValue; children: React.ReactNode }) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}

export function useIsAccountAdmin() {
  const { accountRole } = useApp()
  return accountRole === 'owner' || accountRole === 'admin'
}

export function useWorkspaceMap() {
  const { workspaces, observedWorkspaces } = useApp()
  // incluye los espacios observados por jerarquía: sus tareas se muestran (en solo lectura) con nombre y color
  return useMemo(() => new Map([...observedWorkspaces, ...workspaces].map((w) => [w.id, w])), [workspaces, observedWorkspaces])
}

export function useWorkspaceBySlug(slug: string): WorkspaceWithRole | undefined {
  const { workspaces } = useApp()
  return workspaces.find((w) => w.slug === slug)
}

export function useMemberMap() {
  const { members } = useApp()
  return useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
}

export function canEdit(ws: Pick<WorkspaceWithRole, 'my_role'> | undefined) {
  return ws?.my_role === 'admin' || ws?.my_role === 'editor'
}
