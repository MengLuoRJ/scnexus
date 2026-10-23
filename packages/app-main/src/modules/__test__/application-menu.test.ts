import { expect, test, vi } from 'vitest'
vi.mock('electron', () => ({ Menu: {} }))
import { applicationMenuTemplate } from '../app/menu'

test('macOS retains native application/edit/window commands while Windows keeps existing menu behavior', () => {
  expect(applicationMenuTemplate('darwin')?.map((item) => item.role)).toEqual([
    'appMenu',
    'editMenu',
    'viewMenu',
    'windowMenu',
  ])
  expect(applicationMenuTemplate('win32')).toBeNull()
})
