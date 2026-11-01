import assert from 'node:assert/strict'
import { test } from 'node:test'
import { desktopPublish } from '../../packages/app-main/scripts/update-publish.mjs'

test('stable and snapshot releases publish latest metadata into isolated directories', () => {
  assert.deepEqual(desktopPublish('0.1.0'), [
    {
      provider: 'generic',
      url: 'https://release.scnexus.net/desktop/stable/',
      channel: 'latest',
      useMultipleRangeRequest: false,
    },
  ])
  assert.equal(
    desktopPublish('0.1.1-snapshot.1')[0].url,
    'https://release.scnexus.net/desktop/snapshot/',
  )
  assert.equal(desktopPublish('0.1.0', true)[0].url, 'https://release.scnexus.net/release/')
  assert.throws(() => desktopPublish('0.1.1', true))
  assert.equal(desktopPublish('0.1.1-snapshot.1')[0].channel, 'latest')
  for (const version of ['0.1.1-beta.1', '0.1.1-rc.1', 'invalid', '01.1.0'])
    assert.throws(() => desktopPublish(version))
})
