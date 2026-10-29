import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

const BODY_LIMIT = 64 * 1024
export function createAiAssistantHttp(options: {
  port: number
  token: () => string
  isEnabled: () => boolean
  createServer: (signal: AbortSignal) => McpServer
}) {
  const sockets = new Set<Socket>()
  const active = new Set<AbortController>()
  function reject(res: ServerResponse, status: number) {
    res.writeHead(status, { 'Content-Type': 'application/json', Connection: 'close' })
    res.end(JSON.stringify({ error: 'Request rejected' }))
  }
  async function handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('Cache-Control', 'no-store')
    const auth = req.headers.authorization
    const expected = Buffer.from(`Bearer ${options.token()}`)
    const supplied = Buffer.from(auth ?? '')
    if (
      !options.isEnabled() ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      return reject(res, 401)
    if (
      req.headers.host !== `127.0.0.1:${options.port}` ||
      req.headersDistinct.host?.length !== 1 ||
      req.headersDistinct.authorization?.length !== 1 ||
      req.headers.origin !== undefined
    )
      return reject(res, 403)
    if (req.url !== '/mcp') return reject(res, 404)
    if (req.method !== 'POST') return reject(res, 405)
    if (active.size >= 16) return reject(res, 429)
    if (req.headers['content-type']?.split(';')[0]?.trim() !== 'application/json')
      return reject(res, 415)
    if (Number(req.headers['content-length'] ?? 0) > BODY_LIMIT) return reject(res, 413)
    const controller = new AbortController()
    active.add(controller)
    let mcp: McpServer | undefined
    let transport: StreamableHTTPServerTransport | undefined
    const timer = setTimeout(() => {
      controller.abort()
      res.destroy()
    }, 30000)
    const cleanup = () => {
      clearTimeout(timer)
      controller.abort()
      active.delete(controller)
      void transport?.close().catch(() => {})
      void mcp?.close().catch(() => {})
    }
    res.once('close', cleanup)
    try {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        const bytes = Buffer.from(chunk)
        size += bytes.length
        if (size > BODY_LIMIT) {
          reject(res, 413)
          return
        }
        chunks.push(bytes)
      }
      let body: unknown
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        reject(res, 400)
        return
      }
      if (controller.signal.aborted) return
      mcp = options.createServer(controller.signal)
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      })
      await mcp.connect(transport)
      await transport.handleRequest(req, res, body)
      // handleRequest may return before the SDK finishes sending a tool response.
      // The response close event owns the per-request transport lifetime.
    } catch {
      if (!res.headersSent && !res.destroyed) reject(res, 500)
      else res.destroy()
    }
  }
  const server = createServer((req, res) => {
    void handle(req, res)
  })
  server.headersTimeout = 10000
  server.requestTimeout = 30000
  server.timeout = 30000
  server.keepAliveTimeout = 1000
  server.maxConnections = 32
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  server.on('clientError', (_error, socket) => {
    socket.destroy()
  })
  function cancelConnections() {
    for (const controller of active) controller.abort()
    for (const socket of sockets) socket.destroy()
  }
  return {
    server,
    cancelConnections,
    async stop() {
      cancelConnections()
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
