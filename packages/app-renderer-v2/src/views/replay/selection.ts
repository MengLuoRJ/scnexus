import type { ReplayScope } from '@scnexus/app-shared/types/replay.type'

const KEY = 'scnexus.replay.selection'

export function readReplaySelection(): ReplayScope | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!value || typeof value !== 'object') return null
    const scope = value as ReplayScope
    return typeof scope.profileHandle === 'string' &&
      /^\d+-S2-\d+-\d+$/.test(scope.profileHandle) &&
      ['Multiplayer', 'Coop', 'Campaign', 'Challenge'].includes(scope.category)
      ? { profileHandle: scope.profileHandle, category: scope.category }
      : null
  } catch {
    return null
  }
}

export function saveReplaySelection(scope: ReplayScope): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(scope))
  } catch {
    // Selection still works if renderer storage is unavailable or full.
  }
}
