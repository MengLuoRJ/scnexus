// Derived from Blizzard s2protocol 901804e41283269d43d7bfc3b8dc5be2a9dd350a.
// MIT; see LICENSE.s2protocol. Do not edit.
import type { GameProtocolSchema } from '../protocol-schema.js'

export default {
  delta: 7,
  userId: 8,
  eventId: 0,
  events: {
    '5': [82, 'NNet.Game.SUserFinishedLoadingSyncEvent'],
    '7': [81, 'NNet.Game.SUserOptionsEvent'],
    '9': [74, 'NNet.Game.SBankFileEvent'],
    '10': [76, 'NNet.Game.SBankSectionEvent'],
    '11': [77, 'NNet.Game.SBankKeyEvent'],
    '12': [78, 'NNet.Game.SBankValueEvent'],
    '13': [80, 'NNet.Game.SBankSignatureEvent'],
    '14': [85, 'NNet.Game.SCameraSaveEvent'],
    '21': [86, 'NNet.Game.SSaveGameEvent'],
    '22': [82, 'NNet.Game.SSaveGameDoneEvent'],
    '23': [82, 'NNet.Game.SLoadGameDoneEvent'],
    '25': [87, 'NNet.Game.SCommandManagerResetEvent'],
    '26': [90, 'NNet.Game.SGameCheatEvent'],
    '27': [100, 'NNet.Game.SCmdEvent'],
    '28': [109, 'NNet.Game.SSelectionDeltaEvent'],
    '29': [110, 'NNet.Game.SControlGroupUpdateEvent'],
    '30': [112, 'NNet.Game.SSelectionSyncCheckEvent'],
    '31': [114, 'NNet.Game.SResourceTradeEvent'],
    '32': [115, 'NNet.Game.STriggerChatMessageEvent'],
    '33': [118, 'NNet.Game.SAICommunicateEvent'],
    '34': [119, 'NNet.Game.SSetAbsoluteGameSpeedEvent'],
    '35': [120, 'NNet.Game.SAddAbsoluteGameSpeedEvent'],
    '36': [121, 'NNet.Game.STriggerPingEvent'],
    '37': [122, 'NNet.Game.SBroadcastCheatEvent'],
    '38': [123, 'NNet.Game.SAllianceEvent'],
    '39': [124, 'NNet.Game.SUnitClickEvent'],
    '40': [125, 'NNet.Game.SUnitHighlightEvent'],
    '41': [126, 'NNet.Game.STriggerReplySelectedEvent'],
    '43': [131, 'NNet.Game.SHijackReplayGameEvent'],
    '44': [82, 'NNet.Game.STriggerSkippedEvent'],
    '45': [136, 'NNet.Game.STriggerSoundLengthQueryEvent'],
    '46': [143, 'NNet.Game.STriggerSoundOffsetEvent'],
    '47': [144, 'NNet.Game.STriggerTransmissionOffsetEvent'],
    '48': [145, 'NNet.Game.STriggerTransmissionCompleteEvent'],
    '49': [149, 'NNet.Game.SCameraUpdateEvent'],
    '50': [82, 'NNet.Game.STriggerAbortMissionEvent'],
    '51': [132, 'NNet.Game.STriggerPurchaseMadeEvent'],
    '52': [82, 'NNet.Game.STriggerPurchaseExitEvent'],
    '53': [133, 'NNet.Game.STriggerPlanetMissionLaunchedEvent'],
    '54': [82, 'NNet.Game.STriggerPlanetPanelCanceledEvent'],
    '55': [135, 'NNet.Game.STriggerDialogControlEvent'],
    '56': [139, 'NNet.Game.STriggerSoundLengthSyncEvent'],
    '57': [150, 'NNet.Game.STriggerConversationSkippedEvent'],
    '58': [153, 'NNet.Game.STriggerMouseClickedEvent'],
    '59': [154, 'NNet.Game.STriggerMouseMovedEvent'],
    '60': [155, 'NNet.Game.SAchievementAwardedEvent'],
    '61': [156, 'NNet.Game.STriggerHotkeyPressedEvent'],
    '62': [157, 'NNet.Game.STriggerTargetModeUpdateEvent'],
    '63': [82, 'NNet.Game.STriggerPlanetPanelReplayEvent'],
    '64': [158, 'NNet.Game.STriggerSoundtrackDoneEvent'],
    '65': [159, 'NNet.Game.STriggerPlanetMissionSelectedEvent'],
    '66': [160, 'NNet.Game.STriggerKeyPressedEvent'],
    '67': [171, 'NNet.Game.STriggerMovieFunctionEvent'],
    '68': [82, 'NNet.Game.STriggerPlanetPanelBirthCompleteEvent'],
    '69': [82, 'NNet.Game.STriggerPlanetPanelDeathCompleteEvent'],
    '70': [161, 'NNet.Game.SResourceRequestEvent'],
    '71': [162, 'NNet.Game.SResourceRequestFulfillEvent'],
    '72': [163, 'NNet.Game.SResourceRequestCancelEvent'],
    '73': [82, 'NNet.Game.STriggerResearchPanelExitEvent'],
    '74': [82, 'NNet.Game.STriggerResearchPanelPurchaseEvent'],
    '75': [165, 'NNet.Game.STriggerResearchPanelSelectionChangedEvent'],
    '76': [164, 'NNet.Game.STriggerCommandErrorEvent'],
    '77': [82, 'NNet.Game.STriggerMercenaryPanelExitEvent'],
    '78': [82, 'NNet.Game.STriggerMercenaryPanelPurchaseEvent'],
    '79': [166, 'NNet.Game.STriggerMercenaryPanelSelectionChangedEvent'],
    '80': [82, 'NNet.Game.STriggerVictoryPanelExitEvent'],
    '81': [82, 'NNet.Game.STriggerBattleReportPanelExitEvent'],
    '82': [167, 'NNet.Game.STriggerBattleReportPanelPlayMissionEvent'],
    '83': [168, 'NNet.Game.STriggerBattleReportPanelPlaySceneEvent'],
    '84': [168, 'NNet.Game.STriggerBattleReportPanelSelectionChangedEvent'],
    '85': [133, 'NNet.Game.STriggerVictoryPanelPlayMissionAgainEvent'],
    '86': [82, 'NNet.Game.STriggerMovieStartedEvent'],
    '87': [82, 'NNet.Game.STriggerMovieFinishedEvent'],
    '88': [169, 'NNet.Game.SDecrementGameTimeRemainingEvent'],
    '89': [170, 'NNet.Game.STriggerPortraitLoadedEvent'],
    '90': [172, 'NNet.Game.STriggerCustomDialogDismissedEvent'],
    '91': [173, 'NNet.Game.STriggerGameMenuItemSelectedEvent'],
    '92': [175, 'NNet.Game.STriggerMouseWheelEvent'],
    '93': [132, 'NNet.Game.STriggerPurchasePanelSelectedPurchaseItemChangedEvent'],
    '94': [176, 'NNet.Game.STriggerPurchasePanelSelectedPurchaseCategoryChangedEvent'],
    '95': [177, 'NNet.Game.STriggerButtonPressedEvent'],
    '96': [82, 'NNet.Game.STriggerGameCreditsFinishedEvent'],
    '97': [178, 'NNet.Game.STriggerCutsceneBookmarkFiredEvent'],
    '98': [179, 'NNet.Game.STriggerCutsceneEndSceneFiredEvent'],
    '99': [180, 'NNet.Game.STriggerCutsceneConversationLineEvent'],
    '100': [181, 'NNet.Game.STriggerCutsceneConversationLineMissingEvent'],
    '101': [182, 'NNet.Game.SGameUserLeaveEvent'],
    '102': [183, 'NNet.Game.SGameUserJoinEvent'],
    '103': [185, 'NNet.Game.SCommandManagerStateEvent'],
    '104': [186, 'NNet.Game.SCmdUpdateTargetPointEvent'],
    '105': [187, 'NNet.Game.SCmdUpdateTargetUnitEvent'],
    '106': [140, 'NNet.Game.STriggerAnimLengthQueryByNameEvent'],
    '107': [141, 'NNet.Game.STriggerAnimLengthQueryByPropsEvent'],
    '108': [142, 'NNet.Game.STriggerAnimOffsetEvent'],
    '109': [188, 'NNet.Game.SCatalogModifyEvent'],
    '110': [189, 'NNet.Game.SHeroTalentTreeSelectedEvent'],
    '111': [82, 'NNet.Game.STriggerProfilerLoggingFinishedEvent'],
    '112': [190, 'NNet.Game.SHeroTalentTreeSelectionPanelToggledEvent'],
    '116': [191, 'NNet.Game.SSetSyncLoadingTimeEvent'],
    '117': [191, 'NNet.Game.SSetSyncPlayingTimeEvent'],
    '118': [191, 'NNet.Game.SPeerSetSyncLoadingTimeEvent'],
    '119': [191, 'NNet.Game.SPeerSetSyncPlayingTimeEvent'],
  },
  types: {
    '0': ['_int', [[0, 7]]],
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
    '8': ['_struct', [[['m_userId', 2, -1]]]],
    '9': ['_blob', [[0, 8]]],
    '10': ['_int', [[0, 8]]],
    '12': ['_int', [[0, 3]]],
    '13': ['_bool', []],
    '20': ['_blob', [[0, 7]]],
    '24': ['_int', [[0, 2]]],
    '25': ['_optional', [10]],
    '29': ['_blob', [[0, 10]]],
    '30': ['_blob', [[0, 11]]],
    '34': ['_blob', [[0, 12]]],
    '35': ['_blob', [[40, 0]]],
    '41': ['_optional', [9]],
    '42': ['_optional', [35]],
    '43': ['_optional', [6]],
    '46': ['_blob', [[0, 9]]],
    '47': ['_int', [[-2147483648, 32]]],
    '60': ['_optional', [1]],
    '74': ['_struct', [[['m_name', 20, -6]]]],
    '75': ['_blob', [[0, 6]]],
    '76': ['_struct', [[['m_name', 75, -6]]]],
    '77': [
      '_struct',
      [
        [
          ['m_name', 75, -8],
          ['m_type', 6, -7],
          ['m_data', 20, -6],
        ],
      ],
    ],
    '78': [
      '_struct',
      [
        [
          ['m_type', 6, -8],
          ['m_name', 75, -7],
          ['m_data', 34, -6],
        ],
      ],
    ],
    '79': ['_array', [[0, 5], 10]],
    '80': [
      '_struct',
      [
        [
          ['m_signature', 79, -7],
          ['m_toonHandle', 20, -6],
        ],
      ],
    ],
    '81': [
      '_struct',
      [
        [
          ['m_gameFullyDownloaded', 13, -19],
          ['m_developmentCheatsEnabled', 13, -18],
          ['m_testCheatsEnabled', 13, -17],
          ['m_multiplayerCheatsEnabled', 13, -16],
          ['m_syncChecksummingEnabled', 13, -15],
          ['m_isMapToMapTransition', 13, -14],
          ['m_debugPauseEnabled', 13, -13],
          ['m_useGalaxyAsserts', 13, -12],
          ['m_platformMac', 13, -11],
          ['m_cameraFollow', 13, -10],
          ['m_baseBuildNum', 6, -9],
          ['m_buildNum', 6, -8],
          ['m_versionFlags', 6, -7],
          ['m_hotkeyProfile', 46, -6],
        ],
      ],
    ],
    '82': ['_struct', [[]]],
    '83': ['_int', [[0, 16]]],
    '84': [
      '_struct',
      [
        [
          ['x', 83, -2],
          ['y', 83, -1],
        ],
      ],
    ],
    '85': [
      '_struct',
      [
        [
          ['m_which', 12, -7],
          ['m_target', 84, -6],
        ],
      ],
    ],
    '86': [
      '_struct',
      [
        [
          ['m_fileName', 30, -10],
          ['m_automatic', 13, -9],
          ['m_overwrite', 13, -8],
          ['m_name', 9, -7],
          ['m_description', 29, -6],
        ],
      ],
    ],
    '87': ['_struct', [[['m_sequence', 6, -6]]]],
    '88': [
      '_struct',
      [
        [
          ['x', 47, -2],
          ['y', 47, -1],
        ],
      ],
    ],
    '89': [
      '_struct',
      [
        [
          ['m_point', 88, -4],
          ['m_time', 47, -3],
          ['m_verb', 29, -2],
          ['m_arguments', 29, -1],
        ],
      ],
    ],
    '90': ['_struct', [[['m_data', 89, -6]]]],
    '91': ['_int', [[0, 26]]],
    '92': [
      '_struct',
      [
        [
          ['m_abilLink', 83, -3],
          ['m_abilCmdIndex', 2, -2],
          ['m_abilCmdData', 25, -1],
        ],
      ],
    ],
    '93': ['_optional', [92]],
    '94': ['_null', []],
    '95': ['_int', [[0, 20]]],
    '96': [
      '_struct',
      [
        [
          ['x', 95, -3],
          ['y', 95, -2],
          ['z', 47, -1],
        ],
      ],
    ],
    '97': [
      '_struct',
      [
        [
          ['m_targetUnitFlags', 83, -7],
          ['m_timer', 10, -6],
          ['m_tag', 6, -5],
          ['m_snapshotUnitLink', 83, -4],
          ['m_snapshotControlPlayerId', 60, -3],
          ['m_snapshotUpkeepPlayerId', 60, -2],
          ['m_snapshotPoint', 96, -1],
        ],
      ],
    ],
    '98': [
      '_choice',
      [
        [0, 2],
        {
          '0': ['None', 94],
          '1': ['TargetPoint', 96],
          '2': ['TargetUnit', 97],
          '3': ['Data', 6],
        },
      ],
    ],
    '99': ['_int', [[1, 32]]],
    '100': [
      '_struct',
      [
        [
          ['m_cmdFlags', 91, -11],
          ['m_abil', 93, -10],
          ['m_data', 98, -9],
          ['m_sequence', 99, -8],
          ['m_otherUnit', 43, -7],
          ['m_unitGroup', 43, -6],
        ],
      ],
    ],
    '101': ['_int', [[0, 9]]],
    '102': ['_bitarray', [[0, 9]]],
    '103': ['_array', [[0, 9], 101]],
    '104': [
      '_choice',
      [
        [0, 2],
        {
          '0': ['None', 94],
          '1': ['Mask', 102],
          '2': ['OneIndices', 103],
          '3': ['ZeroIndices', 103],
        },
      ],
    ],
    '105': [
      '_struct',
      [
        [
          ['m_unitLink', 83, -4],
          ['m_subgroupPriority', 10, -3],
          ['m_intraSubgroupPriority', 10, -2],
          ['m_count', 101, -1],
        ],
      ],
    ],
    '106': ['_array', [[0, 9], 105]],
    '107': ['_array', [[0, 9], 6]],
    '108': [
      '_struct',
      [
        [
          ['m_subgroupIndex', 101, -4],
          ['m_removeMask', 104, -3],
          ['m_addSubgroups', 106, -2],
          ['m_addUnitTags', 107, -1],
        ],
      ],
    ],
    '109': [
      '_struct',
      [
        [
          ['m_controlGroupId', 1, -7],
          ['m_delta', 108, -6],
        ],
      ],
    ],
    '110': [
      '_struct',
      [
        [
          ['m_controlGroupIndex', 1, -8],
          ['m_controlGroupUpdate', 12, -7],
          ['m_mask', 104, -6],
        ],
      ],
    ],
    '111': [
      '_struct',
      [
        [
          ['m_count', 101, -6],
          ['m_subgroupCount', 101, -5],
          ['m_activeSubgroupIndex', 101, -4],
          ['m_unitTagsChecksum', 6, -3],
          ['m_subgroupIndicesChecksum', 6, -2],
          ['m_subgroupsChecksum', 6, -1],
        ],
      ],
    ],
    '112': [
      '_struct',
      [
        [
          ['m_controlGroupId', 1, -7],
          ['m_selectionSyncData', 111, -6],
        ],
      ],
    ],
    '113': ['_array', [[0, 3], 47]],
    '114': [
      '_struct',
      [
        [
          ['m_recipientId', 1, -7],
          ['m_resources', 113, -6],
        ],
      ],
    ],
    '115': ['_struct', [[['m_chatMessage', 29, -6]]]],
    '116': ['_int', [[-128, 8]]],
    '117': [
      '_struct',
      [
        [
          ['x', 47, -3],
          ['y', 47, -2],
          ['z', 47, -1],
        ],
      ],
    ],
    '118': [
      '_struct',
      [
        [
          ['m_beacon', 116, -14],
          ['m_ally', 116, -13],
          ['m_flags', 116, -12],
          ['m_build', 116, -11],
          ['m_targetUnitTag', 6, -10],
          ['m_targetUnitSnapshotUnitLink', 83, -9],
          ['m_targetUnitSnapshotUpkeepPlayerId', 116, -8],
          ['m_targetUnitSnapshotControlPlayerId', 116, -7],
          ['m_targetPoint', 117, -6],
        ],
      ],
    ],
    '119': ['_struct', [[['m_speed', 12, -6]]]],
    '120': ['_struct', [[['m_delta', 116, -6]]]],
    '121': [
      '_struct',
      [
        [
          ['m_point', 88, -14],
          ['m_unit', 6, -13],
          ['m_unitLink', 83, -12],
          ['m_unitControlPlayerId', 60, -11],
          ['m_unitUpkeepPlayerId', 60, -10],
          ['m_unitPosition', 96, -9],
          ['m_unitIsUnderConstruction', 13, -8],
          ['m_pingedMinimap', 13, -7],
          ['m_option', 47, -6],
        ],
      ],
    ],
    '122': [
      '_struct',
      [
        [
          ['m_verb', 29, -7],
          ['m_arguments', 29, -6],
        ],
      ],
    ],
    '123': [
      '_struct',
      [
        [
          ['m_alliance', 6, -7],
          ['m_control', 6, -6],
        ],
      ],
    ],
    '124': ['_struct', [[['m_unitTag', 6, -6]]]],
    '125': [
      '_struct',
      [
        [
          ['m_unitTag', 6, -7],
          ['m_flags', 10, -6],
        ],
      ],
    ],
    '126': [
      '_struct',
      [
        [
          ['m_conversationId', 47, -7],
          ['m_replyId', 47, -6],
        ],
      ],
    ],
    '127': ['_optional', [20]],
    '128': [
      '_struct',
      [
        [
          ['m_gameUserId', 1, -6],
          ['m_observe', 24, -5],
          ['m_name', 9, -4],
          ['m_toonHandle', 127, -3],
          ['m_clanTag', 41, -2],
          ['m_clanLogo', 42, -1],
        ],
      ],
    ],
    '129': ['_array', [[0, 5], 128]],
    '130': ['_int', [[0, 1]]],
    '131': [
      '_struct',
      [
        [
          ['m_userInfos', 129, -7],
          ['m_method', 130, -6],
        ],
      ],
    ],
    '132': ['_struct', [[['m_purchaseItemId', 47, -6]]]],
    '133': ['_struct', [[['m_difficultyLevel', 47, -6]]]],
    '134': [
      '_choice',
      [
        [0, 3],
        {
          '0': ['None', 94],
          '1': ['Checked', 13],
          '2': ['ValueChanged', 6],
          '3': ['SelectionChanged', 47],
          '4': ['TextChanged', 30],
          '5': ['MouseButton', 6],
        },
      ],
    ],
    '135': [
      '_struct',
      [
        [
          ['m_controlId', 47, -8],
          ['m_eventType', 47, -7],
          ['m_eventData', 134, -6],
        ],
      ],
    ],
    '136': [
      '_struct',
      [
        [
          ['m_soundHash', 6, -7],
          ['m_length', 6, -6],
        ],
      ],
    ],
    '137': ['_array', [[0, 7], 6]],
    '138': [
      '_struct',
      [
        [
          ['m_soundHash', 137, -2],
          ['m_length', 137, -1],
        ],
      ],
    ],
    '139': ['_struct', [[['m_syncInfo', 138, -6]]]],
    '140': [
      '_struct',
      [
        [
          ['m_queryId', 83, -8],
          ['m_lengthMs', 6, -7],
          ['m_finishGameLoop', 6, -6],
        ],
      ],
    ],
    '141': [
      '_struct',
      [
        [
          ['m_queryId', 83, -7],
          ['m_lengthMs', 6, -6],
        ],
      ],
    ],
    '142': ['_struct', [[['m_animWaitQueryId', 83, -6]]]],
    '143': ['_struct', [[['m_sound', 6, -6]]]],
    '144': [
      '_struct',
      [
        [
          ['m_transmissionId', 47, -7],
          ['m_thread', 6, -6],
        ],
      ],
    ],
    '145': ['_struct', [[['m_transmissionId', 47, -6]]]],
    '146': ['_optional', [84]],
    '147': ['_optional', [83]],
    '148': ['_optional', [116]],
    '149': [
      '_struct',
      [
        [
          ['m_target', 146, -11],
          ['m_distance', 147, -10],
          ['m_pitch', 147, -9],
          ['m_yaw', 147, -8],
          ['m_reason', 148, -7],
          ['m_follow', 13, -6],
        ],
      ],
    ],
    '150': ['_struct', [[['m_skipType', 130, -6]]]],
    '151': ['_int', [[0, 11]]],
    '152': [
      '_struct',
      [
        [
          ['x', 151, -2],
          ['y', 151, -1],
        ],
      ],
    ],
    '153': [
      '_struct',
      [
        [
          ['m_button', 6, -10],
          ['m_down', 13, -9],
          ['m_posUI', 152, -8],
          ['m_posWorld', 96, -7],
          ['m_flags', 116, -6],
        ],
      ],
    ],
    '154': [
      '_struct',
      [
        [
          ['m_posUI', 152, -8],
          ['m_posWorld', 96, -7],
          ['m_flags', 116, -6],
        ],
      ],
    ],
    '155': ['_struct', [[['m_achievementLink', 83, -6]]]],
    '156': [
      '_struct',
      [
        [
          ['m_hotkey', 6, -7],
          ['m_down', 13, -6],
        ],
      ],
    ],
    '157': [
      '_struct',
      [
        [
          ['m_abilLink', 83, -8],
          ['m_abilCmdIndex', 2, -7],
          ['m_state', 116, -6],
        ],
      ],
    ],
    '158': ['_struct', [[['m_soundtrack', 6, -6]]]],
    '159': ['_struct', [[['m_planetId', 47, -6]]]],
    '160': [
      '_struct',
      [
        [
          ['m_key', 116, -7],
          ['m_flags', 116, -6],
        ],
      ],
    ],
    '161': ['_struct', [[['m_resources', 113, -6]]]],
    '162': ['_struct', [[['m_fulfillRequestId', 47, -6]]]],
    '163': ['_struct', [[['m_cancelRequestId', 47, -6]]]],
    '164': [
      '_struct',
      [
        [
          ['m_error', 47, -7],
          ['m_abil', 93, -6],
        ],
      ],
    ],
    '165': ['_struct', [[['m_researchItemId', 47, -6]]]],
    '166': ['_struct', [[['m_mercenaryId', 47, -6]]]],
    '167': [
      '_struct',
      [
        [
          ['m_battleReportId', 47, -7],
          ['m_difficultyLevel', 47, -6],
        ],
      ],
    ],
    '168': ['_struct', [[['m_battleReportId', 47, -6]]]],
    '169': ['_struct', [[['m_decrementSeconds', 47, -6]]]],
    '170': ['_struct', [[['m_portraitId', 47, -6]]]],
    '171': ['_struct', [[['m_functionName', 20, -6]]]],
    '172': ['_struct', [[['m_result', 47, -6]]]],
    '173': ['_struct', [[['m_gameMenuItemIndex', 47, -6]]]],
    '174': ['_int', [[-32768, 16]]],
    '175': [
      '_struct',
      [
        [
          ['m_wheelSpin', 174, -7],
          ['m_flags', 116, -6],
        ],
      ],
    ],
    '176': ['_struct', [[['m_purchaseCategoryId', 47, -6]]]],
    '177': ['_struct', [[['m_button', 83, -6]]]],
    '178': [
      '_struct',
      [
        [
          ['m_cutsceneId', 47, -7],
          ['m_bookmarkName', 20, -6],
        ],
      ],
    ],
    '179': ['_struct', [[['m_cutsceneId', 47, -6]]]],
    '180': [
      '_struct',
      [
        [
          ['m_cutsceneId', 47, -8],
          ['m_conversationLine', 20, -7],
          ['m_altConversationLine', 20, -6],
        ],
      ],
    ],
    '181': [
      '_struct',
      [
        [
          ['m_cutsceneId', 47, -7],
          ['m_conversationLine', 20, -6],
        ],
      ],
    ],
    '182': ['_struct', [[['m_leaveReason', 1, -6]]]],
    '183': [
      '_struct',
      [
        [
          ['m_observe', 24, -12],
          ['m_name', 9, -11],
          ['m_toonHandle', 127, -10],
          ['m_clanTag', 41, -9],
          ['m_clanLogo', 42, -8],
          ['m_hijack', 13, -7],
          ['m_hijackCloneGameUserId', 60, -6],
        ],
      ],
    ],
    '184': ['_optional', [99]],
    '185': [
      '_struct',
      [
        [
          ['m_state', 24, -7],
          ['m_sequence', 184, -6],
        ],
      ],
    ],
    '186': ['_struct', [[['m_target', 96, -6]]]],
    '187': ['_struct', [[['m_target', 97, -6]]]],
    '188': [
      '_struct',
      [
        [
          ['m_catalog', 10, -9],
          ['m_entry', 83, -8],
          ['m_field', 9, -7],
          ['m_value', 9, -6],
        ],
      ],
    ],
    '189': ['_struct', [[['m_index', 6, -6]]]],
    '190': ['_struct', [[['m_shown', 13, -6]]]],
    '191': ['_struct', [[['m_syncTime', 6, -6]]]],
  },
} satisfies GameProtocolSchema
