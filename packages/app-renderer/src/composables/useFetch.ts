import { useUserStore } from "@/stores/user";
import { createFetch } from "@vueuse/core";

export const useFetch = createFetch({
  baseUrl: import.meta.env.PROD
    ? import.meta.env.VITE_API_BASE_URL
    : import.meta.env.VITE_API_BASE_URL_DEV,
  options: {
    async beforeFetch({ options }) {
      const user = useUserStore();
      options.headers = {
        ...options.headers,
        "X-SCNexus-client-id": user.client_id,
        "X-SCNexus-access-token": user.access_token,
      };
      return { options };
    },
  },
  fetchOptions: {
    mode: "cors",
    credentials: "include",
  },
});
