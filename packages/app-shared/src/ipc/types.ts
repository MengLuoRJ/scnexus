export type ApiResult<T = unknown> = { data?: T; error?: string };
export type ApiInvoke = (channel: string, ...args: any[]) => Promise<ApiResult>;
export type ApiListener = (event: object, ...args: any[]) => void;
export type ApiSubscribe = (
  channel: string,
  listener: ApiListener,
) => () => void;
