'use client'

import { createDemoClient } from './client'
import type { Query, Result } from './query'

async function post(body: unknown): Promise<Result> {
  const res = await fetch('/api/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return (await res.json()) as Result
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
      query: (q: Query) => post({ kind: 'query', q }),
      rpc: (name, args) => post({ kind: 'rpc', name, args }),
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
