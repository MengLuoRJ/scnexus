import { describe, expect, it } from 'vitest'
import { inspectReplayFile, looksLikeReplay, REPLAY_COMPONENTS } from '../src/index.js'

describe('replay parser registry', () => {
  it('recognizes replay extensions', () => {
    expect(looksLikeReplay('game1.SC2Replay')).toBe(true)
    expect(looksLikeReplay('game1.mpq')).toBe(false)
  })

  it('reports replay component inventory', () => {
    expect(REPLAY_COMPONENTS.some((component) => component.name === 'replay.game.events')).toBe(true)
  })

  it('returns a partial metadata-only inspection for replay paths', async () => {
    const result = await inspectReplayFile('D:/games/replays/test.SC2Replay')
    expect(result.detected).toBe(true)
    expect(result.supportLevel).toBe('metadata-only')
    expect(result.status).toBe('partial')
  })
})
