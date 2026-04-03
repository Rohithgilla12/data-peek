import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function deriveKey(userId: string): Buffer {
  const serverSecret = process.env.SERVER_SECRET
  if (!serverSecret) {
    throw new Error('SERVER_SECRET environment variable is not set')
  }
  return createHmac('sha256', serverSecret).update(userId).digest()
}

export function encryptCredentials(
  credentials: Record<string, unknown>,
  userId: string
): { encrypted: Buffer; iv: Buffer; authTag: Buffer } {
  const key = deriveKey(userId)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

  const plaintext = JSON.stringify(credentials)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return { encrypted, iv, authTag }
}

export function decryptCredentials(
  encrypted: Buffer,
  iv: Buffer,
  authTag: Buffer,
  userId: string
): Record<string, unknown> {
  const key = deriveKey(userId)
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return JSON.parse(decrypted.toString('utf8'))
}
