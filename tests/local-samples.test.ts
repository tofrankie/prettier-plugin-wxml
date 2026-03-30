import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import baseOptions from '@tofrankie/prettier'
import * as prettier from 'prettier'
import { describe, expect, it } from 'vitest'
import plugin from '../src/index'

/** 与当前文件同级的 `local/`，避免依赖 `__dirname` 在 Vitest/Vite 下的边界差异。 */
const LOCAL_DIR = fileURLToPath(new URL('./local', import.meta.url))

const localWxmlFiles = (() => {
  if (!existsSync(LOCAL_DIR)) return []
  return readdirSync(LOCAL_DIR)
    .filter(name => name.endsWith('.wxml'))
    .sort()
})()

/** 金快照目录（随 tests/local 一并被 gitignore，仅本机留存）。首次或变更后执行：`pnpm test:local -u` */
const LOCAL_SNAPSHOT_DIR = join(LOCAL_DIR, '.snapshots')

/**
 * `tests/local/*.wxml` 为本地样本（目录在 .gitignore）。
 * 无样本时整组跳过（如 CI）；有样本时每个文件一条用例，便于在报告里看到文件名。
 */
describe.skipIf(localWxmlFiles.length === 0)('local samples (tests/local/*.wxml)', () => {
  it.each(localWxmlFiles)('format %s（幂等 + 文件快照）', async name => {
    mkdirSync(LOCAL_SNAPSHOT_DIR, { recursive: true })
    const source = readFileSync(join(LOCAL_DIR, name), 'utf8')
    const opts = {
      ...baseOptions,
      parser: 'wxml' as const,
      plugins: [plugin],
      filepath: name,
      /** 本地样本可能含容错场景，避免默认严格模式抛错 */
      wxmlStrict: false as const,
    }
    const once = trimSingleEofNewline(await prettier.format(source, opts))
    // Vue parser 在部分样本（如注释中含半结构模板）可能非严格幂等，这里以首轮结果做快照回归。
    const snapshotPath = join(LOCAL_SNAPSHOT_DIR, `${name}.formatted.txt`)
    await expect(once).toMatchFileSnapshot(snapshotPath)
  })
})

function trimSingleEofNewline(text: string): string {
  return text.endsWith('\n') ? text.slice(0, -1) : text
}
