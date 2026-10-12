import { NextResponse } from 'next/server'
import { DEMO } from '@/lib/demo/config'
import { demoGetFile, demoSaveFile, executeQuery, executeRpc, resetStore } from '@/lib/demo/engine'
import type { Query } from '@/lib/demo/query'

// Transporte del cliente demo del navegador hacia la base en memoria del servidor.
export async function POST(request: Request) {
  if (!DEMO) return NextResponse.json({ error: 'demo disabled' }, { status: 404 })
  const body = (await request.json()) as
    | { kind: 'query'; q: Query }
    | { kind: 'rpc'; name: string; args: Record<string, unknown> }
    | { kind: 'upload'; path: string; dataUrl: string }
    | { kind: 'file'; path: string }
    | { kind: 'reset' }
    | { kind: 'batch'; calls: ({ kind: 'query'; q: Query } | { kind: 'rpc'; name: string; args: Record<string, unknown> })[] }

  switch (body.kind) {
    case 'batch':
      // en orden: una escritura seguida de una lectura del mismo lote ve el cambio
      return NextResponse.json(body.calls.map((c) => (c.kind === 'query' ? executeQuery(c.q) : executeRpc(c.name, c.args))))
    case 'query':
      return NextResponse.json(executeQuery(body.q))
    case 'rpc':
      return NextResponse.json(executeRpc(body.name, body.args))
    case 'upload':
      demoSaveFile(body.path, body.dataUrl)
      return NextResponse.json({ data: { path: body.path }, error: null })
    case 'file':
      return NextResponse.json({ data: demoGetFile(body.path), error: null })
    case 'reset':
      resetStore()
      return NextResponse.json({ data: true, error: null })
  }
}
