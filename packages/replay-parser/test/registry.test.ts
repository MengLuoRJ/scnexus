import { describe, expect, it } from 'vitest'
import { inspectReplayFile, looksLikeReplay, REPLAY_COMPONENTS } from '../src/index.js'

describe('replay parser registry', () => {
  it('recognizes replay extensions', () => {
    expect(looksLikeReplay('game1.SC2Replay')).toBe(true)
    expect(looksLikeReplay('game1.mpq')).toBe(false)
  })

  it('reports replay component inventory', () => {
    expect(REPLAY_COMPONENTS.some((component) => component.name === 'replay.game.events')).toBe(
      true,
    )
  })

  it('does not invent metadata or component presence for replay candidates', async () => {
    const result = await inspectReplayFile('D:\\games\\replays\\test.SC2Replay')
    expect(result.detected).toBe(true)
    expect(result.supportLevel).toBe('unsupported')
    expect(result.status).toBe('unsupported')
    expect(result.components.every((component) => !component.found)).toBe(true)
    expect(result.summary).toEqual({
      fileName: 'test.SC2Replay',
      mapName: null,
      playedAt: null,
      gameVersion: null,
      baseBuild: null,
      durationSeconds: null,
      players: [],
    })
    expect(result.warnings).toHaveLength(1)
  })

  it('reports non-replay paths as unsupported', async () => {
    const result = await inspectReplayFile('notes.txt')
    expect(result.detected).toBe(false)
    expect(result.status).toBe('unsupported')
  })
})
