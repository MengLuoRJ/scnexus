import { beforeEach, expect, test, vi } from 'vitest'
import type { AxiosRequestConfig } from 'axios'
import {
  apiWorkshopList,
  apiWorkshopDetail,
  apiWorkshopCreate,
  apiWorkshopUpdate,
  apiWorkshopCreateVersion,
  isStrictSemver,
} from '../workshop'
import { apiCreatorRedeem, apiCreatorState, apiCreatorQuota } from '../creator'
import { emptyDocument } from '../../components/workshop/document'
const mocks = vi.hoisted(() => ({
  request: vi.fn<(config: AxiosRequestConfig) => Promise<{ data: unknown }>>(),
}))
vi.mock('axios', () => ({
  default: {
    create: () => ({ request: mocks.request }),
    isAxiosError: (value: unknown) =>
      Boolean(value && typeof value === 'object' && 'isAxiosError' in value),
  },
}))
const id = '11111111-1111-4111-8111-111111111111'
const auth = {
  getSnapshot: () =>
    ({ epoch: 1, sessionId: id, status: 'signed-in', accessToken: 'test-only' }) as never,
  refresh: vi.fn<() => Promise<void>>(),
}
const project = {
  scnid: 1,
  slug: null,
  approvedVersionId: id,
  title: 'Published',
  description: 'Visible',
  website: '',
  social: {},
  sponsor: {},
  detail: emptyDocument(),
  fileIds: [],
  downloadLinks: [],
}
beforeEach(() => vi.resetAllMocks())
test('public browsing uses scnid, pagination and search without access headers', async () => {
  mocks.request.mockResolvedValueOnce({ data: { items: [project], page: 2, limit: 12 } })
  expect((await apiWorkshopList(2, 'hello')).items).toEqual([project])
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      url: '/workshop/projects',
      headers: {},
      params: { page: '2', limit: '12', query: 'hello' },
    }),
  )
  mocks.request.mockResolvedValueOnce({ data: project })
  expect(await apiWorkshopDetail(1)).toEqual(project)
})
test('draft edits send only canonical input and optimistic content revision', async () => {
  const input = {
    title: 'Draft',
    description: '',
    website: '',
    social: {},
    sponsor: {},
    detail: emptyDocument(),
    fileIds: [],
    downloadLinks: [],
  }
  mocks.request.mockResolvedValue({ data: { scnid: 1, contentRevision: 2 } })
  await apiWorkshopCreate(auth, input)
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ method: 'POST', data: input }),
  )
  await apiWorkshopUpdate(auth, 1, 1, input)
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ method: 'PATCH', data: { ...input, expectedRevision: 1 } }),
  )
})
test('creator redemption never replays a write and does not send role or user identifiers', async () => {
  mocks.request.mockResolvedValueOnce({ data: { userId: id, state: 'NONE', source: null } })
  expect((await apiCreatorState(auth)).state).toBe('NONE')
  mocks.request.mockRejectedValueOnce({ isAxiosError: true, response: { status: 409 } })
  await expect(apiCreatorRedeem(auth, 'invite_code')).rejects.toMatchObject({ kind: 'conflict' })
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      method: 'POST',
      url: '/workshop/creator/redeem',
      data: { code: 'invite_code' },
    }),
  )
  expect(auth.refresh).not.toHaveBeenCalled()
  expect(mocks.request).toHaveBeenCalledTimes(2)
})
test.each(['1.0', 'v1.0.0', '1.02.0', ' 1.0.0', '1.0.0-01', 'latest'])(
  'rejects noncanonical semver %s before creating a version',
  async (version) => {
    expect(isStrictSemver(version)).toBe(false)
    expect(() => apiWorkshopCreateVersion(auth, 1, { version }, emptyDocument())).toThrow(
      'badRequest',
    )
    expect(mocks.request).not.toHaveBeenCalled()
  },
)
test.each(['1.0.0', '0.1.0-beta.1', '1.2.3+build.7'])('accepts SemVer %s', (version) => {
  expect(isStrictSemver(version)).toBe(true)
})
test.each([404, 409, 403, 429, 503])('preserves workflow errors for status %s', async (status) => {
  mocks.request.mockRejectedValueOnce({ isAxiosError: true, response: { status } })
  const kind = (
    {
      404: 'notFound',
      409: 'conflict',
      403: 'forbidden',
      429: 'rateLimited',
      503: 'unavailable',
    } as Record<number, string>
  )[status]
  await expect(apiWorkshopDetail(1)).rejects.toMatchObject({ kind })
})

test('reads independent package and total storage limits including usage above the lowered limit', async () => {
  const quota = {
    userId: id,
    maxProjects: 12,
    maxPackageBytes: 0,
    maxStorageBytes: 0,
    usedStorageBytes: 5000000000,
  }
  mocks.request.mockResolvedValueOnce({ data: quota })
  expect(await apiCreatorQuota(auth)).toEqual(quota)
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      url: '/workshop/creator/quota',
      method: 'GET',
      headers: { Authorization: 'Bearer test-only' },
    }),
  )
})
test.each([0, -1, 1.5, '5', null, 2147483648])('rejects invalid quota limit %s', async (limit) => {
  mocks.request.mockResolvedValue({
    data: {
      userId: id,
      maxProjects: limit,
      maxPackageBytes: 300000000,
      maxStorageBytes: 5000000000,
      usedStorageBytes: 0,
    },
  })
  await expect(apiCreatorQuota(auth)).rejects.toMatchObject({ kind: 'invalidResponse' })
})

test.each(['maxPackageBytes', 'maxStorageBytes', 'usedStorageBytes'])(
  'validates the numeric boundaries of %s',
  async (field) => {
    for (const invalid of [-1, 0.1, '0', null, undefined, Number.MAX_SAFE_INTEGER + 1]) {
      mocks.request.mockResolvedValueOnce({
        data: {
          userId: id,
          maxProjects: 5,
          maxPackageBytes: 0,
          maxStorageBytes: Number.MAX_SAFE_INTEGER,
          usedStorageBytes: 5000000000,
          [field]: invalid,
        },
      })
      await expect(apiCreatorQuota(auth)).rejects.toMatchObject({ kind: 'invalidResponse' })
    }
  },
)
test('allows total storage above Int32 and rejects packages above Int32', async () => {
  const quota = {
    userId: id,
    maxProjects: 5,
    maxPackageBytes: 2147483647,
    maxStorageBytes: Number.MAX_SAFE_INTEGER,
    usedStorageBytes: 5000000000,
  }
  mocks.request.mockResolvedValueOnce({ data: quota })
  expect(await apiCreatorQuota(auth)).toEqual(quota)
  mocks.request.mockResolvedValueOnce({ data: { ...quota, maxPackageBytes: 2147483648 } })
  await expect(apiCreatorQuota(auth)).rejects.toMatchObject({ kind: 'invalidResponse' })
})
test('supports published external-only projects and sends draft links with revision', async () => {
  const downloadLinks = [
    { url: 'https://download.example.test/file.zip', description: '<b>Plain text</b>' },
  ]
  mocks.request.mockResolvedValueOnce({
    data: { ...project, approvedVersionId: null, downloadLinks },
  })
  expect(await apiWorkshopDetail(1)).toEqual({ ...project, approvedVersionId: null, downloadLinks })
  mocks.request.mockResolvedValue({ data: { scnid: 1, contentRevision: 2 } })
  const { scnid: _id, slug: _slug, approvedVersionId: _version, ...input } = project
  await apiWorkshopCreate(auth, { ...input, downloadLinks })
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ data: { ...input, downloadLinks } }),
  )
  await apiWorkshopUpdate(auth, 1, 1, { ...input, downloadLinks: [] })
  expect(mocks.request).toHaveBeenLastCalledWith(
    expect.objectContaining({ data: { ...input, downloadLinks: [], expectedRevision: 1 } }),
  )
})
test.each([
  null,
  [{ url: 'http://example.test', description: '' }],
  [{ url: 'https://user:password@example.test', description: '' }],
  [{ url: 'https://example.test/has space', description: '' }],
  [{ url: 'https:example.test', description: '' }],
  [{ url: 'https:///example.test', description: '' }],
  [{ url: 'https://@example.test', description: '' }],
  [{ url: 'https://example.test/a\\b', description: '' }],
  [{ url: 'https://example.test/a\u0000b', description: '' }],
  [{ url: 'https://example.test', description: 'a'.repeat(501) }],
  [{ url: 'https://example.test' }],
  [{ url: 'https://example.test', description: '', token: 'unexpected' }],
  Array.from({ length: 4 }, () => ({ url: 'https://example.test', description: '' })),
])('rejects malformed public download links %#', async (downloadLinks) => {
  mocks.request.mockResolvedValueOnce({ data: { ...project, downloadLinks } })
  await expect(apiWorkshopDetail(1)).rejects.toMatchObject({ kind: 'invalidResponse' })
})
