import { beforeEach, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AnalysisResult } from '@scnexus/app-shared/types/content.type'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
const mocks = vi.hoisted(() => ({
  analyze: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  cancel: vi.fn<(id: string) => Promise<unknown>>(),
}))
vi.mock('../../ipcs/content', () => ({ apiContentAnalyze: mocks.analyze }))
vi.mock('../../ipcs/campaign', () => ({ apiCampaignCancel: mocks.cancel }))
import { useContentImportStore } from '../content-import'
beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  mocks.cancel.mockResolvedValue({ ok: true, data: undefined })
})
const input = { kind: 'archive' as const, path: 'D:\\Content.zip' }
const result = { analysisId: 'a', contentType: 'customize' } as AnalysisResult

test('classification is handed off only to the matching page and consumed once', async () => {
  mocks.analyze.mockResolvedValue({ ok: true, data: result })
  const store = useContentImportStore()
  expect(await store.analyze(input)).toBe('customize')
  expect(store.take('campaign')).toBeNull()
  expect(store.take('customize')).toEqual(result)
  expect(store.take('customize')).toBeNull()
  expect(mocks.analyze).toHaveBeenCalledOnce()
})

test('descriptor conflict waits for explicit choice then analyzes the same source again', async () => {
  const store = useContentImportStore()
  const conflict = toErrorDto(new AppError(ERRORS.CONTENT_TYPE_CONFLICT))
  mocks.analyze
    .mockResolvedValueOnce({ ok: false, error: conflict })
    .mockResolvedValueOnce({ ok: true, data: result })
  expect(await store.analyze(input)).toBeUndefined()
  expect(store.conflict).toEqual(conflict)
  expect(store.pending).toBeNull()
  expect(store.source).toEqual(input)
  expect(await store.analyze(store.source!, 'package-json')).toBe('customize')
  expect(mocks.analyze.mock.calls).toEqual([
    [input, undefined],
    [input, 'package-json'],
  ])
  expect(store.conflict).toBeNull()
})

test('failed analysis shows error without navigation or pending preview', async () => {
  const store = useContentImportStore()
  const error = toErrorDto(new AppError(ERRORS.ARCHIVE_METADATA_INVALID))
  mocks.analyze.mockResolvedValue({ ok: false, error })
  expect(await store.analyze(input)).toBeUndefined()
  expect(store.error).toEqual(error)
  expect(store.conflict).toBeNull()
  expect(store.pending).toBeNull()
})

test('cancelling in-flight classification cancels its late preview rather than leaking it', async () => {
  const store = useContentImportStore()
  let complete!: (value: unknown) => void
  mocks.analyze.mockReturnValue(
    new Promise((resolve) => {
      complete = resolve
    }),
  )
  const pending = store.analyze(input)
  await store.cancel()
  complete({ ok: true, data: result })
  await pending
  expect(mocks.cancel).toHaveBeenCalledWith('a')
  expect(store.pending).toBeNull()
})

test('navigation failure cleanup cancels an unconsumed preview', async () => {
  const store = useContentImportStore()
  mocks.analyze.mockResolvedValue({ ok: true, data: result })
  await store.analyze(input)
  await store.cancel()
  expect(mocks.cancel).toHaveBeenCalledWith('a')
  expect(store.pending).toBeNull()
})
