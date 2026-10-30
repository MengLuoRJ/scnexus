export type ReplayComponentName =
  | 'replay.details'
  | 'replay.initData'
  | 'replay.attributes.events'
  | 'replay.game.events'
  | 'replay.message.events'
  | 'replay.tracker.events'
  | 'replay.gamemetadata.json'

export type ReplayComponent = {
  name: ReplayComponentName
  description: string
  required: boolean
  category: 'header' | 'data' | 'events' | 'meta'
}

export const REPLAY_COMPONENTS: ReplayComponent[] = [
  { name: 'replay.details', description: 'Primary replay details', required: true, category: 'header' },
  { name: 'replay.initData', description: 'Player, race, team and map descriptor', required: true, category: 'header' },
  { name: 'replay.attributes.events', description: 'Attribute event stream', required: false, category: 'events' },
  { name: 'replay.game.events', description: 'Game event stream', required: true, category: 'events' },
  { name: 'replay.message.events', description: 'Chat and message events', required: false, category: 'events' },
  { name: 'replay.tracker.events', description: 'Tracker stream used for unit, economy and timeline analysis', required: false, category: 'events' },
  { name: 'replay.gamemetadata.json', description: 'Optional map replay metadata', required: false, category: 'meta' },
]

export const REPLAY_FILE_EXTENSIONS = ['.sc2replay'] as const
