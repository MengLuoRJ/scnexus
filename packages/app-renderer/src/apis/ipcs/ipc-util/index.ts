import { useDiscreteApi } from '@/composables/useDiscreteApi'
import { tryOnScopeDispose } from '@vueuse/core'

export const useIpcApi = async <T = any>(
  apiName: string,
  request: IpcApiRequest,
): Promise<{ data: T | undefined; error?: string }> => {
  const { data, error } = await request
  if (error) {
    const { message } = useDiscreteApi(['message'])
    message.warning('后台错误：' + apiName + ' error: ' + error)
  }
  return {
    data: (data as T) ?? undefined,
    error: error,
  }
}

export type RendererListener<P1 = any, P2 = any, P3 = any> = (
  event: object,
  arg1: P1,
  arg2?: P2,
  arg3?: P3,
  ...args: any[]
) => void

export const useIpcRendererOn =
  <T = any>(subscribe: (listener: RendererListener<T>) => () => void) =>
  (listener: RendererListener<T>) => {
    const unsubscribe = subscribe(listener)
    tryOnScopeDispose(unsubscribe)
  }
