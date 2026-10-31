import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { discoverReplayDirectories, hashReplayFile } from '../replay-files'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(process.cwd(), 'scnexus-replay-files-'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('replay file foundation', () => {
  it('hashes file content, not names or timestamps', async () => {
    const a = join(directory, 'a.SC2Replay')
    const b = join(directory, 'b.SC2Replay')
    await writeFile(a, 'abc')
    await writeFile(b, 'abc')
    expect(await hashReplayFile(a)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(await hashReplayFile(a)).toBe(await hashReplayFile(b))
    await writeFile(b, 'changed')
    expect(await hashReplayFile(a)).not.toBe(await hashReplayFile(b))
  })
  it('discovers only existing account profile replay directories without indexing files', async () => {
    const path = join(directory, 'StarCraft II', 'Accounts', '123', '5-S2-1-456', 'Replays')
    await mkdir(path, { recursive: true })
    await mkdir(join(directory, 'StarCraft II', 'Accounts', '123', 'other', 'Replays'), {
      recursive: true,
    })
    await writeFile(join(path, 'not-read.SC2Replay'), 'anything')
    expect(await discoverReplayDirectories(directory)).toEqual([
      { path, account: '123', profile: '5-S2-1-456' },
    ])
    expect(await discoverReplayDirectories(join(directory, 'missing'))).toEqual([])
  })
  it('does not swallow discovery errors other than missing paths', async () => {
    await mkdir(join(directory, 'StarCraft II'), { recursive: true })
    await writeFile(join(directory, 'StarCraft II', 'Accounts'), 'not a directory')
    await expect(discoverReplayDirectories(directory)).rejects.toMatchObject({ code: 'ENOTDIR' })
  })
})
