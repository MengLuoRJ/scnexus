import axios, { AxiosRequestConfig } from "axios";
import { useAxios } from "@vueuse/integrations/useAxios";
import { useUserStore } from "@/stores/user";

export const setAuthorizationHeader = () => {
  const user = useUserStore();
  return {
    "X-SCNexus-client-id": user.client_id,
    "X-SCNexus-access-token": user.access_token,
  };
};

export const axiosInstance = axios.create({
  baseURL: import.meta.env.PROD
    ? import.meta.env.VITE_API_BASE_URL
    : import.meta.env.VITE_API_BASE_URL_DEV,
  withCredentials: true,
});

export function useRequest(
  ...args: Parameters<typeof useAxios>
): ReturnType<typeof useAxios> {
  return useAxios({
    ...args,
    headers: {
      ...setAuthorizationHeader(),
    },
  });
}

export function useGet(
  url: string,
  config?: AxiosRequestConfig<any> | undefined
) {
  const { execute } = useAxios(
    {
      method: "GET",
      headers: {
        ...setAuthorizationHeader(),
      },
    },
    axiosInstance
  );
  return execute(url, config);
}

export function usePost(
  url: string,
  config?: AxiosRequestConfig<any> | undefined
) {
  const { execute } = useAxios(
    {
      method: "POST",
      headers: {
        ...setAuthorizationHeader(),
      },
    },
    axiosInstance
  );
  return execute(url, config);
}

export function usePatch(
  url: string,
  config?: AxiosRequestConfig<any> | undefined
) {
  const { execute } = useAxios(
    {
      method: "PATCH",
      headers: {
        ...setAuthorizationHeader(),
      },
    },
    axiosInstance
  );
  return execute(url, config);
}

export function usePut(
  url: string,
  config?: AxiosRequestConfig<any> | undefined
) {
  const { execute } = useAxios(
    {
      method: "PUT",
      headers: {
        ...setAuthorizationHeader(),
      },
    },
    axiosInstance
  );
  return execute(url, config);
}

export function useDelete(
  url: string,
  config?: AxiosRequestConfig<any> | undefined
) {
  const { execute } = useAxios(
    {
      method: "DELETE",
      headers: {
        ...setAuthorizationHeader(),
      },
    },
    axiosInstance
  );
  return execute(url, config);
}
