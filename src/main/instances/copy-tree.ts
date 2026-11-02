import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export interface CopyPlan {
  files: { src: string; dst: string; size: number }[]
  dirs: string[]
  bytes: number
}

export interface CopyProgress {
  doneBytes: number
  totalBytes: number
  doneFiles: number
  totalFiles: number
}

const SKIP = new Set(['session.lock'])

export async function planCopy(
  src: string,
  dst: string,
  plan: CopyPlan = emptyPlan(),
  onScan?: (files: number) => void
): Promise<CopyPlan> {
  plan.dirs.push(dst)
  for (const e of await readdir(src, { withFileTypes: true })) {
    const s = join(src, e.name)
    const d = join(dst, e.name)
    if (e.isDirectory()) await planCopy(s, d, plan, onScan)
    else if (e.isFile() && !SKIP.has(e.name.toLowerCase())) {
      const size = (await stat(s)).size
      plan.files.push({ src: s, dst: d, size })
      plan.bytes += size
      onScan?.(plan.files.length)
    }
  }
  return plan
}

export function emptyPlan(): CopyPlan {
  return { files: [], dirs: [], bytes: 0 }
}

export async function runCopy(
  plan: CopyPlan,
  onProgress?: (p: CopyProgress) => void,
  concurrency = 8
): Promise<void> {
  for (const d of plan.dirs) await mkdir(d, { recursive: true })
  const p: CopyProgress = { doneBytes: 0, totalBytes: plan.bytes, doneFiles: 0, totalFiles: plan.files.length }
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < plan.files.length) {
      const f = plan.files[next++]
      await copyFile(f.src, f.dst)
      p.doneBytes += f.size
      p.doneFiles++
      onProgress?.({ ...p })
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, plan.files.length) }, worker))
}

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  return `${Math.max(1, Math.round(n / 1024 ** 2))} MB`
}
