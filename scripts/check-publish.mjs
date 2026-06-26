// Release guard: refuse to build a distributable while build.publish still holds
// the scaffold placeholders, so a non-functional auto-updater can't ship. Wired as
// the `predist` npm script (runs automatically before `npm run dist`).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

if (JSON.stringify(pkg.build?.publish ?? '').includes('REPLACE_WITH')) {
  console.error(
    '\n[check-publish] build.publish still has placeholder owner/repo.\n' +
      'Set the real GitHub owner/repo in package.json before a release build,\n' +
      'or the packaged auto-updater will 404 against a non-existent repo.\n'
  )
  process.exit(1)
}
