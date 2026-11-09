import { afterEach, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type {
  ReplayAnalysisView,
  ReplayApi,
  ReplayRecord,
} from '@scnexus/app-shared/types/replay.type'
import ReplayAnalysisDialog from '../ReplayAnalysisDialog.vue'
import en from '../../../locales/en'

const scope = { profileHandle: '1-S2-1-123', category: 'Multiplayer' as const }
const record: ReplayRecord = {
  ...scope,
  id: 'id',
  path: 'D:\\replays\\sample.SC2Replay',
  fileName: 'sample.SC2Replay',
  extension: '.sc2replay',
  sizeBytes: 2048,
  mtimeMs: 1,
  contentHash: 'a'.repeat(64),
  status: 'partial',
  supportLevel: 'metadata-only',
  mapName: 'Map',
  playedAt: null,
  gameVersion: null,
  baseBuild: 98310,
  durationSeconds: 200,
  players: [],
  warnings: [],
}
const observation = {
  gameLoop: 0,
  kind: 'born' as const,
  unitType: 'Marine',
  controlPlayerId: 1,
  upkeepPlayerId: 1,
  completed: true,
  x: null,
  y: null,
  positionGameLoop: null,
}
const history = {
  version: 1 as const,
  baseBuild: 98310,
  durationGameLoops: 3200,
  partial: false,
  diagnostics: [],
  units: [
    {
      unitTag: '1:1',
      unitTagIndex: 1,
      unitTagRecycle: 1,
      startedGameLoop: 0,
      diedGameLoop: null,
      observations: [
        observation,
        {
          ...observation,
          gameLoop: 1600,
          kind: 'owner-change' as const,
          controlPlayerId: 2,
          upkeepPlayerId: 2,
        },
      ],
    },
  ],
}
const analysis: ReplayAnalysisView = {
  replayId: 'id',
  contentHash: record.contentHash!,
  parserVersion: 'test-v1',
  baseBuild: 98310,
  status: 'completed',
  warnings: [],
  analyzedAt: '2026-11-09T00:00:00Z',
  observer: { replayId: 'id', contentHash: record.contentHash!, parserVersion: 'test-v1', history },
}
const wrappers: ReturnType<typeof mount>[] = []
function render(current = analysis) {
  const wrapper = mount(ReplayAnalysisDialog, {
    props: { record, scope, analysis: current, loaded: true, busy: false, error: '' },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      stubs: {
        UModal: { template: '<div role="dialog"><slot name="body"/><slot name="footer"/></div>' },
        UButton: { props: ['label'], template: '<button>{{ label }}<slot/></button>' },
        UInput: true,
        Modal: { template: '<div role="dialog"><slot name="body"/><slot name="footer"/></div>' },
        Button: { props: ['label'], template: '<button>{{ label }}<slot/></button>' },
        Input: true,
        ReplayScoreCharts: true,
        ReplayBattleSummary: true,
        ReplayMetrics: true,
        ReplayProductionTiming: true,
        ReplayCoopDetails: true,
        ReplayChat: true,
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.unstubAllGlobals()
})

test('desktop analysis uses scoped IPC windows for positions while retaining coordinate-free event history', async () => {
  const observerWindow = vi
    .fn<ReplayApi['observerWindow']>()
    .mockImplementation(async (_scope, _id, request) => {
      const fromGameLoop = request.gameLoop < 1600 ? 0 : 1600
      return {
        ok: true,
        data: {
          replayId: analysis.replayId,
          contentHash: analysis.contentHash,
          parserVersion: analysis.parserVersion,
          fromGameLoop,
          toGameLoop: Math.min(3200, fromGameLoop + 1600),
          timeline: {
            durationGameLoops: 3200,
            units: [
              {
                ...history.units[0]!,
                observations: [
                  {
                    ...observation,
                    gameLoop: fromGameLoop,
                    x: fromGameLoop === 0 ? 20 : 40,
                    y: 30,
                    positionGameLoop: fromGameLoop,
                    controlPlayerId: fromGameLoop === 0 ? 1 : 2,
                  },
                ],
              },
            ],
          },
        },
      }
    })
  vi.stubGlobal('scnexus', { replay: { observerWindow } })
  const wrapper = render()
  await flushPromises()
  const table = wrapper.get('table')
  expect(table.text()).toContain('20, 30')
  expect(observerWindow).toHaveBeenCalledWith(scope, 'id', {
    contentHash: analysis.contentHash,
    parserVersion: analysis.parserVersion,
    gameLoop: 0,
  })
  await wrapper.get('input[type="range"]').setValue('1700')
  await flushPromises()
  expect(table.text()).toContain('40, 30')
  expect(wrapper.text()).toContain('1700 / 3200')
  expect(observerWindow.mock.calls.map((call) => call[2].gameLoop)).toEqual([0, 1700])
  expect(analysis).not.toHaveProperty('spatial')
  expect(history.units[0]!.observations[0]!.x).toBeNull()
})

test('a descriptor for another replay is not loaded or sampled as a local timeline', async () => {
  const observerWindow = vi.fn<ReplayApi['observerWindow']>()
  vi.stubGlobal('scnexus', { replay: { observerWindow } })
  const wrapper = render({ ...analysis, observer: { ...analysis.observer!, replayId: 'other' } })
  await flushPromises()
  expect(observerWindow).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain(en['replay.observer.missing'])
  expect(wrapper.find('input[type="range"]').exists()).toBe(false)
})
