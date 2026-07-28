import { describe, it, expect } from 'vitest'
import { fetchVerified, sha512Of, type FetchBuffer } from './verified-download'

const body = Buffer.from('pretend-jar-bytes')
const good = sha512Of(body)

const serve =
  (buf: Buffer, finalUrl = 'https://example.test/a.jar'): FetchBuffer =>
  async () => ({ buf, finalUrl })

describe('fetchVerified', () => {
  it('returns the bytes when the hash matches', async () => {
    const out = await fetchVerified('https://example.test/a.jar', good, 'test', serve(body))
    expect(out.equals(body)).toBe(true)
  })

  it('throws when the bytes were swapped', async () => {
    await expect(
      fetchVerified('https://example.test/a.jar', good, 'test', serve(Buffer.from('evil')))
    ).rejects.toThrow(/sha512 mismatch/)
  })

  it('throws when the download ended up on plain http', async () => {
    await expect(
      fetchVerified('https://example.test/a.jar', good, 'test', serve(body, 'http://example.test/a.jar'))
    ).rejects.toThrow(/insecure redirect/)
  })

  it('propagates a transport failure rather than returning partial bytes', async () => {
    const boom: FetchBuffer = async () => {
      throw new Error('download failed (404)')
    }
    await expect(fetchVerified('https://x/a.jar', good, 'test', boom)).rejects.toThrow(/404/)
  })
})
