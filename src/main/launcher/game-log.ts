import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { StringDecoder } from 'node:string_decoder'

export function gameLogReader(file: string, since: number, onText: (text: string) => void): () => void {
  let position = 0
  let identity: number | undefined
  let decoder = new StringDecoder('utf8')
  try {
    const stat = statSync(file)
    identity = stat.ino
    if (stat.mtimeMs <= since) position = stat.size
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  return () => {
    let fd: number | undefined
    try {
      const stat = statSync(file)
      if (stat.ino !== identity || stat.size < position) {
        position = 0
        identity = stat.ino
        decoder = new StringDecoder('utf8')
      }
      const remaining = Math.min(stat.size - position, 1024 * 1024)
      if (remaining <= 0) return
      fd = openSync(file, 'r')
      const buffer = Buffer.alloc(remaining)
      const count = readSync(fd, buffer, 0, remaining, position)
      position += count
      onText(decoder.write(buffer.subarray(0, count)))
    } catch (error) {
      if (!['ENOENT', 'EBUSY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
    } finally {
      if (fd !== undefined) closeSync(fd)
    }
  }
}
