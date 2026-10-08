import { desktop, request } from "./internal/ipc-common";

export const apiGameSettingGet = () => request(() => desktop().gameSetting.get());
export const apiGameSettingInitialize = (path?: string) =>
  request(() => desktop().gameSetting.initialize(path));
export const apiGameSettingConfigure = (path: string) =>
  request(() => desktop().gameSetting.configure(path));
export const apiGameSettingRefresh = () => request(() => desktop().gameSetting.refresh());
