import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

// AES-256-GCM. Clave: TOKEN_ENCRYPTION_KEY (recomendado) o derivada del service role key.
function key() {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('TOKEN_ENCRYPTION_KEY is not set')
  return createHash('sha256').update(`veltro:tokens:${secret}`).digest()
}

export function encrypt(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${data.toString('base64url')}`
}

export function decrypt(payload: string) {
  const [version, iv, tag, data] = payload.split('.')
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('invalid_ciphertext')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}
