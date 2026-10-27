import { initWorkshopIpc } from './workshop.ipc'
import { createWorkshopService, type WorkshopDependencies } from './service'
export { createWorkshopService, trustedOrigin } from './service'
export type { WorkshopDependencies, WorkshopService } from './service'

export async function initWorkshopModule(deps: WorkshopDependencies) {
  const service = await createWorkshopService(deps)
  const cleanup = initWorkshopIpc(service)
  return {
    ...service,
    async dispose() {
      cleanup()
      await service.dispose()
    },
  }
}
