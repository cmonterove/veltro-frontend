// Constructor de consultas compatible con la parte de supabase-js que usa la app.
// Isomórfico: el transporte decide si se ejecuta en el servidor o vía /api/demo.

export type Filter =
  | { op: 'eq' | 'neq'; col: string; value: unknown }
  | { op: 'in'; col: string; value: unknown[] }
  | { op: 'is'; col: string; value: null | boolean }
  | { op: 'ilike'; col: string; value: string }
  | { op: 'or'; expr: string }

export type Query = {
  table: string
  action: 'select' | 'insert' | 'update' | 'delete' | 'upsert'
  columns: string | null
  values?: Record<string, unknown> | Record<string, unknown>[]
  onConflict?: string
  filters: Filter[]
  order: { col: string; ascending: boolean }[]
  limit?: number
  single?: 'single' | 'maybeSingle'
  count?: boolean
  head?: boolean
}

export type Result = { data: unknown; error: { message: string; code?: string } | null; count?: number | null }

export type Transport = {
  query: (q: Query) => Promise<Result>
  rpc: (name: string, args: Record<string, unknown>) => Promise<Result>
}

export class DemoQueryBuilder implements PromiseLike<Result> {
  private q: Query

  constructor(
    table: string,
    private transport: Transport,
  ) {
    this.q = { table, action: 'select', columns: null, filters: [], order: [] }
  }

  select(columns = '*', opts?: { count?: 'exact'; head?: boolean }) {
    this.q.columns = columns
    if (opts?.count) this.q.count = true
    if (opts?.head) this.q.head = true
    return this
  }
  insert(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.q.action = 'insert'
    this.q.values = values
    return this
  }
  upsert(values: Record<string, unknown> | Record<string, unknown>[], opts?: { onConflict?: string }) {
    this.q.action = 'upsert'
    this.q.values = values
    this.q.onConflict = opts?.onConflict
    return this
  }
  update(values: Record<string, unknown>) {
    this.q.action = 'update'
    this.q.values = values
    return this
  }
  delete() {
    this.q.action = 'delete'
    return this
  }
  eq(col: string, value: unknown) {
    this.q.filters.push({ op: 'eq', col, value })
    return this
  }
  neq(col: string, value: unknown) {
    this.q.filters.push({ op: 'neq', col, value })
    return this
  }
  in(col: string, value: unknown[]) {
    this.q.filters.push({ op: 'in', col, value })
    return this
  }
  is(col: string, value: null | boolean) {
    this.q.filters.push({ op: 'is', col, value })
    return this
  }
  ilike(col: string, value: string) {
    this.q.filters.push({ op: 'ilike', col, value })
    return this
  }
  or(expr: string) {
    this.q.filters.push({ op: 'or', expr })
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.q.order.push({ col, ascending: opts?.ascending ?? true })
    return this
  }
  limit(n: number) {
    this.q.limit = n
    return this
  }
  single() {
    this.q.single = 'single'
    return this
  }
  maybeSingle() {
    this.q.single = 'maybeSingle'
    return this
  }

  then<A = Result, B = never>(onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    return this.transport.query(this.q).then(onfulfilled, onrejected)
  }
}
