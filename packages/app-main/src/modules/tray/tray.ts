import { app, Menu, Tray, nativeImage } from 'electron'
import type { MenuItem } from 'electron'
import { join } from 'node:path'
import { Logger } from '@/modules/logging'

let tray: Tray | undefined = undefined

let contextMenu: Menu | undefined = undefined

export function initTray() {
  if (tray) return tray

  const iconPath = join(
    app.getAppPath(),
    'packages',
    'app-renderer-v2',
    app.isPackaged ? 'dist' : 'public',
    'application_icon.png',
  )
  const trayIcon = nativeImage.createFromPath(iconPath)
  if (trayIcon.isEmpty()) {
    Logger.warn('Tray icon is missing or unreadable', iconPath)
    return
  }
  try {
    tray = new Tray(trayIcon)
  } catch (error) {
    Logger.warn('Failed to create tray', error)
    return
  }

  // contextMenu = new Menu();

  contextMenu = Menu.buildFromTemplate([
    { id: 'scnexus', label: 'SCNexus', type: 'normal' },
    { id: 'sp1', label: 'separator1', type: 'separator' },
    {
      id: 'starter-scii-client',
      label: '启动《星际争霸II》',
      type: 'normal',
      enabled: false,
    },
    {
      id: 'starter-scii-editor',
      label: '启动《星际争霸II》编辑器',
      type: 'normal',
      enabled: false,
    },
    { id: 'sp2', label: 'separator2', type: 'separator' },
    { id: 'sp3', label: 'separator3', type: 'separator' },
    { id: 'quit', label: '退出', type: 'normal', role: 'quit' },
  ])

  tray.setContextMenu(contextMenu)

  tray.setToolTip('SCNexus')
  tray.setTitle('SCNexus')

  return tray
}

export function destroyTray() {
  if (!tray) return
  tray.destroy()
  tray = undefined
}

function updateTrayMenu() {
  if (!tray || !contextMenu) return
  tray.setContextMenu(contextMenu)
}

function getTrayMenuItem(id: string): MenuItem | null {
  if (!contextMenu) return null
  return contextMenu.getMenuItemById(id)
}

export function setTrayMenuItemEnabled(id: string, enabled: boolean) {
  const menuItem = getTrayMenuItem(id)
  if (menuItem) {
    menuItem.enabled = enabled
    updateTrayMenu()
  }
}

export function setTrayTitle(title: string) {
  tray?.setTitle(title)
}

export function setTrayToolTip(toolTip: string) {
  tray?.setToolTip(toolTip)
}
