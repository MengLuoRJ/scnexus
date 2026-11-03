/** Standard LotV timing data. */
export type ProductionDuration = {
  loops: number
  race: string | null
  type: string
  morph: boolean
  from: string[]
}
export const DURATIONS: Record<string, ProductionDuration> = {
  Adept: {
    loops: 739.1999999999999,
    race: 'P',
    type: 'Unit',
    morph: false,
    from: ['Gateway', 'WarpGate'],
  },
  Baneling: { loops: 313.59999999999997, race: 'Z', type: 'Unit', morph: true, from: [] },
  BroodLord: { loops: 537.5999999999999, race: 'Z', type: 'Unit', morph: true, from: [] },
  Carrier: { loops: 1433.6, race: 'P', type: 'Unit', morph: false, from: ['Stargate'] },
  Drone: { loops: 268.79999999999995, race: 'Z', type: 'Unit', morph: false, from: [] },
  GreaterSpire: {
    loops: 1590.3999999999999,
    race: 'Z',
    type: 'Building',
    morph: true,
    from: ['Spire'],
  },
  Hive: { loops: 1590.3999999999999, race: 'Z', type: 'Building', morph: true, from: ['Lair'] },
  Hydralisk: { loops: 537.5999999999999, race: 'Z', type: 'Unit', morph: false, from: [] },
  Immortal: {
    loops: 873.5999999999999,
    race: 'P',
    type: 'Unit',
    morph: false,
    from: ['RoboticsFacility'],
  },
  Lair: { loops: 1276.8, race: 'Z', type: 'Building', morph: true, from: ['Hatchery'] },
  Marauder: { loops: 470.4, race: 'T', type: 'Unit', morph: false, from: ['Barracks'] },
  Marine: { loops: 403.2, race: 'T', type: 'Unit', morph: false, from: ['Barracks'] },
  Medivac: { loops: 672, race: 'T', type: 'Unit', morph: false, from: ['Starport'] },
  Observer: { loops: 403.2, race: 'P', type: 'Unit', morph: false, from: ['RoboticsFacility'] },
  Oracle: { loops: 828.8, race: 'P', type: 'Unit', morph: false, from: ['Stargate'] },
  OrbitalCommand: { loops: 560, race: 'T', type: 'Building', morph: true, from: ['CommandCenter'] },
  Overlord: { loops: 403.2, race: 'Z', type: 'Unit', morph: false, from: [] },
  Phoenix: { loops: 560, race: 'P', type: 'Unit', morph: false, from: ['Stargate'] },
  PlanetaryFortress: {
    loops: 806.4,
    race: 'T',
    type: 'Building',
    morph: true,
    from: ['CommandCenter'],
  },
  Probe: { loops: 268.79999999999995, race: 'P', type: 'Unit', morph: false, from: ['Nexus'] },
  Queen: {
    loops: 806.4,
    race: 'Z',
    type: 'Unit',
    morph: false,
    from: ['Hatchery', 'Lair', 'Hive'],
  },
  Reaper: { loops: 761.5999999999999, race: 'T', type: 'Unit', morph: false, from: ['Barracks'] },
  Roach: { loops: 425.59999999999997, race: 'Z', type: 'Unit', morph: false, from: [] },
  SCV: {
    loops: 268.79999999999995,
    race: 'T',
    type: 'Unit',
    morph: false,
    from: ['CommandCenter', 'OrbitalCommand', 'PlanetaryFortress'],
  },
  Sentry: {
    loops: 515.1999999999999,
    race: 'P',
    type: 'Unit',
    morph: false,
    from: ['Gateway', 'WarpGate'],
  },
  SiegeTank: { loops: 716.8, race: 'T', type: 'Unit', morph: false, from: ['Factory'] },
  Stalker: { loops: 604.8, race: 'P', type: 'Unit', morph: false, from: ['Gateway', 'WarpGate'] },
  Stimpack: { loops: 2240, race: 'T', type: 'Upgrade', morph: false, from: ['TechLab'] },
  VoidRay: { loops: 963.1999999999999, race: 'P', type: 'Unit', morph: false, from: ['Stargate'] },
  WarpGateResearch: {
    loops: 2240,
    race: 'P',
    type: 'Upgrade',
    morph: false,
    from: ['CyberneticsCore'],
  },
  Zealot: { loops: 604.8, race: 'P', type: 'Unit', morph: false, from: ['Gateway', 'WarpGate'] },
  Zergling: { loops: 380.79999999999995, race: 'Z', type: 'Unit', morph: false, from: [] },
}
export const DURATION_HISTORY: Record<string, [number, number][]> = {
  Adept: [
    [1548115200, 604.8],
    [1782777600, 672.0],
  ],
  Carrier: [[1542672000, 1926.3999999999999]],
  Observer: [[1711411200, 470.4]],
  Oracle: [[1513555200, 963.1999999999999]],
  Reaper: [[1782777600, 716.8]],
  Sentry: [[1674432000, 582.4]],
  Stalker: [[1732492800, 672.0]],
  Stimpack: [[1566345600, 2710.3999999999996]],
  VoidRay: [
    [1596672000, 963.1999999999999],
    [1647302400, 828.8],
  ],
  WarpGateResearch: [[1548115200, 2553.6]],
}
/** Exact public-sample builds, not an open-ended datapack compatibility claim. */
export const SUPPORTED_BUILDS = new Set([95841, 96163, 96314, 96516])
export function chronoAbility(build: number): number | null {
  if (!SUPPORTED_BUILDS.has(build)) return null
  return 723
}
