// Shared by the install worker; kept separate so it can be tested without a utility process.
/** GMLL throws strings decorated for a terminal (colour codes, a dashed ERROR banner); keep the words. */
export function cleanError(err: unknown): string {
  const raw = String(err instanceof Error ? err.message : err)
  const text = raw
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^\[[-!A-Z\s]*\]$/.test(l))
    .join(' ')
  return text || 'The installer failed.'
}
