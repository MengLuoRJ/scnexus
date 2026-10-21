import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
const mocks = vi.hoisted(() => ({
  root: '',
  handlers: new Map<string, (request: Request) => Promise<Response>>(),
  schemes: vi.fn<(schemes: unknown[]) => void>(),
}))
vi.mock('electron', () => ({
  app: { getAppPath: () => mocks.root },
  protocol: {
    registerSchemesAsPrivileged: mocks.schemes,
    handle: (name: string, handler: (request: Request) => Promise<Response>) =>
      mocks.handlers.set(name, handler),
  },
}))
import { installApplicationProtocol, registerApplicationScheme } from '../protocol'
afterEach(async () => {
  if (mocks.root) await rm(mocks.root, { recursive: true, force: true })
  mocks.root = ''
  mocks.handlers.clear()
})
test('privileged scheme serves only bundled files with CSP and no MIME sniffing', async () => {
  mocks.root = await mkdtemp(join(process.cwd(), '.application-protocol-'))
  const root = join(mocks.root, 'packages', 'app-renderer-v2', 'dist')
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'index.html'), '<html>local</html>')
  registerApplicationScheme()
  expect(mocks.schemes).toHaveBeenCalledWith([
    expect.objectContaining({
      scheme: 'app',
      privileges: expect.objectContaining({ standard: true, secure: true }),
    }),
  ])
  installApplicationProtocol()
  const handler = mocks.handlers.get('app')!
  const response = await handler(new Request('app://localhost/index.html'))
  expect(response.status).toBe(200)
  expect(await response.text()).toBe('<html>local</html>')
  expect(response.headers.get('Content-Security-Policy')).toContain(
    "connect-src 'self' https://api.scnexus.net",
  )
  expect(response.headers.get('Content-Security-Policy')).not.toContain('unsafe-eval')
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  expect((await handler(new Request('app://attacker/index.html'))).status).toBe(404)
  expect((await handler(new Request('app://localhost/%2e%2e%2fsecret'))).status).toBe(404)
  expect(
    (await handler(new Request('app://localhost/index.html', { method: 'POST' }))).status,
  ).toBe(405)
  expect(
    await (await handler(new Request('app://localhost/index.html', { method: 'HEAD' }))).text(),
  ).toBe('')
})
