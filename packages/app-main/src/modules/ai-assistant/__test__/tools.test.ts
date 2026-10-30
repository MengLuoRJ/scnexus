import { expect, test, vi } from 'vitest'
import { strictObject } from 'zod'
import {
  createAiAssistantTools,
  type AiAssistantActionAdapters,
  type ReadOnlyAiAssistantAdapters,
} from '../tools'

test('extended tools expose bounded queries and explicit non-readonly campaign operations', async () => {
  const read = vi.fn<() => Promise<unknown>>(async () => ({}))
  const action = vi.fn<AiAssistantActionAdapters['activateCampaign']>(async () => ({
    changed: true,
  }))
  const mutators = vi.fn<AiAssistantActionAdapters['readMutators']>(async () => ({ items: [] }))
  const weekly = vi.fn<AiAssistantActionAdapters['readWeeklyMutation']>(async () => ({}))
  const adapters: ReadOnlyAiAssistantAdapters & AiAssistantActionAdapters = {
    readAppStatus: read,
    readCampaigns: read,
    readCampaignDetails: read,
    readCustomContent: read,
    readDownloads: read,
    readTaskStatus: read,
    activateCampaign: action,
    switchCampaign: action,
    restoreCampaign: action,
    uninstallCampaign: action,
    readMutators: mutators,
    readWeeklyMutation: weekly,
  }
  const tools = createAiAssistantTools(adapters)
  expect(tools).toHaveLength(12)
  const controller = new AbortController()
  const begin = vi.fn<() => void>()
  for (const name of [
    'activate_campaign',
    'switch_campaign',
    'restore_campaign',
    'uninstall_campaign',
  ]) {
    const tool = tools.find((item) => item.name === name)!
    expect(tool.readOnly).toBe(false)
    expect(strictObject(tool.inputSchema).safeParse({ id: 'known-id', force: true }).success).toBe(
      false,
    )
    await tool.execute({ id: 'known-id' }, controller.signal, begin)
  }
  expect(action).toHaveBeenCalledTimes(4)
  expect(action).toHaveBeenLastCalledWith('known-id', controller.signal, begin)
  const catalog = tools.find((item) => item.name === 'list_mutators')!
  const args = strictObject(catalog.inputSchema).parse({})
  expect(args).toEqual({ language: 'zhCN', search: '', offset: 0, limit: 20 })
  expect(strictObject(catalog.inputSchema).safeParse({ limit: 101 }).success).toBe(false)
  expect(strictObject(catalog.inputSchema).safeParse({ search: 'x'.repeat(101) }).success).toBe(
    false,
  )
  await catalog.execute(args, controller.signal)
  expect(mutators).toHaveBeenCalledWith(args, controller.signal)
  const current = tools.find((item) => item.name === 'get_weekly_mutation')!
  expect(strictObject(current.inputSchema).parse({})).toEqual({ region: 'CN', language: 'zhCN' })
  expect(strictObject(current.inputSchema).safeParse({ region: 'invalid' }).success).toBe(false)
})
