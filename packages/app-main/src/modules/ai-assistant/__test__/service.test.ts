import { createServer, request } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createAiAssistantService, type AiAssistantService } from '../service'
import {
  createReadOnlyAiAssistantTools,
  type AiAssistantTool,
  type ReadOnlyAiAssistantAdapters,
} from '../tools'

const services: AiAssistantService[] = []
const clients: Client[] = []
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
  await Promise.all(services.splice(0).map((service) => service.dispose()))
})
async function freePort() {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}
async function setup(
  tools: AiAssistantTool[] = [
    {
      name: 'status',
      description: 'Read status',
      inputSchema: {},
      execute: async () => ({ ok: true }),
    },
  ],
) {
  const service = createAiAssistantService({ isEnabled: () => true, tools })
  services.push(service)
  await service.start(await freePort())
  return service
}
async function clientFor(service: AiAssistantService) {
  const info = service.getConnectionInfo()
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  clients.push(client)
  await client.connect(
    new StreamableHTTPClientTransport(new URL(info.url), {
      requestInit: { headers: { Authorization: `Bearer ${info.token}` } },
    }),
  )
  return client
}
function raw(
  service: AiAssistantService,
  options: {
    headers?: Record<string, string>
    path?: string
    body?: string
    method?: string
    chunks?: string[]
  } = {},
) {
  const { url, token } = service.getConnectionInfo()
  return new Promise<number>((resolve, reject) => {
    const req = request(
      url + (options.path ?? ''),
      {
        method: options.method ?? 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...options.headers,
        },
      },
      (res) => {
        res.resume()
        res.once('end', () => resolve(res.statusCode!))
      },
    )
    req.on('error', reject)
    for (const chunk of options.chunks ?? []) req.write(chunk)
    req.end(options.body ?? '{}')
  })
}
describe('local stateless MCP service', () => {
  it('requires manual start and validates enabled and port gates', async () => {
    let enabled = false
    const service = createAiAssistantService({ isEnabled: () => enabled, tools: [] })
    services.push(service)
    expect(service.getStatus()).toEqual({ state: 'stopped', port: 17861 })
    expect(() => service.getConnectionInfo()).toThrow('AI_ASSISTANT_NOT_RUNNING')
    await expect(service.start(17861)).rejects.toThrow('AI_ASSISTANT_DISABLED')
    enabled = true
    await expect(service.start(0)).rejects.toThrow('AI_ASSISTANT_INVALID_PORT')
    await expect(service.start(65536)).rejects.toThrow('AI_ASSISTANT_INVALID_PORT')
  })
  it('supports actual MCP initialize, tools/list and tools/call across request transports', async () => {
    const service = await setup()
    const client = await clientFor(service)
    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name)).toEqual(['status'])
    expect(tools.tools[0].annotations?.readOnlyHint).toBe(true)
    expect(await client.callTool({ name: 'status', arguments: {} })).toEqual({
      content: [{ type: 'text', text: '{"ok":true}' }],
    })
    await vi.waitFor(() => expect(service.listRecords()[0].status).toBe('succeeded'))
    expect(service.listRecords()[0]).toMatchObject({
      toolName: 'status',
      startedAt: expect.any(Number),
      finishedAt: expect.any(Number),
    })
  })
  it('authenticates every request, rejects origin, foreign Host and query tokens', async () => {
    const service = await setup()
    expect(await raw(service, { headers: { Authorization: '' } })).toBe(401)
    expect(await raw(service, { headers: { Authorization: 'Bearer wrong' } })).toBe(401)
    expect(await raw(service, { headers: { Origin: 'null' } })).toBe(403)
    expect(await raw(service, { headers: { Host: 'localhost:17861' } })).toBe(403)
    expect(await raw(service, { path: '?token=secret' })).toBe(404)
    expect(await raw(service, { method: 'GET' })).toBe(405)
    expect(await raw(service, { body: '{' })).toBe(400)
    expect(await raw(service, { headers: { 'Content-Type': 'text/plain' } })).toBe(415)
  })
  it('bounds both declared and chunked request body sizes', async () => {
    const service = await setup()
    expect(
      await raw(service, { headers: { 'Content-Length': '65537' }, body: 'x'.repeat(65537) }),
    ).toBe(413)
    expect(await raw(service, { chunks: ['x'.repeat(33000), 'x'.repeat(33000)] })).toBe(413)
  })
  it('rotates credentials, cancels an executing tool and releases its port on stop', async () => {
    let entered!: () => void
    const ready = new Promise<void>((resolve) => {
      entered = resolve
    })
    const service = await setup([
      {
        name: 'wait',
        description: 'Wait',
        inputSchema: {},
        execute: (_args, signal) =>
          new Promise((_resolve, reject) => {
            entered()
            signal.addEventListener('abort', () => reject(new Error('private path')), {
              once: true,
            })
          }),
      },
    ])
    const client = await clientFor(service)
    const oldToken = service.getConnectionInfo().token
    const call = client.callTool({ name: 'wait', arguments: {} }).catch(() => null)
    await ready
    const next = service.regenerateToken()
    expect(next.token).not.toBe(oldToken)
    expect(next.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    await call
    expect(service.listRecords()[0]).toMatchObject({ status: 'cancelled', errorCode: 'CANCELLED' })
    expect(await raw(service, { headers: { Authorization: `Bearer ${oldToken}` } })).toBe(401)
    const port = service.getStatus().port
    await service.stop()
    expect(service.getStatus().state).toBe('stopped')
    const replacement = createServer()
    await new Promise<void>((resolve, reject) => {
      replacement.once('error', reject)
      replacement.listen(port, '127.0.0.1', resolve)
    })
    await new Promise<void>((resolve) => replacement.close(() => resolve()))
  })
  it('bounds concurrent requests and stop cancels active requests without waiting for tools', async () => {
    const service = await setup([
      { name: 'wait', description: 'Wait', inputSchema: {}, execute: () => new Promise(() => {}) },
    ])
    const { url, token } = service.getConnectionInfo()
    const requests = Array.from({ length: 16 }, (_, id) =>
      fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: { name: 'wait', arguments: {} },
        }),
      }).catch(() => null),
    )
    await vi.waitFor(() => expect(service.listRecords()).toHaveLength(16))
    expect(await raw(service)).toBe(429)
    await service.stop()
    await Promise.all(requests)
    expect(service.listRecords().every((record) => record.status === 'cancelled')).toBe(true)
  })
  it('times out incomplete requests and releases active request slots', async () => {
    const service = await setup()
    const { url, token } = service.getConnectionInfo()
    const req = request(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
    })
    req.on('error', () => {})
    req.write('{')
    await new Promise((resolve) => setTimeout(resolve, 30))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    // Start a second request after fake timers are enabled to exercise the deadline.
    const second = request(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    second.on('error', () => {})
    second.write('{')
    const closed = new Promise<void>((resolve) => second.once('close', resolve))
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    await vi.advanceTimersByTimeAsync(30001)
    vi.useRealTimers()
    await closed
    req.destroy()
    expect(await raw(service, { body: '{' })).toBe(400)
  })
  it('reports an occupied port safely and can retry after release', async () => {
    const first = await setup()
    const second = createAiAssistantService({ isEnabled: () => true, tools: [] })
    services.push(second)
    const port = first.getStatus().port
    await expect(second.start(port)).rejects.toThrow('AI_ASSISTANT_PORT_IN_USE')
    expect(second.getStatus()).toMatchObject({
      state: 'error',
      errorCode: 'AI_ASSISTANT_PORT_IN_USE',
    })
    await first.stop()
    await second.start(port)
    expect(second.getStatus().state).toBe('running')
  })
  it('keeps at most 500 metadata-only records and redacts tool failures', async () => {
    const service = await setup([
      {
        name: 'fail',
        description: 'Fail safely',
        inputSchema: {},
        execute: async () => {
          throw new Error('secret C:\\private\\path')
        },
      },
    ])
    const client = await clientFor(service)
    for (let index = 0; index < 501; index++) {
      const result = await client.callTool({ name: 'fail', arguments: {} })
      expect(result).toMatchObject({
        isError: true,
        content: [{ type: 'text', text: 'TOOL_FAILED' }],
      })
    }
    expect(service.listRecords()).toHaveLength(500)
    expect(JSON.stringify(service.listRecords())).not.toContain('secret')
    expect(Object.keys(service.listRecords()[0]).sort()).toEqual([
      'errorCode',
      'finishedAt',
      'id',
      'startedAt',
      'status',
      'toolName',
    ])
    const copy = service.listRecords()
    copy[0].toolName = 'mutated'
    expect(service.listRecords()[0].toolName).toBe('fail')
    service.clearRecords()
    expect(service.listRecords()).toEqual([])
  }, 20000)
  it('exposes exactly six injected readonly adapters with bounded pagination', async () => {
    const adapters = {
      readAppStatus: vi.fn<ReadOnlyAiAssistantAdapters['readAppStatus']>(async () => ({
        ready: true,
      })),
      readCampaigns: vi.fn<ReadOnlyAiAssistantAdapters['readCampaigns']>(async () => []),
      readCampaignDetails: vi.fn<ReadOnlyAiAssistantAdapters['readCampaignDetails']>(async () => {
        throw new Error('CONTENT_NOT_FOUND')
      }),
      readCustomContent: vi.fn<ReadOnlyAiAssistantAdapters['readCustomContent']>(async () => []),
      readDownloads: vi.fn<ReadOnlyAiAssistantAdapters['readDownloads']>(async () => []),
      readTaskStatus: vi.fn<ReadOnlyAiAssistantAdapters['readTaskStatus']>(async () => ({})),
    }
    const service = await setup(createReadOnlyAiAssistantTools(adapters))
    const client = await clientFor(service)
    expect((await client.listTools()).tools).toHaveLength(6)
    await client.callTool({ name: 'list_campaigns', arguments: {} })
    expect(adapters.readCampaigns).toHaveBeenCalledWith(0, 20)
    expect(
      (await client.callTool({ name: 'list_campaigns', arguments: { limit: 101 } })).isError,
    ).toBe(true)
    expect(
      (await client.callTool({ name: 'list_campaigns', arguments: { unexpected: true } })).isError,
    ).toBe(true)
    expect(
      (await client.callTool({ name: 'get_app_status', arguments: { unexpected: true } })).isError,
    ).toBe(true)
    expect(adapters.readAppStatus).not.toHaveBeenCalled()
    expect(adapters.readCampaigns).toHaveBeenCalledTimes(1)
    expect(
      await client.callTool({ name: 'get_campaign_details', arguments: { id: 'missing' } }),
    ).toMatchObject({ isError: true, content: [{ text: 'CONTENT_NOT_FOUND' }] })
  })
})
