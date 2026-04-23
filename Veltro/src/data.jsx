// Sample data — Tech team (features, bugs, sprints)

const STATUS_OPTIONS = [
  { id: 'todo',      label: 'Por hacer',    bg: '#e2e8f0', fg: '#334155', dark_bg: '#2c3a33', dark_fg: '#b8c7bf' },
  { id: 'progress',  label: 'En progreso',  bg: '#dbeafe', fg: '#1e40af', dark_bg: '#1e3a5f', dark_fg: '#93c5fd' },
  { id: 'review',    label: 'En revisión',  bg: '#fef3c7', fg: '#92400e', dark_bg: '#4a3a14', dark_fg: '#fcd34d' },
  { id: 'done',      label: 'Hecho',        bg: '#dcfce7', fg: '#15803d', dark_bg: '#1a3d2a', dark_fg: '#86efac' },
  { id: 'stuck',     label: 'Atascado',     bg: '#fee2e2', fg: '#b91c1c', dark_bg: '#4a1e1e', dark_fg: '#fca5a5' },
];

const PRIORITY_OPTIONS = [
  { id: 'low',    label: 'Baja',    bg: '#f1f5f9', fg: '#475569', dark_bg: '#252e2a', dark_fg: '#94a3b8' },
  { id: 'med',    label: 'Media',   bg: '#fef3c7', fg: '#92400e', dark_bg: '#3d2f10', dark_fg: '#fcd34d' },
  { id: 'high',   label: 'Alta',    bg: '#fed7aa', fg: '#9a3412', dark_bg: '#3d2514', dark_fg: '#fdba74' },
  { id: 'urgent', label: 'Urgente', bg: '#fecaca', fg: '#991b1b', dark_bg: '#3d1818', dark_fg: '#fca5a5' },
];

const COLOR_SWATCHES = [
  '#2d8a6a', '#059669', '#0891b2', '#2563eb', '#6366f1', '#8b5cf6',
  '#d946ef', '#e11d48', '#ea580c', '#d97706', '#65a30d', '#475569',
];

const PEOPLE = [
  { id: 'u1', name: 'César Morales',  initials: 'CM', color: '#2d8a6a' },
  { id: 'u2', name: 'Ana Torres',     initials: 'AT', color: '#8b5cf6' },
  { id: 'u3', name: 'Juan Ramírez',   initials: 'JR', color: '#e11d48' },
  { id: 'u4', name: 'Laura Peña',     initials: 'LP', color: '#d97706' },
  { id: 'u5', name: 'Martín Vega',    initials: 'MV', color: '#0891b2' },
  { id: 'u6', name: 'Sofía Castro',   initials: 'SC', color: '#65a30d' },
  { id: 'u7', name: 'Diego Lima',     initials: 'DL', color: '#6366f1' },
  { id: 'u8', name: 'Paula Mendoza',  initials: 'PM', color: '#d946ef' },
];

const COMPANIES = [
  {
    id: 'tech', name: 'Tech', color: '#2d8a6a',
    boards: [
      { id: 'sprint-14', name: 'Sprint 14 — Q2', color: '#2563eb', items: 38, members: 6 },
      { id: 'bugs',      name: 'Bug Triage',     color: '#e11d48', items: 52, members: 4 },
      { id: 'roadmap',   name: 'Roadmap 2026',   color: '#8b5cf6', items: 24, members: 8 },
      { id: 'infra',     name: 'Infra & DevOps', color: '#0891b2', items: 18, members: 3 },
    ],
  },
  {
    id: 'design', name: 'Design', color: '#d946ef',
    boards: [
      { id: 'ds',        name: 'Design System',  color: '#d946ef', items: 41, members: 3 },
      { id: 'brand',     name: 'Brand 2026',     color: '#ea580c', items: 12, members: 2 },
    ],
  },
  {
    id: 'ops', name: 'Operaciones', color: '#d97706',
    boards: [
      { id: 'vendors',   name: 'Proveedores',    color: '#65a30d', items: 19, members: 4 },
      { id: 'hiring',    name: 'Hiring Q2',      color: '#6366f1', items: 14, members: 5 },
    ],
  },
];

// Active board: Sprint 14 (items w/ groups)
const BOARD_GROUPS = [
  {
    id: 'g-dev', name: 'En desarrollo', color: '#2563eb', collapsed: false,
    items: [
      { id: 'i1', name: 'Implementar SSO con Google Workspace',            status: 'progress', assignee: 'u1', due: '2026-04-25', priority: 'high',   estimate: 8,  done: false },
      { id: 'i2', name: 'Migrar API de v1 a v2 — endpoints de billing',    status: 'progress', assignee: 'u5', due: '2026-04-28', priority: 'urgent', estimate: 13, done: false },
      { id: 'i3', name: 'Rate limiting con Redis + leaky bucket',          status: 'review',   assignee: 'u7', due: '2026-04-22', priority: 'high',   estimate: 5,  done: false },
      { id: 'i4', name: 'Webhooks retries con exponential backoff',        status: 'progress', assignee: 'u3', due: '2026-04-30', priority: 'med',    estimate: 3,  done: false },
    ],
  },
  {
    id: 'g-backlog', name: 'Backlog del sprint', color: '#64748b', collapsed: false,
    items: [
      { id: 'i5', name: 'Redesign del onboarding — step 3 confunde',       status: 'todo',     assignee: 'u2', due: '2026-05-02', priority: 'med',    estimate: 8, done: false },
      { id: 'i6', name: 'Exportar reportes a CSV y XLSX',                   status: 'todo',     assignee: 'u4', due: '2026-05-05', priority: 'low',    estimate: 5, done: false },
      { id: 'i7', name: 'Notificaciones in-app con badges no leídos',       status: 'todo',     assignee: 'u6', due: '2026-05-08', priority: 'med',    estimate: 5, done: false },
      { id: 'i8', name: 'Search multi-tenant con Meilisearch',              status: 'todo',     assignee: 'u1', due: '2026-05-12', priority: 'high',   estimate: 13, done: false },
    ],
  },
  {
    id: 'g-bugs', name: 'Bugs bloqueantes', color: '#e11d48', collapsed: false,
    items: [
      { id: 'i9',  name: 'Timezone offset en due dates — reportado por CS', status: 'stuck',   assignee: 'u3', due: '2026-04-20', priority: 'urgent', estimate: 2,  done: false },
      { id: 'i10', name: 'Drag & drop pierde orden al colapsar grupo',      status: 'progress', assignee: 'u5', due: '2026-04-23', priority: 'high',   estimate: 3,  done: false },
    ],
  },
  {
    id: 'g-done', name: 'Completado', color: '#16a34a', collapsed: true,
    items: [
      { id: 'i11', name: 'Deploy preview environments en Vercel',            status: 'done',    assignee: 'u7', due: '2026-04-10', priority: 'med',    estimate: 5, done: true },
      { id: 'i12', name: 'Setup Sentry + structured logging',                status: 'done',    assignee: 'u1', due: '2026-04-08', priority: 'high',   estimate: 3, done: true },
      { id: 'i13', name: 'Passkeys / WebAuthn flow',                         status: 'done',    assignee: 'u5', due: '2026-04-12', priority: 'high',   estimate: 8, done: true },
    ],
  },
];

const ACTIVITY = [
  { id: 'a1', user: 'u5', verb: 'movió', what: 'Migrar API de v1 a v2', from: 'Backlog', to: 'En desarrollo', when: 'hace 12m' },
  { id: 'a2', user: 'u3', verb: 'marcó como', what: 'Passkeys / WebAuthn flow', to: 'Hecho', when: 'hace 1h' },
  { id: 'a3', user: 'u2', verb: 'comentó en', what: 'Redesign del onboarding', when: 'hace 2h' },
  { id: 'a4', user: 'u1', verb: 'asignó', what: 'Search multi-tenant', to: 'César Morales', when: 'hace 3h' },
  { id: 'a5', user: 'u7', verb: 'creó', what: 'Rate limiting con Redis', when: 'ayer' },
];

const COMMENTS_I2 = [
  { id: 'c1', user: 'u1', when: 'hace 2h', text: 'Arranqué con el endpoint de subscriptions. El schema cambia bastante, voy a dejar un mapping en el PR.' },
  { id: 'c2', user: 'u3', when: 'hace 1h', text: '¿Estás rompiendo backcompat o vas con el header X-API-Version?' },
  { id: 'c3', user: 'u1', when: 'hace 45m', text: 'Header. v1 sigue vivo al menos 6 meses.' },
];

Object.assign(window, {
  STATUS_OPTIONS, PRIORITY_OPTIONS, COLOR_SWATCHES,
  PEOPLE, COMPANIES, BOARD_GROUPS, ACTIVITY, COMMENTS_I2,
});
