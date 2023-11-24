

export async function showOpenDialogSync(options: any) {
  const dialog = await window.ipcRenderer.invoke(
    "dialog::show-open-dialog-sync",
    options
  );
  return dialog;
}
