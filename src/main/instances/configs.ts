// Writes baseline configuration into an instance's game directory.
// Mods regenerate their own configs on first run; we pre-seed the values that
// matter for a good out-of-the-box MCSR experience. The SpeedRunIGT "make
// record on every run" setting (needed by paceman) is also surfaced in the UI,
// and the precise on-disk behaviour is verified empirically in Phase 4.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

function writeFile(file: string, contents: string, overwrite = false): void {
  if (!overwrite && existsSync(file)) return
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, contents, 'utf8')
}

const OPTIONS_TXT = [
  'version:2586',
  'fov:1.0',
  'gamma:5.0',
  'guiScale:3',
  'renderDistance:8',
  'maxFps:260',
  'enableVsync:false',
  'entityShadows:false',
  'lang:en_us',
  'soundCategory_master:0.0'
].join('\n')

// StandardSettings mirrors options.txt and is applied to every new world, so
// resets are deterministic for speedrunning.
const STANDARD_OPTIONS = [
  'fov:1.0',
  'gamma:5.0',
  'guiScale:3',
  'renderDistance:8',
  'maxFps:260',
  'enableVsync:false',
  'entityShadows:false',
  'f1:false',
  'autoJump:false',
  'standardSettings:1'
].join('\n')

// Best-effort SeedQueue config (SpeedrunAPI-managed). Reasonable wall defaults.
const SEEDQUEUE_CONFIG = {
  useWall: true,
  rows: 3,
  columns: 3,
  maxCapacity: 12,
  maxConcurrently: 4,
  maxConcurrently_onWall: 4,
  resetCooldown: 150,
  wallFPS: 60,
  previewFPS: 15,
  bypassWall: false,
  reduceLevelList: true
}

// Best-effort SpeedRunIGT settings — "make record every run" is what paceman reads.
const SPEEDRUNIGT_OPTIONS = [
  'make_record_file:true',
  'auto_split_timer:true',
  'first_world_set:true'
].join('\n')

export function writeCommonConfigs(gameDir: string): void {
  writeFile(join(gameDir, 'options.txt'), OPTIONS_TXT)
  writeFile(join(gameDir, 'config', 'standardoptions.txt'), STANDARD_OPTIONS)
}

export function writeRankedConfigs(gameDir: string): void {
  writeCommonConfigs(gameDir)
  writeFile(join(gameDir, 'config', 'mcsr', 'seedqueue.json'), JSON.stringify(SEEDQUEUE_CONFIG, null, 2))
  writeFile(join(gameDir, 'speedrunigt', 'options.txt'), SPEEDRUNIGT_OPTIONS)
}

export function writeRsgConfigs(gameDir: string): void {
  writeCommonConfigs(gameDir)
  writeFile(join(gameDir, 'config', 'mcsr', 'seedqueue.json'), JSON.stringify(SEEDQUEUE_CONFIG, null, 2))
  // SpeedRunIGT "every run" record is required for paceman pace to upload.
  writeFile(join(gameDir, 'speedrunigt', 'options.txt'), SPEEDRUNIGT_OPTIONS)
}
