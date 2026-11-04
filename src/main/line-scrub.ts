const MAX_PENDING = 64 * 1024

export function redact(text: string, secrets: readonly string[]): string {
  let out = text
  for (const s of secrets) if (s) out = out.split(s).join('«redacted»')
  return out
}

export function makeLineScrubber(
  secrets: readonly string[],
  emit: (text: string) => void
): { push(chunk: string): void; flush(): void } {
  let pending = ''
  return {
    push(chunk) {
      pending += chunk
      const cut = pending.lastIndexOf('\n') + 1
      if (cut > 0) {
        emit(redact(pending.slice(0, cut), secrets))
        pending = pending.slice(cut)
      }
      if (pending.length > MAX_PENDING) this.flush()
    },
    flush() {
      if (pending) emit(redact(pending, secrets))
      pending = ''
    }
  }
}
