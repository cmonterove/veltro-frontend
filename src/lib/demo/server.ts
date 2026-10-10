import 'server-only'
import { createDemoClient } from './client'
import { demoCreateUser, demoDeleteUser, demoGetFile, demoSaveFile, executeQuery, executeRpc } from './engine'

export function createServerDemoClient() {
  return createDemoClient(
    {
      query: async (q) => executeQuery(q),
      rpc: async (name, args) => executeRpc(name, args),
    },
    {
      createUser: async (email, meta) => demoCreateUser(email, meta),
      deleteUser: async (id) => demoDeleteUser(id),
      upload: async () => ({ error: { message: 'server upload not supported in demo' } }),
      signedUrl: async (path) => demoGetFile(path),
    },
  )
}

export { demoSaveFile }
