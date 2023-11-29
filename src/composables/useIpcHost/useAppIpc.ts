const ipcRenderer = window.ipcRenderer;


export async function getVersion() {
  return ipcRenderer.invoke("app::get-version");
}

export async function getLocale() {
  return ipcRenderer.invoke("app::get-locale");
}

export async function getSystemLocale() {
  return ipcRenderer.invoke("app::get-system-locale");
}

export async function getLocaleCountryCode() {
  return ipcRenderer.invoke("app::get-locale-country-code");
}

export async function getPreferredSystemLanguages(): Promise<string[]> {
  return ipcRenderer.invoke("app::get-preferred-system-languages");
}
