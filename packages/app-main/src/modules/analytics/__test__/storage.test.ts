import { afterEach, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createAnalyticsStorage } from '../storage'
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
test('visitor persists independently and is reused without temporary artifacts', () => {
  const root = mkdtempSync(join(process.cwd(), '.analytics-storage-'))
  roots.push(root)
  const store = createAnalyticsStorage(root)
  expect(store.load()).toBeNull()
  const value = { visitorToken: 'signed-installation-token', expiresAt: '2030-01-01T00:00:00Z' }
  store.save(value)
  expect(createAnalyticsStorage(root).load()).toEqual(value)
  expect(readdirSync(root)).toEqual(['analytics-visitor.json'])
})
test('malformed credential fails closed rather than creating a new visitor identity', () => {
  const root = mkdtempSync(join(process.cwd(), '.analytics-storage-'))
  roots.push(root)
  writeFileSync(join(root, 'analytics-visitor.json'), '{broken')
  expect(() => createAnalyticsStorage(root).load()).toThrow('Analytics storage unavailable')
})
