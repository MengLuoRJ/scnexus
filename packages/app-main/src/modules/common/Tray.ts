import { Menu, MenuItem, Tray, nativeImage } from "electron";
import { join } from "node:path";

let tray: Tray | undefined = undefined;

let contextMenu: Menu | undefined = undefined;

export function initTray() {
  if (tray) return tray;

  const trayIcon = nativeImage.createFromPath(
    join(process.env.PUBLIC, "application_icon.png")
  );

  tray = new Tray(trayIcon);

  // contextMenu = new Menu();

  contextMenu = Menu.buildFromTemplate([
    { id: "scnexus", label: "SCNexus", type: "normal" },
    { id: "sp1", label: "separator1", type: "separator" },
    {
      id: "starter-scii-client",
      label: "启动《星际争霸II》",
      type: "normal",
      enabled: false,
    },
    {
      id: "starter-scii-editor",
      label: "启动《星际争霸II》编辑器",
      type: "normal",
      enabled: false,
    },
    { id: "sp2", label: "separator2", type: "separator" },
    { id: "sp3", label: "separator3", type: "separator" },
    { id: "quit", label: "退出", type: "normal", role: "quit" },
  ]);

  tray.setContextMenu(contextMenu);

  tray.setToolTip("SCNexus");
  tray.setTitle("SCNexus");

  return tray;
}

export function destroyTray() {
  if (!tray) return;
  tray.destroy();
  tray = undefined;
}

function updateTrayMenu() {
  if (!tray || !contextMenu) return;
  tray.setContextMenu(contextMenu);
}

function getTrayMenuItem(id: string): MenuItem | null {
  if (!contextMenu) return null;
  return contextMenu.getMenuItemById(id);
}

export function setTrayMenuItemEnabled(id: string, enabled: boolean) {
  const menuItem = getTrayMenuItem(id);
  if (menuItem) {
    menuItem.enabled = enabled;
    updateTrayMenu();
  }
}

export function setTrayTitle(title: string) {
  tray?.setTitle(title);
}

export function setTrayToolTip(toolTip: string) {
  tray?.setToolTip(toolTip);
}
