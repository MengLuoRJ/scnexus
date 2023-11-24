import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { useAxios, type EasyUseAxiosReturn } from '@vueuse/integrations/useAxios'
import { useCookies } from '@vueuse/integrations/useCookies'

export const setAuthorizationHeader = () => {
  const token = useCookies().get(import.meta.env.VITE_COOKIE_NAME)
  if (token) {
    return {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  } else {
    return undefined
  }
}

export const setAuthorization = () => {
  const token = useCookies().get(import.meta.env.VITE_COOKIE_NAME)
  if (token) {
    return {
      Authorization: `Bearer ${token}`
    }
  } else {
    return undefined
  }
}

export const axiosInstance = axios.create({
  baseURL: import.meta.env.PROD
    ? import.meta.env.VITE_PA_API_BASE_URL
    : import.meta.env.VITE_PA_API_BASE_URL_DEV,
  withCredentials: true
})

export function useRequest(...args: Parameters<typeof useAxios>): ReturnType<typeof useAxios> {
  return useAxios(...args)
}

export function useGet(
  url: string,
  config?: AxiosRequestConfig<any> | undefined
): Promise<EasyUseAxiosReturn<any, AxiosResponse<any, any>, any>> {
  const { execute } = useAxios(
    {
      method: 'GET'
    },
    axiosInstance
  )
  return execute(url, config)
}

export function usePost(
  url: string,
  config?: AxiosRequestConfig<any> | undefined
): Promise<EasyUseAxiosReturn<any, AxiosResponse<any, any>, any>> {
  const { execute } = useAxios(
    {
      method: 'POST'
    },
    axiosInstance
  )
  return execute(url, config)
}

export function usePatch(
  url: string,
  config?: AxiosRequestConfig<any> | undefined
): Promise<EasyUseAxiosReturn<any, AxiosResponse<any, any>, any>> {
  const { execute } = useAxios(
    {
      method: 'PATCH'
    },
    axiosInstance
  )
  return execute(url, config)
}

export function usePut(
  url: string,
  config?: AxiosRequestConfig<any> | undefined
): Promise<EasyUseAxiosReturn<any, AxiosResponse<any, any>, any>> {
  const { execute } = useAxios(
    {
      method: 'PUT'
    },
    axiosInstance
  )
  return execute(url, config)
}

export function useDelete(
  url: string,
  config?: AxiosRequestConfig<any> | undefined
): Promise<EasyUseAxiosReturn<any, AxiosResponse<any, any>, any>> {
  const { execute } = useAxios(
    {
      method: 'DELETE'
    },
    axiosInstance
  )
  return execute(url, config)
}
