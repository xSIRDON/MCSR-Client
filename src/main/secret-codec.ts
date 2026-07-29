export interface SecretCipher {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(buf: Buffer): string
}

export function encodeSecret(value: string, cipher: SecretCipher): string {
  return cipher.isEncryptionAvailable()
    ? 'enc:' + cipher.encryptString(value).toString('base64')
    : 'b64:' + Buffer.from(value, 'utf8').toString('base64')
}

export function decodeSecret(raw: string, cipher: SecretCipher): string | null {
  try {
    if (raw.startsWith('enc:')) {
      if (!cipher.isEncryptionAvailable()) return null
      return cipher.decryptString(Buffer.from(raw.slice(4), 'base64'))
    }
    if (raw.startsWith('b64:')) {
      return Buffer.from(raw.slice(4), 'base64').toString('utf8')
    }
    const buf = Buffer.from(raw, 'base64')
    return cipher.isEncryptionAvailable() ? cipher.decryptString(buf) : buf.toString('utf8')
  } catch {
    return null
  }
}
