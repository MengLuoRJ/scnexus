import * as z from 'zod'
import type { MutationLanguage, MutationRegion } from '@scnexus/app-shared/mutations/contracts'

export interface AiAssistantTool {
  name: string
  description: string
  inputSchema: z.ZodRawShape
  readOnly?: boolean
  execute(
    args: Record<string, unknown>,
    signal: AbortSignal,
    beginMutation?: () => void,
  ): Promise<unknown>
}

export interface ReadOnlyAiAssistantAdapters {
  readAppStatus(): Promise<unknown>
  readCampaigns(offset: number, limit: number): Promise<unknown>
  readCampaignDetails(id: string): Promise<unknown>
  readCustomContent(offset: number, limit: number): Promise<unknown>
  readDownloads(offset: number, limit: number): Promise<unknown>
  readTaskStatus(id: string): Promise<unknown>
}

export function createReadOnlyAiAssistantTools(
  adapters: ReadOnlyAiAssistantAdapters,
): AiAssistantTool[] {
  const pagination = {
    offset: z.number().int().min(0).max(100000).default(0),
    limit: z.number().int().min(1).max(100).default(20),
  }
  const identifier = { id: z.string().min(1).max(200) }
  return [
    {
      name: 'get_app_status',
      description: 'Read local application status.',
      inputSchema: {},
      execute: () => adapters.readAppStatus(),
    },
    {
      name: 'list_campaigns',
      description: 'List installed local campaigns.',
      inputSchema: pagination,
      execute: (args) => adapters.readCampaigns(args.offset as number, args.limit as number),
    },
    {
      name: 'get_campaign_details',
      description: 'Read an installed campaign by its local identifier.',
      inputSchema: identifier,
      execute: (args) => adapters.readCampaignDetails(args.id as string),
    },
    {
      name: 'list_custom_content',
      description: 'List installed local custom content.',
      inputSchema: pagination,
      execute: (args) => adapters.readCustomContent(args.offset as number, args.limit as number),
    },
    {
      name: 'list_downloads',
      description: 'List local download task summaries.',
      inputSchema: pagination,
      execute: (args) => adapters.readDownloads(args.offset as number, args.limit as number),
    },
    {
      name: 'get_task_status',
      description: 'Read a local download task by identifier.',
      inputSchema: identifier,
      execute: (args) => adapters.readTaskStatus(args.id as string),
    },
  ]
}

export interface AiAssistantActionAdapters {
  activateCampaign(id: string, signal: AbortSignal, beginMutation?: () => void): Promise<unknown>
  switchCampaign(id: string, signal: AbortSignal, beginMutation?: () => void): Promise<unknown>
  restoreCampaign(id: string, signal: AbortSignal, beginMutation?: () => void): Promise<unknown>
  uninstallCampaign(id: string, signal: AbortSignal, beginMutation?: () => void): Promise<unknown>
  readMutators(
    args: { language?: MutationLanguage; search?: string; offset?: number; limit?: number },
    signal: AbortSignal,
  ): Promise<unknown>
  readWeeklyMutation(
    args: { region?: MutationRegion; language?: MutationLanguage },
    signal: AbortSignal,
  ): Promise<unknown>
}
export function createAiAssistantTools(
  adapters: ReadOnlyAiAssistantAdapters & AiAssistantActionAdapters,
): AiAssistantTool[] {
  const actions: [string, string, AiAssistantActionAdapters['activateCampaign']][] = [
    [
      'activate_campaign',
      'Activate an installed campaign. Conflicts require manual review; changes local game files.',
      adapters.activateCampaign,
    ],
    [
      'switch_campaign',
      'Switch to an installed campaign of the same category. Conflicts require manual review; changes local game files.',
      adapters.switchCampaign,
    ],
    [
      'restore_campaign',
      'Deactivate the active custom campaign to restore the original campaign. Requires approval in the desktop application.',
      adapters.restoreCampaign,
    ],
    [
      'uninstall_campaign',
      'Uninstall an installed campaign. Requires approval in the desktop application; conflicts require manual review.',
      adapters.uninstallCampaign,
    ],
  ]
  const language = z.enum(['zhCN', 'enUS', 'ruRU', 'koKR', 'frFR', 'deDE']).default('zhCN')
  return [
    ...createReadOnlyAiAssistantTools(adapters),
    ...actions.map(([name, description, execute]): AiAssistantTool => ({
      name,
      description,
      readOnly: false,
      inputSchema: { id: z.string().min(1).max(200) },
      execute: (args, signal, beginMutation) => execute(args.id as string, signal, beginMutation),
    })),
    {
      name: 'list_mutators',
      description:
        'Query mutator catalog using local data and optional online calibration. Search by name or identifier.',
      inputSchema: {
        language,
        search: z.string().max(100).default(''),
        offset: z.number().int().min(0).max(100000).default(0),
        limit: z.number().int().min(1).max(100).default(20),
      },
      execute: (args, signal) => adapters.readMutators(args, signal),
    },
    {
      name: 'get_weekly_mutation',
      description:
        'Query current weekly mutation using local prediction and optional online calibration. Does not require sign-in.',
      inputSchema: { region: z.enum(['CN', 'NA', 'EU', 'AS']).default('CN'), language },
      execute: (args, signal) => adapters.readWeeklyMutation(args, signal),
    },
  ]
}
