import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../../', import.meta.url)

test('includes the third-party notices document in the desktop application', async () => {
  const config = JSON.parse(
    await readFile(new URL('packages/app-main/electron-builder.json', root), 'utf8'),
  )
  assert.ok(
    config.files.some(
      (entry) =>
        entry.from === '../../THIRD-PARTY-NOTICES.md' && entry.to === 'THIRD-PARTY-NOTICES.md',
    ),
  )
  const notices = await readFile(new URL('THIRD-PARTY-NOTICES.md', root), 'utf8')
  assert.match(notices, /^# Third-Party Notices/)
})
