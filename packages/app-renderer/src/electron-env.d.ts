export {};
declare global {
  interface Window {
    ipcRenderer: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      on: (channel: string, listener: (event: object, ...args: any[]) => void) => () => void;
    };
    webUtils: import("electron").WebUtils;
  }
}
