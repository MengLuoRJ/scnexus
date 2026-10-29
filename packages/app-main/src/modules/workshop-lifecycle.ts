let apply: ((enabled: boolean) => void) | undefined
let enabled = true
// This is the effective official-services + workshop networking gate, not download lifecycle.
export function setWorkshopEnabled(value: boolean) {
  enabled = value
  apply?.(value)
}
export function onWorkshopEnabled(listener?: (enabled: boolean) => void) {
  apply = listener
  listener?.(enabled)
}

let authenticationChanged: (() => void) | undefined
export function onWorkshopAuthenticationChanged(listener?: () => void) {
  authenticationChanged = listener
}
export function notifyWorkshopAuthenticationChanged() {
  authenticationChanged?.()
}
