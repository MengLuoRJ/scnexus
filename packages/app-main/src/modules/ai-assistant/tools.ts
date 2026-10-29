import * as z from 'zod'

export interface AiAssistantTool {
  name: string
  description: string
  inputSchema: z.ZodRawShape
  execute(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>
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
