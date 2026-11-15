import type { TaskStatus } from './database.types'

/**
 * Plantillas de espacio: con qué estados, campos y primeras tareas arranca. Los nombres salen de
 * los mensajes (settings.workspaces.templates.<plantilla>.…), así quedan en el idioma de quien lo crea.
 */
export type WorkspaceTemplate = {
  key: string
  statuses: { key: string; category: TaskStatus }[]
  fields: { key: string; type: 'text' | 'number' | 'date' | 'select' | 'url'; options?: string[] }[]
  tasks: { key: string; status: TaskStatus }[]
}

export const WORKSPACE_TEMPLATES: WorkspaceTemplate[] = [
  { key: 'blank', statuses: [], fields: [], tasks: [] },
  {
    key: 'client',
    statuses: [
      { key: 's1', category: 'todo' },
      { key: 's2', category: 'in_progress' },
      { key: 's3', category: 'in_progress' },
      { key: 's4', category: 'blocked' },
      { key: 's5', category: 'done' },
    ],
    fields: [
      { key: 'f1', type: 'select', options: ['o1', 'o2', 'o3', 'o4'] },
      { key: 'f2', type: 'url' },
    ],
    tasks: [
      { key: 't1', status: 'todo' },
      { key: 't2', status: 'todo' },
    ],
  },
  {
    key: 'project',
    statuses: [
      { key: 's1', category: 'backlog' },
      { key: 's2', category: 'todo' },
      { key: 's3', category: 'in_progress' },
      { key: 's4', category: 'in_progress' },
      { key: 's5', category: 'blocked' },
      { key: 's6', category: 'done' },
    ],
    fields: [{ key: 'f1', type: 'select', options: ['o1', 'o2', 'o3'] }],
    tasks: [
      { key: 't1', status: 'todo' },
      { key: 't2', status: 'todo' },
    ],
  },
  {
    key: 'sales',
    statuses: [
      { key: 's1', category: 'backlog' },
      { key: 's2', category: 'todo' },
      { key: 's3', category: 'in_progress' },
      { key: 's4', category: 'in_progress' },
      { key: 's5', category: 'done' },
      { key: 's6', category: 'done' },
    ],
    fields: [
      { key: 'f1', type: 'text' },
      { key: 'f2', type: 'number' },
      { key: 'f3', type: 'select', options: ['o1', 'o2', 'o3'] },
    ],
    tasks: [{ key: 't1', status: 'todo' }],
  },
  {
    key: 'helpdesk',
    statuses: [
      { key: 's1', category: 'todo' },
      { key: 's2', category: 'in_progress' },
      { key: 's3', category: 'blocked' },
      { key: 's4', category: 'done' },
    ],
    fields: [
      { key: 'f1', type: 'text' },
      { key: 'f2', type: 'select', options: ['o1', 'o2', 'o3'] },
    ],
    tasks: [],
  },
  {
    key: 'content',
    statuses: [
      { key: 's1', category: 'backlog' },
      { key: 's2', category: 'in_progress' },
      { key: 's3', category: 'in_progress' },
      { key: 's4', category: 'blocked' },
      { key: 's5', category: 'done' },
    ],
    fields: [
      { key: 'f1', type: 'select', options: ['o1', 'o2', 'o3', 'o4'] },
      { key: 'f2', type: 'date' },
    ],
    tasks: [{ key: 't1', status: 'backlog' }],
  },
]
