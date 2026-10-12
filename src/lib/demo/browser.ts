'use client'

import { createDemoClient } from './client'
import type { Query, Result } from './query'

async function post(body: unknown): Promise<Result> {
  const res = await fetch('/api/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return (await res.json()) as Result
}

// Las consultas que salen en el mismo instante (todas las de una pantalla al montarse) viajan juntas en una sola
// petición. En desarrollo cada llamada a una ruta API cuesta ~250 ms fijos, así que 6 consultas pasan a costar 1.
type Call = { kind: 'query'; q: Query } | { kind: 'rpc'; name: string; args: Record<string, unknown> }
let pending: { call: Call; resolve: (r: Result) => void; reject: (e: unknown) => void }[] = []
let scheduled = false

function batched(call: Call): Promise<Result> {
  return new Promise((resolve, reject) => {
    pending.push({ call, resolve, reject })
    if (scheduled) return
    scheduled = true
    setTimeout(flush, 0)
  })
}

async function flush() {
  const queue = pending
  pending = []
  scheduled = false
  if (queue.length === 1) {
    post(queue[0].call).then(queue[0].resolve, queue[0].reject)
    return
  }
  try {
    const res = await fetch('/api/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'batch', calls: queue.map((p) => p.call) }),
    })
    const results = (await res.json()) as Result[]
    queue.forEach((p, i) => p.resolve(results[i]))
  } catch (e) {
    queue.forEach((p) => p.reject(e))
  }
}

function toDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export function createBrowserDemoClient() {
  return createDemoClient(
    {
      query: (q: Query) => batched({ kind: 'query', q }),
      rpc: (name, args) => batched({ kind: 'rpc', name, args }),
    },
    {
      upload: async (path, file) => {
        const res = await post({ kind: 'upload', path, dataUrl: await toDataUrl(file) })
        return { error: res.error }
      },
      signedUrl: async (path) => ((await post({ kind: 'file', path })).data as string | null) ?? null,
    },
  )
}
