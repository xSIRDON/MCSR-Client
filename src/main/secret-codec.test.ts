import { describe, it, expect } from 'vitest'
import { encodeSecret, decodeSecret, type SecretCipher } from './secret-codec'

/** Toy reversible cipher: XOR each byte with 0x5a. Only for tests. */
function fakeCipher(available: boolean): SecretCipher {
  const xor = (buf: Buffer): Buffer => Buffer.from(buf.map((b) => b ^ 0x5a))
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain) => xor(Buffer.from(plain, 'utf8')),
    decryptString: (buf) => xor(buf).toString('utf8')
  }
}

describe('secret codec', () => {
  it('round-trips through the encrypted scheme', () => {
    const c = fakeCipher(true)
    const raw = encodeSecret('tok-123', c)
    expect(raw.startsWith('enc:')).toBe(true)
    expect(decodeSecret(raw, c)).toBe('tok-123')
  })

  it('round-trips through plain base64 when encryption is unavailable', () => {
    const c = fakeCipher(false)
    const raw = encodeSecret('tok-123', c)
    expect(raw.startsWith('b64:')).toBe(true)
    expect(decodeSecret(raw, c)).toBe('tok-123')
  })

  it('returns null (not ciphertext) when an encrypted value is read without encryption', () => {
    const raw = encodeSecret('tok-123', fakeCipher(true))
    expect(decodeSecret(raw, fakeCipher(false))).toBeNull()
  })

  it('decodes a b64-tagged value correctly even when encryption is available', () => {
    const raw = encodeSecret('tok-123', fakeCipher(false))
    expect(decodeSecret(raw, fakeCipher(true))).toBe('tok-123')
  })

  it('falls back to the legacy heuristic for untagged values', () => {
    // Legacy value written by the old code with encryption available:
    const c = fakeCipher(true)
    const legacyEnc = c.encryptString('legacy').toString('base64')
    expect(decodeSecret(legacyEnc, c)).toBe('legacy')
    // Legacy value written without encryption:
    const legacyB64 = Buffer.from('legacy', 'utf8').toString('base64')
    expect(decodeSecret(legacyB64, fakeCipher(false))).toBe('legacy')
  })

  it('returns null on corrupt input instead of throwing', () => {
    const throwing: SecretCipher = {
      isEncryptionAvailable: () => true,
      encryptString: () => Buffer.alloc(0),
      decryptString: () => {
        throw new Error('bad blob')
      }
    }
    expect(decodeSecret('enc:!!!!not-base64!!!!', throwing)).toBeNull()
    expect(decodeSecret('enc:AAAA', throwing)).toBeNull()
  })
})
