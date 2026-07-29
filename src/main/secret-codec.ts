// Secret encoding for store.secret. The scheme is recorded in the value ("enc:"/"b64:")
// because choosing it per call is the bug this replaces: a value written while OS
// encryption was available but read while it isn't would decode down the wrong branch and
// hand ciphertext to the caller as if it were the secret. Tagged values fail closed;
// untagged values predate the tag and fall back to the old heuristic once, then get
// rewritten tagged on the next set().

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
    // Legacy untagged value from before the scheme tag existed.
    const buf = Buffer.from(raw, 'base64')
    return cipher.isEncryptionAvailable() ? cipher.decryptString(buf) : buf.toString('utf8')
  } catch {
    return null
  }
}
