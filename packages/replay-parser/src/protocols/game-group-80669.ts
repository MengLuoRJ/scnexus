// Derived from Blizzard s2protocol 901804e41283269d43d7bfc3b8dc5be2a9dd350a.
// MIT; see LICENSE.s2protocol. Do not edit.
import type { GameProtocolSchema } from '../protocol-schema.js'

export default {
  delta: 4,
  userId: 6,
  eventId: 7,
  events: {
    '5': [8, 'NNet.Game.SUserFinishedLoadingSyncEvent'],
    '7': [11, 'NNet.Game.SUserOptionsEvent'],
    '9': [13, 'NNet.Game.SBankFileEvent'],
    '10': [15, 'NNet.Game.SBankSectionEvent'],
    '11': [16, 'NNet.Game.SBankKeyEvent'],
    '12': [18, 'NNet.Game.SBankValueEvent'],
    '13': [21, 'NNet.Game.SBankSignatureEvent'],
    '14': [25, 'NNet.Game.SCameraSaveEvent'],
    '21': [29, 'NNet.Game.SSaveGameEvent'],
    '22': [8, 'NNet.Game.SSaveGameDoneEvent'],
    '23': [8, 'NNet.Game.SLoadGameDoneEvent'],
    '25': [30, 'NNet.Game.SCommandManagerResetEvent'],
    '26': [34, 'NNet.Game.SGameCheatEvent'],
    '27': [48, 'NNet.Game.SCmdEvent'],
    '28': [57, 'NNet.Game.SSelectionDeltaEvent'],
    '29': [58, 'NNet.Game.SControlGroupUpdateEvent'],
    '30': [60, 'NNet.Game.SSelectionSyncCheckEvent'],
    '31': [62, 'NNet.Game.SResourceTradeEvent'],
    '32': [63, 'NNet.Game.STriggerChatMessageEvent'],
    '33': [66, 'NNet.Game.SAICommunicateEvent'],
    '34': [67, 'NNet.Game.SSetAbsoluteGameSpeedEvent'],
    '35': [68, 'NNet.Game.SAddAbsoluteGameSpeedEvent'],
    '36': [69, 'NNet.Game.STriggerPingEvent'],
    '37': [70, 'NNet.Game.SBroadcastCheatEvent'],
    '38': [71, 'NNet.Game.SAllianceEvent'],
    '39': [72, 'NNet.Game.SUnitClickEvent'],
    '40': [73, 'NNet.Game.SUnitHighlightEvent'],
    '41': [74, 'NNet.Game.STriggerReplySelectedEvent'],
    '43': [83, 'NNet.Game.SHijackReplayGameEvent'],
    '44': [8, 'NNet.Game.STriggerSkippedEvent'],
    '45': [84, 'NNet.Game.STriggerSoundLengthQueryEvent'],
    '46': [85, 'NNet.Game.STriggerSoundOffsetEvent'],
    '47': [86, 'NNet.Game.STriggerTransmissionOffsetEvent'],
    '48': [87, 'NNet.Game.STriggerTransmissionCompleteEvent'],
    '49': [91, 'NNet.Game.SCameraUpdateEvent'],
    '50': [8, 'NNet.Game.STriggerAbortMissionEvent'],
    '51': [92, 'NNet.Game.STriggerPurchaseMadeEvent'],
    '52': [8, 'NNet.Game.STriggerPurchaseExitEvent'],
    '53': [93, 'NNet.Game.STriggerPlanetMissionLaunchedEvent'],
    '54': [8, 'NNet.Game.STriggerPlanetPanelCanceledEvent'],
    '55': [95, 'NNet.Game.STriggerDialogControlEvent'],
    '56': [98, 'NNet.Game.STriggerSoundLengthSyncEvent'],
    '57': [99, 'NNet.Game.STriggerConversationSkippedEvent'],
    '58': [102, 'NNet.Game.STriggerMouseClickedEvent'],
    '59': [103, 'NNet.Game.STriggerMouseMovedEvent'],
    '60': [104, 'NNet.Game.SAchievementAwardedEvent'],
    '61': [105, 'NNet.Game.STriggerHotkeyPressedEvent'],
    '62': [106, 'NNet.Game.STriggerTargetModeUpdateEvent'],
    '63': [8, 'NNet.Game.STriggerPlanetPanelReplayEvent'],
    '64': [107, 'NNet.Game.STriggerSoundtrackDoneEvent'],
    '65': [108, 'NNet.Game.STriggerPlanetMissionSelectedEvent'],
    '66': [109, 'NNet.Game.STriggerKeyPressedEvent'],
    '67': [110, 'NNet.Game.STriggerMovieFunctionEvent'],
    '68': [8, 'NNet.Game.STriggerPlanetPanelBirthCompleteEvent'],
    '69': [8, 'NNet.Game.STriggerPlanetPanelDeathCompleteEvent'],
    '70': [111, 'NNet.Game.SResourceRequestEvent'],
    '71': [112, 'NNet.Game.SResourceRequestFulfillEvent'],
    '72': [113, 'NNet.Game.SResourceRequestCancelEvent'],
    '73': [8, 'NNet.Game.STriggerResearchPanelExitEvent'],
    '74': [8, 'NNet.Game.STriggerResearchPanelPurchaseEvent'],
    '75': [114, 'NNet.Game.STriggerResearchPanelSelectionChangedEvent'],
    '76': [115, 'NNet.Game.STriggerCommandErrorEvent'],
    '77': [8, 'NNet.Game.STriggerMercenaryPanelExitEvent'],
    '78': [8, 'NNet.Game.STriggerMercenaryPanelPurchaseEvent'],
    '79': [116, 'NNet.Game.STriggerMercenaryPanelSelectionChangedEvent'],
    '80': [8, 'NNet.Game.STriggerVictoryPanelExitEvent'],
    '81': [8, 'NNet.Game.STriggerBattleReportPanelExitEvent'],
    '82': [117, 'NNet.Game.STriggerBattleReportPanelPlayMissionEvent'],
    '83': [118, 'NNet.Game.STriggerBattleReportPanelPlaySceneEvent'],
    '84': [118, 'NNet.Game.STriggerBattleReportPanelSelectionChangedEvent'],
    '85': [93, 'NNet.Game.STriggerVictoryPanelPlayMissionAgainEvent'],
    '86': [8, 'NNet.Game.STriggerMovieStartedEvent'],
    '87': [8, 'NNet.Game.STriggerMovieFinishedEvent'],
    '88': [119, 'NNet.Game.SDecrementGameTimeRemainingEvent'],
    '89': [120, 'NNet.Game.STriggerPortraitLoadedEvent'],
    '90': [121, 'NNet.Game.STriggerCustomDialogDismissedEvent'],
    '91': [122, 'NNet.Game.STriggerGameMenuItemSelectedEvent'],
    '92': [124, 'NNet.Game.STriggerMouseWheelEvent'],
    '93': [92, 'NNet.Game.STriggerPurchasePanelSelectedPurchaseItemChangedEvent'],
    '94': [125, 'NNet.Game.STriggerPurchasePanelSelectedPurchaseCategoryChangedEvent'],
    '95': [126, 'NNet.Game.STriggerButtonPressedEvent'],
    '96': [8, 'NNet.Game.STriggerGameCreditsFinishedEvent'],
    '97': [127, 'NNet.Game.STriggerCutsceneBookmarkFiredEvent'],
    '98': [128, 'NNet.Game.STriggerCutsceneEndSceneFiredEvent'],
    '99': [129, 'NNet.Game.STriggerCutsceneConversationLineEvent'],
    '100': [130, 'NNet.Game.STriggerCutsceneConversationLineMissingEvent'],
    '101': [131, 'NNet.Game.SGameUserLeaveEvent'],
    '102': [132, 'NNet.Game.SGameUserJoinEvent'],
    '103': [134, 'NNet.Game.SCommandManagerStateEvent'],
    '104': [135, 'NNet.Game.SCmdUpdateTargetPointEvent'],
    '105': [136, 'NNet.Game.SCmdUpdateTargetUnitEvent'],
    '106': [137, 'NNet.Game.STriggerAnimLengthQueryByNameEvent'],
    '107': [138, 'NNet.Game.STriggerAnimLengthQueryByPropsEvent'],
    '108': [139, 'NNet.Game.STriggerAnimOffsetEvent'],
    '109': [140, 'NNet.Game.SCatalogModifyEvent'],
    '110': [141, 'NNet.Game.SHeroTalentTreeSelectedEvent'],
    '111': [8, 'NNet.Game.STriggerProfilerLoggingFinishedEvent'],
    '112': [142, 'NNet.Game.SHeroTalentTreeSelectionPanelToggledEvent'],
    '116': [143, 'NNet.Game.SSetSyncLoadingTimeEvent'],
    '117': [143, 'NNet.Game.SSetSyncPlayingTimeEvent'],
    '118': [143, 'NNet.Game.SPeerSetSyncLoadingTimeEvent'],
    '119': [143, 'NNet.Game.SPeerSetSyncPlayingTimeEvent'],
  },
  types: {
    '0': ['_int', [[0, 6]]],
    '1': ['_int', [[0, 14]]],
    '2': ['_int', [[0, 22]]],
    '3': ['_int', [[0, 32]]],
    '4': [
      '_choice',
      [
        [0, 2],
        {
          '0': ['m_uint6', 0],
          '1': ['m_uint14', 1],
          '2': ['m_uint22', 2],
          '3': ['m_uint32', 3],
        },
      ],
    ],
    '5': ['_int', [[0, 5]]],
    '6': ['_struct', [[['m_userId', 5, -1]]]],
    '7': ['_int', [[0, 7]]],
    '8': ['_struct', [[]]],
    '9': ['_bool', []],
    '10': ['_blob', [[0, 9]]],
    '11': [
      '_struct',
      [
        [
          ['m_gameFullyDownloaded', 9, -19],
          ['m_developmentCheatsEnabled', 9, -18],
          ['m_testCheatsEnabled', 9, -17],
          ['m_multiplayerCheatsEnabled', 9, -16],
          ['m_syncChecksummingEnabled', 9, -15],
          ['m_isMapToMapTransition', 9, -14],
          ['m_debugPauseEnabled', 9, -13],
          ['m_useGalaxyAsserts', 9, -12],
          ['m_platformMac', 9, -11],
          ['m_cameraFollow', 9, -10],
          ['m_baseBuildNum', 3, -9],
          ['m_buildNum', 3, -8],
          ['m_versionFlags', 3, -7],
          ['m_hotkeyProfile', 10, -6],
        ],
      ],
    ],
    '12': ['_blob', [[0, 7]]],
    '13': ['_struct', [[['m_name', 12, -6]]]],
    '14': ['_blob', [[0, 6]]],
    '15': ['_struct', [[['m_name', 14, -6]]]],
    '16': [
      '_struct',
      [
        [
          ['m_name', 14, -8],
          ['m_type', 3, -7],
          ['m_data', 12, -6],
        ],
      ],
    ],
    '17': ['_blob', [[0, 12]]],
    '18': [
      '_struct',
      [
        [
          ['m_type', 3, -8],
          ['m_name', 14, -7],
          ['m_data', 17, -6],
        ],
      ],
    ],
    '19': ['_int', [[0, 8]]],
    '20': ['_array', [[0, 5], 19]],
    '21': [
      '_struct',
      [
        [
          ['m_signature', 20, -7],
          ['m_toonHandle', 12, -6],
        ],
      ],
    ],
    '22': ['_int', [[0, 3]]],
    '23': ['_int', [[0, 16]]],
    '24': [
      '_struct',
      [
        [
          ['x', 23, -2],
          ['y', 23, -1],
        ],
      ],
    ],
    '25': [
      '_struct',
      [
        [
          ['m_which', 22, -7],
          ['m_target', 24, -6],
        ],
      ],
    ],
    '26': ['_blob', [[0, 11]]],
    '27': ['_blob', [[0, 8]]],
    '28': ['_blob', [[0, 10]]],
    '29': [
      '_struct',
      [
        [
          ['m_fileName', 26, -10],
          ['m_automatic', 9, -9],
          ['m_overwrite', 9, -8],
          ['m_name', 27, -7],
          ['m_description', 28, -6],
        ],
      ],
    ],
    '30': ['_struct', [[['m_sequence', 3, -6]]]],
    '31': ['_int', [[-2147483648, 32]]],
    '32': [
      '_struct',
      [
        [
          ['x', 31, -2],
          ['y', 31, -1],
        ],
      ],
    ],
    '33': [
      '_struct',
      [
        [
          ['m_point', 32, -4],
          ['m_time', 31, -3],
          ['m_verb', 28, -2],
          ['m_arguments', 28, -1],
        ],
      ],
    ],
    '34': ['_struct', [[['m_data', 33, -6]]]],
    '35': ['_int', [[0, 27]]],
    '36': ['_optional', [19]],
    '37': [
      '_struct',
      [
        [
          ['m_abilLink', 23, -3],
          ['m_abilCmdIndex', 5, -2],
          ['m_abilCmdData', 36, -1],
        ],
      ],
    ],
    '38': ['_optional', [37]],
    '39': ['_null', []],
    '40': ['_int', [[0, 20]]],
    '41': [
      '_struct',
      [
        [
          ['x', 40, -3],
          ['y', 40, -2],
          ['z', 31, -1],
        ],
      ],
    ],
    '42': ['_int', [[0, 4]]],
    '43': ['_optional', [42]],
    '44': [
      '_struct',
      [
        [
          ['m_targetUnitFlags', 23, -7],
          ['m_timer', 19, -6],
          ['m_tag', 3, -5],
          ['m_snapshotUnitLink', 23, -4],
          ['m_snapshotControlPlayerId', 43, -3],
          ['m_snapshotUpkeepPlayerId', 43, -2],
          ['m_snapshotPoint', 41, -1],
        ],
      ],
    ],
    '45': [
      '_choice',
      [
        [0, 2],
        {
          '0': ['None', 39],
          '1': ['TargetPoint', 41],
          '2': ['TargetUnit', 44],
          '3': ['Data', 3],
        },
      ],
    ],
    '46': ['_int', [[1, 32]]],
    '47': ['_optional', [3]],
    '48': [
      '_struct',
      [
        [
          ['m_cmdFlags', 35, -11],
          ['m_abil', 38, -10],
          ['m_data', 45, -9],
          ['m_sequence', 46, -8],
          ['m_otherUnit', 47, -7],
          ['m_unitGroup', 47, -6],
        ],
      ],
    ],
    '49': ['_int', [[0, 9]]],
    '50': ['_bitarray', [[0, 9]]],
    '51': ['_array', [[0, 9], 49]],
    '52': [
      '_choice',
      [
        [0, 2],
        {
          '0': ['None', 39],
          '1': ['Mask', 50],
          '2': ['OneIndices', 51],
          '3': ['ZeroIndices', 51],
        },
      ],
    ],
    '53': [
      '_struct',
      [
        [
          ['m_unitLink', 23, -4],
          ['m_subgroupPriority', 19, -3],
          ['m_intraSubgroupPriority', 19, -2],
          ['m_count', 49, -1],
        ],
      ],
    ],
    '54': ['_array', [[0, 9], 53]],
    '55': ['_array', [[0, 9], 3]],
    '56': [
      '_struct',
      [
        [
          ['m_subgroupIndex', 49, -4],
          ['m_removeMask', 52, -3],
          ['m_addSubgroups', 54, -2],
          ['m_addUnitTags', 55, -1],
        ],
      ],
    ],
    '57': [
      '_struct',
      [
        [
          ['m_controlGroupId', 42, -7],
          ['m_delta', 56, -6],
        ],
      ],
    ],
    '58': [
      '_struct',
      [
        [
          ['m_controlGroupIndex', 42, -8],
          ['m_controlGroupUpdate', 22, -7],
          ['m_mask', 52, -6],
        ],
      ],
    ],
    '59': [
      '_struct',
      [
        [
          ['m_count', 49, -6],
          ['m_subgroupCount', 49, -5],
          ['m_activeSubgroupIndex', 49, -4],
          ['m_unitTagsChecksum', 3, -3],
          ['m_subgroupIndicesChecksum', 3, -2],
          ['m_subgroupsChecksum', 3, -1],
        ],
      ],
    ],
    '60': [
      '_struct',
      [
        [
          ['m_controlGroupId', 42, -7],
          ['m_selectionSyncData', 59, -6],
        ],
      ],
    ],
    '61': ['_array', [[0, 3], 31]],
    '62': [
      '_struct',
      [
        [
          ['m_recipientId', 42, -7],
          ['m_resources', 61, -6],
        ],
      ],
    ],
    '63': ['_struct', [[['m_chatMessage', 28, -6]]]],
    '64': ['_int', [[-128, 8]]],
    '65': [
      '_struct',
      [
        [
          ['x', 31, -3],
          ['y', 31, -2],
          ['z', 31, -1],
        ],
      ],
    ],
    '66': [
      '_struct',
      [
        [
          ['m_beacon', 64, -14],
          ['m_ally', 64, -13],
          ['m_flags', 64, -12],
          ['m_build', 64, -11],
          ['m_targetUnitTag', 3, -10],
          ['m_targetUnitSnapshotUnitLink', 23, -9],
          ['m_targetUnitSnapshotUpkeepPlayerId', 64, -8],
          ['m_targetUnitSnapshotControlPlayerId', 64, -7],
          ['m_targetPoint', 65, -6],
        ],
      ],
    ],
    '67': ['_struct', [[['m_speed', 22, -6]]]],
    '68': ['_struct', [[['m_delta', 64, -6]]]],
    '69': [
      '_struct',
      [
        [
          ['m_point', 32, -14],
          ['m_unit', 3, -13],
          ['m_unitLink', 23, -12],
          ['m_unitControlPlayerId', 43, -11],
          ['m_unitUpkeepPlayerId', 43, -10],
          ['m_unitPosition', 41, -9],
          ['m_unitIsUnderConstruction', 9, -8],
          ['m_pingedMinimap', 9, -7],
          ['m_option', 31, -6],
        ],
      ],
    ],
    '70': [
      '_struct',
      [
        [
          ['m_verb', 28, -7],
          ['m_arguments', 28, -6],
        ],
      ],
    ],
    '71': [
      '_struct',
      [
        [
          ['m_alliance', 3, -7],
          ['m_control', 3, -6],
        ],
      ],
    ],
    '72': ['_struct', [[['m_unitTag', 3, -6]]]],
    '73': [
      '_struct',
      [
        [
          ['m_unitTag', 3, -7],
          ['m_flags', 19, -6],
        ],
      ],
    ],
    '74': [
      '_struct',
      [
        [
          ['m_conversationId', 31, -7],
          ['m_replyId', 31, -6],
        ],
      ],
    ],
    '75': ['_int', [[0, 2]]],
    '76': ['_optional', [12]],
    '77': ['_optional', [27]],
    '78': ['_blob', [[40, 0]]],
    '79': ['_optional', [78]],
    '80': [
      '_struct',
      [
        [
          ['m_gameUserId', 42, -6],
          ['m_observe', 75, -5],
          ['m_name', 27, -4],
          ['m_toonHandle', 76, -3],
          ['m_clanTag', 77, -2],
          ['m_clanLogo', 79, -1],
        ],
      ],
    ],
    '81': ['_array', [[0, 5], 80]],
    '82': ['_int', [[0, 1]]],
    '83': [
      '_struct',
      [
        [
          ['m_userInfos', 81, -7],
          ['m_method', 82, -6],
        ],
      ],
    ],
    '84': [
      '_struct',
      [
        [
          ['m_soundHash', 3, -7],
          ['m_length', 3, -6],
        ],
      ],
    ],
    '85': ['_struct', [[['m_sound', 3, -6]]]],
    '86': [
      '_struct',
      [
        [
          ['m_transmissionId', 31, -7],
          ['m_thread', 3, -6],
        ],
      ],
    ],
    '87': ['_struct', [[['m_transmissionId', 31, -6]]]],
    '88': ['_optional', [24]],
    '89': ['_optional', [23]],
    '90': ['_optional', [64]],
    '91': [
      '_struct',
      [
        [
          ['m_target', 88, -11],
          ['m_distance', 89, -10],
          ['m_pitch', 89, -9],
          ['m_yaw', 89, -8],
          ['m_reason', 90, -7],
          ['m_follow', 9, -6],
        ],
      ],
    ],
    '92': ['_struct', [[['m_purchaseItemId', 31, -6]]]],
    '93': ['_struct', [[['m_difficultyLevel', 31, -6]]]],
    '94': [
      '_choice',
      [
        [0, 3],
        {
          '0': ['None', 39],
          '1': ['Checked', 9],
          '2': ['ValueChanged', 3],
          '3': ['SelectionChanged', 31],
          '4': ['TextChanged', 26],
          '5': ['MouseButton', 3],
        },
      ],
    ],
    '95': [
      '_struct',
      [
        [
          ['m_controlId', 31, -8],
          ['m_eventType', 31, -7],
          ['m_eventData', 94, -6],
        ],
      ],
    ],
    '96': ['_array', [[0, 7], 3]],
    '97': [
      '_struct',
      [
        [
          ['m_soundHash', 96, -2],
          ['m_length', 96, -1],
        ],
      ],
    ],
    '98': ['_struct', [[['m_syncInfo', 97, -6]]]],
    '99': ['_struct', [[['m_skipType', 82, -6]]]],
    '100': ['_int', [[0, 11]]],
    '101': [
      '_struct',
      [
        [
          ['x', 100, -2],
          ['y', 100, -1],
        ],
      ],
    ],
    '102': [
      '_struct',
      [
        [
          ['m_button', 3, -10],
          ['m_down', 9, -9],
          ['m_posUI', 101, -8],
          ['m_posWorld', 41, -7],
          ['m_flags', 64, -6],
        ],
      ],
    ],
    '103': [
      '_struct',
      [
        [
          ['m_posUI', 101, -8],
          ['m_posWorld', 41, -7],
          ['m_flags', 64, -6],
        ],
      ],
    ],
    '104': ['_struct', [[['m_achievementLink', 23, -6]]]],
    '105': [
      '_struct',
      [
        [
          ['m_hotkey', 3, -7],
          ['m_down', 9, -6],
        ],
      ],
    ],
    '106': [
      '_struct',
      [
        [
          ['m_abilLink', 23, -8],
          ['m_abilCmdIndex', 5, -7],
          ['m_state', 64, -6],
        ],
      ],
    ],
    '107': ['_struct', [[['m_soundtrack', 3, -6]]]],
    '108': ['_struct', [[['m_planetId', 31, -6]]]],
    '109': [
      '_struct',
      [
        [
          ['m_key', 64, -7],
          ['m_flags', 64, -6],
        ],
      ],
    ],
    '110': ['_struct', [[['m_functionName', 12, -6]]]],
    '111': ['_struct', [[['m_resources', 61, -6]]]],
    '112': ['_struct', [[['m_fulfillRequestId', 31, -6]]]],
    '113': ['_struct', [[['m_cancelRequestId', 31, -6]]]],
    '114': ['_struct', [[['m_researchItemId', 31, -6]]]],
    '115': [
      '_struct',
      [
        [
          ['m_error', 31, -7],
          ['m_abil', 38, -6],
        ],
      ],
    ],
    '116': ['_struct', [[['m_mercenaryId', 31, -6]]]],
    '117': [
      '_struct',
      [
        [
          ['m_battleReportId', 31, -7],
          ['m_difficultyLevel', 31, -6],
        ],
      ],
    ],
    '118': ['_struct', [[['m_battleReportId', 31, -6]]]],
    '119': ['_struct', [[['m_decrementSeconds', 31, -6]]]],
    '120': ['_struct', [[['m_portraitId', 31, -6]]]],
    '121': ['_struct', [[['m_result', 31, -6]]]],
    '122': ['_struct', [[['m_gameMenuItemIndex', 31, -6]]]],
    '123': ['_int', [[-32768, 16]]],
    '124': [
      '_struct',
      [
        [
          ['m_wheelSpin', 123, -7],
          ['m_flags', 64, -6],
        ],
      ],
    ],
    '125': ['_struct', [[['m_purchaseCategoryId', 31, -6]]]],
    '126': ['_struct', [[['m_button', 23, -6]]]],
    '127': [
      '_struct',
      [
        [
          ['m_cutsceneId', 31, -7],
          ['m_bookmarkName', 12, -6],
        ],
      ],
    ],
    '128': ['_struct', [[['m_cutsceneId', 31, -6]]]],
    '129': [
      '_struct',
      [
        [
          ['m_cutsceneId', 31, -8],
          ['m_conversationLine', 12, -7],
          ['m_altConversationLine', 12, -6],
        ],
      ],
    ],
    '130': [
      '_struct',
      [
        [
          ['m_cutsceneId', 31, -7],
          ['m_conversationLine', 12, -6],
        ],
      ],
    ],
    '131': ['_struct', [[['m_leaveReason', 42, -6]]]],
    '132': [
      '_struct',
      [
        [
          ['m_observe', 75, -12],
          ['m_name', 27, -11],
          ['m_toonHandle', 76, -10],
          ['m_clanTag', 77, -9],
          ['m_clanLogo', 79, -8],
          ['m_hijack', 9, -7],
          ['m_hijackCloneGameUserId', 43, -6],
        ],
      ],
    ],
    '133': ['_optional', [46]],
    '134': [
      '_struct',
      [
        [
          ['m_state', 75, -7],
          ['m_sequence', 133, -6],
        ],
      ],
    ],
    '135': ['_struct', [[['m_target', 41, -6]]]],
    '136': ['_struct', [[['m_target', 44, -6]]]],
    '137': [
      '_struct',
      [
        [
          ['m_queryId', 23, -8],
          ['m_lengthMs', 3, -7],
          ['m_finishGameLoop', 3, -6],
        ],
      ],
    ],
    '138': [
      '_struct',
      [
        [
          ['m_queryId', 23, -7],
          ['m_lengthMs', 3, -6],
        ],
      ],
    ],
    '139': ['_struct', [[['m_animWaitQueryId', 23, -6]]]],
    '140': [
      '_struct',
      [
        [
          ['m_catalog', 19, -9],
          ['m_entry', 23, -8],
          ['m_field', 27, -7],
          ['m_value', 27, -6],
        ],
      ],
    ],
    '141': ['_struct', [[['m_index', 3, -6]]]],
    '142': ['_struct', [[['m_shown', 9, -6]]]],
    '143': ['_struct', [[['m_syncTime', 3, -6]]]],
  },
} satisfies GameProtocolSchema
