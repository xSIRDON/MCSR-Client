export function ipcMessage(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  const msg = raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '').trim()
  return msg || fallback
}
