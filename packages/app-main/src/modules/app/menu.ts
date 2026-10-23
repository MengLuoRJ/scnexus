import { Menu, type MenuItemConstructorOptions } from 'electron'

export function applicationMenuTemplate(
  platform = process.platform,
): MenuItemConstructorOptions[] | null {
  if (platform !== 'darwin') return null
  return [{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]
}
export function initializeApplicationMenu() {
  const template = applicationMenuTemplate()
  Menu.setApplicationMenu(template ? Menu.buildFromTemplate(template) : null)
}
