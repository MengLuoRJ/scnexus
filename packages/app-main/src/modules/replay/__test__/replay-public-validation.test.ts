import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import { SUPPORTED_REPLAY_BASE_BUILDS } from '@scnexus/replay-parser'
import { analyzeLocalReplay } from '../replay-analysis'
import { inspectLocalReplay } from '../replay-inspection'

// Opt-in local corpus; no downloads, database writes, or replay redistribution.
it.skipIf(!process.env.SCNEXUS_REPLAY_CORPUS)(
  'validates a local replay corpus and optional independent score oracles',
  async () => {
    const directory = process.env.SCNEXUS_REPLAY_CORPUS!
    const files = (await readdir(directory)).filter((name) => name.endsWith('.SC2Replay')).sort()
    expect(files.length).toBeGreaterThan(0)
    for (const fileName of files) {
      const path = join(directory, fileName)
      const before = await stat(path)
      const bytes = await readFile(path)
      const inspection = await inspectLocalReplay(path)
      const record: ReplayRecord = {
        ...inspection.summary,
        id: fileName,
        profileHandle: null,
        category: 'Multiplayer',
        path,
        extension: '.SC2Replay',
        sizeBytes: bytes.length,
        mtimeMs: before.mtimeMs,
        contentHash: createHash('sha256').update(bytes).digest('hex'),
        status: inspection.status,
        supportLevel: inspection.supportLevel,
        warnings: inspection.warnings,
      }
      const analysis = await analyzeLocalReplay(record)
      const official = SUPPORTED_REPLAY_BASE_BUILDS.some((build) => build === record.baseBuild)
      expect(analysis.status).toBe(official ? 'completed' : 'partial')
      assert.ok(['available', 'partial'].includes(analysis.capabilities!.tracker.state))
      for (const component of ['initData', 'game', 'message'] as const) {
        const capability = analysis.capabilities![component]!
        if (official) assert.equal(capability.compatibility?.state, 'verified')
        else if (capability.state === 'partial')
          assert.equal(capability.compatibility?.state, 'unverified')
        else assert.ok(['unsupported', 'missing'].includes(capability.state))
      }
      expect(analysis.insights?.players.length).toBeGreaterThan(0)
      const samples = analysis.insights!.players.flatMap((player) =>
        player.economy.map((sample) => ({ player: player.playerId, sample })),
      )
      expect(samples.length).toBeGreaterThan(0)
      for (const { sample } of samples) expect(Object.keys(sample)).toHaveLength(40)
      if (process.env.SCNEXUS_SCORE_ORACLE === '1') {
        const oracle: {
          stats: { player: number; loop: number; values: Record<string, number> }[]
        } = JSON.parse(await readFile(`${path}.oracle.json`, 'utf8'))
        const actual = new Map<string, typeof samples>()
        for (const entry of samples) {
          const key = `${entry.player}:${entry.sample.gameLoop}`
          const group = actual.get(key) ?? []
          group.push(entry)
          actual.set(key, group)
        }
        assert.equal(samples.length, oracle.stats.length)
        for (const point of oracle.stats) {
          const group = actual.get(`${point.player}:${point.loop}`)
          assert.ok(group?.length, `${fileName}:${point.player}:${point.loop}`)
          const { sample } = group!.shift()!
          // Compare all projected fields against independent raw tracker scores.
          const mappings = {
            minerals: 'MineralsCurrent',
            vespene: 'VespeneCurrent',
            mineralIncome: 'MineralsCollectionRate',
            vespeneIncome: 'VespeneCollectionRate',
            workers: 'WorkersActiveCount',
            supplyUsed: 'FoodUsed',
            supplyCap: 'FoodMade',
            armyMinerals: 'MineralsUsedCurrentArmy',
            armyVespene: 'VespeneUsedCurrentArmy',
            economyMinerals: 'MineralsUsedCurrentEconomy',
            economyVespene: 'VespeneUsedCurrentEconomy',
            technologyMinerals: 'MineralsUsedCurrentTechnology',
            technologyVespene: 'VespeneUsedCurrentTechnology',
            inProgressArmyMinerals: 'MineralsUsedInProgressArmy',
            inProgressArmyVespene: 'VespeneUsedInProgressArmy',
            inProgressEconomyMinerals: 'MineralsUsedInProgressEconomy',
            inProgressEconomyVespene: 'VespeneUsedInProgressEconomy',
            inProgressTechnologyMinerals: 'MineralsUsedInProgressTechnology',
            inProgressTechnologyVespene: 'VespeneUsedInProgressTechnology',
            activeForcesMinerals: 'MineralsUsedActiveForces',
            activeForcesVespene: 'VespeneUsedActiveForces',
            lostArmyMinerals: 'MineralsLostArmy',
            lostArmyVespene: 'VespeneLostArmy',
            lostEconomyMinerals: 'MineralsLostEconomy',
            lostEconomyVespene: 'VespeneLostEconomy',
            lostTechnologyMinerals: 'MineralsLostTechnology',
            lostTechnologyVespene: 'VespeneLostTechnology',
            killedArmyMinerals: 'MineralsKilledArmy',
            killedArmyVespene: 'VespeneKilledArmy',
            killedEconomyMinerals: 'MineralsKilledEconomy',
            killedEconomyVespene: 'VespeneKilledEconomy',
            killedTechnologyMinerals: 'MineralsKilledTechnology',
            killedTechnologyVespene: 'VespeneKilledTechnology',
            friendlyFireArmyMinerals: 'MineralsFriendlyFireArmy',
            friendlyFireArmyVespene: 'VespeneFriendlyFireArmy',
            friendlyFireEconomyMinerals: 'MineralsFriendlyFireEconomy',
            friendlyFireEconomyVespene: 'VespeneFriendlyFireEconomy',
            friendlyFireTechnologyMinerals: 'MineralsFriendlyFireTechnology',
            friendlyFireTechnologyVespene: 'VespeneFriendlyFireTechnology',
          }
          assert.equal(Object.keys(mappings).length, 39)
          for (const [key, suffix] of Object.entries(mappings)) {
            const raw = point.values[`m_scoreValue${suffix}`]
            const expected =
              raw === undefined
                ? null
                : suffix === 'FoodUsed' || suffix === 'FoodMade'
                  ? raw / 4096
                  : raw
            assert.equal(
              sample[key as keyof typeof sample],
              expected,
              `${fileName}:${point.loop}:${key}`,
            )
          }
        }
      }
      const after = await stat(path)
      expect({ size: after.size, mtimeMs: after.mtimeMs }).toEqual({
        size: before.size,
        mtimeMs: before.mtimeMs,
      })
      console.log(
        JSON.stringify({
          fileName,
          baseBuild: record.baseBuild,
          status: analysis.status,
          scoreSamples: samples.length,
        }),
      )
    }
  },
  120_000,
)
