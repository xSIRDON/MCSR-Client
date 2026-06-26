import { existsSync, copyFileSync, cpSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export function copyInstanceSettings(srcGameDir: string, dstGameDir: string): string[] {
  const copied: string[] = []
  mkdirSync(dstGameDir, { recursive: true })

  for (const file of ['options.txt', 'hotbar.nbt']) {
    const src = join(srcGameDir, file)
    if (existsSync(src)) {
      copyFileSync(src, join(dstGameDir, file))
      copied.push(file)
    }
  }

  const srcConfig = join(srcGameDir, 'config')
  if (existsSync(srcConfig)) {
    cpSync(srcConfig, join(dstGameDir, 'config'), { recursive: true })
    copied.push('config/')
  }

  return copied
}
