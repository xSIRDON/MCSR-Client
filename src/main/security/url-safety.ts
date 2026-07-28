// URL guards for the two places the main process acts on a URL it did not construct:
// handing a link to the OS shell, and allowing a top-level navigation.
//
// Both are security boundaries. shell.openExternal passes the string to ShellExecute on
// Windows, which honours file:, UNC paths, and every registered protocol handler
// (ms-msdt:, search-ms:, …) — so a hostile scheme is a code-execution vector, and some of
// the URLs the app opens originate from remote APIs. Navigation matters because the
// preload (and the whole window.mcsr bridge) is re-attached to whatever page loads.

/** Schemes we are willing to hand to the operating system. */
const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * True when `url` is safe to pass to shell.openExternal — an absolute http(s) URL.
 * Everything else (file:, smb:, javascript:, custom handlers, unparseable input) is refused.
 */
export function isSafeExternalUrl(url: unknown): boolean {
  if (typeof url !== 'string' || url === '') return false
  try {
    return SAFE_EXTERNAL_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

/**
 * True when `target` stays on the same origin as `current`, so a navigation to it cannot
 * hand the preload to foreign content. file:// URLs have a null/opaque origin, so they are
 * compared by directory prefix instead: the packaged renderer is loaded from disk.
 */
export function isSameOrigin(target: unknown, current: unknown): boolean {
  if (typeof target !== 'string' || typeof current !== 'string') return false
  if (!target || !current) return false
  let t: URL
  let c: URL
  try {
    t = new URL(target)
    c = new URL(current)
  } catch {
    return false
  }
  if (t.protocol !== c.protocol) return false
  if (t.protocol === 'file:') {
    // Compare the containing directory, so index.html -> index.html#/route stays allowed
    // but a jump to another path on disk does not.
    const dir = (u: URL): string => u.pathname.slice(0, u.pathname.lastIndexOf('/') + 1)
    return dir(t) === dir(c)
  }
  return t.origin === c.origin
}
