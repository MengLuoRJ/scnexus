import { _api } from '@iconify/vue'

export function disableIconRequests() {
  // Missing local icons must never fall back to Iconify's remote providers.
  _api.setFetch(async () => new Response(null, { status: 404 }))
}
