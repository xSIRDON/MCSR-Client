import type { ChildProcessWithoutNullStreams } from 'node:child_process'

export function waitForPrismStart(prism: ChildProcessWithoutNullStreams, timeoutMs = 300_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let started = false
    let suffix = ''
    const timer = setTimeout(() => {
      prism.kill()
      reject(new Error('Prism did not start Minecraft before the startup timeout. Check the connection and sign in again before retrying.'))
    }, timeoutMs)
    const onText = (buffer: Buffer): void => {
      const text = suffix + buffer.toString()
      suffix = text.slice(-64)
      if (!started && text.includes('org.prismlauncher.EntryPoint')) {
        started = true
        clearTimeout(timer)
        resolve()
      }
    }
    prism.stdout.on('data', onText)
    prism.stderr.on('data', onText)
    prism.once('error', () => { clearTimeout(timer); reject(new Error('Could not start Prism Launcher.')) })
    prism.once('close', (code) => {
      clearTimeout(timer)
      if (!started) reject(new Error(`Prism stopped before Minecraft started (code ${code}). Check Java and sign in again before retrying.`))
    })
  })
}
