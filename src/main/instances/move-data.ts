import { existsSync, lstatSync, readdirSync, unlinkSync } from 'node:fs'
import { mkdir, rename, rm, rmdir, statfs } from 'node:fs/promises'
import { dirname, join, parse, resolve, sep } from 'node:path'
import { planCopy, runCopy, type CopyProgress } from './copy-tree'

export interface MoveProgress extends CopyProgress {
  stage: 'scanning' | 'copying' | 'cleaning'
}

const inside = (child: string, parent: string): boolean => {
  const c = resolve(child).toLowerCase() + sep
  const p = resolve(parent).toLowerCase() + sep
  return c.startsWith(p)
}

export function moveTarget(picked: string, from: string): string {
  const base = resolve(picked)
  const dest = existsSync(base) && readdirSync(base).length > 0 ? join(base, 'MCSR Client') : base
  if (inside(dest, from) || inside(from, dest)) {
    throw new Error('Pick a folder outside the current game files folder.')
  }
  if (existsSync(dest) && readdirSync(dest).length > 0) {
    throw new Error(`${dest} already has files in it. Pick an empty folder.`)
  }
  return dest
}

export function dropPrismLinks(root: string): void {
  const prism = join(root, 'prism')
  if (!existsSync(prism)) return
  for (const id of readdirSync(prism)) {
    const instances = join(prism, id, 'instances')
    if (!existsSync(instances)) continue
    for (const name of readdirSync(instances)) {
      const dir = join(instances, name)
      if (!existsSync(join(dir, '.mcsr-managed'))) continue
      const link = join(dir, '.minecraft')
      try {
        if (lstatSync(link).isSymbolicLink()) unlinkSync(link)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      if (existsSync(link)) throw new Error(`Could not unlink ${link}.`)
    }
  }
}

export async function removePrismInstances(root: string): Promise<void> {
  const prism = join(root, 'prism')
  if (!existsSync(prism)) return
  for (const id of readdirSync(prism)) {
    const instances = join(prism, id, 'instances')
    if (!existsSync(instances)) continue
    for (const name of readdirSync(instances)) {
      const dir = join(instances, name)
      if (existsSync(join(dir, '.mcsr-managed')) && !existsSync(join(dir, '.minecraft'))) {
        await rm(dir, { recursive: true, force: true })
      }
    }
  }
}

export async function moveDataDir(
  from: string,
  dest: string,
  commit: () => void,
  onProgress?: (p: MoveProgress) => void
): Promise<{ leftover: boolean }> {
  dropPrismLinks(from)
  await removePrismInstances(from)

  if (parse(resolve(from)).root.toLowerCase() === parse(resolve(dest)).root.toLowerCase()) {
    let renamed = false
    try {
      await mkdir(dirname(dest), { recursive: true })
      if (existsSync(dest)) await rmdir(dest)
      await rename(from, dest)
      renamed = true
    } catch (error) {
      if (!['EXDEV', 'EPERM', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
    }
    if (renamed) {
      commit()
      return { leftover: false }
    }
  }

  onProgress?.({ stage: 'scanning', doneBytes: 0, totalBytes: 0, doneFiles: 0, totalFiles: 0 })
  const plan = await planCopy(from, dest, undefined, (files) =>
    onProgress?.({ stage: 'scanning', doneBytes: 0, totalBytes: 0, doneFiles: 0, totalFiles: files })
  )
  const space = await statfs(existsSync(dest) ? dest : dirname(dest))
  const free = space.bavail * space.bsize
  if (free < plan.bytes + 256 * 1024 ** 2) {
    throw new Error(`Not enough space there: needs ${Math.ceil(plan.bytes / 1024 ** 3)} GB.`)
  }
  try {
    await runCopy(plan, (p) => onProgress?.({ stage: 'copying', ...p }))
  } catch (error) {
    await rm(dest, { recursive: true, force: true }).catch(() => {})
    throw error
  }

  commit()
  onProgress?.({ stage: 'cleaning', doneBytes: plan.bytes, totalBytes: plan.bytes, doneFiles: plan.files.length, totalFiles: plan.files.length })
  try {
    await rm(from, { recursive: true, force: true, maxRetries: 3 })
    return { leftover: false }
  } catch {
    return { leftover: existsSync(from) }
  }
}
