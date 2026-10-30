import { randomBytes, randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { strictObject } from 'zod'
import type {
  AiAssistantStatus,
  AiOperationRecord,
  AiConnectionInfo,
} from '@scnexus/app-shared/types/ai-assistant.type'
import { createAiAssistantHttp } from './http'
import type { AiAssistantTool } from './tools'

export interface AiAssistantServiceOptions {
  isEnabled: () => boolean
  tools: readonly AiAssistantTool[]
  onStatusChanged?: (status: AiAssistantStatus) => void
  onRecordChanged?: (record: AiOperationRecord) => void
}
const safeErrors = new Set([
  'GAME_NOT_CONFIGURED',
  'CONTENT_NOT_FOUND',
  'TASK_NOT_FOUND',
  'CANCELLED',
  'ACTION_REQUIRES_REVIEW',
  'ACTION_CANCELLED',
  'CONFIRMATION_UNAVAILABLE',
  'ACTION_BUSY',
  'CAMPAIGN_NOT_ACTIVE',
  'CAMPAIGN_STATE_CHANGED',
])
export function createAiAssistantService(options: AiAssistantServiceOptions) {
  let status: AiAssistantStatus = { state: 'stopped', port: 17861 }
  let token = randomBytes(32).toString('base64url')
  let http: ReturnType<typeof createAiAssistantHttp> | undefined
  let disposed = false
  let lifecycle = Promise.resolve()
  const records: AiOperationRecord[] = []
  const mutations = new Set<Promise<void>>()
  function publishStatus(next: AiAssistantStatus) {
    status = next
    options.onStatusChanged?.({ ...status })
  }
  function publishRecord(record: AiOperationRecord) {
    options.onRecordChanged?.({ ...record })
  }
  function createServer(signal: AbortSignal) {
    const server = new McpServer({ name: 'scnexus-local-assistant', version: '1.0.0' })
    for (const tool of options.tools) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: strictObject(tool.inputSchema),
          annotations: {
            readOnlyHint: tool.readOnly !== false,
            destructiveHint: tool.readOnly === false,
            idempotentHint: tool.readOnly !== false,
            openWorldHint: false,
          },
        },
        async (args) => {
          const record: AiOperationRecord = {
            id: randomUUID(),
            toolName: tool.name,
            status: 'running',
            startedAt: Date.now(),
          }
          records.push(record)
          if (records.length > 500) records.shift()
          publishRecord(record)
          let finished = false
          const finish = (state: AiOperationRecord['status'], errorCode?: string) => {
            if (finished) return
            finished = true
            record.status = state
            record.finishedAt = Date.now()
            if (errorCode) record.errorCode = errorCode
            publishRecord(record)
          }
          let rejectCancelled!: (error: Error) => void
          const cancelled = new Promise<never>((_resolve, reject) => {
            rejectCancelled = reject
          })
          let committing = false
          let completeMutation!: () => void
          const mutationDone = new Promise<void>((resolve) => {
            completeMutation = resolve
          })
          const beginMutation = () => {
            signal.throwIfAborted()
            committing = true
            mutations.add(mutationDone)
          }
          const cancel = () => {
            if (committing) return
            finish('cancelled', 'CANCELLED')
            rejectCancelled(new Error('CANCELLED'))
          }
          signal.addEventListener('abort', cancel, { once: true })
          try {
            signal.throwIfAborted()
            const result = await Promise.race([
              tool.execute(args as Record<string, unknown>, signal, beginMutation),
              cancelled,
            ])
            if (!committing) signal.throwIfAborted()
            const text = JSON.stringify(result ?? null)
            const actionStatus =
              tool.readOnly === false && result && typeof result === 'object'
                ? (result as { status?: unknown }).status
                : undefined
            if (actionStatus === 'cancelled') {
              finish('cancelled', 'ACTION_CANCELLED')
              return { isError: true, content: [{ type: 'text' as const, text }] }
            }
            if (actionStatus === 'requires-review' || actionStatus === 'partially-completed') {
              finish(
                'failed',
                actionStatus === 'partially-completed'
                  ? 'ACTION_PARTIALLY_COMPLETED'
                  : 'ACTION_REQUIRES_REVIEW',
              )
              return { isError: true, content: [{ type: 'text' as const, text }] }
            }
            finish('succeeded')
            return { content: [{ type: 'text' as const, text }] }
          } catch (error) {
            const code =
              error instanceof Error && safeErrors.has(error.message)
                ? error.message
                : 'TOOL_FAILED'
            const cancelledBeforeCommit = signal.aborted && !committing
            finish(
              cancelledBeforeCommit ? 'cancelled' : 'failed',
              cancelledBeforeCommit ? 'CANCELLED' : code,
            )
            return {
              isError: true,
              content: [
                { type: 'text' as const, text: cancelledBeforeCommit ? 'CANCELLED' : code },
              ],
            }
          } finally {
            completeMutation()
            mutations.delete(mutationDone)
            signal.removeEventListener('abort', cancel)
          }
        },
      )
    }
    return server
  }
  function serialize<T>(action: () => Promise<T>): Promise<T> {
    const task = lifecycle.then(action)
    lifecycle = task.then(
      () => {},
      () => {},
    )
    return task
  }
  async function stopInternal() {
    if (!http) {
      publishStatus({ state: 'stopped', port: status.port })
      return { ...status }
    }
    publishStatus({ state: 'stopping', port: status.port })
    const current = http
    http = undefined
    await current.stop()
    await Promise.all(mutations)
    publishStatus({ state: 'stopped', port: status.port })
    return { ...status }
  }
  function getConnectionInfo(): AiConnectionInfo {
    if (!options.isEnabled() || status.state !== 'running')
      throw new Error('AI_ASSISTANT_NOT_RUNNING')
    return { url: `http://127.0.0.1:${status.port}/mcp`, token }
  }
  return {
    getStatus: (): AiAssistantStatus => ({ ...status }),
    start(port = 17861): Promise<AiAssistantStatus> {
      return serialize(async () => {
        if (disposed) throw new Error('AI_ASSISTANT_DISPOSED')
        if (!options.isEnabled()) throw new Error('AI_ASSISTANT_DISABLED')
        if (!Number.isInteger(port) || port < 1024 || port > 65535)
          throw new Error('AI_ASSISTANT_INVALID_PORT')
        if (status.state === 'running' && status.port === port) return { ...status }
        if (http) await stopInternal()
        publishStatus({ state: 'starting', port })
        const current = createAiAssistantHttp({
          port,
          token: () => token,
          isEnabled: options.isEnabled,
          createServer,
        })
        http = current
        try {
          await new Promise<void>((resolve, reject) => {
            const onError = (error: Error) => {
              current.server.off('listening', onListening)
              reject(error)
            }
            const onListening = () => {
              current.server.off('error', onError)
              resolve()
            }
            current.server.once('error', onError)
            current.server.once('listening', onListening)
            current.server.listen(port, '127.0.0.1')
          })
          current.server.on('error', () => {
            current.cancelConnections()
            publishStatus({ state: 'error', port, errorCode: 'AI_ASSISTANT_SERVER_ERROR' })
          })
          publishStatus({ state: 'running', port })
          return { ...status }
        } catch (error) {
          http = undefined
          await current.stop()
          const errorCode =
            (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
              ? 'AI_ASSISTANT_PORT_IN_USE'
              : 'AI_ASSISTANT_START_FAILED'
          publishStatus({ state: 'error', port, errorCode })
          throw new Error(errorCode)
        }
      })
    },
    stop: () => serialize(stopInternal),
    regenerateToken(): AiConnectionInfo {
      getConnectionInfo()
      token = randomBytes(32).toString('base64url')
      http?.cancelConnections()
      return getConnectionInfo()
    },
    getConnectionInfo,
    listRecords: (): AiOperationRecord[] => records.map((record) => ({ ...record })),
    clearRecords() {
      records.length = 0
    },
    dispose() {
      disposed = true
      return serialize(async () => {
        await stopInternal()
      })
    },
  }
}

export type AiAssistantService = ReturnType<typeof createAiAssistantService>
