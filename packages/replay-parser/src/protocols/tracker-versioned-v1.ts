// Stable Versioned tracker field tags, not a build compatibility claim.
// Derived from Blizzard s2protocol protocol98310.py (MIT; see LICENSE.s2protocol).
import type { TrackerProtocolSchema } from '../protocol-schema.js'

export default {
  delta: 7,
  eventId: 2,
  events: {
    '0': [197, 'NNet.Replay.Tracker.SPlayerStatsEvent'],
    '1': [199, 'NNet.Replay.Tracker.SUnitBornEvent'],
    '2': [200, 'NNet.Replay.Tracker.SUnitDiedEvent'],
    '3': [201, 'NNet.Replay.Tracker.SUnitOwnerChangeEvent'],
    '4': [202, 'NNet.Replay.Tracker.SUnitTypeChangeEvent'],
    '5': [203, 'NNet.Replay.Tracker.SUpgradeEvent'],
    '6': [204, 'NNet.Replay.Tracker.SUnitInitEvent'],
    '7': [205, 'NNet.Replay.Tracker.SUnitDoneEvent'],
    '8': [207, 'NNet.Replay.Tracker.SUnitPositionsEvent'],
    '9': [208, 'NNet.Replay.Tracker.SPlayerSetupEvent'],
  },
  types: {
    '1': ['_int', [[0, 4]]],
    '2': ['_int', [[0, 5]]],
    '3': ['_int', [[0, 6]]],
    '4': ['_int', [[0, 14]]],
    '5': ['_int', [[0, 22]]],
    '6': ['_int', [[0, 32]]],
    '7': [
      '_choice',
      [
        [0, 2],
        {
          '0': ['m_uint6', 3],
          '1': ['m_uint14', 4],
          '2': ['m_uint22', 5],
          '3': ['m_uint32', 6],
        },
      ],
    ],
    '10': ['_int', [[0, 8]]],
    '29': ['_blob', [[0, 10]]],
    '43': ['_optional', [6]],
    '47': ['_int', [[-2147483648, 32]]],
    '60': ['_optional', [1]],
    '196': [
      '_struct',
      [
        [
          ['m_scoreValueMineralsCurrent', 47, 0],
          ['m_scoreValueVespeneCurrent', 47, 1],
          ['m_scoreValueMineralsCollectionRate', 47, 2],
          ['m_scoreValueVespeneCollectionRate', 47, 3],
          ['m_scoreValueWorkersActiveCount', 47, 4],
          ['m_scoreValueMineralsUsedInProgressArmy', 47, 5],
          ['m_scoreValueMineralsUsedInProgressEconomy', 47, 6],
          ['m_scoreValueMineralsUsedInProgressTechnology', 47, 7],
          ['m_scoreValueVespeneUsedInProgressArmy', 47, 8],
          ['m_scoreValueVespeneUsedInProgressEconomy', 47, 9],
          ['m_scoreValueVespeneUsedInProgressTechnology', 47, 10],
          ['m_scoreValueMineralsUsedCurrentArmy', 47, 11],
          ['m_scoreValueMineralsUsedCurrentEconomy', 47, 12],
          ['m_scoreValueMineralsUsedCurrentTechnology', 47, 13],
          ['m_scoreValueVespeneUsedCurrentArmy', 47, 14],
          ['m_scoreValueVespeneUsedCurrentEconomy', 47, 15],
          ['m_scoreValueVespeneUsedCurrentTechnology', 47, 16],
          ['m_scoreValueMineralsLostArmy', 47, 17],
          ['m_scoreValueMineralsLostEconomy', 47, 18],
          ['m_scoreValueMineralsLostTechnology', 47, 19],
          ['m_scoreValueVespeneLostArmy', 47, 20],
          ['m_scoreValueVespeneLostEconomy', 47, 21],
          ['m_scoreValueVespeneLostTechnology', 47, 22],
          ['m_scoreValueMineralsKilledArmy', 47, 23],
          ['m_scoreValueMineralsKilledEconomy', 47, 24],
          ['m_scoreValueMineralsKilledTechnology', 47, 25],
          ['m_scoreValueVespeneKilledArmy', 47, 26],
          ['m_scoreValueVespeneKilledEconomy', 47, 27],
          ['m_scoreValueVespeneKilledTechnology', 47, 28],
          ['m_scoreValueFoodUsed', 47, 29],
          ['m_scoreValueFoodMade', 47, 30],
          ['m_scoreValueMineralsUsedActiveForces', 47, 31],
          ['m_scoreValueVespeneUsedActiveForces', 47, 32],
          ['m_scoreValueMineralsFriendlyFireArmy', 47, 33],
          ['m_scoreValueMineralsFriendlyFireEconomy', 47, 34],
          ['m_scoreValueMineralsFriendlyFireTechnology', 47, 35],
          ['m_scoreValueVespeneFriendlyFireArmy', 47, 36],
          ['m_scoreValueVespeneFriendlyFireEconomy', 47, 37],
          ['m_scoreValueVespeneFriendlyFireTechnology', 47, 38],
        ],
      ],
    ],
    '197': [
      '_struct',
      [
        [
          ['m_playerId', 1, 0],
          ['m_stats', 196, 1],
        ],
      ],
    ],
    '198': ['_optional', [29]],
    '199': [
      '_struct',
      [
        [
          ['m_unitTagIndex', 6, 0],
          ['m_unitTagRecycle', 6, 1],
          ['m_unitTypeName', 29, 2],
          ['m_controlPlayerId', 1, 3],
          ['m_upkeepPlayerId', 1, 4],
          ['m_x', 10, 5],
          ['m_y', 10, 6],
          ['m_creatorUnitTagIndex', 43, 7],
          ['m_creatorUnitTagRecycle', 43, 8],
          ['m_creatorAbilityName', 198, 9],
        ],
      ],
    ],
    '200': [
      '_struct',
      [
        [
          ['m_unitTagIndex', 6, 0],
          ['m_unitTagRecycle', 6, 1],
          ['m_killerPlayerId', 60, 2],
          ['m_x', 10, 3],
          ['m_y', 10, 4],
          ['m_killerUnitTagIndex', 43, 5],
          ['m_killerUnitTagRecycle', 43, 6],
        ],
      ],
    ],
    '201': [
      '_struct',
      [
        [
          ['m_unitTagIndex', 6, 0],
          ['m_unitTagRecycle', 6, 1],
          ['m_controlPlayerId', 1, 2],
          ['m_upkeepPlayerId', 1, 3],
        ],
      ],
    ],
    '202': [
      '_struct',
      [
        [
          ['m_unitTagIndex', 6, 0],
          ['m_unitTagRecycle', 6, 1],
          ['m_unitTypeName', 29, 2],
        ],
      ],
    ],
    '203': [
      '_struct',
      [
        [
          ['m_playerId', 1, 0],
          ['m_upgradeTypeName', 29, 1],
          ['m_count', 47, 2],
        ],
      ],
    ],
    '204': [
      '_struct',
      [
        [
          ['m_unitTagIndex', 6, 0],
          ['m_unitTagRecycle', 6, 1],
          ['m_unitTypeName', 29, 2],
          ['m_controlPlayerId', 1, 3],
          ['m_upkeepPlayerId', 1, 4],
          ['m_x', 10, 5],
          ['m_y', 10, 6],
        ],
      ],
    ],
    '205': [
      '_struct',
      [
        [
          ['m_unitTagIndex', 6, 0],
          ['m_unitTagRecycle', 6, 1],
        ],
      ],
    ],
    '206': ['_array', [[0, 10], 47]],
    '207': [
      '_struct',
      [
        [
          ['m_firstUnitIndex', 6, 0],
          ['m_items', 206, 1],
        ],
      ],
    ],
    '208': [
      '_struct',
      [
        [
          ['m_playerId', 1, 0],
          ['m_type', 6, 1],
          ['m_userId', 43, 2],
          ['m_slotId', 43, 3],
        ],
      ],
    ],
  },
} satisfies TrackerProtocolSchema
