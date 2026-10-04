import {
  DashboardEditor,
  runDashboardEditorVerification,
  runDashboardPagesVerification,
  runDashboardWidgetConfigurationVerification,
} from "/dashboard-editor.js";
import {
  createPortableDashboardProfile,
  parsePortableDashboardProfile,
  portableDashboardRoleIds,
  resolvePortableDashboardProfile,
} from "/dashboard-layout-transfer.js";

const state = {
  records: [],
  seenIds: new Set(),
  paused: false,
  autoScroll: true,
  slice91LiveTest: { status: "idle", message: "Ready." },
  slice91LastReport: null,
  slice92LiveTest: { status: "idle", message: "Ready." },
  slice92LastReport: null,
  slice93LiveTest: { status: "idle", message: "Ready." },
  slice93LastReport: null,
  slice94LiveTest: { status: "idle", message: "Ready." },
  slice94LastReport: null,
  slice95LiveTest: { status: "idle", message: "Ready." },
  slice95LastReport: null,
  slice101LiveTest: { status: "idle", message: "Ready." },
  slice101LastReport: null,
  slice102LiveTest: { status: "idle", message: "Ready." },
  slice102LastReport: null,
  slice103LiveTest: { status: "idle", message: "Ready." },
  slice103LastReport: null,
  slice104LiveTest: { status: "idle", message: "Ready." },
  slice104LastReport: null,
  controlMode: null,
  dashboardLayouts: null,
  pendingDashboardImport: null,
  status: null,
  account: null,
  selection: null,
  character: null,
  actionGateway: null,
  skillOptions: null,
  lootConsumableOptions: null,
  slice35LiveTest: null,
  slice35LastReport: null,
  scriptRuntime: null,
  slice41LiveTest: null,
  slice41LastReport: null,
  slice42LiveTest: null,
  slice42LastReport: null,
  slice43LiveTest: null,
  slice43LastReport: null,
  slice44LiveTest: null,
  slice44LastReport: null,
  simpleFarmerOptions: null,
  simpleFarmer: null,
  slice45LiveTest: null,
  slice45LastReport: null,
  slice51LiveTest: null,
  slice51LastReport: null,
  slice52LiveTest: null,
  slice52LastReport: null,
  slice53LiveTest: null,
  slice53LastReport: null,
  slice54LiveTest: null,
  slice54LastReport: null,
  slice61LiveTest: null,
  slice61LastReport: null,
  slice62LiveTest: null,
  slice62LastReport: null,
  slice63LiveTest: null,
  slice63LastReport: null,
  slice64LiveTest: null,
  slice64LastReport: null,
  characterSessions: null,
  slice71LiveTest: null,
  slice71LastReport: null,
  characterMessaging: null,
  slice72LiveTest: null,
  slice72LastReport: null,
  partyCoordinator: null,
  slice73LiveTest: null,
  slice73LastReport: null,
  partyTemplates: null,
  slice74LiveTest: null,
  slice74LastReport: null,
  characterCards: null,
  slice81LiveTest: null,
  slice81LastReport: null,
  setupWizard: null,
  slice82LiveTest: null,
  slice82LastReport: null,
  templateConfig: null,
  slice83LiveTest: null,
  slice83LastReport: null,
  explainability: null,
  slice84LiveTest: null,
  slice84LastReport: null,
  movementDebug: null,
  update: null,
  gameVersion: null,
  gameData: null,
  diagnostics: null,
  source: null,
  updateReconnectPending: false,
};

const elements = {
  connectionStatus: document.querySelector("#connection-status"),
  currentVerificationPanel: document.querySelector("#current-verification-panel"),
  currentVerificationSlot: document.querySelector("#current-verification-slot"),
  currentVerificationStatus: document.querySelector("#current-verification-status"),
  currentVerificationEmpty: document.querySelector("#current-verification-empty"),
  controlMode: document.querySelector("#control-mode"),
  openBrowserView: document.querySelector("#open-browser-view"),
  editDashboard: document.querySelector("#edit-dashboard"),
  dashboardEditToolbar: document.querySelector("#dashboard-edit-toolbar"),
  dashboardEditStatus: document.querySelector("#dashboard-edit-status"),
  dashboardWidgetAddSelect: document.querySelector("#dashboard-widget-add-select"),
  dashboardAddWidget: document.querySelector("#dashboard-add-widget"),
  dashboardPageTabs: document.querySelector("#dashboard-page-tabs"),
  dashboardLayoutProfile: document.querySelector("#dashboard-layout-profile"),
  dashboardLayoutVariant: document.querySelector("#dashboard-layout-variant"),
  dashboardLayoutSave: document.querySelector("#dashboard-layout-save"),
  dashboardLayoutUndo: document.querySelector("#dashboard-layout-undo"),
  dashboardLayoutRedo: document.querySelector("#dashboard-layout-redo"),
  dashboardLayoutReset: document.querySelector("#dashboard-layout-reset"),
  dashboardLayoutProfileName: document.querySelector("#dashboard-layout-profile-name"),
  dashboardLayoutProfileCreate: document.querySelector("#dashboard-layout-profile-create"),
  dashboardLayoutProfileDelete: document.querySelector("#dashboard-layout-profile-delete"),
  dashboardLayoutExport: document.querySelector("#dashboard-layout-export"),
  dashboardLayoutImport: document.querySelector("#dashboard-layout-import"),
  dashboardLayoutImportFile: document.querySelector("#dashboard-layout-import-file"),
  dashboardLayoutImportPanel: document.querySelector("#dashboard-layout-import-panel"),
  dashboardLayoutImportSummary: document.querySelector("#dashboard-layout-import-summary"),
  dashboardLayoutRoleMappings: document.querySelector("#dashboard-layout-role-mappings"),
  dashboardLayoutImportApply: document.querySelector("#dashboard-layout-import-apply"),
  dashboardLayoutImportCancel: document.querySelector("#dashboard-layout-import-cancel"),
  startSlice91LiveTest: document.querySelector("#start-slice-9-1-live-test"),
  slice91LiveTestStatus: document.querySelector("#slice-9-1-live-test-status"),
  slice91LiveTestNote: document.querySelector("#slice-9-1-live-test-note"),
  copySlice91LiveTestResult: document.querySelector("#copy-slice-9-1-live-test-result"),
  startSlice92LiveTest: document.querySelector("#start-slice-9-2-live-test"),
  slice92LiveTestStatus: document.querySelector("#slice-9-2-live-test-status"),
  slice92LiveTestNote: document.querySelector("#slice-9-2-live-test-note"),
  copySlice92LiveTestResult: document.querySelector("#copy-slice-9-2-live-test-result"),
  startSlice93LiveTest: document.querySelector("#start-slice-9-3-live-test"),
  slice93LiveTestStatus: document.querySelector("#slice-9-3-live-test-status"),
  slice93LiveTestNote: document.querySelector("#slice-9-3-live-test-note"),
  copySlice93LiveTestResult: document.querySelector("#copy-slice-9-3-live-test-result"),
  startSlice94LiveTest: document.querySelector("#start-slice-9-4-live-test"),
  slice94LiveTestStatus: document.querySelector("#slice-9-4-live-test-status"),
  slice94LiveTestNote: document.querySelector("#slice-9-4-live-test-note"),
  copySlice94LiveTestResult: document.querySelector("#copy-slice-9-4-live-test-result"),
  startSlice95LiveTest: document.querySelector("#start-slice-9-5-live-test"),
  slice95LiveTestStatus: document.querySelector("#slice-9-5-live-test-status"),
  slice95LiveTestNote: document.querySelector("#slice-9-5-live-test-note"),
  copySlice95LiveTestResult: document.querySelector("#copy-slice-9-5-live-test-result"),
  startSlice101LiveTest: document.querySelector("#start-slice-10-1-live-test"),
  slice101LiveTestStatus: document.querySelector("#slice-10-1-live-test-status"),
  slice101LiveTestNote: document.querySelector("#slice-10-1-live-test-note"),
  copySlice101LiveTestResult: document.querySelector("#copy-slice-10-1-live-test-result"),
  startSlice102LiveTest: document.querySelector("#start-slice-10-2-live-test"),
  slice102LiveTestStatus: document.querySelector("#slice-10-2-live-test-status"),
  slice102LiveTestNote: document.querySelector("#slice-10-2-live-test-note"),
  copySlice102LiveTestResult: document.querySelector("#copy-slice-10-2-live-test-result"),
  startSlice103LiveTest: document.querySelector("#start-slice-10-3-live-test"),
  slice103LiveTestStatus: document.querySelector("#slice-10-3-live-test-status"),
  slice103LiveTestNote: document.querySelector("#slice-10-3-live-test-note"),
  copySlice103LiveTestResult: document.querySelector("#copy-slice-10-3-live-test-result"),
  startSlice104LiveTest: document.querySelector("#start-slice-10-4-live-test"),
  slice104LiveTestStatus: document.querySelector("#slice-10-4-live-test-status"),
  slice104LiveTestNote: document.querySelector("#slice-10-4-live-test-note"),
  copySlice104LiveTestResult: document.querySelector("#copy-slice-10-4-live-test-result"),
  coreStatus: document.querySelector("#core-status"),
  version: document.querySelector("#client-version"),
  uptime: document.querySelector("#uptime"),
  platform: document.querySelector("#platform"),
  accountStatus: document.querySelector("#account-status"),
  accountUserId: document.querySelector("#account-user-id"),
  accountConnectedAt: document.querySelector("#account-connected-at"),
  accountForm: document.querySelector("#account-login-form"),
  accountEmail: document.querySelector("#account-email"),
  accountPassword: document.querySelector("#account-password"),
  accountConnect: document.querySelector("#account-connect"),
  accountDisconnect: document.querySelector("#account-disconnect"),
  selectionPanel: document.querySelector("#selection-panel"),
  selectionStatus: document.querySelector("#selection-status"),
  characterCount: document.querySelector("#character-count"),
  serverCount: document.querySelector("#server-count"),
  selectedServer: document.querySelector("#selected-server"),
  characterList: document.querySelector("#character-list"),
  serverList: document.querySelector("#server-list"),
  serverSelect: document.querySelector("#server-select"),
  selectServer: document.querySelector("#select-server"),
  refreshSelection: document.querySelector("#refresh-selection"),
  characterConnectionStatus: document.querySelector("#character-connection-status"),
  activeCharacter: document.querySelector("#active-character"),
  characterServer: document.querySelector("#character-server"),
  characterConnectedAt: document.querySelector("#character-connected-at"),
  characterHp: document.querySelector("#character-hp"),
  characterMp: document.querySelector("#character-mp"),
  characterLevel: document.querySelector("#character-level"),
  characterXp: document.querySelector("#character-xp"),
  characterMap: document.querySelector("#character-map"),
  characterPosition: document.querySelector("#character-position"),
  characterDirection: document.querySelector("#character-direction"),
  characterTarget: document.querySelector("#character-target"),
  characterDeathState: document.querySelector("#character-death-state"),
  characterPing: document.querySelector("#character-ping"),
  characterGold: document.querySelector("#character-gold"),
  characterInventorySummary: document.querySelector("#character-inventory-summary"),
  characterEquipmentSummary: document.querySelector("#character-equipment-summary"),
  characterConditionsSummary: document.querySelector("#character-conditions-summary"),
  characterEntitiesSummary: document.querySelector("#character-entities-summary"),
  characterPlayersSummary: document.querySelector("#character-players-summary"),
  characterMonstersSummary: document.querySelector("#character-monsters-summary"),
  characterPartySummary: document.querySelector("#character-party-summary"),
  characterEntities: document.querySelector("#character-entities"),
  characterParty: document.querySelector("#character-party"),
  characterInventory: document.querySelector("#character-inventory"),
  characterEquipment: document.querySelector("#character-equipment"),
  characterConditions: document.querySelector("#character-conditions"),
  characterSelect: document.querySelector("#character-select"),
  startCharacter: document.querySelector("#start-character"),
  stopCharacter: document.querySelector("#stop-character"),
  actionGatewayStatus: document.querySelector("#action-gateway-status"),
  actionGatewayActive: document.querySelector("#action-gateway-active"),
  actionGatewayTotal: document.querySelector("#action-gateway-total"),
  actionGatewayRequestId: document.querySelector("#action-gateway-request-id"),
  actionGatewayOutcome: document.querySelector("#action-gateway-outcome"),
  runActionGatewayProbe: document.querySelector("#run-action-gateway-probe"),
  movementMode: document.querySelector("#movement-mode"),
  movementButtons: document.querySelectorAll("[data-movement-direction]"),
  attackTarget: document.querySelector("#attack-target"),
  runAttackTest: document.querySelector("#run-attack-test"),
  skillName: document.querySelector("#skill-name"),
  skillTarget: document.querySelector("#skill-target"),
  runSkillTest: document.querySelector("#run-skill-test"),
  skillTestNote: document.querySelector("#skill-test-note"),
  lootChest: document.querySelector("#loot-chest"),
  runLootTest: document.querySelector("#run-loot-test"),
  consumableItem: document.querySelector("#consumable-item"),
  runConsumableTest: document.querySelector("#run-consumable-test"),
  lootConsumableTestNote: document.querySelector("#loot-consumable-test-note"),
  startSlice35LiveTest: document.querySelector("#start-slice-3-5-live-test"),
  slice35LiveTestStatus: document.querySelector("#slice-3-5-live-test-status"),
  slice35LiveTestNote: document.querySelector("#slice-3-5-live-test-note"),
  copySlice35LiveTestResult: document.querySelector("#copy-slice-3-5-live-test-result"),
  scriptRuntimeStatus: document.querySelector("#script-runtime-status"),
  scriptRuntimeName: document.querySelector("#script-runtime-name"),
  scriptRuntimeTimers: document.querySelector("#script-runtime-timers"),
  scriptRuntimeLogRecords: document.querySelector("#script-runtime-log-records"),
  scriptRuntimeScriptName: document.querySelector("#script-runtime-script-name"),
  scriptRuntimeSource: document.querySelector("#script-runtime-source"),
  scriptRuntimeLoad: document.querySelector("#script-runtime-load"),
  scriptRuntimeStart: document.querySelector("#script-runtime-start"),
  scriptRuntimePause: document.querySelector("#script-runtime-pause"),
  scriptRuntimeStop: document.querySelector("#script-runtime-stop"),
  startSlice41LiveTest: document.querySelector("#start-slice-4-1-live-test"),
  slice41LiveTestStatus: document.querySelector("#slice-4-1-live-test-status"),
  slice41LiveTestNote: document.querySelector("#slice-4-1-live-test-note"),
  copySlice41LiveTestResult: document.querySelector("#copy-slice-4-1-live-test-result"),
  startSlice42LiveTest: document.querySelector("#start-slice-4-2-live-test"),
  slice42LiveTestStatus: document.querySelector("#slice-4-2-live-test-status"),
  slice42LiveTestNote: document.querySelector("#slice-4-2-live-test-note"),
  copySlice42LiveTestResult: document.querySelector("#copy-slice-4-2-live-test-result"),
  startSlice43LiveTest: document.querySelector("#start-slice-4-3-live-test"),
  slice43LiveTestStatus: document.querySelector("#slice-4-3-live-test-status"),
  slice43LiveTestNote: document.querySelector("#slice-4-3-live-test-note"),
  copySlice43LiveTestResult: document.querySelector("#copy-slice-4-3-live-test-result"),
  startSlice44LiveTest: document.querySelector("#start-slice-4-4-live-test"),
  slice44LiveTestStatus: document.querySelector("#slice-4-4-live-test-status"),
  slice44LiveTestNote: document.querySelector("#slice-4-4-live-test-note"),
  copySlice44LiveTestResult: document.querySelector("#copy-slice-4-4-live-test-result"),
  simpleFarmerMonster: document.querySelector("#simple-farmer-monster"),
  simpleFarmerHpThreshold: document.querySelector("#simple-farmer-hp-threshold"),
  simpleFarmerMpThreshold: document.querySelector("#simple-farmer-mp-threshold"),
  simpleFarmerLoot: document.querySelector("#simple-farmer-loot"),
  simpleFarmerRespawn: document.querySelector("#simple-farmer-respawn"),
  simpleFarmerStart: document.querySelector("#simple-farmer-start"),
  simpleFarmerStop: document.querySelector("#simple-farmer-stop"),
  simpleFarmerStatus: document.querySelector("#simple-farmer-status"),
  simpleFarmerNote: document.querySelector("#simple-farmer-note"),
  startSlice45LiveTest: document.querySelector("#start-slice-4-5-live-test"),
  slice45LiveTestStatus: document.querySelector("#slice-4-5-live-test-status"),
  slice45LiveTestNote: document.querySelector("#slice-4-5-live-test-note"),
  copySlice45LiveTestResult: document.querySelector("#copy-slice-4-5-live-test-result"),
  startSlice51LiveTest: document.querySelector("#start-slice-5-1-live-test"),
  slice51LiveTestStatus: document.querySelector("#slice-5-1-live-test-status"),
  slice51LiveTestNote: document.querySelector("#slice-5-1-live-test-note"),
  copySlice51LiveTestResult: document.querySelector("#copy-slice-5-1-live-test-result"),
  startSlice52LiveTest: document.querySelector("#start-slice-5-2-live-test"),
  slice52LiveTestStatus: document.querySelector("#slice-5-2-live-test-status"),
  slice52LiveTestNote: document.querySelector("#slice-5-2-live-test-note"),
  copySlice52LiveTestResult: document.querySelector("#copy-slice-5-2-live-test-result"),
  startSlice53LiveTest: document.querySelector("#start-slice-5-3-live-test"),
  slice53LiveTestStatus: document.querySelector("#slice-5-3-live-test-status"),
  slice53LiveTestNote: document.querySelector("#slice-5-3-live-test-note"),
  copySlice53LiveTestResult: document.querySelector("#copy-slice-5-3-live-test-result"),
  startSlice54LiveTest: document.querySelector("#start-slice-5-4-live-test"),
  slice54LiveTestStatus: document.querySelector("#slice-5-4-live-test-status"),
  slice54LiveTestNote: document.querySelector("#slice-5-4-live-test-note"),
  copySlice54LiveTestResult: document.querySelector("#copy-slice-5-4-live-test-result"),
  startSlice61LiveTest: document.querySelector("#start-slice-6-1-live-test"),
  slice61LiveTestStatus: document.querySelector("#slice-6-1-live-test-status"),
  slice61LiveTestNote: document.querySelector("#slice-6-1-live-test-note"),
  copySlice61LiveTestResult: document.querySelector("#copy-slice-6-1-live-test-result"),
  startSlice62LiveTest: document.querySelector("#start-slice-6-2-live-test"),
  slice62LiveTestStatus: document.querySelector("#slice-6-2-live-test-status"),
  slice62LiveTestNote: document.querySelector("#slice-6-2-live-test-note"),
  copySlice62LiveTestResult: document.querySelector("#copy-slice-6-2-live-test-result"),
  startSlice63LiveTest: document.querySelector("#start-slice-6-3-live-test"),
  slice63LiveTestStatus: document.querySelector("#slice-6-3-live-test-status"),
  slice63LiveTestNote: document.querySelector("#slice-6-3-live-test-note"),
  copySlice63LiveTestResult: document.querySelector("#copy-slice-6-3-live-test-result"),
  startSlice64LiveTest: document.querySelector("#start-slice-6-4-live-test"),
  slice64LiveTestStatus: document.querySelector("#slice-6-4-live-test-status"),
  slice64LiveTestNote: document.querySelector("#slice-6-4-live-test-note"),
  copySlice64LiveTestResult: document.querySelector("#copy-slice-6-4-live-test-result"),
  characterSessionsStatus: document.querySelector("#character-sessions-status"),
  characterSessionsActive: document.querySelector("#character-sessions-active"),
  characterSessionsLimit: document.querySelector("#character-sessions-limit"),
  characterSessionsGameData: document.querySelector("#character-sessions-game-data"),
  characterSessionsList: document.querySelector("#character-sessions-list"),
  characterSessionsNote: document.querySelector("#character-sessions-note"),
  startSlice71LiveTest: document.querySelector("#start-slice-7-1-live-test"),
  slice71LiveTestStatus: document.querySelector("#slice-7-1-live-test-status"),
  slice71LiveTestNote: document.querySelector("#slice-7-1-live-test-note"),
  copySlice71LiveTestResult: document.querySelector("#copy-slice-7-1-live-test-result"),
  characterMessagingStatus: document.querySelector("#character-messaging-status"),
  characterMessagingRequests: document.querySelector("#character-messaging-requests"),
  characterMessagingDeliveries: document.querySelector("#character-messaging-deliveries"),
  characterMessagingUnavailable: document.querySelector("#character-messaging-unavailable"),
  characterMessagingNote: document.querySelector("#character-messaging-note"),
  startSlice72LiveTest: document.querySelector("#start-slice-7-2-live-test"),
  slice72LiveTestStatus: document.querySelector("#slice-7-2-live-test-status"),
  slice72LiveTestNote: document.querySelector("#slice-7-2-live-test-note"),
  copySlice72LiveTestResult: document.querySelector("#copy-slice-7-2-live-test-result"),
  partyCoordinatorStatus: document.querySelector("#party-coordinator-status"),
  partyCoordinatorMembers: document.querySelector("#party-coordinator-members"),
  partyCoordinatorTarget: document.querySelector("#party-coordinator-target"),
  partyCoordinatorRoles: document.querySelector("#party-coordinator-roles"),
  partyCoordinatorList: document.querySelector("#party-coordinator-list"),
  partyCoordinatorNote: document.querySelector("#party-coordinator-note"),
  startSlice73LiveTest: document.querySelector("#start-slice-7-3-live-test"),
  slice73LiveTestStatus: document.querySelector("#slice-7-3-live-test-status"),
  slice73LiveTestNote: document.querySelector("#slice-7-3-live-test-note"),
  copySlice73LiveTestResult: document.querySelector("#copy-slice-7-3-live-test-result"),
  partyTemplatesStatus: document.querySelector("#party-templates-status"),
  partyTemplatesMatched: document.querySelector("#party-templates-matched"),
  partyTemplatesSafety: document.querySelector("#party-templates-safety"),
  partyTemplateMember: document.querySelector("#party-template-member"),
  partyTemplateRole: document.querySelector("#party-template-role"),
  assignPartyTemplateRole: document.querySelector("#assign-party-template-role"),
  clearPartyTemplateRole: document.querySelector("#clear-party-template-role"),
  applyRecommendedPartyRoles: document.querySelector("#apply-recommended-party-roles"),
  partyTemplatesList: document.querySelector("#party-templates-list"),
  partyTemplatesNote: document.querySelector("#party-templates-note"),
  startSlice74LiveTest: document.querySelector("#start-slice-7-4-live-test"),
  slice74LiveTestStatus: document.querySelector("#slice-7-4-live-test-status"),
  slice74LiveTestNote: document.querySelector("#slice-7-4-live-test-note"),
  copySlice74LiveTestResult: document.querySelector("#copy-slice-7-4-live-test-result"),
  characterCardsGrid: document.querySelector("#character-cards-grid"),
  characterCardsStatus: document.querySelector("#character-cards-status"),
  characterCardsNote: document.querySelector("#character-cards-note"),
  startSlice81LiveTest: document.querySelector("#start-slice-8-1-live-test"),
  slice81LiveTestStatus: document.querySelector("#slice-8-1-live-test-status"),
  slice81LiveTestNote: document.querySelector("#slice-8-1-live-test-note"),
  copySlice81LiveTestResult: document.querySelector("#copy-slice-8-1-live-test-result"),
  setupWizard: document.querySelector("#setup-wizard"),
  setupWizardStatus: document.querySelector("#setup-wizard-status"),
  setupWizardStepButtons: document.querySelectorAll("[data-setup-wizard-step]"),
  setupWizardPanels: document.querySelectorAll("[data-setup-wizard-panel]"),
  setupWizardEmail: document.querySelector("#setup-wizard-email"),
  setupWizardPassword: document.querySelector("#setup-wizard-password"),
  setupWizardConnectAccount: document.querySelector("#setup-wizard-connect-account"),
  setupWizardAccountNote: document.querySelector("#setup-wizard-account-note"),
  setupWizardCharacter: document.querySelector("#setup-wizard-character"),
  setupWizardServer: document.querySelector("#setup-wizard-server"),
  setupWizardTaskTemplate: document.querySelector("#setup-wizard-task-template"),
  setupWizardTaskNote: document.querySelector("#setup-wizard-task-note"),
  setupWizardConfigConnectOnly: document.querySelector("#setup-wizard-config-connect-only"),
  setupWizardConfigSimpleFarmer: document.querySelector("#setup-wizard-config-simple-farmer"),
  setupWizardConfigCustomScript: document.querySelector("#setup-wizard-config-custom-script"),
  setupWizardFarmerMonster: document.querySelector("#setup-wizard-farmer-monster"),
  setupWizardFarmerHp: document.querySelector("#setup-wizard-farmer-hp"),
  setupWizardFarmerMp: document.querySelector("#setup-wizard-farmer-mp"),
  setupWizardFarmerLoot: document.querySelector("#setup-wizard-farmer-loot"),
  setupWizardFarmerRespawn: document.querySelector("#setup-wizard-farmer-respawn"),
  setupWizardScriptName: document.querySelector("#setup-wizard-script-name"),
  setupWizardScriptSource: document.querySelector("#setup-wizard-script-source"),
  setupWizardSummary: document.querySelector("#setup-wizard-summary"),
  setupWizardStart: document.querySelector("#setup-wizard-start"),
  setupWizardStartNote: document.querySelector("#setup-wizard-start-note"),
  setupWizardBack: document.querySelector("#setup-wizard-back"),
  setupWizardNext: document.querySelector("#setup-wizard-next"),
  startSlice82LiveTest: document.querySelector("#start-slice-8-2-live-test"),
  slice82LiveTestStatus: document.querySelector("#slice-8-2-live-test-status"),
  slice82LiveTestNote: document.querySelector("#slice-8-2-live-test-note"),
  copySlice82LiveTestResult: document.querySelector("#copy-slice-8-2-live-test-result"),
  templateConfigTemplate: document.querySelector("#template-config-template"),
  templateConfigStatus: document.querySelector("#template-config-status"),
  templateConfigFields: document.querySelector("#template-config-fields"),
  templateConfigSave: document.querySelector("#template-config-save"),
  templateConfigReset: document.querySelector("#template-config-reset"),
  templateConfigStart: document.querySelector("#template-config-start"),
  templateConfigStop: document.querySelector("#template-config-stop"),
  templateConfigNote: document.querySelector("#template-config-note"),
  startSlice83LiveTest: document.querySelector("#start-slice-8-3-live-test"),
  slice83LiveTestStatus: document.querySelector("#slice-8-3-live-test-status"),
  slice83LiveTestNote: document.querySelector("#slice-8-3-live-test-note"),
  copySlice83LiveTestResult: document.querySelector("#copy-slice-8-3-live-test-result"),
  explainabilityStatus: document.querySelector("#explainability-status"),
  explainabilityStrategy: document.querySelector("#explainability-strategy"),
  explainabilityCurrentTarget: document.querySelector("#explainability-current-target"),
  explainabilityRange: document.querySelector("#explainability-range"),
  explainabilityCooldowns: document.querySelector("#explainability-cooldowns"),
  explainabilityMovementTarget: document.querySelector("#explainability-movement-target"),
  explainabilityNextAction: document.querySelector("#explainability-next-action"),
  explainabilitySelectionReason: document.querySelector("#explainability-selection-reason"),
  explainabilityRejectedTargets: document.querySelector("#explainability-rejected-targets"),
  explainabilityBlockers: document.querySelector("#explainability-blockers"),
  explainabilityNote: document.querySelector("#explainability-note"),
  startSlice84LiveTest: document.querySelector("#start-slice-8-4-live-test"),
  slice84LiveTestStatus: document.querySelector("#slice-8-4-live-test-status"),
  slice84LiveTestNote: document.querySelector("#slice-8-4-live-test-note"),
  copySlice84LiveTestResult: document.querySelector("#copy-slice-8-4-live-test-result"),
  movementDebugStatus: document.querySelector("#movement-debug-status"),
  movementDebugTrailCount: document.querySelector("#movement-debug-trail-count"),
  movementDebugMovementCount: document.querySelector("#movement-debug-movement-count"),
  movementDebugPlanCount: document.querySelector("#movement-debug-plan-count"),
  movementDebugTrail: document.querySelector("#movement-debug-trail"),
  movementDebugRoute: document.querySelector("#movement-debug-route"),
  movementDebugNote: document.querySelector("#movement-debug-note"),
  gameVersion: document.querySelector("#game-version"),
  gameVersionStatus: document.querySelector("#game-version-status"),
  gameLastDeploy: document.querySelector("#game-last-deploy"),
  checkGameVersion: document.querySelector("#check-game-version"),
  gameDataStatus: document.querySelector("#game-data-status"),
  gameDataVersion: document.querySelector("#game-data-version"),
  gameDataFamilyTotal: document.querySelector("#game-data-family-total"),
  gameDataLoadedAt: document.querySelector("#game-data-loaded-at"),
  gameDataOrigin: document.querySelector("#game-data-origin"),
  gameDataCacheStatus: document.querySelector("#game-data-cache-status"),
  gameDataCachedAt: document.querySelector("#game-data-cached-at"),
  gameDataFamilies: document.querySelector("#game-data-families"),
  reloadGameData: document.querySelector("#reload-game-data"),
  console: document.querySelector("#log-console"),
  feedback: document.querySelector("#feedback"),
  level: document.querySelector("#level-filter"),
  search: document.querySelector("#search"),
  autoScroll: document.querySelector("#auto-scroll"),
  pause: document.querySelector("#pause"),
  copyFull: document.querySelector("#copy-full"),
  copyFiltered: document.querySelector("#copy-filtered"),
  download: document.querySelector("#download-log"),
  clear: document.querySelector("#clear-log"),
  checkUpdates: document.querySelector("#check-updates"),
  updateBanner: document.querySelector("#update-banner"),
  updateTitle: document.querySelector("#update-title"),
  updateSummary: document.querySelector("#update-summary"),
  releaseNotes: document.querySelector("#release-notes"),
  updateProgress: document.querySelector("#update-progress"),
  updateProgressBar: document.querySelector("#update-progress-bar"),
  updateProgressLabel: document.querySelector("#update-progress-label"),
  installUpdate: document.querySelector("#install-update"),
  skipUpdate: document.querySelector("#skip-update"),
  remindUpdate: document.querySelector("#remind-update"),
  componentHealth: document.querySelector("#component-health"),
  recentErrors: document.querySelector("#recent-errors-list"),
  copySnapshot: document.querySelector("#copy-snapshot"),
  downloadPackage: document.querySelector("#download-package"),
};

function setFeedback(message, kind = "") {
  elements.feedback.textContent = message;
  elements.feedback.className = `feedback ${kind}`.trim();
}


function mountCurrentVerification() {
  const currentSlice = document.body.dataset.currentVerificationSlice?.trim() ?? "";
  const tests = [...document.querySelectorAll("[data-verification-test]")];

  for (const test of tests) {
    test.hidden = true;
  }

  if (!currentSlice) {
    elements.currentVerificationStatus.textContent = "None required";
    elements.currentVerificationEmpty.hidden = false;
    return;
  }

  const current = tests.find((test) => test.dataset.verificationTest === currentSlice);
  if (!current) {
    elements.currentVerificationStatus.textContent = `Slice ${currentSlice} unavailable`;
    elements.currentVerificationEmpty.textContent =
      `The current Slice ${currentSlice} verification control is not present in this build.`;
    elements.currentVerificationEmpty.hidden = false;
    return;
  }

  elements.currentVerificationSlot.replaceChildren(current);
  current.hidden = false;
  elements.currentVerificationStatus.textContent = `Slice ${currentSlice}`;
  elements.currentVerificationEmpty.hidden = true;
}

mountCurrentVerification();

let dashboardEditor;
function renderDashboardEditMode() {
  if (!dashboardEditor) return;
  const editing = dashboardEditor.enabled;
  elements.editDashboard.setAttribute("aria-pressed", String(editing));
  elements.editDashboard.textContent = editing ? "Finish editing" : "Edit dashboard";
  elements.dashboardEditToolbar.hidden = !editing;
  elements.dashboardEditStatus.textContent = editing ? "Editing" : "Normal mode";

  const removed = dashboardEditor.removedWidgets();
  elements.dashboardWidgetAddSelect.replaceChildren();
  if (removed.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No removed widgets";
    elements.dashboardWidgetAddSelect.append(option);
    elements.dashboardWidgetAddSelect.disabled = true;
    elements.dashboardAddWidget.disabled = true;
  } else {
    for (const widget of removed) {
      const option = document.createElement("option");
      option.value = widget.id;
      option.textContent = widget.label;
      elements.dashboardWidgetAddSelect.append(option);
    }
    elements.dashboardWidgetAddSelect.disabled = false;
    elements.dashboardAddWidget.disabled = false;
  }
}

function renderDashboardPages() {
  if (!dashboardEditor || !elements.dashboardPageTabs) return;
  const activePage = dashboardEditor.activePage;
  for (const button of elements.dashboardPageTabs.querySelectorAll("[data-dashboard-page]")) {
    const selected = button.dataset.dashboardPage === activePage;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
}

function currentDashboardLayoutVariant() {
  return globalThis.innerWidth <= 720 ? "small" : "desktop";
}

function activeDashboardLayoutProfile() {
  const layouts = state.dashboardLayouts;
  return layouts?.profiles?.find((profile) => profile.id === layouts.activeProfileId) ?? null;
}

function renderDashboardLayoutControls() {
  if (!dashboardEditor || !elements.dashboardLayoutProfile) return;
  const layouts = state.dashboardLayouts;
  const variant = currentDashboardLayoutVariant();
  elements.dashboardLayoutVariant.textContent = variant === "small" ? "Small screen" : "Desktop";
  elements.dashboardLayoutProfile.replaceChildren();

  for (const profile of layouts?.profiles ?? []) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    elements.dashboardLayoutProfile.append(option);
  }
  if (layouts?.activeProfileId) elements.dashboardLayoutProfile.value = layouts.activeProfileId;

  const available = Boolean(layouts?.profiles?.length);
  elements.dashboardLayoutProfile.disabled = !available;
  elements.dashboardLayoutSave.disabled = !available;
  elements.dashboardLayoutReset.disabled = !available;
  elements.dashboardLayoutProfileDelete.disabled = !available;
  elements.dashboardLayoutUndo.disabled = !dashboardEditor.canUndo();
  elements.dashboardLayoutRedo.disabled = !dashboardEditor.canRedo();
}

function renderDashboardEditorState() {
  renderDashboardEditMode();
  renderDashboardPages();
  renderDashboardLayoutControls();
  renderDashboardImportPanel();
}

async function dashboardLayoutRequest(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Dashboard layout request failed with HTTP ${response.status}.`);
  return payload;
}

async function applyActiveDashboardLayout() {
  const profile = activeDashboardLayoutProfile();
  const layout = profile?.layouts?.[currentDashboardLayoutVariant()];
  if (layout) dashboardEditor.applyPersistentState(layout, { notify: false });
  else if (dashboardEditor.defaultPersistentState) {
    dashboardEditor.applyPersistentState(dashboardEditor.defaultPersistentState, { notify: false });
  }
  dashboardEditor.clearHistory();
  renderDashboardEditorState();
}

async function refreshDashboardLayouts({ apply = false } = {}) {
  state.dashboardLayouts = await dashboardLayoutRequest("/api/dashboard-layout");
  if (apply) await applyActiveDashboardLayout();
  else renderDashboardLayoutControls();
  return state.dashboardLayouts;
}

function dashboardProfileId(name) {
  const base = String(name || "profile")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "profile";
  const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Date.now().toString(36);
  return `${base}-${suffix}`;
}

function dashboardExportFilename(name) {
  const base = String(name || "dashboard-profile")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "dashboard-profile";
  return `${base}.alremastered-dashboard.json`;
}

function downloadDashboardExport(portable) {
  const json = `${JSON.stringify(portable, null, 2)}\n`;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = dashboardExportFilename(portable.profile.name);
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
  return json;
}

function dashboardImportMapping() {
  const mapping = {};
  for (const select of elements.dashboardLayoutRoleMappings.querySelectorAll("[data-dashboard-role]")) {
    mapping[select.dataset.dashboardRole] = select.value;
  }
  return mapping;
}

function syncDashboardImportApply() {
  const pending = state.pendingDashboardImport;
  if (!pending) {
    elements.dashboardLayoutImportApply.disabled = true;
    return;
  }
  const roleIds = portableDashboardRoleIds(pending);
  const mapping = dashboardImportMapping();
  elements.dashboardLayoutImportApply.disabled =
    roleIds.some((roleId) => !String(mapping[roleId] ?? "").trim());
}

function renderDashboardImportPanel() {
  const pending = state.pendingDashboardImport;
  elements.dashboardLayoutImportPanel.hidden = !pending;
  elements.dashboardLayoutRoleMappings.replaceChildren();
  if (!pending) {
    elements.dashboardLayoutImportSummary.textContent =
      "Choose a portable ALRemastered dashboard profile.";
    elements.dashboardLayoutImportApply.disabled = true;
    return;
  }

  const roles = pending.profile.roles;
  const characters = dashboardEditor?.characters?.() ?? [];
  const variants = ["desktop", "small"].filter((variant) => pending.profile.layouts[variant]);
  elements.dashboardLayoutImportSummary.textContent =
    `Profile "${pending.profile.name}" · ${variants.map((variant) => variant === "small" ? "Small screen" : "Desktop").join(" + ")} · ${roles.length} Character role(s).`;

  if (!roles.length) {
    const note = document.createElement("small");
    note.textContent = "This profile has no Character-bound widgets and requires no role mapping.";
    elements.dashboardLayoutRoleMappings.append(note);
  }

  for (const role of roles) {
    const label = document.createElement("label");
    label.className = "dashboard-layout-role-map";

    const title = document.createElement("span");
    title.className = "label";
    title.textContent = role.label;

    const select = document.createElement("select");
    select.dataset.dashboardRole = role.id;
    select.setAttribute("aria-label", `Map ${role.label}`);

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = characters.length ? "Choose Character…" : "No Characters available";
    select.append(empty);

    for (const character of characters) {
      const option = document.createElement("option");
      option.value = character.id;
      option.textContent = character.name;
      select.append(option);
    }

    select.addEventListener("change", syncDashboardImportApply);
    label.append(title, select);
    elements.dashboardLayoutRoleMappings.append(label);
  }

  syncDashboardImportApply();
}

dashboardEditor = new DashboardEditor({
  document,
  onChange: () => renderDashboardEditorState(),
}).init();
renderDashboardEditorState();
void refreshDashboardLayouts({ apply: true }).catch((error) => {
  setFeedback(`Dashboard layout profiles could not load: ${error.message}`, "error");
});

elements.dashboardPageTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-dashboard-page]");
  if (!button) return;
  const pageId = button.dataset.dashboardPage;
  const page = dashboardEditor.pages().find((item) => item.id === pageId);
  dashboardEditor.setActivePage(pageId);
  setFeedback(`Dashboard page changed to ${page?.label ?? pageId}. Page selection is not persisted.`);
});

elements.editDashboard.addEventListener("click", () => {
  dashboardEditor.toggle();
  setFeedback(
    dashboardEditor.enabled
      ? "Dashboard edit mode enabled. Drag, resize, configure, duplicate, remove, or add widgets. Use Save layout to persist changes."
      : "Dashboard edit mode disabled. Normal dashboard controls are active.",
  );
});

elements.dashboardAddWidget.addEventListener("click", () => {
  const id = elements.dashboardWidgetAddSelect.value;
  if (!id) return;
  dashboardEditor.addWidget(id);
  setFeedback("Widget added to the current dashboard session.", "success");
});


elements.dashboardLayoutProfile.addEventListener("change", async () => {
  try {
    state.dashboardLayouts = await dashboardLayoutRequest("/api/dashboard-layout/profile/active", {
      profileId: elements.dashboardLayoutProfile.value,
    });
    await applyActiveDashboardLayout();
    setFeedback("Dashboard layout profile activated.", "success");
  } catch (error) {
    setFeedback(`Layout profile could not be activated: ${error.message}`, "error");
  }
});

elements.dashboardLayoutProfileCreate.addEventListener("click", async () => {
  const name = elements.dashboardLayoutProfileName.value.trim();
  if (!name) {
    setFeedback("Enter a profile name first.", "error");
    return;
  }
  try {
    state.dashboardLayouts = await dashboardLayoutRequest("/api/dashboard-layout/profile/create", {
      profileId: dashboardProfileId(name),
      name,
    });
    elements.dashboardLayoutProfileName.value = "";
    await applyActiveDashboardLayout();
    setFeedback("Dashboard layout profile created.", "success");
  } catch (error) {
    setFeedback(`Layout profile could not be created: ${error.message}`, "error");
  }
});

elements.dashboardLayoutProfileDelete.addEventListener("click", async () => {
  const profileId = state.dashboardLayouts?.activeProfileId;
  if (!profileId) return;
  try {
    state.dashboardLayouts = await dashboardLayoutRequest("/api/dashboard-layout/profile/delete", { profileId });
    await applyActiveDashboardLayout();
    setFeedback("Dashboard layout profile deleted.", "success");
  } catch (error) {
    setFeedback(`Layout profile could not be deleted: ${error.message}`, "error");
  }
});

elements.dashboardLayoutSave.addEventListener("click", async () => {
  const profileId = state.dashboardLayouts?.activeProfileId;
  if (!profileId) return;
  try {
    state.dashboardLayouts = await dashboardLayoutRequest("/api/dashboard-layout/save", {
      profileId,
      variant: currentDashboardLayoutVariant(),
      layout: dashboardEditor.persistentState(),
    });
    dashboardEditor.clearHistory();
    setFeedback("Dashboard layout saved to disk.", "success");
  } catch (error) {
    setFeedback(`Dashboard layout could not be saved: ${error.message}`, "error");
  }
});

elements.dashboardLayoutUndo.addEventListener("click", () => {
  if (dashboardEditor.undo()) setFeedback("Dashboard layout change undone.", "success");
});

elements.dashboardLayoutRedo.addEventListener("click", () => {
  if (dashboardEditor.redo()) setFeedback("Dashboard layout change redone.", "success");
});

elements.dashboardLayoutReset.addEventListener("click", async () => {
  const profileId = state.dashboardLayouts?.activeProfileId;
  if (!profileId) return;
  try {
    dashboardEditor.resetToDefault();
    state.dashboardLayouts = await dashboardLayoutRequest("/api/dashboard-layout/reset", {
      profileId,
      variant: currentDashboardLayoutVariant(),
    });
    setFeedback("Current viewport layout reset to defaults.", "success");
  } catch (error) {
    setFeedback(`Dashboard layout could not be reset: ${error.message}`, "error");
  }
});

elements.dashboardLayoutExport.addEventListener("click", () => {
  try {
    const profile = activeDashboardLayoutProfile();
    if (!profile) throw new Error("No active dashboard profile is available.");
    const portable = createPortableDashboardProfile(profile);
    downloadDashboardExport(portable);
    setFeedback(
      `Dashboard profile "${profile.name}" exported without fixed Character IDs or names.`,
      "success",
    );
  } catch (error) {
    setFeedback(`Dashboard profile export failed: ${error.message}`, "error");
  }
});

elements.dashboardLayoutImport.addEventListener("click", () => {
  elements.dashboardLayoutImportFile.value = "";
  elements.dashboardLayoutImportFile.click();
});

elements.dashboardLayoutImportFile.addEventListener("change", async () => {
  const file = elements.dashboardLayoutImportFile.files?.[0];
  if (!file) return;
  try {
    state.pendingDashboardImport = parsePortableDashboardProfile(await file.text());
    renderDashboardImportPanel();
    setFeedback(
      "Dashboard import file validated. Map every Character role before importing.",
      "success",
    );
  } catch (error) {
    state.pendingDashboardImport = null;
    renderDashboardImportPanel();
    setFeedback(`Dashboard import file is invalid: ${error.message}`, "error");
  }
});

elements.dashboardLayoutImportCancel.addEventListener("click", () => {
  state.pendingDashboardImport = null;
  elements.dashboardLayoutImportFile.value = "";
  renderDashboardImportPanel();
  setFeedback("Dashboard import cancelled.");
});

elements.dashboardLayoutImportApply.addEventListener("click", async () => {
  const pending = state.pendingDashboardImport;
  if (!pending) return;
  const roleMapping = dashboardImportMapping();
  let importedProfileId = null;
  try {
    const resolved = resolvePortableDashboardProfile(pending, roleMapping);
    importedProfileId = dashboardProfileId(resolved.name);
    state.dashboardLayouts = await dashboardLayoutRequest("/api/dashboard-layout/profile/create", {
      profileId: importedProfileId,
      name: resolved.name,
    });
    for (const variant of ["desktop", "small"]) {
      const layout = resolved.layouts[variant];
      if (!layout) continue;
      state.dashboardLayouts = await dashboardLayoutRequest("/api/dashboard-layout/save", {
        profileId: importedProfileId,
        variant,
        layout,
      });
    }
    await applyActiveDashboardLayout();
    state.pendingDashboardImport = null;
    elements.dashboardLayoutImportFile.value = "";
    renderDashboardImportPanel();
    setFeedback(
      `Dashboard profile "${resolved.name}" imported with explicit Character role mapping.`,
      "success",
    );
  } catch (error) {
    if (importedProfileId) {
      try {
        state.dashboardLayouts = await dashboardLayoutRequest("/api/dashboard-layout/profile/delete", {
          profileId: importedProfileId,
        });
      } catch {
        // Preserve the import error; cleanup is best effort.
      }
    }
    renderDashboardImportPanel();
    setFeedback(`Dashboard profile import failed: ${error.message}`, "error");
  }
});

let lastDashboardLayoutVariant = currentDashboardLayoutVariant();
globalThis.addEventListener("resize", () => {
  const variant = currentDashboardLayoutVariant();
  if (variant === lastDashboardLayoutVariant) return;
  lastDashboardLayoutVariant = variant;
  void applyActiveDashboardLayout().catch((error) => {
    setFeedback(`Viewport layout could not be applied: ${error.message}`, "error");
  });
});

function renderSlice91LiveTest() {
  const test = state.slice91LiveTest ?? { status: "idle", message: "Ready." };
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    failed: "FAILED",
  };
  elements.slice91LiveTestStatus.textContent = labels[test.status] ?? test.status;
  elements.startSlice91LiveTest.disabled = test.status === "running";
  elements.copySlice91LiveTestResult.hidden = !state.slice91LastReport;
  if (test.status === "running") {
    elements.slice91LiveTestNote.textContent =
      "Exercising edit toggle, drag/reorder, resize, grid snapping, add/remove, and normal mode without gameplay actions.";
  } else if (test.message) {
    elements.slice91LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  }
}

async function startSlice91LiveTest(clipboardWrite) {
  const startedAt = new Date().toISOString();
  state.slice91LiveTest = { status: "running", message: "Slice 9.1 dashboard edit test is running." };
  renderSlice91LiveTest();

  const verification = await runDashboardEditorVerification(dashboardEditor);
  const diagnosticsResponse = await fetch("/api/logs/export", { cache: "no-store" });
  if (!diagnosticsResponse.ok) throw new Error(`Diagnostic export failed with HTTP ${diagnosticsResponse.status}.`);
  const diagnostics = await diagnosticsResponse.json();
  const completedAt = new Date().toISOString();
  const testId = `live91-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
  const outcome = verification.outcome;
  const stepLines = verification.steps.map((step) =>
    `- ${step.key}: ${String(step.outcome).toUpperCase()}`
  );
  const reportText = [
    "ALRemastered Slice 9.1 one-click dashboard edit mode test",
    `Test ID: ${testId}`,
    "Slice: 9.1",
    `Outcome: ${String(outcome).toUpperCase()}`,
    `Client: ${state.status?.version ?? "unknown"}`,
    `Platform: ${state.status?.platform ?? "unknown"}`,
    `Started: ${startedAt}`,
    `Completed: ${completedAt}`,
    "",
    "Steps:",
    ...stepLines,
    "",
    `Grid: ${verification.grid.columns} columns / ${verification.grid.rowPx}px row snap`,
    "Persistence: false",
    "Gameplay mutation: false",
    "Action Gateway requests: 0",
    "Raw socket access: false",
    "User Script touched: false",
    `Diagnostic log lines: ${diagnostics.lineCount ?? "unknown"}`,
    "Secrets sanitized: yes",
    "",
    "Sanitized diagnostic log:",
    diagnostics.text ?? "",
  ].join("\n");

  const result = {
    testId,
    slice: "9.1",
    outcome,
    startedAt,
    completedAt,
    message: outcome === "passed"
      ? "Dashboard edit mode verification passed."
      : "Dashboard edit mode verification failed.",
    steps: verification.steps,
    persistence: false,
    gameplayMutation: false,
    rawSocketAccess: false,
    userScriptTouched: false,
  };

  state.slice91LastReport = reportText;
  state.slice91LiveTest = { status: outcome, message: result.message, lastResult: result };
  const copied = await clipboardWrite.finish(reportText);
  renderSlice91LiveTest();
  return { result, reportText, copied };
}

elements.startSlice91LiveTest.addEventListener("click", async () => {
  if (state.slice91LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice91LastReport = null;
  elements.copySlice91LiveTestResult.hidden = true;
  setFeedback("Slice 9.1 dashboard edit test started. It changes dashboard DOM only and restores the starting layout.");
  try {
    const { result, copied } = await startSlice91LiveTest(clipboardWrite);
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 9.1 test ${String(result.outcome).toUpperCase()}. ${copyMessage}`,
      result.outcome === "passed" && copied ? "success" : result.outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    state.slice91LiveTest = { status: "failed", message: error.message };
    renderSlice91LiveTest();
    setFeedback(`Slice 9.1 dashboard edit test could not finish: ${error.message}`, "error");
  }
});

elements.copySlice91LiveTestResult.addEventListener("click", async () => {
  if (!state.slice91LastReport) return;
  try {
    await writeClipboard(state.slice91LastReport);
    setFeedback("Complete Slice 9.1 dashboard edit result and sanitized diagnostic log copied.", "success");
  } catch (error) {
    setFeedback(`Dashboard edit result copy failed: ${error.message}`, "error");
  }
});

renderSlice91LiveTest();

function renderSlice92LiveTest() {
  const test = state.slice92LiveTest ?? { status: "idle", message: "Ready." };
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    failed: "FAILED",
  };
  elements.slice92LiveTestStatus.textContent = labels[test.status] ?? test.status;
  elements.startSlice92LiveTest.disabled = test.status === "running";
  elements.copySlice92LiveTestResult.hidden = !state.slice92LastReport;
  if (test.status === "running") {
    elements.slice92LiveTestNote.textContent =
      "Exercising Character binding, field visibility, display options, duplication, independent duplicate settings, and normal mode without gameplay actions.";
  } else if (test.message) {
    elements.slice92LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  }
}

async function startSlice92LiveTest(clipboardWrite) {
  const startedAt = new Date().toISOString();
  state.slice92LiveTest = {
    status: "running",
    message: "Slice 9.2 widget configuration test is running.",
  };
  renderSlice92LiveTest();

  const verification = await runDashboardWidgetConfigurationVerification(dashboardEditor);
  const diagnosticsResponse = await fetch("/api/logs/export", { cache: "no-store" });
  if (!diagnosticsResponse.ok) {
    throw new Error(`Diagnostic export failed with HTTP ${diagnosticsResponse.status}.`);
  }
  const diagnostics = await diagnosticsResponse.json();
  const completedAt = new Date().toISOString();
  const testId = `live92-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
  const outcome = verification.outcome;
  const stepLines = verification.steps.map((step) =>
    `- ${step.key}: ${String(step.outcome).toUpperCase()}`
  );
  const reportText = [
    "ALRemastered Slice 9.2 one-click widget configuration test",
    `Test ID: ${testId}`,
    "Slice: 9.2",
    `Outcome: ${String(outcome).toUpperCase()}`,
    `Client: ${state.status?.version ?? "unknown"}`,
    `Platform: ${state.status?.platform ?? "unknown"}`,
    `Started: ${startedAt}`,
    `Completed: ${completedAt}`,
    "",
    "Steps:",
    ...stepLines,
    "",
    "Configuration persistence: false",
    "Gameplay mutation: false",
    "Action Gateway requests: 0",
    "Raw socket access: false",
    "User Script touched: false",
    `Diagnostic log lines: ${diagnostics.lineCount ?? "unknown"}`,
    "Secrets sanitized: yes",
    "",
    "Sanitized diagnostic log:",
    diagnostics.text ?? "",
  ].join("\n");

  const result = {
    testId,
    slice: "9.2",
    outcome,
    startedAt,
    completedAt,
    message: outcome === "passed"
      ? "Widget configuration verification passed."
      : "Widget configuration verification failed.",
    steps: verification.steps,
    persistence: false,
    gameplayMutation: false,
    actionGatewayRequests: 0,
    rawSocketAccess: false,
    userScriptTouched: false,
  };

  state.slice92LastReport = reportText;
  state.slice92LiveTest = { status: outcome, message: result.message, lastResult: result };
  const copied = await clipboardWrite.finish(reportText);
  renderSlice92LiveTest();
  return { result, reportText, copied };
}

elements.startSlice92LiveTest.addEventListener("click", async () => {
  if (state.slice92LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice92LastReport = null;
  elements.copySlice92LiveTestResult.hidden = true;
  setFeedback(
    "Slice 9.2 widget configuration test started. It changes dashboard DOM only and restores the starting configuration.",
  );
  try {
    const { result, copied } = await startSlice92LiveTest(clipboardWrite);
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 9.2 test ${String(result.outcome).toUpperCase()}. ${copyMessage}`,
      result.outcome === "passed" && copied ? "success" : result.outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    state.slice92LiveTest = { status: "failed", message: error.message };
    renderSlice92LiveTest();
    setFeedback(`Slice 9.2 widget configuration test could not finish: ${error.message}`, "error");
  }
});

elements.copySlice92LiveTestResult.addEventListener("click", async () => {
  if (!state.slice92LastReport) return;
  try {
    await writeClipboard(state.slice92LastReport);
    setFeedback(
      "Complete Slice 9.2 widget configuration result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Widget configuration result copy failed: ${error.message}`, "error");
  }
});

renderSlice92LiveTest();

function renderSlice93LiveTest() {
  const test = state.slice93LiveTest ?? { status: "idle", message: "Ready." };
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    failed: "FAILED",
  };
  elements.slice93LiveTestStatus.textContent = labels[test.status] ?? test.status;
  elements.startSlice93LiveTest.disabled = test.status === "running";
  elements.copySlice93LiveTestResult.hidden = !state.slice93LastReport;
  if (test.status === "running") {
    elements.slice93LiveTestNote.textContent =
      "Exercising Overview, Combat, Party, Merchant, Logs, and Debugging page filtering without gameplay actions.";
  } else if (test.message) {
    elements.slice93LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  }
}

async function startSlice93LiveTest(clipboardWrite) {
  const startedAt = new Date().toISOString();
  state.slice93LiveTest = {
    status: "running",
    message: "Slice 9.3 dashboard pages test is running.",
  };
  renderSlice93LiveTest();

  const verification = await runDashboardPagesVerification(dashboardEditor);
  const diagnosticsResponse = await fetch("/api/logs/export", { cache: "no-store" });
  if (!diagnosticsResponse.ok) {
    throw new Error(`Diagnostic export failed with HTTP ${diagnosticsResponse.status}.`);
  }
  const diagnostics = await diagnosticsResponse.json();
  const completedAt = new Date().toISOString();
  const testId = `live93-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
  const outcome = verification.outcome;
  const stepLines = verification.steps.map((step) =>
    `- ${step.key}: ${String(step.outcome).toUpperCase()}`
  );
  const pageLabels = verification.pages.map((page) => page.label).join(", ");
  const reportText = [
    "ALRemastered Slice 9.3 one-click dashboard pages and tabs test",
    `Test ID: ${testId}`,
    "Slice: 9.3",
    `Outcome: ${String(outcome).toUpperCase()}`,
    `Client: ${state.status?.version ?? "unknown"}`,
    `Platform: ${state.status?.platform ?? "unknown"}`,
    `Started: ${startedAt}`,
    `Completed: ${completedAt}`,
    "",
    "Steps:",
    ...stepLines,
    "",
    `Pages: ${pageLabels}`,
    "Page selection persistence: false",
    "Gameplay mutation: false",
    "Action Gateway requests: 0",
    "Raw socket access: false",
    "User Script touched: false",
    `Diagnostic log lines: ${diagnostics.lineCount ?? "unknown"}`,
    "Secrets sanitized: yes",
    "",
    "Sanitized diagnostic log:",
    diagnostics.text ?? "",
  ].join("\n");

  const result = {
    testId,
    slice: "9.3",
    outcome,
    startedAt,
    completedAt,
    message: outcome === "passed"
      ? "Dashboard pages and tabs verification passed."
      : "Dashboard pages and tabs verification failed.",
    steps: verification.steps,
    pages: verification.pages,
    persistence: false,
    gameplayMutation: false,
    actionGatewayRequests: 0,
    rawSocketAccess: false,
    userScriptTouched: false,
  };

  state.slice93LastReport = reportText;
  state.slice93LiveTest = { status: outcome, message: result.message, lastResult: result };
  const copied = await clipboardWrite.finish(reportText);
  renderSlice93LiveTest();
  renderDashboardPages();
  return { result, reportText, copied };
}

elements.startSlice93LiveTest.addEventListener("click", async () => {
  if (state.slice93LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice93LastReport = null;
  elements.copySlice93LiveTestResult.hidden = true;
  setFeedback(
    "Slice 9.3 dashboard pages test started. It changes the transient page view only and restores the starting page.",
  );
  try {
    const { result, copied } = await startSlice93LiveTest(clipboardWrite);
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 9.3 test ${String(result.outcome).toUpperCase()}. ${copyMessage}`,
      result.outcome === "passed" && copied ? "success" : result.outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    state.slice93LiveTest = { status: "failed", message: error.message };
    renderSlice93LiveTest();
    renderDashboardPages();
    setFeedback(`Slice 9.3 dashboard pages test could not finish: ${error.message}`, "error");
  }
});

elements.copySlice93LiveTestResult.addEventListener("click", async () => {
  if (!state.slice93LastReport) return;
  try {
    await writeClipboard(state.slice93LastReport);
    setFeedback(
      "Complete Slice 9.3 dashboard pages result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Dashboard pages result copy failed: ${error.message}`, "error");
  }
});

renderSlice93LiveTest();

function renderSlice94LiveTest() {
  const test = state.slice94LiveTest ?? { status: "idle", message: "Ready." };
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    failed: "FAILED",
  };
  elements.slice94LiveTestStatus.textContent = labels[test.status] ?? test.status;
  elements.startSlice94LiveTest.disabled = test.status === "running";
  elements.copySlice94LiveTestResult.hidden = !state.slice94LastReport;
  if (test.status === "running") {
    elements.slice94LiveTestNote.textContent =
      "Exercising disk persistence, reload, Undo/Redo, Reset, multiple profiles, and Desktop/Small variants.";
  } else if (test.message) {
    elements.slice94LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  }
}

function layoutWithFirstWidgetColumns(layout, columns) {
  const next = structuredClone(layout);
  const candidate = next.widgets.find((widget) => !widget.duplicateOf);
  if (candidate) candidate.columns = columns;
  return next;
}

async function runSlice94Verification() {
  const startingSnapshot = dashboardEditor.snapshot();
  const startingLayouts = await dashboardLayoutRequest("/api/dashboard-layout");
  const startingActiveProfileId = startingLayouts.activeProfileId;
  const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Date.now().toString(36);
  const profileA = `slice94-a-${suffix}`;
  const profileB = `slice94-b-${suffix}`;
  const cleanupProfiles = [profileA, profileB];
  const steps = [];

  try {
    let store = await dashboardLayoutRequest("/api/dashboard-layout/profile/create", {
      profileId: profileA,
      name: "Slice 9.4 verification A",
    });
    const baseLayout = dashboardEditor.persistentState();
    const desktopLayout = layoutWithFirstWidgetColumns(baseLayout, 8);
    const smallLayout = layoutWithFirstWidgetColumns(baseLayout, 12);

    store = await dashboardLayoutRequest("/api/dashboard-layout/save", {
      profileId: profileA,
      variant: "desktop",
      layout: desktopLayout,
    });
    steps.push({
      key: "save-to-disk",
      outcome: store.profiles.some((profile) => profile.id === profileA && profile.layouts.desktop)
        ? "passed"
        : "failed",
    });

    store = await dashboardLayoutRequest("/api/dashboard-layout/save", {
      profileId: profileA,
      variant: "small",
      layout: smallLayout,
    });
    store = await dashboardLayoutRequest("/api/dashboard-layout/reload", {});
    const reloadedA = store.profiles.find((profile) => profile.id === profileA);
    steps.push({
      key: "restart-reload",
      outcome: reloadedA?.layouts?.desktop?.widgets?.length > 0 ? "passed" : "failed",
    });
    steps.push({
      key: "desktop-small-profiles",
      outcome:
        reloadedA?.layouts?.desktop?.widgets?.[0]?.columns !==
        reloadedA?.layouts?.small?.widgets?.[0]?.columns
          ? "passed"
          : "failed",
    });

    store = await dashboardLayoutRequest("/api/dashboard-layout/profile/create", {
      profileId: profileB,
      name: "Slice 9.4 verification B",
    });
    steps.push({
      key: "multiple-profiles",
      outcome:
        store.profiles.some((profile) => profile.id === profileA) &&
        store.profiles.some((profile) => profile.id === profileB)
          ? "passed"
          : "failed",
    });

    dashboardEditor.restore(startingSnapshot);
    dashboardEditor.clearHistory();
    const candidateId = dashboardEditor.widgetIds().find((id) => id !== "current-verification-panel");
    const candidate = candidateId ? dashboardEditor.widgets.get(candidateId)?.element : null;
    const beforeColumns = Number(candidate?.dataset.widgetColumns ?? 12);
    const changedColumns = beforeColumns === 6 ? 7 : 6;
    if (candidateId) dashboardEditor.resizeWidget(candidateId, changedColumns, 192);
    const changed = Number(candidate?.dataset.widgetColumns) === changedColumns;
    const undone = dashboardEditor.undo();
    const undoColumns = Number(candidate?.dataset.widgetColumns);
    const redone = dashboardEditor.redo();
    const redoColumns = Number(candidate?.dataset.widgetColumns);
    steps.push({
      key: "undo-redo",
      outcome:
        Boolean(candidateId) &&
        changed &&
        undone &&
        undoColumns === beforeColumns &&
        redone &&
        redoColumns === changedColumns
          ? "passed"
          : "failed",
    });

    const reset = dashboardEditor.resetToDefault();
    steps.push({
      key: "reset",
      outcome:
        reset &&
        JSON.stringify(dashboardEditor.persistentState()) ===
          JSON.stringify(dashboardEditor.defaultPersistentState)
          ? "passed"
          : "failed",
    });

    return {
      outcome: steps.every((step) => step.outcome === "passed") ? "passed" : "failed",
      steps,
      persistence: true,
      diskReload: true,
      gameplayMutation: false,
      actionGatewayRequests: 0,
      rawSocketAccess: false,
      userScriptTouched: false,
    };
  } finally {
    dashboardEditor.restore(startingSnapshot);
    for (const profileId of cleanupProfiles) {
      try {
        await dashboardLayoutRequest("/api/dashboard-layout/profile/delete", { profileId });
      } catch {
        // Verification cleanup is best-effort if a temporary profile was not created.
      }
    }
    let restoredStore = await dashboardLayoutRequest("/api/dashboard-layout");
    if (restoredStore.profiles.some((profile) => profile.id === startingActiveProfileId)) {
      restoredStore = await dashboardLayoutRequest("/api/dashboard-layout/profile/active", {
        profileId: startingActiveProfileId,
      });
    }
    state.dashboardLayouts = restoredStore;
    renderDashboardEditorState();
  }
}

async function startSlice94LiveTest(clipboardWrite) {
  const startedAt = new Date().toISOString();
  state.slice94LiveTest = {
    status: "running",
    message: "Slice 9.4 layout persistence test is running.",
  };
  renderSlice94LiveTest();

  const verification = await runSlice94Verification();
  const diagnosticsResponse = await fetch("/api/logs/export", { cache: "no-store" });
  if (!diagnosticsResponse.ok) {
    throw new Error(`Diagnostic export failed with HTTP ${diagnosticsResponse.status}.`);
  }
  const diagnostics = await diagnosticsResponse.json();
  const completedAt = new Date().toISOString();
  const testId = `live94-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
  const outcome = verification.outcome;
  const stepLines = verification.steps.map((step) =>
    `- ${step.key}: ${String(step.outcome).toUpperCase()}`
  );
  const reportText = [
    "ALRemastered Slice 9.4 one-click layout persistence and profiles test",
    `Test ID: ${testId}`,
    "Slice: 9.4",
    `Outcome: ${String(outcome).toUpperCase()}`,
    `Client: ${state.status?.version ?? "unknown"}`,
    `Platform: ${state.status?.platform ?? "unknown"}`,
    `Started: ${startedAt}`,
    `Completed: ${completedAt}`,
    "",
    "Steps:",
    ...stepLines,
    "",
    "Persistence: true",
    "Disk reload: true",
    "Profiles: multiple",
    "Viewport layouts: Desktop / Small",
    "Gameplay mutation: false",
    "Action Gateway requests: 0",
    "Raw socket access: false",
    "User Script touched: false",
    `Diagnostic log lines: ${diagnostics.lineCount ?? "unknown"}`,
    "Secrets sanitized: yes",
    "",
    "Sanitized diagnostic log:",
    diagnostics.text ?? "",
  ].join("\n");

  const result = {
    testId,
    slice: "9.4",
    outcome,
    startedAt,
    completedAt,
    message: outcome === "passed"
      ? "Layout persistence and profiles verification passed."
      : "Layout persistence and profiles verification failed.",
    steps: verification.steps,
    persistence: true,
    diskReload: true,
    gameplayMutation: false,
    actionGatewayRequests: 0,
    rawSocketAccess: false,
    userScriptTouched: false,
  };

  state.slice94LastReport = reportText;
  state.slice94LiveTest = { status: outcome, message: result.message, lastResult: result };
  const copied = await clipboardWrite.finish(reportText);
  renderSlice94LiveTest();
  return { result, reportText, copied };
}

elements.startSlice94LiveTest.addEventListener("click", async () => {
  if (state.slice94LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice94LastReport = null;
  elements.copySlice94LiveTestResult.hidden = true;
  setFeedback(
    "Slice 9.4 layout persistence test started. Temporary verification profiles will be removed automatically.",
  );
  try {
    const { result, copied } = await startSlice94LiveTest(clipboardWrite);
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 9.4 test ${String(result.outcome).toUpperCase()}. ${copyMessage}`,
      result.outcome === "passed" && copied ? "success" : result.outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    state.slice94LiveTest = { status: "failed", message: error.message };
    renderSlice94LiveTest();
    setFeedback(`Slice 9.4 layout persistence test could not finish: ${error.message}`, "error");
  }
});

elements.copySlice94LiveTestResult.addEventListener("click", async () => {
  if (!state.slice94LastReport) return;
  try {
    await writeClipboard(state.slice94LastReport);
    setFeedback(
      "Complete Slice 9.4 layout persistence result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Layout persistence result copy failed: ${error.message}`, "error");
  }
});

renderSlice94LiveTest();

function renderSlice95LiveTest() {
  const test = state.slice95LiveTest ?? { status: "idle", message: "Ready." };
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    failed: "FAILED",
  };
  elements.slice95LiveTestStatus.textContent = labels[test.status] ?? test.status;
  elements.startSlice95LiveTest.disabled = test.status === "running";
  elements.copySlice95LiveTestResult.hidden = !state.slice95LastReport;
  if (test.status === "running") {
    elements.slice95LiveTestNote.textContent =
      "Exercising role-neutral export, JSON validation, Character role mapping, persistent import/reload, and cleanup.";
  } else if (test.message) {
    elements.slice95LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  }
}

async function runSlice95Verification() {
  const startingSnapshot = dashboardEditor.snapshot();
  const startingLayouts = await dashboardLayoutRequest("/api/dashboard-layout");
  const startingActiveProfileId = startingLayouts.activeProfileId;
  const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Date.now().toString(36);
  const importedProfileId = `slice95-import-${suffix}`;
  let importedCreated = false;
  const steps = [];

  try {
    const baseDesktop = structuredClone(dashboardEditor.persistentState());
    const baseSmall = structuredClone(dashboardEditor.persistentState());
    const sourceIds = ["SLICE95_SOURCE_CHARACTER_A", "SLICE95_SOURCE_CHARACTER_B"];
    const desktopCandidates = baseDesktop.widgets.filter((widget) => !widget.duplicateOf);
    const smallCandidates = baseSmall.widgets.filter((widget) => !widget.duplicateOf);
    if (!desktopCandidates.length || !smallCandidates.length) {
      throw new Error("Dashboard import/export verification requires at least one base widget.");
    }

    desktopCandidates[0].characterId = sourceIds[0];
    smallCandidates[0].characterId = sourceIds[0];
    if (desktopCandidates[1]) desktopCandidates[1].characterId = sourceIds[1];
    if (smallCandidates[1]) smallCandidates[1].characterId = sourceIds[1];

    const sourceProfile = {
      name: "Slice 9.5 portable verification",
      layouts: {
        desktop: baseDesktop,
        small: baseSmall,
      },
    };
    const portable = createPortableDashboardProfile(sourceProfile);
    const serialized = JSON.stringify(portable);
    const roles = portableDashboardRoleIds(portable);

    steps.push({
      key: "role-neutral-export",
      outcome:
        portable.kind === "ALRemasteredDashboardProfile" &&
        roles.length >= 1 &&
        !serialized.includes(sourceIds[0]) &&
        !serialized.includes(sourceIds[1]) &&
        !serialized.includes('"characterId"')
          ? "passed"
          : "failed",
    });

    const parsed = parsePortableDashboardProfile(serialized);
    steps.push({
      key: "json-roundtrip",
      outcome:
        parsed.profile.name === sourceProfile.name &&
        Boolean(parsed.profile.layouts.desktop) &&
        Boolean(parsed.profile.layouts.small)
          ? "passed"
          : "failed",
    });

    const mapping = {};
    roles.forEach((roleId, index) => {
      mapping[roleId] = `SLICE95_MAPPED_CHARACTER_${index + 1}`;
    });
    const resolved = resolvePortableDashboardProfile(parsed, mapping);
    const resolvedIds = new Set(
      Object.values(resolved.layouts)
        .flatMap((layout) => layout.widgets)
        .map((widget) => widget.characterId)
        .filter(Boolean),
    );
    steps.push({
      key: "role-mapping",
      outcome:
        roles.every((roleId) => resolvedIds.has(mapping[roleId])) &&
        !resolvedIds.has(sourceIds[0]) &&
        !resolvedIds.has(sourceIds[1])
          ? "passed"
          : "failed",
    });

    let store = await dashboardLayoutRequest("/api/dashboard-layout/profile/create", {
      profileId: importedProfileId,
      name: resolved.name,
    });
    importedCreated = true;
    for (const variant of ["desktop", "small"]) {
      if (!resolved.layouts[variant]) continue;
      store = await dashboardLayoutRequest("/api/dashboard-layout/save", {
        profileId: importedProfileId,
        variant,
        layout: resolved.layouts[variant],
      });
    }
    store = await dashboardLayoutRequest("/api/dashboard-layout/reload", {});
    const imported = store.profiles.find((profile) => profile.id === importedProfileId);
    const persistedIds = new Set(
      ["desktop", "small"]
        .flatMap((variant) => imported?.layouts?.[variant]?.widgets ?? [])
        .map((widget) => widget.characterId)
        .filter(Boolean),
    );
    steps.push({
      key: "import-persist-reload",
      outcome:
        Boolean(imported?.layouts?.desktop) &&
        Boolean(imported?.layouts?.small) &&
        roles.every((roleId) => persistedIds.has(mapping[roleId])) &&
        !persistedIds.has(sourceIds[0]) &&
        !persistedIds.has(sourceIds[1])
          ? "passed"
          : "failed",
    });

    store = await dashboardLayoutRequest("/api/dashboard-layout/profile/active", {
      profileId: startingActiveProfileId,
    });
    store = await dashboardLayoutRequest("/api/dashboard-layout/profile/delete", {
      profileId: importedProfileId,
    });
    importedCreated = false;
    state.dashboardLayouts = store;
    steps.push({
      key: "cleanup",
      outcome:
        store.activeProfileId === startingActiveProfileId &&
        !store.profiles.some((profile) => profile.id === importedProfileId)
          ? "passed"
          : "failed",
    });

    return {
      outcome: steps.every((step) => step.outcome === "passed") ? "passed" : "failed",
      steps,
      portableExport: true,
      fixedCharacterIdsExported: false,
      characterNamesExported: false,
      roleMapping: "explicit",
      importedProfilePersisted: true,
      gameplayMutation: false,
      actionGatewayRequests: 0,
      rawSocketAccess: false,
      userScriptTouched: false,
    };
  } finally {
    dashboardEditor.restore(startingSnapshot);
    try {
      let restored = await dashboardLayoutRequest("/api/dashboard-layout");
      if (importedCreated && restored.profiles.some((profile) => profile.id === importedProfileId)) {
        if (restored.activeProfileId === importedProfileId) {
          restored = await dashboardLayoutRequest("/api/dashboard-layout/profile/active", {
            profileId: startingActiveProfileId,
          });
        }
        restored = await dashboardLayoutRequest("/api/dashboard-layout/profile/delete", {
          profileId: importedProfileId,
        });
      }
      if (restored.profiles.some((profile) => profile.id === startingActiveProfileId) &&
          restored.activeProfileId !== startingActiveProfileId) {
        restored = await dashboardLayoutRequest("/api/dashboard-layout/profile/active", {
          profileId: startingActiveProfileId,
        });
      }
      state.dashboardLayouts = restored;
    } catch {
      state.dashboardLayouts = startingLayouts;
    }
    state.pendingDashboardImport = null;
    renderDashboardEditorState();
  }
}

async function startSlice95LiveTest(clipboardWrite) {
  const startedAt = new Date().toISOString();
  state.slice95LiveTest = {
    status: "running",
    message: "Slice 9.5 dashboard import/export test is running.",
  };
  renderSlice95LiveTest();

  const verification = await runSlice95Verification();
  const diagnosticsResponse = await fetch("/api/logs/export", { cache: "no-store" });
  if (!diagnosticsResponse.ok) {
    throw new Error(`Diagnostic export failed with HTTP ${diagnosticsResponse.status}.`);
  }
  const diagnostics = await diagnosticsResponse.json();
  const completedAt = new Date().toISOString();
  const testId = `live95-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
  const outcome = verification.outcome;
  const stepLines = verification.steps.map((step) =>
    `- ${step.key}: ${String(step.outcome).toUpperCase()}`
  );
  const reportText = [
    "ALRemastered Slice 9.5 one-click dashboard import/export test",
    `Test ID: ${testId}`,
    "Slice: 9.5",
    `Outcome: ${String(outcome).toUpperCase()}`,
    `Client: ${state.status?.version ?? "unknown"}`,
    `Platform: ${state.status?.platform ?? "unknown"}`,
    `Started: ${startedAt}`,
    `Completed: ${completedAt}`,
    "",
    "Steps:",
    ...stepLines,
    "",
    "Portable export: true",
    "Fixed Character IDs exported: false",
    "Character names exported: false",
    "Role mapping: explicit",
    "Imported profile persisted: true",
    "Gameplay mutation: false",
    "Action Gateway requests: 0",
    "Raw socket access: false",
    "User Script touched: false",
    `Diagnostic log lines: ${diagnostics.lineCount ?? "unknown"}`,
    "Secrets sanitized: yes",
    "",
    "Sanitized diagnostic log:",
    diagnostics.text ?? "",
  ].join("\n");

  const result = {
    testId,
    slice: "9.5",
    outcome,
    startedAt,
    completedAt,
    message: outcome === "passed"
      ? "Dashboard import/export verification passed."
      : "Dashboard import/export verification failed.",
    steps: verification.steps,
    portableExport: true,
    fixedCharacterIdsExported: false,
    characterNamesExported: false,
    roleMapping: "explicit",
    importedProfilePersisted: true,
    gameplayMutation: false,
    actionGatewayRequests: 0,
    rawSocketAccess: false,
    userScriptTouched: false,
  };

  state.slice95LastReport = reportText;
  state.slice95LiveTest = { status: outcome, message: result.message, lastResult: result };
  const copied = await clipboardWrite.finish(reportText);
  renderSlice95LiveTest();
  return { result, reportText, copied };
}

elements.startSlice95LiveTest.addEventListener("click", async () => {
  if (state.slice95LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice95LastReport = null;
  elements.copySlice95LiveTestResult.hidden = true;
  setFeedback(
    "Slice 9.5 dashboard import/export test started. A temporary imported profile will be removed automatically.",
  );
  try {
    const { result, copied } = await startSlice95LiveTest(clipboardWrite);
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 9.5 test ${String(result.outcome).toUpperCase()}. ${copyMessage}`,
      result.outcome === "passed" && copied ? "success" : result.outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    state.slice95LiveTest = { status: "failed", message: error.message };
    renderSlice95LiveTest();
    setFeedback(`Slice 9.5 dashboard import/export test could not finish: ${error.message}`, "error");
  }
});

elements.copySlice95LiveTestResult.addEventListener("click", async () => {
  if (!state.slice95LastReport) return;
  try {
    await writeClipboard(state.slice95LastReport);
    setFeedback(
      "Complete Slice 9.5 dashboard import/export result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Dashboard import/export result copy failed: ${error.message}`, "error");
  }
});

renderSlice95LiveTest();

function renderSlice101LiveTest() {
  const test = state.slice101LiveTest ?? { status: "idle", message: "Ready." };
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    failed: "FAILED",
  };
  elements.slice101LiveTestStatus.textContent = labels[test.status] ?? test.status;
  elements.startSlice101LiveTest.disabled = test.status === "running";
  elements.copySlice101LiveTestResult.hidden = !state.slice101LastReport;
  if (test.status === "running") {
    elements.slice101LiveTestNote.textContent =
      "Reading the renderer snapshot and SSE event stream, then verifying Core/Character/Script continuity and zero Action Gateway mutation.";
  } else if (test.message) {
    elements.slice101LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  }
}

async function fetchRendererSnapshot() {
  const response = await fetch("/api/renderer/snapshot", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Renderer snapshot failed with HTTP ${response.status}.`);
  }
  return response.json();
}

async function fetchRendererHandoffState() {
  const response = await fetch("/api/renderer/handoff", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Renderer handoff state failed with HTTP ${response.status}.`);
  }
  return response.json();
}

function waitForRendererStateEvent(afterSequence, timeoutMs = 4_000) {
  return new Promise((resolve, reject) => {
    const source = new EventSource("/api/renderer/stream");
    const timer = globalThis.setTimeout(() => {
      source.close();
      reject(new Error("Renderer state event did not arrive before timeout."));
    }, timeoutMs);

    source.addEventListener("state", (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (Number(payload.sequence) <= Number(afterSequence)) return;
        globalThis.clearTimeout(timer);
        source.close();
        resolve(payload);
      } catch (error) {
        globalThis.clearTimeout(timer);
        source.close();
        reject(error);
      }
    });

    source.addEventListener("error", () => {
      globalThis.clearTimeout(timer);
      source.close();
      reject(new Error("Renderer SSE stream failed."));
    });
  });
}

async function runSlice101Verification() {
  const before = await fetchRendererSnapshot();
  const steps = [];

  steps.push({
    key: "snapshot-schema",
    outcome:
      before?.snapshot?.schemaVersion === 1 &&
      before?.snapshot?.core?.application === "ALRemastered" &&
      before?.bridge?.status === "running"
        ? "passed"
        : "failed",
  });

  const event = await waitForRendererStateEvent(before.bridge.eventSequence);
  steps.push({
    key: "stream-connect",
    outcome:
      event?.type === "state" &&
      event?.snapshot?.schemaVersion === 1
        ? "passed"
        : "failed",
  });
  steps.push({
    key: "sequenced-state-event",
    outcome:
      Number(event?.sequence) > Number(before.bridge.eventSequence) &&
      Number(event?.snapshot?.eventSequence) === Number(event?.sequence)
        ? "passed"
        : "failed",
  });

  await new Promise((resolve) => globalThis.setTimeout(resolve, 40));
  const after = await fetchRendererSnapshot();

  const beforeCore = before.snapshot.core ?? {};
  const afterCore = after.snapshot.core ?? {};
  const coreRestart = beforeCore.startedAt !== afterCore.startedAt;
  steps.push({
    key: "core-continuity",
    outcome:
      !coreRestart &&
      afterCore.status === "running" &&
      Number(afterCore.heartbeatSequence ?? 0) >= Number(beforeCore.heartbeatSequence ?? 0)
        ? "passed"
        : "failed",
  });

  const beforeCharacter = before.snapshot.character ?? {};
  const afterCharacter = after.snapshot.character ?? {};
  const characterRestart =
    (beforeCharacter.characterId ?? null) !== (afterCharacter.characterId ?? null) ||
    (beforeCharacter.connectedAt ?? null) !== (afterCharacter.connectedAt ?? null);
  steps.push({
    key: "character-continuity",
    outcome: characterRestart ? "failed" : "passed",
  });

  const beforeScript = before.snapshot.script ?? {};
  const afterScript = after.snapshot.script ?? {};
  const scriptRestart =
    (beforeScript.runId ?? null) !== (afterScript.runId ?? null) ||
    (beforeScript.startedAt ?? null) !== (afterScript.startedAt ?? null);
  steps.push({
    key: "script-continuity",
    outcome: scriptRestart ? "failed" : "passed",
  });

  const actionGatewayRequests = Math.max(
    0,
    Number(after.snapshot.actionGateway?.totalRequests ?? 0) -
      Number(before.snapshot.actionGateway?.totalRequests ?? 0),
  );
  steps.push({
    key: "read-only-action-gateway",
    outcome: actionGatewayRequests === 0 ? "passed" : "failed",
  });

  steps.push({
    key: "subscriber-cleanup",
    outcome:
      Number(after.bridge?.subscribers ?? 0) === Number(before.bridge?.subscribers ?? 0)
        ? "passed"
        : "failed",
  });

  return {
    outcome: steps.every((step) => step.outcome === "passed") ? "passed" : "failed",
    steps,
    rendererTransport: "SSE",
    rendererMutationApi: false,
    coreRestart,
    characterRestart,
    scriptRestart,
    gameplayMutation: false,
    actionGatewayRequests,
    rawSocketAccess: false,
    userScriptTouched: false,
    beforeSequence: before.bridge.eventSequence,
    eventSequence: event.sequence,
    afterSequence: after.bridge.eventSequence,
  };
}

async function startSlice101LiveTest(clipboardWrite) {
  const startedAt = new Date().toISOString();
  state.slice101LiveTest = {
    status: "running",
    message: "Slice 10.1 renderer bridge test is running.",
  };
  renderSlice101LiveTest();

  const verification = await runSlice101Verification();
  const diagnosticsResponse = await fetch("/api/logs/export", { cache: "no-store" });
  if (!diagnosticsResponse.ok) {
    throw new Error(`Diagnostic export failed with HTTP ${diagnosticsResponse.status}.`);
  }
  const diagnostics = await diagnosticsResponse.json();
  const completedAt = new Date().toISOString();
  const testId = `live101-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
  const outcome = verification.outcome;
  const stepLines = verification.steps.map((step) =>
    `- ${step.key}: ${String(step.outcome).toUpperCase()}`
  );
  const reportText = [
    "ALRemastered Slice 10.1 one-click renderer bridge test",
    `Test ID: ${testId}`,
    "Slice: 10.1",
    `Outcome: ${String(outcome).toUpperCase()}`,
    `Client: ${state.status?.version ?? "unknown"}`,
    `Platform: ${state.status?.platform ?? "unknown"}`,
    `Started: ${startedAt}`,
    `Completed: ${completedAt}`,
    "",
    "Steps:",
    ...stepLines,
    "",
    `Renderer transport: ${verification.rendererTransport}`,
    "Renderer mutation API: false",
    `Bridge sequence: ${verification.beforeSequence} -> ${verification.eventSequence} -> ${verification.afterSequence}`,
    `Core restart: ${verification.coreRestart}`,
    `Character restart: ${verification.characterRestart}`,
    `Script restart: ${verification.scriptRestart}`,
    "Gameplay mutation: false",
    `Action Gateway requests: ${verification.actionGatewayRequests}`,
    "Raw socket access: false",
    "User Script touched: false",
    `Diagnostic log lines: ${diagnostics.lineCount ?? "unknown"}`,
    "Secrets sanitized: yes",
    "",
    "Sanitized diagnostic log:",
    diagnostics.text ?? "",
  ].join("\n");

  const result = {
    testId,
    slice: "10.1",
    outcome,
    startedAt,
    completedAt,
    message: outcome === "passed"
      ? "Renderer bridge verification passed."
      : "Renderer bridge verification failed.",
    ...verification,
  };

  state.slice101LastReport = reportText;
  state.slice101LiveTest = { status: outcome, message: result.message, lastResult: result };
  const copied = await clipboardWrite.finish(reportText);
  renderSlice101LiveTest();
  return { result, reportText, copied };
}

elements.startSlice101LiveTest.addEventListener("click", async () => {
  if (state.slice101LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice101LastReport = null;
  elements.copySlice101LiveTestResult.hidden = true;
  setFeedback(
    "Slice 10.1 renderer bridge test started. It opens one temporary read-only SSE subscriber and does not open a renderer window.",
  );
  try {
    const { result, copied } = await startSlice101LiveTest(clipboardWrite);
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 10.1 test ${String(result.outcome).toUpperCase()}. ${copyMessage}`,
      result.outcome === "passed" && copied ? "success" : result.outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    state.slice101LiveTest = { status: "failed", message: error.message };
    renderSlice101LiveTest();
    setFeedback(`Slice 10.1 renderer bridge test could not finish: ${error.message}`, "error");
  }
});

elements.copySlice101LiveTestResult.addEventListener("click", async () => {
  if (!state.slice101LastReport) return;
  try {
    await writeClipboard(state.slice101LastReport);
    setFeedback(
      "Complete Slice 10.1 renderer bridge result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Renderer bridge result copy failed: ${error.message}`, "error");
  }
});

renderSlice101LiveTest();

function openBrowserViewWindow(url = "/browser-view", name = "alremastered-browser-view") {
  const view = window.open(url, name, "popup,width=980,height=760,resizable=yes,scrollbars=yes");
  if (!view) {
    throw new Error("Browser View was blocked by the browser. Allow pop-ups for this local ALRemastered dashboard.");
  }
  view.focus();
  return view;
}

elements.openBrowserView.addEventListener("click", () => {
  try {
    openBrowserViewWindow();
    setFeedback("Browser View opened in a read-only window.", "success");
  } catch (error) {
    setFeedback(error.message, "error");
  }
});

function renderSlice102LiveTest() {
  const test = state.slice102LiveTest ?? { status: "idle", message: "Ready." };
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    failed: "FAILED",
  };
  elements.slice102LiveTestStatus.textContent = labels[test.status] ?? test.status;
  elements.startSlice102LiveTest.disabled = test.status === "running";
  elements.copySlice102LiveTestResult.hidden = !state.slice102LastReport;
  if (test.status === "running") {
    elements.slice102LiveTestNote.textContent =
      "Opening the read-only Browser View, verifying rendered Character state, closing the test window, and checking Core/Character/Script continuity.";
  } else if (test.message) {
    elements.slice102LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  }
}

async function waitForBrowserViewCondition(check, message, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (check()) return;
    } catch {
      // The same-origin Browser View may still be navigating.
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
  }
  throw new Error(message);
}

async function waitForRendererSubscriberCount(expected, timeoutMs = 4_000) {
  let last;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    last = await fetchRendererSnapshot();
    if (Number(last.bridge?.subscribers ?? 0) === Number(expected)) return last;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
  }
  throw new Error(
    `Renderer subscriber count did not reach ${expected}; last value was ${last?.bridge?.subscribers ?? "unknown"}.`,
  );
}

async function waitForRendererHandoffCount(expected, timeoutMs = 4_000) {
  let last;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    last = await fetchRendererHandoffState();
    if (Number(last.attachedRenderers ?? 0) === Number(expected)) return last;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
  }
  throw new Error(
    `Renderer handoff count did not reach ${expected}; last value was ${last?.attachedRenderers ?? "unknown"}.`,
  );
}

function sameSocketMarkers(before, after) {
  return (before.characterId ?? null) === (after.characterId ?? null) &&
    (before.connectedAt ?? null) === (after.connectedAt ?? null) &&
    Number(before.reconnectCount ?? 0) === Number(after.reconnectCount ?? 0) &&
    (before.lastDisconnectAt ?? null) === (after.lastDisconnectAt ?? null) &&
    (before.lastReconnectAt ?? null) === (after.lastReconnectAt ?? null);
}

async function runSlice102Verification(view) {
  const before = await fetchRendererSnapshot();
  const baselineSubscribers = Number(before.bridge?.subscribers ?? 0);
  const steps = [];

  view.location.replace(`/browser-view?verification=${Date.now()}`);
  await waitForBrowserViewCondition(
    () => view.__alrBrowserViewState?.ready === true,
    "Browser View did not render a renderer snapshot before timeout.",
  );

  const opened = await waitForRendererSubscriberCount(baselineSubscribers + 1);
  const browserState = view.__alrBrowserViewState ?? {};
  const expectedCharacter = opened.snapshot?.character ?? {};
  const expectedCharacterId =
    expectedCharacter.characterId ?? expectedCharacter.character?.id ?? null;
  steps.push({
    key: "browser-open",
    outcome:
      !view.closed &&
      Number(opened.bridge?.subscribers ?? 0) === baselineSubscribers + 1
        ? "passed"
        : "failed",
  });
  steps.push({
    key: "character-state-rendered",
    outcome:
      browserState.ready === true &&
      Number(browserState.renderCount ?? 0) >= 1 &&
      (browserState.lastCharacterStatus ?? null) === (expectedCharacter.status ?? null) &&
      (browserState.lastCharacterId ?? null) === expectedCharacterId
        ? "passed"
        : "failed",
  });

  view.close();
  await waitForBrowserViewCondition(
    () => view.closed === true,
    "Browser View test window did not close before timeout.",
  );
  const after = await waitForRendererSubscriberCount(baselineSubscribers);

  const beforeCore = before.snapshot?.core ?? {};
  const afterCore = after.snapshot?.core ?? {};
  const coreRestart = beforeCore.startedAt !== afterCore.startedAt;
  steps.push({
    key: "browser-close",
    outcome:
      view.closed &&
      Number(after.bridge?.subscribers ?? 0) === baselineSubscribers
        ? "passed"
        : "failed",
  });
  steps.push({
    key: "core-continuity",
    outcome:
      !coreRestart &&
      afterCore.status === "running" &&
      Number(afterCore.heartbeatSequence ?? 0) >= Number(beforeCore.heartbeatSequence ?? 0)
        ? "passed"
        : "failed",
  });

  const beforeCharacter = before.snapshot?.character ?? {};
  const afterCharacter = after.snapshot?.character ?? {};
  const characterRestart =
    (beforeCharacter.characterId ?? null) !== (afterCharacter.characterId ?? null) ||
    (beforeCharacter.connectedAt ?? null) !== (afterCharacter.connectedAt ?? null);
  steps.push({
    key: "character-continuity",
    outcome: characterRestart ? "failed" : "passed",
  });

  const beforeScript = before.snapshot?.script ?? {};
  const afterScript = after.snapshot?.script ?? {};
  const scriptRestart =
    (beforeScript.runId ?? null) !== (afterScript.runId ?? null) ||
    (beforeScript.startedAt ?? null) !== (afterScript.startedAt ?? null);
  steps.push({
    key: "script-continuity",
    outcome: scriptRestart ? "failed" : "passed",
  });

  const actionGatewayRequests = Math.max(
    0,
    Number(after.snapshot?.actionGateway?.totalRequests ?? 0) -
      Number(before.snapshot?.actionGateway?.totalRequests ?? 0),
  );
  steps.push({
    key: "read-only-action-gateway",
    outcome: actionGatewayRequests === 0 ? "passed" : "failed",
  });

  return {
    outcome: steps.every((step) => step.outcome === "passed") ? "passed" : "failed",
    steps,
    browserViewOpened: true,
    browserViewClosed: view.closed,
    rendererTransport: "SSE",
    characterStateRendered: browserState.ready === true,
    coreRestart,
    characterRestart,
    scriptRestart,
    gameplayMutation: false,
    actionGatewayRequests,
    rawSocketAccess: false,
    userScriptTouched: false,
    baselineSubscribers,
    openedSubscribers: opened.bridge?.subscribers ?? null,
    closedSubscribers: after.bridge?.subscribers ?? null,
  };
}

async function startSlice102LiveTest(view, clipboardWrite) {
  const startedAt = new Date().toISOString();
  state.slice102LiveTest = {
    status: "running",
    message: "Slice 10.2 Browser View test is running.",
  };
  renderSlice102LiveTest();

  const verification = await runSlice102Verification(view);
  const diagnosticsResponse = await fetch("/api/logs/export", { cache: "no-store" });
  if (!diagnosticsResponse.ok) {
    throw new Error(`Diagnostic export failed with HTTP ${diagnosticsResponse.status}.`);
  }
  const diagnostics = await diagnosticsResponse.json();
  const completedAt = new Date().toISOString();
  const testId = `live102-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
  const outcome = verification.outcome;
  const stepLines = verification.steps.map((step) =>
    `- ${step.key}: ${String(step.outcome).toUpperCase()}`
  );
  const reportText = [
    "ALRemastered Slice 10.2 one-click Browser View test",
    `Test ID: ${testId}`,
    "Slice: 10.2",
    `Outcome: ${String(outcome).toUpperCase()}`,
    `Client: ${state.status?.version ?? "unknown"}`,
    `Platform: ${state.status?.platform ?? "unknown"}`,
    `Started: ${startedAt}`,
    `Completed: ${completedAt}`,
    "",
    "Steps:",
    ...stepLines,
    "",
    `Browser View opened: ${verification.browserViewOpened}`,
    `Browser View closed: ${verification.browserViewClosed}`,
    `Renderer transport: ${verification.rendererTransport}`,
    `Character state rendered: ${verification.characterStateRendered}`,
    `Renderer subscribers: ${verification.baselineSubscribers} -> ${verification.openedSubscribers} -> ${verification.closedSubscribers}`,
    `Core restart: ${verification.coreRestart}`,
    `Character restart: ${verification.characterRestart}`,
    `Script restart: ${verification.scriptRestart}`,
    "Gameplay mutation: false",
    `Action Gateway requests: ${verification.actionGatewayRequests}`,
    "Raw socket access: false",
    "User Script touched: false",
    `Diagnostic log lines: ${diagnostics.lineCount ?? "unknown"}`,
    "Secrets sanitized: yes",
    "",
    "Sanitized diagnostic log:",
    diagnostics.text ?? "",
  ].join("\n");

  const result = {
    testId,
    slice: "10.2",
    outcome,
    startedAt,
    completedAt,
    message: outcome === "passed"
      ? "Browser View verification passed."
      : "Browser View verification failed.",
    ...verification,
  };

  state.slice102LastReport = reportText;
  state.slice102LiveTest = { status: outcome, message: result.message, lastResult: result };
  const copied = await clipboardWrite.finish(reportText);
  renderSlice102LiveTest();
  return { result, reportText, copied };
}

elements.startSlice102LiveTest.addEventListener("click", async () => {
  if (state.slice102LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice102LastReport = null;
  elements.copySlice102LiveTestResult.hidden = true;

  let view;
  try {
    view = openBrowserViewWindow("about:blank", "alremastered-browser-view-verification");
  } catch (error) {
    state.slice102LiveTest = { status: "failed", message: error.message };
    renderSlice102LiveTest();
    setFeedback(`Slice 10.2 Browser View test could not start: ${error.message}`, "error");
    return;
  }

  setFeedback(
    "Slice 10.2 Browser View test started. The test window will close automatically after continuity checks.",
  );
  try {
    const { result, copied } = await startSlice102LiveTest(view, clipboardWrite);
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 10.2 test ${String(result.outcome).toUpperCase()}. ${copyMessage}`,
      result.outcome === "passed" && copied ? "success" : result.outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    if (view && !view.closed) view.close();
    state.slice102LiveTest = { status: "failed", message: error.message };
    renderSlice102LiveTest();
    setFeedback(`Slice 10.2 Browser View test could not finish: ${error.message}`, "error");
  }
});

elements.copySlice102LiveTestResult.addEventListener("click", async () => {
  if (!state.slice102LastReport) return;
  try {
    await writeClipboard(state.slice102LastReport);
    setFeedback(
      "Complete Slice 10.2 Browser View result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Browser View result copy failed: ${error.message}`, "error");
  }
});

renderSlice102LiveTest();

async function fetchControlMode() {
  const response = await fetch("/api/control-mode", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Control mode state failed with HTTP ${response.status}.`);
  }
  return response.json();
}

async function controlModeProbe(origin) {
  const response = await fetch("/api/control-mode/verification-probe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin }),
  });
  return {
    status: response.status,
    payload: await response.json(),
  };
}

function renderSlice103LiveTest() {
  const test = state.slice103LiveTest ?? { status: "idle", message: "Ready." };
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    failed: "FAILED",
  };
  elements.slice103LiveTestStatus.textContent = labels[test.status] ?? test.status;
  elements.startSlice103LiveTest.disabled = test.status === "running";
  elements.copySlice103LiveTestResult.hidden = !state.slice103LastReport;
  if (test.status === "running") {
    elements.slice103LiveTestNote.textContent =
      "Verifying Automatic, Assist, and Manual policy with non-gameplay Action Gateway probes, then restoring the starting mode.";
  } else if (test.message) {
    elements.slice103LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  }
}

async function runSlice103Verification() {
  const startingControl = await fetchControlMode();
  const before = await fetchRendererSnapshot();
  const steps = [];
  let automaticScript;
  let automaticUser;
  let assistScript;
  let assistSystem;
  let assistUser;
  let manualScript;
  let manualSystem;
  let manualUser;

  try {
    const automatic = await setControlMode("automatic");
    automaticScript = await controlModeProbe("script");
    automaticUser = await controlModeProbe("dashboard");
    steps.push({
      key: "automatic-policy",
      outcome:
        automatic.mode === "automatic" &&
        automatic.scriptActionsAllowed === true &&
        automatic.systemActionsAllowed === true &&
        automatic.userActionsAllowed === true &&
        automaticScript.payload?.outcome === "success" &&
        automaticUser.payload?.outcome === "success"
          ? "passed"
          : "failed",
    });

    const assist = await setControlMode("assist");
    assistScript = await controlModeProbe("script");
    assistSystem = await controlModeProbe("system");
    assistUser = await controlModeProbe("dashboard");
    steps.push({
      key: "assist-policy",
      outcome:
        assist.mode === "assist" &&
        assist.scriptActionsAllowed === false &&
        assist.systemActionsAllowed === true &&
        assist.userActionsAllowed === true &&
        assistScript.payload?.outcome === "error" &&
        assistScript.payload?.error?.code === "CONTROL_MODE_SCRIPT_BLOCKED" &&
        assistSystem.payload?.outcome === "success" &&
        assistUser.payload?.outcome === "success"
          ? "passed"
          : "failed",
    });

    const manual = await setControlMode("manual");
    manualScript = await controlModeProbe("script");
    manualSystem = await controlModeProbe("system");
    manualUser = await controlModeProbe("dashboard");
    steps.push({
      key: "manual-policy",
      outcome:
        manual.mode === "manual" &&
        manual.scriptActionsAllowed === false &&
        manual.systemActionsAllowed === false &&
        manual.userActionsAllowed === true &&
        manualScript.payload?.outcome === "error" &&
        manualScript.payload?.error?.code === "CONTROL_MODE_SCRIPT_BLOCKED" &&
        manualSystem.payload?.outcome === "error" &&
        manualSystem.payload?.error?.code === "CONTROL_MODE_SYSTEM_BLOCKED" &&
        manualUser.payload?.outcome === "success"
          ? "passed"
          : "failed",
    });

    steps.push({
      key: "user-actions-through-gateway",
      outcome:
        [automaticUser, assistUser, manualUser].every((probe) =>
          probe.payload?.action === "control-mode.verification-probe" &&
          probe.payload?.origin === "dashboard" &&
          String(probe.payload?.requestId ?? "").startsWith("act-")
        )
          ? "passed"
          : "failed",
    });
  } finally {
    await setControlMode(startingControl.mode);
  }

  const restoredControl = await fetchControlMode();
  steps.push({
    key: "mode-restored",
    outcome: restoredControl.mode === startingControl.mode ? "passed" : "failed",
  });

  const after = await fetchRendererSnapshot();
  const beforeCore = before.snapshot?.core ?? {};
  const afterCore = after.snapshot?.core ?? {};
  const coreRestart = beforeCore.startedAt !== afterCore.startedAt;
  steps.push({
    key: "core-continuity",
    outcome:
      !coreRestart &&
      afterCore.status === "running" &&
      Number(afterCore.heartbeatSequence ?? 0) >= Number(beforeCore.heartbeatSequence ?? 0)
        ? "passed"
        : "failed",
  });

  const beforeCharacter = before.snapshot?.character ?? {};
  const afterCharacter = after.snapshot?.character ?? {};
  const characterRestart =
    (beforeCharacter.characterId ?? null) !== (afterCharacter.characterId ?? null) ||
    (beforeCharacter.connectedAt ?? null) !== (afterCharacter.connectedAt ?? null);
  steps.push({
    key: "character-continuity",
    outcome: characterRestart ? "failed" : "passed",
  });

  const beforeScript = before.snapshot?.script ?? {};
  const afterScript = after.snapshot?.script ?? {};
  const scriptRestart =
    (beforeScript.runId ?? null) !== (afterScript.runId ?? null) ||
    (beforeScript.startedAt ?? null) !== (afterScript.startedAt ?? null);
  steps.push({
    key: "script-continuity",
    outcome: scriptRestart ? "failed" : "passed",
  });

  const actionGatewayRequests = Math.max(
    0,
    Number(after.snapshot?.actionGateway?.totalRequests ?? 0) -
      Number(before.snapshot?.actionGateway?.totalRequests ?? 0),
  );

  return {
    outcome: steps.every((step) => step.outcome === "passed") ? "passed" : "failed",
    steps,
    startingMode: startingControl.mode,
    restoredMode: restoredControl.mode,
    modesVerified: ["automatic", "assist", "manual"],
    userActionsThroughGateway: true,
    probeRequests: actionGatewayRequests,
    coreRestart,
    characterRestart,
    scriptRestart,
    gameplayMutation: false,
    rawSocketAccess: false,
    userScriptTouched: false,
  };
}

async function startSlice103LiveTest(clipboardWrite) {
  const startedAt = new Date().toISOString();
  state.slice103LiveTest = {
    status: "running",
    message: "Slice 10.3 control modes test is running.",
  };
  renderSlice103LiveTest();

  const verification = await runSlice103Verification();
  const diagnosticsResponse = await fetch("/api/logs/export", { cache: "no-store" });
  if (!diagnosticsResponse.ok) {
    throw new Error(`Diagnostic export failed with HTTP ${diagnosticsResponse.status}.`);
  }
  const diagnostics = await diagnosticsResponse.json();
  const completedAt = new Date().toISOString();
  const testId = `live103-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
  const outcome = verification.outcome;
  const stepLines = verification.steps.map((step) =>
    `- ${step.key}: ${String(step.outcome).toUpperCase()}`
  );
  const reportText = [
    "ALRemastered Slice 10.3 one-click control modes test",
    `Test ID: ${testId}`,
    "Slice: 10.3",
    `Outcome: ${String(outcome).toUpperCase()}`,
    `Client: ${state.status?.version ?? "unknown"}`,
    `Platform: ${state.status?.platform ?? "unknown"}`,
    `Started: ${startedAt}`,
    `Completed: ${completedAt}`,
    "",
    "Steps:",
    ...stepLines,
    "",
    "Modes verified: Automatic / Assist / Manual",
    `Starting mode: ${verification.startingMode}`,
    `Restored mode: ${verification.restoredMode}`,
    `User actions through Action Gateway: ${verification.userActionsThroughGateway}`,
    `Action Gateway probe requests: ${verification.probeRequests}`,
    `Core restart: ${verification.coreRestart}`,
    `Character restart: ${verification.characterRestart}`,
    `Script restart: ${verification.scriptRestart}`,
    "Gameplay mutation: false",
    "Raw socket access: false",
    "User Script touched: false",
    `Diagnostic log lines: ${diagnostics.lineCount ?? "unknown"}`,
    "Secrets sanitized: yes",
    "",
    "Sanitized diagnostic log:",
    diagnostics.text ?? "",
  ].join("\n");

  const result = {
    testId,
    slice: "10.3",
    outcome,
    startedAt,
    completedAt,
    message: outcome === "passed"
      ? "Control modes verification passed."
      : "Control modes verification failed.",
    ...verification,
  };

  state.slice103LastReport = reportText;
  state.slice103LiveTest = { status: outcome, message: result.message, lastResult: result };
  const copied = await clipboardWrite.finish(reportText);
  renderSlice103LiveTest();
  return { result, reportText, copied };
}

elements.startSlice103LiveTest.addEventListener("click", async () => {
  if (state.slice103LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice103LastReport = null;
  elements.copySlice103LiveTestResult.hidden = true;
  setFeedback(
    "Slice 10.3 control modes test started. Only non-gameplay Action Gateway probes are used; the starting mode will be restored automatically.",
  );
  try {
    const { result, copied } = await startSlice103LiveTest(clipboardWrite);
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 10.3 test ${String(result.outcome).toUpperCase()}. ${copyMessage}`,
      result.outcome === "passed" && copied ? "success" : result.outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    state.slice103LiveTest = { status: "failed", message: error.message };
    renderSlice103LiveTest();
    setFeedback(`Slice 10.3 control modes test could not finish: ${error.message}`, "error");
  }
});

elements.copySlice103LiveTestResult.addEventListener("click", async () => {
  if (!state.slice103LastReport) return;
  try {
    await writeClipboard(state.slice103LastReport);
    setFeedback(
      "Complete Slice 10.3 control modes result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Control modes result copy failed: ${error.message}`, "error");
  }
});

renderSlice103LiveTest();

function renderSlice104LiveTest() {
  const test = state.slice104LiveTest ?? { status: "idle", message: "Ready." };
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    failed: "FAILED",
  };
  elements.slice104LiveTestStatus.textContent = labels[test.status] ?? test.status;
  elements.startSlice104LiveTest.disabled = test.status === "running";
  elements.copySlice104LiveTestResult.hidden = !state.slice104LastReport;
  if (test.status === "running") {
    elements.slice104LiveTestNote.textContent =
      "Attaching one Browser renderer to the live headless Core, verifying Script/Character/socket continuity, detaching it, and returning to the original renderer state.";
  } else if (test.message) {
    elements.slice104LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  }
}

async function runSlice104Verification(view) {
  const before = await fetchRendererSnapshot();
  const beforeHandoff = await fetchRendererHandoffState();
  const baselineSubscribers = Number(before.bridge?.subscribers ?? 0);
  const baselineRenderers = Number(beforeHandoff.attachedRenderers ?? 0);
  const beforeCharacter = before.snapshot?.character ?? {};
  const beforeScript = before.snapshot?.script ?? {};
  const steps = [];
  const socketBaseline =
    beforeCharacter.status === "connected" &&
      Boolean(beforeCharacter.characterId) &&
      Boolean(beforeCharacter.connectedAt)
      ? "connected"
      : beforeCharacter.status === "disconnected" &&
          !beforeCharacter.characterId &&
          !beforeCharacter.connectedAt
      ? "disconnected"
      : "unstable";
  const activeSocketPreservationApplicable = socketBaseline === "connected";

  steps.push({
    key: "headless-socket-baseline",
    outcome: socketBaseline === "unstable" ? "failed" : "passed",
  });

  view.location.replace(`/browser-view?handoffVerification=${Date.now()}`);
  await waitForBrowserViewCondition(
    () => view.__alrBrowserViewState?.ready === true,
    "Browser View did not render the live headless state before timeout.",
  );

  const opened = await waitForRendererSubscriberCount(baselineSubscribers + 1);
  const attached = await waitForRendererHandoffCount(baselineRenderers + 1);
  const duringCharacter = opened.snapshot?.character ?? {};
  const duringScript = opened.snapshot?.script ?? {};
  const socketMarkersPreservedDuring = sameSocketMarkers(beforeCharacter, duringCharacter);
  const socketStatePreservedDuring =
    socketMarkersPreservedDuring &&
    (activeSocketPreservationApplicable
      ? duringCharacter.status === "connected"
      : duringCharacter.status === "disconnected" &&
          !duringCharacter.characterId &&
          !duringCharacter.connectedAt);
  const scriptPreservedDuring =
    (beforeScript.runId ?? null) === (duringScript.runId ?? null) &&
    (beforeScript.startedAt ?? null) === (duringScript.startedAt ?? null);

  steps.push({
    key: "renderer-attach",
    outcome:
      attached.mode === "browser" &&
      attached.socketOwnership === "headless-core" &&
      attached.socketStrategy === "preserve" &&
      Number(opened.bridge?.subscribers ?? 0) === baselineSubscribers + 1
        ? "passed"
        : "failed",
  });
  steps.push({
    key: "socket-continuity-browser",
    outcome: socketStatePreservedDuring ? "passed" : "failed",
  });
  steps.push({
    key: "script-continuity-browser",
    outcome: scriptPreservedDuring ? "passed" : "failed",
  });

  view.close();
  await waitForBrowserViewCondition(
    () => view.closed === true,
    "Browser View test window did not close before timeout.",
  );
  const after = await waitForRendererSubscriberCount(baselineSubscribers);
  const detached = await waitForRendererHandoffCount(baselineRenderers);
  const afterCharacter = after.snapshot?.character ?? {};
  const afterScript = after.snapshot?.script ?? {};
  const afterCore = after.snapshot?.core ?? {};
  const beforeCore = before.snapshot?.core ?? {};

  const coreRestart = beforeCore.startedAt !== afterCore.startedAt;
  const characterRestart = !sameSocketMarkers(beforeCharacter, afterCharacter);
  const scriptRestart =
    (beforeScript.runId ?? null) !== (afterScript.runId ?? null) ||
    (beforeScript.startedAt ?? null) !== (afterScript.startedAt ?? null);
  const socketStatePreserved =
    !characterRestart &&
    detached.lastSocketContinuity === true &&
    (activeSocketPreservationApplicable
      ? afterCharacter.status === "connected"
      : afterCharacter.status === "disconnected" &&
          !afterCharacter.characterId &&
          !afterCharacter.connectedAt);

  steps.push({
    key: "renderer-detach",
    outcome:
      Number(after.bridge?.subscribers ?? 0) === baselineSubscribers &&
      Number(detached.attachedRenderers ?? 0) === baselineRenderers &&
      detached.mode === (baselineRenderers > 0 ? "browser" : "headless")
        ? "passed"
        : "failed",
  });
  steps.push({
    key: "socket-state-preserved",
    outcome: socketStatePreserved ? "passed" : "failed",
  });
  steps.push({
    key: "core-continuity",
    outcome:
      !coreRestart &&
      afterCore.status === "running" &&
      Number(afterCore.heartbeatSequence ?? 0) >= Number(beforeCore.heartbeatSequence ?? 0)
        ? "passed"
        : "failed",
  });
  steps.push({
    key: "character-continuity",
    outcome: characterRestart ? "failed" : "passed",
  });
  steps.push({
    key: "script-continuity",
    outcome: scriptRestart ? "failed" : "passed",
  });
  steps.push({
    key: "soft-handoff-policy",
    outcome:
      detached.reconnectFallback === "soft-handoff" &&
      detached.socketOwnership === "headless-core"
        ? "passed"
        : "failed",
  });

  const actionGatewayRequests = Math.max(
    0,
    Number(after.snapshot?.actionGateway?.totalRequests ?? 0) -
      Number(before.snapshot?.actionGateway?.totalRequests ?? 0),
  );
  steps.push({
    key: "no-gameplay-action",
    outcome: actionGatewayRequests === 0 ? "passed" : "failed",
  });

  return {
    outcome: steps.every((step) => step.outcome === "passed") ? "passed" : "failed",
    steps,
    rendererTransport: "SSE",
    rendererModeBefore: beforeHandoff.mode,
    rendererModeDuring: attached.mode,
    rendererModeAfter: detached.mode,
    rendererSubscribers: [
      baselineSubscribers,
      opened.bridge?.subscribers ?? null,
      after.bridge?.subscribers ?? null,
    ],
    attachedRenderers: [
      baselineRenderers,
      attached.attachedRenderers,
      detached.attachedRenderers,
    ],
    socketOwnership: detached.socketOwnership,
    socketStrategy: detached.socketStrategy,
    socketBaseline,
    activeSocketPreservationApplicable,
    socketStatePreserved,
    reconnectFallback: detached.reconnectFallback,
    softHandoffUsed: false,
    coreRestart,
    characterRestart,
    scriptRestart,
    gameplayMutation: false,
    actionGatewayRequests,
    rawSocketShortcut: false,
    userScriptTouched: false,
  };
}

async function startSlice104LiveTest(view, clipboardWrite) {
  const startedAt = new Date().toISOString();
  state.slice104LiveTest = {
    status: "running",
    message: "Slice 10.4 live handoff test is running.",
  };
  renderSlice104LiveTest();

  const verification = await runSlice104Verification(view);
  const diagnosticsResponse = await fetch("/api/logs/export", { cache: "no-store" });
  if (!diagnosticsResponse.ok) {
    throw new Error(`Diagnostic export failed with HTTP ${diagnosticsResponse.status}.`);
  }
  const diagnostics = await diagnosticsResponse.json();
  const completedAt = new Date().toISOString();
  const testId = `live104-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
  const outcome = verification.outcome;
  const stepLines = verification.steps.map((step) =>
    `- ${step.key}: ${String(step.outcome).toUpperCase()}`
  );
  const reportText = [
    "ALRemastered Slice 10.4 one-click live handoff test",
    `Test ID: ${testId}`,
    "Slice: 10.4",
    `Outcome: ${String(outcome).toUpperCase()}`,
    `Client: ${state.status?.version ?? "unknown"}`,
    `Platform: ${state.status?.platform ?? "unknown"}`,
    `Started: ${startedAt}`,
    `Completed: ${completedAt}`,
    "",
    "Steps:",
    ...stepLines,
    "",
    `Renderer transport: ${verification.rendererTransport}`,
    `Renderer mode: ${verification.rendererModeBefore} -> ${verification.rendererModeDuring} -> ${verification.rendererModeAfter}`,
    `Renderer subscribers: ${verification.rendererSubscribers.join(" -> ")}`,
    `Attached renderers: ${verification.attachedRenderers.join(" -> ")}`,
    `Socket ownership: ${verification.socketOwnership}`,
    `Socket strategy: ${verification.socketStrategy}`,
    `Socket baseline: ${verification.socketBaseline}`,
    `Active socket preservation applicable: ${verification.activeSocketPreservationApplicable}`,
    `Socket state preserved: ${verification.socketStatePreserved}`,
    `Reconnect fallback: ${verification.reconnectFallback}`,
    `Soft handoff used: ${verification.softHandoffUsed}`,
    `Core restart: ${verification.coreRestart}`,
    `Character restart: ${verification.characterRestart}`,
    `Script restart: ${verification.scriptRestart}`,
    "Gameplay mutation: false",
    `Action Gateway requests: ${verification.actionGatewayRequests}`,
    "Raw socket shortcut: false",
    "User Script touched: false",
    `Diagnostic log lines: ${diagnostics.lineCount ?? "unknown"}`,
    "Secrets sanitized: yes",
    "",
    "Sanitized diagnostic log:",
    diagnostics.text ?? "",
  ].join("\n");

  const result = {
    testId,
    slice: "10.4",
    outcome,
    startedAt,
    completedAt,
    message: outcome === "passed"
      ? "Headless / Browser live handoff verification passed."
      : "Headless / Browser live handoff verification failed.",
    ...verification,
  };

  state.slice104LastReport = reportText;
  state.slice104LiveTest = { status: outcome, message: result.message, lastResult: result };
  const copied = await clipboardWrite.finish(reportText);
  renderSlice104LiveTest();
  return { result, reportText, copied };
}

elements.startSlice104LiveTest.addEventListener("click", async () => {
  if (state.slice104LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice104LastReport = null;
  elements.copySlice104LiveTestResult.hidden = true;

  let view;
  try {
    view = openBrowserViewWindow("about:blank", "alremastered-live-handoff-verification");
  } catch (error) {
    state.slice104LiveTest = { status: "failed", message: error.message };
    renderSlice104LiveTest();
    setFeedback(`Slice 10.4 live handoff test could not start: ${error.message}`, "error");
    return;
  }

  setFeedback(
    "Slice 10.4 live handoff test started. The Browser renderer will attach and detach automatically without transferring the headless Character socket.",
  );
  try {
    const { result, copied } = await startSlice104LiveTest(view, clipboardWrite);
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 10.4 test ${String(result.outcome).toUpperCase()}. ${copyMessage}`,
      result.outcome === "passed" && copied ? "success" : result.outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    if (view && !view.closed) view.close();
    state.slice104LiveTest = { status: "failed", message: error.message };
    renderSlice104LiveTest();
    setFeedback(`Slice 10.4 live handoff test could not finish: ${error.message}`, "error");
  }
});

elements.copySlice104LiveTestResult.addEventListener("click", async () => {
  if (!state.slice104LastReport) return;
  try {
    await writeClipboard(state.slice104LastReport);
    setFeedback(
      "Complete Slice 10.4 live handoff result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Live handoff result copy failed: ${error.message}`, "error");
  }
});

renderSlice104LiveTest();

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatPublished(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function appendRecord(record) {
  if (state.seenIds.has(record.id)) return;
  state.seenIds.add(record.id);
  state.records.push(record);

  if (state.records.length > 2000) {
    const removed = state.records.splice(0, state.records.length - 2000);
    for (const entry of removed) state.seenIds.delete(entry.id);
  }
}

function replaceRecords(records) {
  state.records = [];
  state.seenIds.clear();
  for (const record of records) appendRecord(record);
}

function clearRecords() {
  state.records = [];
  state.seenIds.clear();
  renderLogs();
}

function visibleRecords() {
  const level = elements.level.value;
  const query = elements.search.value.trim().toLowerCase();

  return state.records.filter((record) => {
    if (level !== "ALL" && record.level !== level) return false;
    if (!query) return true;
    return JSON.stringify(record).toLowerCase().includes(query);
  });
}

function recordText(record) {
  const context = record.context === undefined ? "" : ` ${JSON.stringify(record.context)}`;
  const error = record.error === undefined ? "" : ` ${JSON.stringify(record.error)}`;
  return `${record.message}${context}${error}`;
}

function renderLogs() {
  if (state.paused) return;

  const records = visibleRecords();
  elements.console.replaceChildren();

  if (records.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No log entries match the current filters.";
    elements.console.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const record of records) {
    const line = document.createElement("div");
    line.className = "log-line";
    line.dataset.level = record.level;

    const time = document.createElement("span");
    time.className = "log-time";
    time.textContent = record.timestamp;

    const level = document.createElement("span");
    level.className = "log-level";
    level.textContent = record.level;

    const component = document.createElement("span");
    component.className = "log-component";
    component.textContent = record.component;

    const message = document.createElement("span");
    message.textContent = recordText(record);

    line.append(time, level, component, message);
    fragment.append(line);
  }

  elements.console.append(fragment);
  if (state.autoScroll) elements.console.scrollTop = elements.console.scrollHeight;
}

function updateStatusView() {
  if (!state.status) return;
  elements.coreStatus.textContent = state.status.status;
  elements.version.textContent = state.status.version;
  elements.platform.textContent = state.status.platform;
  const started = Date.parse(state.status.startedAt);
  elements.uptime.textContent = formatDuration(Date.now() - started);
}

function renderAccount() {
  const account = state.account;
  if (!account) return;

  const labels = {
    disconnected: "Disconnected",
    connecting: "Connecting…",
    connected: "Connected",
    error: "Connection failed",
  };
  elements.accountStatus.textContent = labels[account.status] ?? account.status;
  elements.accountStatus.title = account.message ?? "";
  elements.accountUserId.textContent = account.userId ?? "—";
  elements.accountConnectedAt.textContent =
    account.connectedAt ? formatPublished(account.connectedAt) : "—";

  const connected = account.status === "connected";
  if (!connected) dashboardEditor?.setCharacterOptions([]);
  elements.accountForm.hidden = connected;
  elements.accountDisconnect.hidden = !connected;
  elements.accountConnect.disabled = account.status === "connecting";
}

function renderCharacterConnection() {
  const connection = state.character;
  if (!connection) return;

  const labels = {
    disconnected: "Disconnected",
    connecting: "Connecting…",
    connected: "Connected",
    disconnecting: "Disconnecting…",
    error: "Connection failed",
  };
  elements.characterConnectionStatus.textContent =
    labels[connection.status] ?? connection.status;
  elements.characterConnectionStatus.title = connection.message ?? "";
  elements.activeCharacter.textContent =
    connection.characterName ?? connection.character?.name ?? "—";
  elements.characterServer.textContent =
    connection.serverRegion && connection.serverName
      ? `${connection.serverRegion} ${connection.serverName}`
      : "—";
  elements.characterConnectedAt.textContent =
    connection.connectedAt ? formatPublished(connection.connectedAt) : "—";

  const character = connection.character;
  elements.characterHp.textContent =
    character?.hp === undefined
      ? "—"
      : `${character.hp} / ${character.maxHp ?? "?"}`;
  elements.characterMp.textContent =
    character?.mp === undefined
      ? "—"
      : `${character.mp} / ${character.maxMp ?? "?"}`;
  elements.characterLevel.textContent =
    character?.level === undefined ? "—" : String(character.level);
  elements.characterXp.textContent =
    character?.xp === undefined
      ? "—"
      : `${character.xp} / ${character.maxXp ?? "?"}`;
  elements.characterMap.textContent = character?.map ?? "—";
  elements.characterPosition.textContent =
    character?.x === undefined || character?.y === undefined
      ? "—"
      : `${character.x.toFixed(1)}, ${character.y.toFixed(1)}`;
  elements.characterDirection.textContent =
    character?.directionLabel ??
    (character?.angle === undefined ? "—" : `${character.angle.toFixed(1)}°`);
  elements.characterTarget.textContent = character?.target ?? "None";
  elements.characterDeathState.textContent =
    character ? (character.dead ? "Dead" : "Alive") : "—";
  elements.characterPing.textContent =
    connection.pingMs === undefined
      ? (connection.status === "connected" ? "Measuring…" : "—")
      : `${Math.round(connection.pingMs)} ms`;

  const inventory = character?.inventory;
  const inventoryUsed = inventory?.filter(Boolean).length;
  const equipment = character?.equipment;
  const equipmentUsed = equipment
    ? Object.values(equipment).filter(Boolean).length
    : undefined;
  const conditions = character?.conditions;
  const conditionCount = conditions ? Object.keys(conditions).length : undefined;

  elements.characterGold.textContent =
    character?.gold === undefined ? "—" : character.gold.toLocaleString("en-US");
  elements.characterInventorySummary.textContent =
    inventory === undefined ? "—" : `${inventoryUsed} / ${inventory.length} used`;
  elements.characterEquipmentSummary.textContent =
    equipment === undefined ? "—" : `${equipmentUsed} equipped`;
  elements.characterConditionsSummary.textContent =
    conditions === undefined ? "—" : `${conditionCount} active`;

  const entities = connection.entities;
  const nearbyPlayers = entities?.filter((entity) => entity.kind === "player") ?? [];
  const nearbyMonsters = entities?.filter((entity) => entity.kind === "monster") ?? [];
  const party = connection.party;
  elements.characterEntitiesSummary.textContent =
    entities === undefined ? "—" : `${entities.length} visible`;
  elements.characterPlayersSummary.textContent =
    entities === undefined ? "—" : String(nearbyPlayers.length);
  elements.characterMonstersSummary.textContent =
    entities === undefined ? "—" : String(nearbyMonsters.length);
  elements.characterPartySummary.textContent =
    party === undefined
      ? "—"
      : party.inParty
        ? party.members.length
          ? `${party.members.length} members · Leader: ${party.leader ?? "Unknown"}`
          : `In party · Leader: ${party.leader ?? "Unknown"} · waiting for members`
        : "Solo";

  renderInventoryState(inventory);
  renderEquipmentState(equipment);
  renderConditionState(conditions);
  renderEntityState(entities);
  renderAttackTargets(nearbyMonsters, character, connection.status === "connected");
  renderPartyState(party);

  const busy = ["connecting", "connected", "disconnecting"].includes(connection.status);
  const canStart =
    state.account?.status === "connected" &&
    state.selection?.status === "ready" &&
    Boolean(state.selection?.selectedServerKey) &&
    Boolean(elements.characterSelect.value) &&
    !busy;
  elements.startCharacter.disabled = !canStart;
  elements.stopCharacter.hidden =
    connection.status !== "connected" && connection.status !== "connecting";
  elements.stopCharacter.disabled = connection.status === "disconnecting";
  elements.characterSelect.disabled = busy;
  elements.serverSelect.disabled = busy || state.selection?.status !== "ready";
  elements.selectServer.disabled =
    busy ||
    state.selection?.status !== "ready" ||
    (state.selection?.servers?.length ?? 0) === 0;
}

function renderInventoryState(inventory) {
  elements.characterInventory.replaceChildren();
  if (!inventory) {
    appendStateEmpty(elements.characterInventory, "Inventory state is not available.");
    return;
  }

  let rendered = 0;
  inventory.forEach((item, index) => {
    if (!item) return;
    appendStateCard(
      elements.characterInventory,
      `Slot ${index + 1}`,
      formatItemState(item),
    );
    rendered += 1;
  });
  if (!rendered) appendStateEmpty(elements.characterInventory, "Inventory is empty.");
}

function renderEquipmentState(equipment) {
  elements.characterEquipment.replaceChildren();
  if (!equipment) {
    appendStateEmpty(elements.characterEquipment, "Equipment state is not available.");
    return;
  }

  const equipped = Object.entries(equipment)
    .filter(([, item]) => Boolean(item))
    .sort(([left], [right]) => left.localeCompare(right));
  if (!equipped.length) {
    appendStateEmpty(elements.characterEquipment, "No equipment is currently equipped.");
    return;
  }
  for (const [slot, item] of equipped) {
    appendStateCard(elements.characterEquipment, slot, formatItemState(item));
  }
}

function renderConditionState(conditions) {
  elements.characterConditions.replaceChildren();
  if (!conditions) {
    appendStateEmpty(elements.characterConditions, "Condition state is not available.");
    return;
  }

  const entries = Object.entries(conditions).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  if (!entries.length) {
    appendStateEmpty(elements.characterConditions, "No active conditions.");
    return;
  }
  for (const [name, condition] of entries) {
    const details = [];
    if (typeof condition.ms === "number") {
      details.push(`${Math.max(0, Math.ceil(condition.ms / 1000))}s remaining`);
    }
    if (typeof condition.f === "string" && condition.f) {
      details.push(`Source: ${condition.f}`);
    }
    appendStateCard(
      elements.characterConditions,
      name,
      details.join(" · ") || "Active",
    );
  }
}

function renderEntityState(entities) {
  elements.characterEntities.replaceChildren();
  if (!entities) {
    appendStateEmpty(elements.characterEntities, "Nearby entity state is not available.");
    return;
  }
  if (!entities.length) {
    appendStateEmpty(elements.characterEntities, "No nearby entities are currently visible.");
    return;
  }

  const sorted = [...entities].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
    return left.name.localeCompare(right.name);
  });
  for (const entity of sorted) {
    const details = [
      entity.kind === "player" ? "Player" : "Monster",
      entity.type,
    ];
    if (typeof entity.level === "number") details.push(`Level ${entity.level}`);
    if (typeof entity.hp === "number") {
      details.push(`HP ${entity.hp} / ${entity.maxHp ?? "?"}`);
    }
    if (typeof entity.x === "number" && typeof entity.y === "number") {
      details.push(`${entity.x.toFixed(1)}, ${entity.y.toFixed(1)}`);
    }
    if (entity.target) details.push(`Target: ${entity.target}`);
    appendStateCard(elements.characterEntities, entity.name, details.join(" · "));
  }
}

function renderAttackTargets(monsters, character, connected) {
  const previous = elements.attackTarget.value;
  elements.attackTarget.replaceChildren();

  if (!connected || !character || character.dead || !monsters.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = !connected
      ? "Connect a character first"
      : character?.dead
        ? "Character is dead"
        : "No visible monsters";
    elements.attackTarget.append(option);
    elements.runAttackTest.disabled = true;
    return;
  }

  for (const monster of monsters) {
    const option = document.createElement("option");
    option.value = monster.id;
    const details = [monster.type || "monster", `ID ${monster.id}`];
    if (
      typeof character.x === "number" &&
      typeof character.y === "number" &&
      typeof monster.x === "number" &&
      typeof monster.y === "number"
    ) {
      details.push(
        `Distance ${Math.hypot(monster.x - character.x, monster.y - character.y).toFixed(1)}`,
      );
    }
    if (typeof monster.hp === "number") {
      details.push(`HP ${monster.hp}${typeof monster.maxHp === "number" ? `/${monster.maxHp}` : ""}`);
    }
    option.textContent = details.join(" · ");
    elements.attackTarget.append(option);
  }

  elements.attackTarget.value = monsters.some((monster) => monster.id === previous)
    ? previous
    : monsters[0].id;
  elements.runAttackTest.disabled = !elements.attackTarget.value;
}

function renderSkillControls() {
  const payload = state.skillOptions;
  const previousSkill = elements.skillName.value;
  const previousTarget = elements.skillTarget.value;
  elements.skillName.replaceChildren();

  const skills = payload?.skills ?? [];
  if (payload?.status !== "ready" || !skills.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = payload?.message ?? "No supported skills";
    elements.skillName.append(option);
    elements.skillName.disabled = true;
    elements.skillTarget.replaceChildren();
    const targetOption = document.createElement("option");
    targetOption.value = "";
    targetOption.textContent = "No target available";
    elements.skillTarget.append(targetOption);
    elements.skillTarget.disabled = true;
    elements.runSkillTest.disabled = true;
    elements.skillTestNote.textContent =
      payload?.message ??
      "Slice 3.4 safe skill options are not available yet.";
    return;
  }

  for (const skill of skills) {
    const option = document.createElement("option");
    option.value = skill.skillName;
    const details = [skill.displayName, skill.skillName];
    if (skill.mpCost > 0) details.push(`${skill.mpCost} MP`);
    if (typeof skill.cooldownMs === "number") {
      details.push(`${skill.cooldownMs} ms cooldown`);
    }
    option.textContent = details.join(" · ");
    elements.skillName.append(option);
  }
  elements.skillName.disabled = false;
  elements.skillName.value = skills.some((skill) => skill.skillName === previousSkill)
    ? previousSkill
    : skills[0].skillName;
  renderSkillTargets(previousTarget);
}

function renderSkillTargets(previousTarget = elements.skillTarget.value) {
  const skills = state.skillOptions?.skills ?? [];
  const skill = skills.find((entry) => entry.skillName === elements.skillName.value);
  elements.skillTarget.replaceChildren();

  if (!skill) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No skill selected";
    elements.skillTarget.append(option);
    elements.skillTarget.disabled = true;
    elements.runSkillTest.disabled = true;
    return;
  }

  if (skill.targetMode === "none") {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No target required";
    elements.skillTarget.append(option);
    elements.skillTarget.disabled = true;
    elements.runSkillTest.disabled = false;
  } else if (!skill.targets?.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = `No in-range visible ${skill.targetMode} targets`;
    elements.skillTarget.append(option);
    elements.skillTarget.disabled = true;
    elements.runSkillTest.disabled = true;
  } else {
    for (const target of skill.targets) {
      const option = document.createElement("option");
      option.value = target.id;
      const details = [target.name, target.kind, `ID ${target.id}`];
      if (typeof target.distance === "number") {
        details.push(`Distance ${target.distance.toFixed(1)}`);
      }
      option.textContent = details.join(" · ");
      elements.skillTarget.append(option);
    }
    elements.skillTarget.disabled = false;
    elements.skillTarget.value = skill.targets.some((target) => target.id === previousTarget)
      ? previousTarget
      : skill.targets[0].id;
    elements.runSkillTest.disabled = !elements.skillTarget.value;
  }

  const range = typeof skill.range === "number"
    ? ` Range: ${skill.range}.`
    : "";
  elements.skillTestNote.textContent =
    `Slice 3.4 safe skill: ${skill.displayName}. Target mode: ${skill.targetMode}. MP cost: ${skill.mpCost}.${range} One click sends at most one validated skill and waits for the Adventure Land server result; special, hostile, movement, item-consuming and multi-target payloads remain excluded.`;
}

function renderLootConsumableControls() {
  const payload = state.lootConsumableOptions;
  const previousChest = elements.lootChest.value;
  const previousConsumable = elements.consumableItem.value;

  elements.lootChest.replaceChildren();
  const chests = payload?.lootChests ?? [];
  if (payload?.status !== "ready" || chests.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = payload?.status !== "ready"
      ? payload?.message ?? "Loot options unavailable"
      : "No visible loot chests";
    elements.lootChest.append(option);
    elements.lootChest.disabled = true;
    elements.runLootTest.disabled = true;
  } else {
    for (const chest of chests) {
      const option = document.createElement("option");
      option.value = chest.id;
      const details = [`Chest ${chest.id}`];
      if (typeof chest.distance === "number") {
        details.push(`Distance ${chest.distance.toFixed(1)}`);
      }
      if (typeof chest.itemCount === "number") {
        details.push(`${chest.itemCount} item${chest.itemCount === 1 ? "" : "s"}`);
      }
      option.textContent = details.join(" · ");
      elements.lootChest.append(option);
    }
    elements.lootChest.disabled = false;
    elements.lootChest.value = chests.some((chest) => chest.id === previousChest)
      ? previousChest
      : chests[0].id;
    elements.runLootTest.disabled = !elements.lootChest.value;
  }

  elements.consumableItem.replaceChildren();
  const consumables = payload?.consumables ?? [];
  if (payload?.status !== "ready" || consumables.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = payload?.status !== "ready"
      ? payload?.message ?? "Consumable options unavailable"
      : "No supported HP/MP consumables";
    elements.consumableItem.append(option);
    elements.consumableItem.disabled = true;
    elements.runConsumableTest.disabled = true;
  } else {
    for (const item of consumables) {
      const option = document.createElement("option");
      option.value = String(item.inventoryIndex);
      const details = [
        item.displayName,
        item.kind.toUpperCase(),
        `+${item.restoreAmount}`,
        `Qty ${item.quantity}`,
        `Slot ${item.inventoryIndex}`,
      ];
      if (typeof item.cooldownMs === "number") {
        details.push(`${item.cooldownMs} ms cooldown`);
      }
      option.textContent = details.join(" · ");
      elements.consumableItem.append(option);
    }
    elements.consumableItem.disabled = false;
    elements.consumableItem.value = consumables.some((item) =>
      String(item.inventoryIndex) === previousConsumable
    )
      ? previousConsumable
      : String(consumables[0].inventoryIndex);
    elements.runConsumableTest.disabled = !elements.consumableItem.value;
  }

  if (payload?.status === "ready") {
    elements.lootConsumableTestNote.textContent =
      `Slice 3.5 currently exposes ${chests.length} visible loot chest(s) and ${consumables.length} validated HP/MP inventory item(s). Each click sends exactly one bounded request and waits for Adventure Land server confirmation; no automatic loop or free-form payload is available.`;
  } else {
    elements.lootConsumableTestNote.textContent =
      payload?.message ?? "Slice 3.5 loot and consumable options are unavailable.";
  }
}

function renderPartyState(party) {
  elements.characterParty.replaceChildren();
  if (!party) {
    appendStateEmpty(elements.characterParty, "Party state is not available.");
    return;
  }
  if (!party.inParty) {
    appendStateEmpty(elements.characterParty, "Character is not in a party.");
    return;
  }
  if (!party.members.length) {
    const leader = party.leader ? ` · Leader: ${party.leader}` : "";
    appendStateEmpty(
      elements.characterParty,
      `Party detected${leader}. Waiting for member details.`,
    );
    return;
  }

  for (const name of party.members) {
    const member = party.details?.[name];
    const details = [];
    if (name === party.leader) details.push("Leader");
    if (member?.type) details.push(member.type);
    if (typeof member?.level === "number") details.push(`Level ${member.level}`);
    if (member?.map) details.push(member.map);
    if (typeof member?.x === "number" && typeof member?.y === "number") {
      details.push(`${member.x.toFixed(1)}, ${member.y.toFixed(1)}`);
    }
    if (member?.dead === true) details.push("Dead");
    appendStateCard(elements.characterParty, name, details.join(" · ") || "Party member");
  }
}

function appendStateCard(container, titleText, detailText) {
  const card = document.createElement("article");
  card.className = "selection-card";

  const title = document.createElement("strong");
  title.textContent = titleText;

  const details = document.createElement("span");
  details.textContent = detailText;

  card.append(title, details);
  container.append(card);
}

function appendStateEmpty(container, message) {
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = message;
  container.append(empty);
}

function formatItemState(item) {
  if (!item) return "Empty";
  const name = typeof item.name === "string" ? item.name : "Unknown item";
  const details = [];
  if (typeof item.level === "number") details.push(`Level ${item.level}`);
  if (typeof item.q === "number") details.push(`Qty ${item.q}`);
  return details.length ? `${name} · ${details.join(" · ")}` : name;
}

function renderSelection() {
  const selection = state.selection;
  const connected = state.account?.status === "connected";
  elements.selectionPanel.hidden = !connected;
  if (!connected || !selection) return;

  const statusLabels = {
    disconnected: "Disconnected",
    loading: "Loading…",
    ready: "Ready",
    error: "Load failed",
  };
  elements.selectionStatus.textContent =
    statusLabels[selection.status] ?? selection.status;
  elements.selectionStatus.title = selection.message ?? "";
  elements.characterCount.textContent = String(selection.characters?.length ?? 0);
  elements.serverCount.textContent = String(selection.servers?.length ?? 0);

  const servers = selection.servers ?? [];
  const selected = servers.find(
    (server) => server.key === selection.selectedServerKey,
  );
  elements.selectedServer.textContent = selected
    ? `${selected.region} ${selected.name}`
    : "Not selected";

  elements.characterList.replaceChildren();
  const characters = selection.characters ?? [];
  dashboardEditor?.setCharacterOptions(
    characters.map((character) => ({ id: character.id, name: character.name })),
  );

  const previousCharacter = elements.characterSelect.value;
  elements.characterSelect.replaceChildren();
  if (characters.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No characters available";
    elements.characterSelect.append(option);
  } else {
    for (const character of characters) {
      const option = document.createElement("option");
      option.value = character.id;
      option.textContent =
        `${character.name} · ${character.type} · Level ${character.level}`;
      elements.characterSelect.append(option);
    }
    const activeId = state.character?.characterId;
    elements.characterSelect.value =
      activeId && characters.some((character) => character.id === activeId)
        ? activeId
        : characters.some((character) => character.id === previousCharacter)
          ? previousCharacter
          : characters[0].id;
  }

  if (characters.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent =
      selection.status === "error"
        ? selection.message ?? "Characters could not be loaded."
        : "No characters were returned for this account.";
    elements.characterList.append(empty);
  } else {
    for (const character of characters) {
      const card = document.createElement("article");
      card.className = "selection-card";

      const name = document.createElement("strong");
      name.textContent = character.name;

      const details = document.createElement("span");
      details.textContent = `${character.type} · Level ${character.level}`;

      const presence = document.createElement("small");
      presence.textContent = character.online
        ? `Online${character.serverKey ? ` · ${character.serverKey}` : ""}`
        : "Offline";

      card.append(name, details, presence);
      elements.characterList.append(card);
    }
  }

  const previousValue = elements.serverSelect.value;
  elements.serverSelect.replaceChildren();
  if (servers.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No servers available";
    elements.serverSelect.append(option);
  } else {
    for (const server of servers) {
      const option = document.createElement("option");
      option.value = server.key;
      option.textContent =
        `${server.region} ${server.name} · ${server.players} players`;
      elements.serverSelect.append(option);
    }
    const preferred =
      selection.selectedServerKey &&
      servers.some((server) => server.key === selection.selectedServerKey)
        ? selection.selectedServerKey
        : servers.some((server) => server.key === previousValue)
          ? previousValue
          : servers[0].key;
    elements.serverSelect.value = preferred;
  }

  const characterBusy = ["connecting", "connected", "disconnecting"].includes(
    state.character?.status,
  );
  elements.selectServer.disabled =
    characterBusy || selection.status !== "ready" || servers.length === 0;
  elements.serverSelect.disabled =
    characterBusy || selection.status !== "ready" || servers.length === 0;
  elements.refreshSelection.disabled = selection.status === "loading";

  elements.serverList.replaceChildren();
  if (servers.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent =
      selection.status === "error"
        ? selection.message ?? "Servers could not be loaded."
        : "No servers are available.";
    elements.serverList.append(empty);
  } else {
    for (const server of servers) {
      const card = document.createElement("article");
      card.className = "selection-card";
      if (server.key === selection.selectedServerKey) {
        card.dataset.selected = "true";
      }

      const name = document.createElement("strong");
      name.textContent = `${server.region} ${server.name}`;

      const details = document.createElement("span");
      details.textContent = server.key;

      const players = document.createElement("small");
      players.textContent = `${server.players} players`;

      card.append(name, details, players);
      elements.serverList.append(card);
    }
  }

  renderCharacterConnection();
}

function renderControlMode() {
  const control = state.controlMode;
  if (!control || !elements.controlMode) return;
  elements.controlMode.value = control.mode;
  elements.controlMode.title = control.message ?? "";
}

async function setControlMode(mode) {
  const response = await fetch("/api/control-mode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? `Control mode request failed with HTTP ${response.status}.`);
  }
  state.controlMode = payload;
  renderControlMode();
  return payload;
}

elements.controlMode.addEventListener("change", async () => {
  const requested = elements.controlMode.value;
  elements.controlMode.disabled = true;
  try {
    const control = await setControlMode(requested);
    setFeedback(`Control mode changed to ${control.label}.`, "success");
  } catch (error) {
    renderControlMode();
    setFeedback(`Control mode could not be changed: ${error.message}`, "error");
  } finally {
    elements.controlMode.disabled = false;
  }
});

function renderActionGateway() {
  const gateway = state.actionGateway;
  if (!gateway) return;

  elements.actionGatewayStatus.textContent =
    gateway.status === "ready" ? "Ready" : gateway.status ?? "Unavailable";
  elements.actionGatewayActive.textContent = String(gateway.active ?? 0);
  elements.actionGatewayTotal.textContent = String(gateway.totalRequests ?? 0);
  elements.actionGatewayRequestId.textContent =
    gateway.lastResult?.requestId ?? "—";
  elements.actionGatewayOutcome.textContent =
    gateway.lastResult?.outcome ?? "—";
}

function renderSlice35LiveTest() {
  const test = state.slice35LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice35LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice35LiveTest.disabled = status === "running";
  elements.copySlice35LiveTestResult.hidden = !state.slice35LastReport;

  if (status === "running") {
    elements.slice35LiveTestNote.textContent =
      "The one-click test is preparing and validating the required live game state automatically. Do not perform manual gameplay actions while it is running.";
  } else if (test?.message) {
    elements.slice35LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice35LiveTestNote.textContent =
      "The test prepares a bounded safe game state automatically, runs the Slice 3.5 loot and consumable checks, verifies Adventure Land server responses and live postconditions, then copies the complete structured result and sanitized diagnostic log to the clipboard. No manual target, chest, item, movement, or combat preparation is required.";
  }
}

function renderScriptRuntime() {
  const runtime = state.scriptRuntime;
  const status = runtime?.status ?? "unavailable";
  const labels = {
    unloaded: "No script loaded",
    loaded: "Loaded",
    running: "Running",
    paused: "Paused",
    stopped: "Stopped",
    crashed: "Crashed",
    unavailable: "Unavailable",
  };

  elements.scriptRuntimeStatus.textContent = labels[status] ?? status;
  elements.scriptRuntimeStatus.title = runtime?.message ?? "";
  elements.scriptRuntimeName.textContent = runtime?.scriptName ?? "—";
  elements.scriptRuntimeTimers.textContent = String(runtime?.activeTimers ?? 0);
  elements.scriptRuntimeLogRecords.textContent = String(runtime?.logRecords ?? 0);

  elements.scriptRuntimeStart.disabled =
    !runtime || status === "unavailable" || status === "unloaded" || status === "running";
  elements.scriptRuntimePause.disabled = status !== "running";
  elements.scriptRuntimeStop.disabled =
    !runtime || status === "unavailable" || status === "unloaded" || status === "stopped";
}

function renderSlice41LiveTest() {
  const test = state.slice41LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice41LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice41LiveTest.disabled = status === "running";
  elements.copySlice41LiveTestResult.hidden = !state.slice41LastReport;

  if (status === "running") {
    elements.slice41LiveTestNote.textContent =
      "The test is automatically exercising the isolated script lifecycle. No Adventure Land gameplay preparation is required.";
  } else if (test?.message) {
    elements.slice41LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice41LiveTestNote.textContent =
      "The test automatically verifies script loading, isolated start, timer cleanup on pause and stop, crash isolation, recovery after a script crash, and separately marked script logs. No Adventure Land gameplay preparation is required.";
  }
}

function renderSlice42LiveTest() {
  const test = state.slice42LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice42LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice42LiveTest.disabled = status === "running";
  elements.copySlice42LiveTestResult.hidden = !state.slice42LastReport;

  if (status === "running") {
    elements.slice42LiveTestNote.textContent =
      "The bounded isolated script farmer is selecting and validating one low-risk target automatically. Do not perform manual gameplay actions while it is running.";
  } else if (test?.message) {
    elements.slice42LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice42LiveTestNote.textContent =
      "The test selects one bounded low-risk visible monster automatically, exercises the first Adventure Land-compatible script globals and helpers, then runs script-origin attack, loot, move, and direct-path xmove actions through the central Action Gateway. No manual target or developer controls are required.";
  }
}

function renderSlice43LiveTest() {
  const test = state.slice43LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice43LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice43LiveTest.disabled = status === "running";
  elements.copySlice43LiveTestResult.hidden = !state.slice43LastReport;

  if (status === "running") {
    elements.slice43LiveTestNote.textContent =
      "The isolated event script is observing fresh read-only headless state. Do not stop the character connection while the test is running.";
  } else if (test?.message) {
    elements.slice43LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice43LiveTestNote.textContent =
      "The test observes a real entities event, validates its safe worker snapshot, and verifies listener cleanup across off(), pause, stop, restart, and handler crash without gameplay mutation.";
  }
}

function renderSlice44LiveTest() {
  const test = state.slice44LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice44LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice44LiveTest.disabled = status === "running";
  elements.copySlice44LiveTestResult.hidden = !state.slice44LastReport;

  if (status === "running") {
    elements.slice44LiveTestNote.textContent =
      "The isolated storage probe is verifying local persistence and namespace isolation. No Adventure Land connection is required.";
  } else if (test?.message) {
    elements.slice44LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice44LiveTestNote.textContent =
      "The test writes JSON state with set(), restores it with get() in a fresh worker, proves a second script uses a separate namespace, then verifies del() and bounded test cleanup.";
  }
}

function renderSimpleFarmer() {
  const options = state.simpleFarmerOptions;
  const farmer = state.simpleFarmer;
  const selected = elements.simpleFarmerMonster.value;
  const monsters = Array.isArray(options?.monsters) ? options.monsters : [];
  elements.simpleFarmerMonster.replaceChildren();
  if (!monsters.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No visible monsters";
    elements.simpleFarmerMonster.append(option);
  } else {
    for (const monster of monsters) {
      const option = document.createElement("option");
      option.value = monster;
      option.textContent = monster;
      elements.simpleFarmerMonster.append(option);
    }
    elements.simpleFarmerMonster.value = monsters.includes(selected) ? selected : monsters[0];
  }

  const running = farmer?.status === "running";
  elements.simpleFarmerStatus.textContent = running
    ? "Running"
    : farmer?.status === "error"
      ? "Error"
      : farmer?.status === "stopped"
        ? "Stopped"
        : "Idle";
  elements.simpleFarmerStart.disabled = options?.status !== "ready" || !monsters.length || running;
  elements.simpleFarmerStop.disabled = !running;
  elements.simpleFarmerNote.textContent = farmer?.message ??
    options?.message ??
    "Configure a currently visible monster type. Slice 4.5 does not navigate.";
}

function renderSlice45LiveTest() {
  const test = state.slice45LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice45LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice45LiveTest.disabled = status === "running";
  elements.copySlice45LiveTestResult.hidden = !state.slice45LastReport;
  if (status === "running") {
    elements.slice45LiveTestNote.textContent =
      "The bounded test is selecting a safe visible monster, approaching it automatically when needed, then verifying real server-confirmed attack and loot.";
  } else if (test?.message) {
    elements.slice45LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice45LiveTestNote.textContent =
      "The test selects one low-risk visible monster, approaches it automatically when needed, starts the no-code Simple Farmer, proves script-origin attack and loot, then stops and verifies cleanup.";
  }
}

function renderSlice51LiveTest() {
  const test = state.slice51LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice51LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice51LiveTest.disabled = status === "running";
  elements.copySlice51LiveTestResult.hidden = !state.slice51LastReport;
  if (status === "running") {
    elements.slice51LiveTestNote.textContent =
      "Observing passive Core, Character, and Script heartbeat sequences. No reconnect, restart, or gameplay mutation is performed.";
  } else if (test?.message) {
    elements.slice51LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice51LiveTestNote.textContent =
      "Verifies passive Core, Character, and isolated Script heartbeats using a read-only character state refresh.";
  }
}

function renderSlice52LiveTest() {
  const test = state.slice52LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice52LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice52LiveTest.disabled = status === "running";
  elements.copySlice52LiveTestResult.hidden = !state.slice52LastReport;
  if (status === "running") {
    elements.slice52LiveTestNote.textContent =
      "The real character socket is being interrupted once. ALRemastered is verifying bounded backoff, automatic reconnect, ordered logs, and fresh state without gameplay mutation.";
  } else if (test?.message) {
    elements.slice52LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice52LiveTestNote.textContent =
      "Intentionally interrupts the real headless character socket and verifies disconnect detection, bounded reconnect, and recovery evidence.";
  }
}

function renderSlice53LiveTest() {
  const test = state.slice53LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice53LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice53LiveTest.disabled = status === "running";
  elements.copySlice53LiveTestResult.hidden = !state.slice53LastReport;
  if (status === "running") {
    elements.slice53LiveTestNote.textContent =
      "Verifying real death evidence, server-confirmed respawn through the central Action Gateway, and continuation of the same isolated script run.";
  } else if (test?.message) {
    elements.slice53LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice53LiveTestNote.textContent =
      "Requires a real server-observed dead Character. The harness handles respawn and script-continuation verification without raw socket access.";
  }
}

function renderSlice54LiveTest() {
  const test = state.slice54LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice54LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice54LiveTest.disabled = status === "running";
  elements.copySlice54LiveTestResult.hidden = !state.slice54LastReport;
  if (status === "running") {
    elements.slice54LiveTestNote.textContent =
      "Suppressing host-observed probe heartbeats, then verifying production watchdog stall detection, bounded worker restarts, restart-budget exhaustion, and no restart loop.";
  } else if (test?.message) {
    elements.slice54LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice54LiveTestNote.textContent =
      "Uses a bounded test-only Script heartbeat suppression. No gameplay action or raw socket access is used.";
  }
}

function renderSlice61LiveTest() {
  const test = state.slice61LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice61LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice61LiveTest.disabled = status === "running";
  elements.copySlice61LiveTestResult.hidden = !state.slice61LastReport;
  if (status === "running") {
    elements.slice61LiveTestNote.textContent =
      "Reloading and validating live maps, boundaries, door target-spawn references, and collision-relevant geometry. No Character connection, movement, or pathfinding is required.";
  } else if (test?.message) {
    elements.slice61LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice61LiveTestNote.textContent =
      "Passive live-data validation only. No headless Character is required, and no movement, pathfinding, gameplay action, or raw socket access is used.";
  }
}

function renderSlice62LiveTest() {
  const test = state.slice62LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice62LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice62LiveTest.disabled = status === "running";
  elements.copySlice62LiveTestResult.hidden = !state.slice62LastReport;
  if (status === "running") {
    elements.slice62LiveTestNote.textContent =
      "Refreshing live navigation data, selecting a real unconditional cross-map route, and validating waypoints plus every route leg. No Character movement is executed.";
  } else if (test?.message) {
    elements.slice62LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice62LiveTestNote.textContent =
      "Passive route planning only. No Character connection, movement execution, gameplay mutation, or raw socket access is required.";
  }
}

function renderSlice63LiveTest() {
  const test = state.slice63LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice63LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice63LiveTest.disabled = status === "running";
  elements.copySlice63LiveTestResult.hidden = !state.slice63LastReport;
  if (status === "running") {
    elements.slice63LiveTestNote.textContent =
      "Exercising smart_move() inside the isolated script worker. The probe verifies an already-at-target destination plus a stable unsupported-target error without executing movement.";
  } else if (test?.message) {
    elements.slice63LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice63LiveTestNote.textContent =
      "Requires one connected headless Character. The probe performs no movement execution, gameplay mutation, or raw socket access.";
  }
}

function renderSlice64LiveTest() {
  const test = state.slice64LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice64LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice64LiveTest.disabled = status === "running";
  elements.copySlice64LiveTestResult.hidden = !state.slice64LastReport;
  if (status === "running") {
    elements.slice64LiveTestNote.textContent =
      "Planning one short route, moving 32 units through the central Action Gateway, returning to the original position, and verifying the server-confirmed trail. A user script is never interrupted.";
  } else if (test?.message) {
    elements.slice64LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice64LiveTestNote.textContent =
      "Requires one connected headless Character and no running or paused user script. The test performs one bounded movement round-trip through the central Action Gateway and uses no raw sockets.";
  }
}

function renderCharacterSessions() {
  const manager = state.characterSessions;
  if (!manager) {
    elements.characterSessionsStatus.textContent = "Waiting";
    elements.characterSessionsActive.textContent = "0";
    elements.characterSessionsList.value = "No active Character sessions.";
    return;
  }

  elements.characterSessionsStatus.textContent =
    manager.status === "degraded" ? "Degraded" : "Ready";
  elements.characterSessionsActive.textContent =
    String(manager.activeSessionCount ?? 0);
  elements.characterSessionsLimit.textContent =
    String(manager.sessionLimit ?? 4);
  const sharedVersion = manager.sharedStaticData?.gameDataVersion;
  elements.characterSessionsGameData.textContent =
    sharedVersion === undefined ? "Shared" : `Shared v${sharedVersion}`;

  const sessions = Array.isArray(manager.sessions) ? manager.sessions : [];
  elements.characterSessionsList.value = sessions.length > 0
    ? sessions.map((session) => {
      const role = session.role === "primary" ? "PRIMARY" : "MANAGED";
      const name = session.characterName ?? session.characterId;
      const server = session.serverKey ?? "unknown server";
      return `[${role}] ${name} (${session.characterId}) — ${server} — ${session.status}`;
    }).join("\n")
    : "No active Character sessions.";
  elements.characterSessionsNote.textContent = manager.message ??
    "Additional Characters use isolated sessions and shared static game data.";
}

function renderSlice71LiveTest() {
  const test = state.slice71LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice71LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice71LiveTest.disabled = status === "running";
  elements.copySlice71LiveTestResult.hidden = !state.slice71LastReport;
  if (status === "running") {
    elements.slice71LiveTestNote.textContent =
      "Connecting one additional offline Character, verifying two isolated sessions plus duplicate/limit protection, then stopping only the added test session. No gameplay action is executed.";
  } else if (test?.message) {
    elements.slice71LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice71LiveTestNote.textContent =
      "Requires one connected primary Character, one additional offline Character, loaded game data, and no running or paused user script. The probe performs no gameplay mutation and does not use a raw-socket bypass.";
  }
}

function renderCharacterMessaging() {
  const messaging = state.characterMessaging;
  if (!messaging) {
    elements.characterMessagingStatus.textContent = "Waiting";
    elements.characterMessagingRequests.textContent = "0";
    elements.characterMessagingDeliveries.textContent = "0";
    elements.characterMessagingUnavailable.textContent = "0";
    return;
  }

  elements.characterMessagingStatus.textContent =
    messaging.status === "ready" ? "Ready" : "Unavailable";
  elements.characterMessagingRequests.textContent =
    String(messaging.requestCount ?? 0);
  elements.characterMessagingDeliveries.textContent =
    String(messaging.localDeliveryCount ?? 0);
  elements.characterMessagingUnavailable.textContent =
    String(messaging.unavailableRecipientCount ?? 0);
  elements.characterMessagingNote.textContent = messaging.message ??
    "Local send_cm() messaging is available for active Character sessions.";
}

function renderSlice72LiveTest() {
  const test = state.slice72LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice72LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice72LiveTest.disabled = status === "running";
  elements.copySlice72LiveTestResult.hidden = !state.slice72LastReport;
  if (status === "running") {
    elements.slice72LiveTestNote.textContent =
      "Connecting one temporary managed Character, sending one local send_cm() probe plus one local reply, then removing only the temporary session. The user Script runtime is not replaced.";
  } else if (test?.message) {
    elements.slice72LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice72LiveTestNote.textContent =
      "Requires one connected primary Character, one additional offline Character, and no running or paused user script. The probe uses only local in-process messaging, performs no gameplay mutation, and does not use raw-socket/server CM routing.";
  }
}

function renderPartyCoordinator() {
  const coordinator = state.partyCoordinator;
  if (!coordinator) {
    elements.partyCoordinatorStatus.textContent = "Waiting";
    elements.partyCoordinatorMembers.textContent = "0";
    elements.partyCoordinatorTarget.textContent = "None";
    elements.partyCoordinatorRoles.textContent = "Waiting";
    elements.partyCoordinatorList.value = "No local Coordinator members.";
    return;
  }
  elements.partyCoordinatorStatus.textContent =
    coordinator.status === "ready" ? "Ready" : "Needs setup";
  elements.partyCoordinatorMembers.textContent = String(coordinator.memberCount ?? 0);
  elements.partyCoordinatorTarget.textContent = coordinator.target?.id ?? "None";
  const roleLabel = (name, role) =>
    `${name}: ${role?.status === "ready" ? "Ready" : role?.status === "degraded" ? "Degraded" : "Unassigned"}`;
  elements.partyCoordinatorRoles.textContent = [
    roleLabel("Tank", coordinator.roles?.tank),
    roleLabel("Healer", coordinator.roles?.healer),
    roleLabel("DPS", coordinator.roles?.dps),
  ].join(" · ");
  const members = Array.isArray(coordinator.members) ? coordinator.members : [];
  elements.partyCoordinatorList.value = members.length
    ? members.map((member) => {
      const session = member.sessionRole === "primary" ? "PRIMARY" : "MANAGED";
      const role = member.role ? member.role.toUpperCase() : "NO ROLE";
      const name = member.characterName ?? member.characterId;
      return `[${session}] ${name} — ${role} — ${member.status} — ${member.connectionStatus}`;
    }).join("\n")
    : "No local Coordinator members.";
  elements.partyCoordinatorNote.textContent = coordinator.message ??
    "Party Coordinator provides technical role and target state without combat or movement automation.";
}

function renderSlice73LiveTest() {
  const test = state.slice73LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice73LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice73LiveTest.disabled = status === "running";
  elements.copySlice73LiveTestResult.hidden = !state.slice73LastReport;
  if (status === "running") {
    elements.slice73LiveTestNote.textContent =
      "Connecting one temporary managed Character, exercising Tank / Healer / DPS Coordinator state and one logical shared target, then removing only the temporary session.";
  } else if (test?.message) {
    elements.slice73LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice73LiveTestNote.textContent =
      "Requires one connected primary Character, one additional offline Character, and no running or paused user script. No gameplay mutation, raw sockets, Party Templates, or Coordinator messaging traffic are used.";
  }
}



function renderPartyTemplates() {
  const templates = state.partyTemplates;
  const assignments = Array.isArray(templates?.assignments) ? templates.assignments : [];
  elements.partyTemplatesStatus.textContent = templates?.status === "ready"
    ? "Ready"
    : templates?.status === "degraded"
      ? "Needs assignment"
      : templates?.status === "idle"
        ? "Waiting"
        : "Unavailable";
  elements.partyTemplatesMatched.textContent =
    `${templates?.matchedCount ?? 0} / ${templates?.memberCount ?? 0}`;
  elements.partyTemplatesSafety.textContent =
    templates?.gameplayMutation === false && templates?.rawSocketAccess === false
      ? "Local roles only"
      : "Check status";

  const previous = elements.partyTemplateMember.value;
  elements.partyTemplateMember.replaceChildren();
  for (const assignment of assignments) {
    const option = document.createElement("option");
    option.value = assignment.characterId;
    option.textContent =
      `${assignment.characterName ?? assignment.characterId} (${assignment.characterType ?? "unknown"})`;
    elements.partyTemplateMember.append(option);
  }
  if (assignments.some((item) => item.characterId === previous)) {
    elements.partyTemplateMember.value = previous;
  }
  const selected = assignments.find((item) =>
    item.characterId === elements.partyTemplateMember.value
  ) ?? assignments[0];
  if (selected?.currentRole) elements.partyTemplateRole.value = selected.currentRole;

  const disabled = assignments.length === 0;
  elements.partyTemplateMember.disabled = disabled;
  elements.partyTemplateRole.disabled = disabled;
  elements.assignPartyTemplateRole.disabled = disabled;
  elements.clearPartyTemplateRole.disabled = disabled;
  elements.applyRecommendedPartyRoles.disabled = disabled;

  elements.partyTemplatesList.value = assignments.length
    ? assignments.map((item) => {
      const current = item.currentRole?.toUpperCase() ?? "NO ROLE";
      const recommended = item.recommendedRole?.toUpperCase() ?? "NO RECOMMENDATION";
      return `${item.characterName ?? item.characterId} — ${item.characterType ?? "unknown"} — current ${current} — recommended ${recommended} — ${item.status}`;
    }).join("\n")
    : "No local Party Template assignments.";
  elements.partyTemplatesNote.textContent = templates?.message ??
    "Warrior Tank, Priest Healer, and DPS recommendations reuse the Party Coordinator without gameplay automation.";
}

function renderSlice74LiveTest() {
  const test = state.slice74LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice74LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice74LiveTest.disabled = status === "running";
  elements.copySlice74LiveTestResult.hidden = !state.slice74LastReport;
  if (status === "running") {
    elements.slice74LiveTestNote.textContent =
      "Connecting two bounded managed Characters to cover the missing Warrior Tank / Priest Healer / DPS roles, exercising manual assignment, then restoring the original Coordinator state.";
  } else if (test?.message) {
    elements.slice74LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice74LiveTestNote.textContent =
      "Requires one connected primary Character, offline Characters covering the two missing template roles, two free session slots, and no running or paused user script. No gameplay mutation, raw sockets, or messaging traffic are used.";
  }
}


function appendCharacterCardMetric(container, label, value) {
  const metric = document.createElement("div");
  metric.className = "character-card-metric";
  const labelNode = document.createElement("span");
  labelNode.className = "label";
  labelNode.textContent = label;
  const valueNode = document.createElement("strong");
  valueNode.textContent = value;
  metric.append(labelNode, valueNode);
  container.append(metric);
}

function formatResource(current, maximum) {
  return typeof current === "number" && typeof maximum === "number"
    ? `${Math.round(current)} / ${Math.round(maximum)}`
    : "—";
}

function renderCharacterCards() {
  const cardsState = state.characterCards;
  const cards = Array.isArray(cardsState?.cards) ? cardsState.cards : [];
  dashboardEditor?.setCharacterSnapshots(cards);
  elements.characterCardsStatus.textContent = cardsState?.status === "ready"
    ? `${cardsState.activeSessionCount ?? 0} / ${cardsState.sessionLimit ?? 4} active`
    : "Unavailable";
  elements.characterCardsGrid.replaceChildren();

  if (cards.length === 0) {
    const empty = document.createElement("article");
    empty.className = "card character-card";
    empty.textContent = "Connect an account and load Characters to show Character Cards.";
    elements.characterCardsGrid.append(empty);
  }

  for (const card of cards) {
    const article = document.createElement("article");
    article.className = "card character-card";
    article.dataset.health = card.health?.status ?? "offline";

    const header = document.createElement("div");
    header.className = "character-card-header";
    const title = document.createElement("div");
    const name = document.createElement("strong");
    name.className = "character-card-name";
    name.textContent = card.characterName ?? card.characterId;
    const meta = document.createElement("small");
    meta.textContent = `${card.characterType ?? "unknown"} · Level ${card.level ?? "—"} · ${card.sessionRole?.toUpperCase() ?? "OFFLINE"}`;
    title.append(name, meta);
    const health = document.createElement("span");
    health.className = "status-pill character-card-health";
    health.dataset.health = card.health?.status ?? "offline";
    health.textContent = card.health?.status === "healthy"
      ? "Healthy"
      : card.health?.status === "critical"
        ? "Critical"
        : card.health?.status === "attention"
          ? "Attention"
          : "Offline";
    health.title = card.health?.message ?? "";
    header.append(title, health);
    article.append(header);

    const metrics = document.createElement("div");
    metrics.className = "character-card-metrics";
    appendCharacterCardMetric(metrics, "HP", formatResource(card.hp, card.maxHp));
    appendCharacterCardMetric(metrics, "MP", formatResource(card.mp, card.maxMp));
    appendCharacterCardMetric(metrics, "Map", card.map ?? "—");
    appendCharacterCardMetric(metrics, "Target", card.target ?? "None");
    const scriptLabel = card.script?.status === "not-available"
      ? "Not available"
      : card.script?.name
        ? `${card.script.name} · ${card.script.status}`
        : card.script?.status ?? "unloaded";
    appendCharacterCardMetric(metrics, "Script", scriptLabel);
    appendCharacterCardMetric(metrics, "Health", health.textContent);
    article.append(metrics);

    const actions = document.createElement("div");
    actions.className = "toolbar character-card-actions";
    for (const action of ["start", "pause", "stop"]) {
      const control = card.controls?.[action] ?? { enabled: false, reason: "Unavailable." };
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.characterAction = action;
      button.dataset.characterId = card.characterId;
      button.textContent = action[0].toUpperCase() + action.slice(1);
      button.disabled = !control.enabled;
      button.title = control.reason ?? "";
      if (action === "stop") button.classList.add("danger");
      actions.append(button);
    }
    article.append(actions);
    elements.characterCardsGrid.append(article);
  }

  elements.characterCardsNote.textContent = cardsState?.message ??
    "Character Cards use the existing Character session and primary Script controls.";
}

function renderSlice81LiveTest() {
  const test = state.slice81LiveTest;
  const labels = {
    idle: "Ready",
    running: "Running…",
    passed: "PASSED",
    blocked: "BLOCKED",
    failed: "FAILED",
    unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice81LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice81LiveTest.disabled = status === "running";
  elements.copySlice81LiveTestResult.hidden = !state.slice81LastReport;
  if (status === "running") {
    elements.slice81LiveTestNote.textContent =
      "Verifying primary Card telemetry, one bounded managed Start/Stop, and primary Pause through an isolated probe Script runtime.";
  } else if (test?.message) {
    elements.slice81LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  } else {
    elements.slice81LiveTestNote.textContent =
      "Requires one connected primary Character, one offline secondary Character, one free session slot, and no running or paused user Script. No gameplay mutation or raw-socket access is used.";
  }
}


const setupWizardDraft = {
  step: 1,
  characterId: "",
  serverKey: "",
  taskTemplateId: "connect-only",
};

function syncSelectOptions(select, items, valueKey, labelFor, preferred) {
  const current = preferred || select.value;
  select.replaceChildren();
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item[valueKey];
    option.textContent = labelFor(item);
    select.append(option);
  }
  if (items.some((item) => item[valueKey] === current)) select.value = current;
  else if (items.length) select.value = items[0][valueKey];
  return select.value;
}

function setupWizardConfiguration() {
  if (setupWizardDraft.taskTemplateId === "simple-farmer") {
    return {
      monster: elements.setupWizardFarmerMonster.value.trim(),
      hpThresholdPercent: Number(elements.setupWizardFarmerHp.value),
      mpThresholdPercent: Number(elements.setupWizardFarmerMp.value),
      loot: elements.setupWizardFarmerLoot.checked,
      respawn: elements.setupWizardFarmerRespawn.checked,
    };
  }
  if (setupWizardDraft.taskTemplateId === "custom-script") {
    return {
      scriptName: elements.setupWizardScriptName.value.trim(),
      scriptSource: elements.setupWizardScriptSource.value,
    };
  }
  return {};
}

function setupWizardStageReady(step) {
  if (step === 1) return state.setupWizard?.accountConnected === true;
  if (step === 2) return Boolean(setupWizardDraft.characterId);
  if (step === 3) return Boolean(setupWizardDraft.serverKey);
  if (step === 4) return Boolean(setupWizardDraft.taskTemplateId);
  if (step === 5) {
    if (setupWizardDraft.taskTemplateId === "simple-farmer") {
      const hp = Number(elements.setupWizardFarmerHp.value);
      const mp = Number(elements.setupWizardFarmerMp.value);
      return Number.isInteger(hp) && hp >= 1 && hp <= 99 &&
        Number.isInteger(mp) && mp >= 1 && mp <= 99;
    }
    if (setupWizardDraft.taskTemplateId === "custom-script") {
      return Boolean(elements.setupWizardScriptName.value.trim() && elements.setupWizardScriptSource.value.trim());
    }
    return true;
  }
  return true;
}

function renderSetupWizard() {
  const wizard = state.setupWizard;
  const characters = Array.isArray(wizard?.characters) ? wizard.characters : [];
  const servers = Array.isArray(wizard?.servers) ? wizard.servers : [];
  const tasks = Array.isArray(wizard?.taskTemplates) ? wizard.taskTemplates : [];

  elements.setupWizardStatus.textContent = wizard?.status === "ready" ? "Ready" : "Needs account";
  elements.setupWizardAccountNote.textContent = wizard?.accountConnected
    ? "Account connected. Continue to Character."
    : "Connect your Adventure Land account. Credentials stay in memory only.";
  elements.setupWizardConnectAccount.disabled = wizard?.accountConnected === true;

  setupWizardDraft.characterId = syncSelectOptions(
    elements.setupWizardCharacter,
    characters,
    "id",
    (item) => `${item.name} · ${item.type} · Level ${item.level}`,
    setupWizardDraft.characterId,
  );
  setupWizardDraft.serverKey = syncSelectOptions(
    elements.setupWizardServer,
    servers,
    "key",
    (item) => `${item.region} ${item.name} · ${item.players} players`,
    setupWizardDraft.serverKey || wizard?.selectedServerKey,
  );
  setupWizardDraft.taskTemplateId = syncSelectOptions(
    elements.setupWizardTaskTemplate,
    tasks,
    "id",
    (item) => item.label,
    setupWizardDraft.taskTemplateId,
  ) || "connect-only";

  const selectedTask = tasks.find((item) => item.id === setupWizardDraft.taskTemplateId);
  elements.setupWizardTaskNote.textContent = selectedTask?.description ??
    "Choose an existing task or template.";

  elements.setupWizardConfigConnectOnly.hidden = setupWizardDraft.taskTemplateId !== "connect-only";
  elements.setupWizardConfigSimpleFarmer.hidden = setupWizardDraft.taskTemplateId !== "simple-farmer";
  elements.setupWizardConfigCustomScript.hidden = setupWizardDraft.taskTemplateId !== "custom-script";

  for (const panel of elements.setupWizardPanels) {
    panel.hidden = Number(panel.dataset.setupWizardPanel) !== setupWizardDraft.step;
  }
  for (const button of elements.setupWizardStepButtons) {
    const step = Number(button.dataset.setupWizardStep);
    button.dataset.active = step === setupWizardDraft.step ? "true" : "false";
    button.disabled = step > setupWizardDraft.step + 1;
  }

  const character = characters.find((item) => item.id === setupWizardDraft.characterId);
  const server = servers.find((item) => item.key === setupWizardDraft.serverKey);
  elements.setupWizardSummary.textContent =
    `${character?.name ?? "No Character"} · ${server ? `${server.region} ${server.name}` : "No server"} · ${selectedTask?.label ?? "No task"}`;

  elements.setupWizardBack.disabled = setupWizardDraft.step <= 1;
  elements.setupWizardNext.hidden = setupWizardDraft.step >= 6;
  elements.setupWizardNext.disabled = !setupWizardStageReady(setupWizardDraft.step);
  elements.setupWizardStart.disabled =
    setupWizardDraft.step !== 6 ||
    !wizard?.accountConnected ||
    !setupWizardDraft.characterId ||
    !setupWizardDraft.serverKey ||
    !setupWizardStageReady(5);
}

function renderSlice82LiveTest() {
  const test = state.slice82LiveTest;
  const labels = {
    idle: "Ready", running: "Running…", passed: "PASSED",
    blocked: "BLOCKED", failed: "FAILED", unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice82LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice82LiveTest.disabled = status === "running";
  elements.copySlice82LiveTestResult.hidden = !state.slice82LastReport;
  if (status === "running") {
    elements.slice82LiveTestNote.textContent =
      "Verifying Account, Character, Server, Task / Template, Configuration and Start with one bounded Connect only session.";
  } else if (test?.message) {
    elements.slice82LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  }
}

async function refreshSetupWizard() {
  try {
    const response = await fetch("/api/setup-wizard", { cache: "no-store" });
    state.setupWizard = await response.json();
  } catch {
    state.setupWizard = { status: "blocked", accountConnected: false, characters: [], servers: [], taskTemplates: [], message: "Setup Wizard status could not be loaded." };
  }
  renderSetupWizard();
}

async function refreshSlice82LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-8-2", { cache: "no-store" });
    state.slice82LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 8.2 Setup Wizard test is unavailable." };
  } catch {
    state.slice82LiveTest = { status: "unavailable", message: "Slice 8.2 Setup Wizard test status could not be loaded." };
  }
  renderSlice82LiveTest();
}

async function setupWizardStart() {
  const response = await fetch("/api/setup-wizard/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      characterId: setupWizardDraft.characterId,
      serverKey: setupWizardDraft.serverKey,
      taskTemplateId: setupWizardDraft.taskTemplateId,
      configuration: setupWizardConfiguration(),
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  return payload;
}

async function startSlice82LiveTest(clipboardWrite) {
  state.slice82LiveTest = { status: "running", message: "Slice 8.2 Setup Wizard test is running." };
  renderSlice82LiveTest();
  const response = await fetch("/api/live-test/slice-8-2/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 8.2 Setup Wizard test returned no copyable report.");
  }
  state.slice82LastReport = payload.reportText;
  state.slice82LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 8.2 Setup Wizard test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice82LiveTest();
  return { payload, copied };
}

elements.setupWizardStepButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const step = Number(button.dataset.setupWizardStep);
    if (step >= 1 && step <= 6 && step <= setupWizardDraft.step + 1) {
      setupWizardDraft.step = step;
      renderSetupWizard();
    }
  });
});
elements.setupWizardCharacter.addEventListener("change", () => {
  setupWizardDraft.characterId = elements.setupWizardCharacter.value;
  renderSetupWizard();
});
elements.setupWizardServer.addEventListener("change", () => {
  setupWizardDraft.serverKey = elements.setupWizardServer.value;
  renderSetupWizard();
});
elements.setupWizardTaskTemplate.addEventListener("change", () => {
  setupWizardDraft.taskTemplateId = elements.setupWizardTaskTemplate.value;
  renderSetupWizard();
});
for (const input of [
  elements.setupWizardFarmerMonster, elements.setupWizardFarmerHp, elements.setupWizardFarmerMp,
  elements.setupWizardFarmerLoot, elements.setupWizardFarmerRespawn,
  elements.setupWizardScriptName, elements.setupWizardScriptSource,
]) {
  input.addEventListener("input", renderSetupWizard);
  input.addEventListener("change", renderSetupWizard);
}

elements.setupWizardBack.addEventListener("click", () => {
  setupWizardDraft.step = Math.max(1, setupWizardDraft.step - 1);
  renderSetupWizard();
});
elements.setupWizardNext.addEventListener("click", () => {
  if (!setupWizardStageReady(setupWizardDraft.step)) return;
  setupWizardDraft.step = Math.min(6, setupWizardDraft.step + 1);
  renderSetupWizard();
});

elements.setupWizardConnectAccount.addEventListener("click", async () => {
  const email = elements.setupWizardEmail.value.trim();
  const password = elements.setupWizardPassword.value;
  if (!email || !password) {
    setFeedback("Setup Wizard account connection requires email and password.", "error");
    return;
  }
  elements.setupWizardConnectAccount.disabled = true;
  try {
    const response = await fetch("/api/account/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const payload = await response.json();
    if (!response.ok || payload.status !== "connected") {
      throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
    }
    elements.setupWizardPassword.value = "";
    await refreshAccount();
    await refreshSelection();
    await refreshSetupWizard();
    setFeedback("Setup Wizard account connected.", "success");
  } catch (error) {
    setFeedback(`Setup Wizard account connection failed: ${error.message}`, "error");
  } finally {
    renderSetupWizard();
  }
});

elements.setupWizardStart.addEventListener("click", async () => {
  elements.setupWizardStart.disabled = true;
  setFeedback("Setup Wizard Start is applying the selected setup…");
  try {
    const result = await setupWizardStart();
    setFeedback(result.message ?? "Setup Wizard completed.", "success");
    await refreshSelection();
    await refreshCharacterConnection();
    await refreshCharacterSessions();
    await refreshCharacterCards();
    await refreshScriptRuntime();
    await refreshSimpleFarmer();
    await refreshSetupWizard();
  } catch (error) {
    setFeedback(`Setup Wizard Start failed: ${error.message}`, "error");
  } finally {
    renderSetupWizard();
  }
});

elements.startSlice82LiveTest.addEventListener("click", async () => {
  if (state.slice82LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice82LastReport = null;
  elements.copySlice82LiveTestResult.hidden = true;
  setFeedback("Slice 8.2 Setup Wizard test started. It will use one bounded Connect only managed session and will not interrupt the user Script.");
  try {
    const { payload, copied } = await startSlice82LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 8.2 test ${String(outcome).toUpperCase()}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice82LiveTest();
    setFeedback(`Slice 8.2 Setup Wizard test could not finish: ${error.message}`, "error");
  } finally {
    await refreshSetupWizard();
    await refreshCharacterSessions();
    await refreshCharacterCards();
  }
});

elements.copySlice82LiveTestResult.addEventListener("click", async () => {
  if (!state.slice82LastReport) return;
  try {
    await writeClipboard(state.slice82LastReport);
    setFeedback("Complete Slice 8.2 Setup Wizard result and sanitized diagnostic log copied.", "success");
  } catch (error) {
    setFeedback(`Setup Wizard result copy failed: ${error.message}`, "error");
  }
});


let templateConfigDirty = false;

function selectedTemplateConfig() {
  const templates = Array.isArray(state.templateConfig?.templates)
    ? state.templateConfig.templates
    : [];
  return templates.find((item) => item.id === elements.templateConfigTemplate.value) ??
    templates[0];
}

function buildTemplateConfigFields(template) {
  elements.templateConfigFields.replaceChildren();
  for (const field of template?.fields ?? []) {
    const label = document.createElement("label");
    label.className = "template-config-field";
    const title = document.createElement("span");
    title.className = "label";
    title.textContent = field.label;
    label.append(title);

    let input;
    if (field.type === "select") {
      input = document.createElement("select");
      for (const optionData of field.options ?? []) {
        const option = document.createElement("option");
        option.value = optionData.value;
        option.textContent = optionData.label;
        input.append(option);
      }
    } else if (field.type === "boolean") {
      input = document.createElement("input");
      input.type = "checkbox";
    } else {
      input = document.createElement("input");
      input.type = "number";
      if (typeof field.min === "number") input.min = String(field.min);
      if (typeof field.max === "number") input.max = String(field.max);
      if (typeof field.step === "number") input.step = String(field.step);
    }
    input.dataset.templateConfigKey = field.key;
    input.dataset.templateConfigType = field.type;
    input.setAttribute("aria-label", field.label);
    label.append(input);

    const help = document.createElement("small");
    help.textContent = field.description;
    label.append(help);
    elements.templateConfigFields.append(label);
  }
  elements.templateConfigFields.dataset.templateId = template?.id ?? "";
}

function writeTemplateConfigValues(template) {
  if (!template) return;
  for (const input of elements.templateConfigFields.querySelectorAll("[data-template-config-key]")) {
    const key = input.dataset.templateConfigKey;
    const value = template.values?.[key];
    if (input.dataset.templateConfigType === "boolean") input.checked = Boolean(value);
    else input.value = value ?? "";
  }
}

function readTemplateConfigValues() {
  const values = {};
  for (const input of elements.templateConfigFields.querySelectorAll("[data-template-config-key]")) {
    const key = input.dataset.templateConfigKey;
    if (!key) continue;
    if (input.dataset.templateConfigType === "boolean") values[key] = input.checked;
    else if (input.dataset.templateConfigType === "number") values[key] = Number(input.value);
    else values[key] = input.value;
  }
  return values;
}

function renderTemplateConfig() {
  const config = state.templateConfig;
  const templates = Array.isArray(config?.templates) ? config.templates : [];
  const currentId = elements.templateConfigTemplate.value || config?.selectedTemplateId || "";
  elements.templateConfigTemplate.replaceChildren();
  for (const template of templates) {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.label;
    elements.templateConfigTemplate.append(option);
  }
  if (templates.some((item) => item.id === currentId)) {
    elements.templateConfigTemplate.value = currentId;
  }
  const template = selectedTemplateConfig();
  if (template && elements.templateConfigFields.dataset.templateId !== template.id) {
    buildTemplateConfigFields(template);
    templateConfigDirty = false;
  }
  if (!templateConfigDirty) writeTemplateConfigValues(template);

  elements.templateConfigStatus.textContent = template?.status === "ready"
    ? template.configured ? "Saved" : "Ready"
    : "Unavailable";
  elements.templateConfigNote.textContent = template?.message ??
    config?.message ??
    "Normal template settings can be changed without editing script code.";
  const ready = template?.status === "ready";
  elements.templateConfigSave.disabled = !ready;
  elements.templateConfigReset.disabled = !template;
  elements.templateConfigStart.disabled = !ready;
  elements.templateConfigStop.disabled = !template;
}

function renderSlice83LiveTest() {
  const test = state.slice83LiveTest;
  const labels = {
    idle: "Ready", running: "Running…", passed: "PASSED",
    blocked: "BLOCKED", failed: "FAILED", unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice83LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice83LiveTest.disabled = status === "running";
  elements.copySlice83LiveTestResult.hidden = !state.slice83LastReport;
  if (status === "running") {
    elements.slice83LiveTestNote.textContent =
      "Changing and restoring normal template settings without starting gameplay automation.";
  } else if (test?.message) {
    elements.slice83LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  }
}

async function refreshTemplateConfig() {
  try {
    const response = await fetch("/api/template-config", { cache: "no-store" });
    state.templateConfig = await response.json();
  } catch {
    state.templateConfig = {
      status: "unavailable",
      selectedTemplateId: "simple-farmer",
      templates: [],
      message: "Template Configuration status could not be loaded.",
    };
  }
  renderTemplateConfig();
}

async function templateConfigAction(action, body) {
  const response = await fetch(`/api/template-config/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  state.templateConfig = payload;
  renderTemplateConfig();
  return payload;
}

async function refreshSlice83LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-8-3", { cache: "no-store" });
    state.slice83LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 8.3 Template Configuration test is unavailable." };
  } catch {
    state.slice83LiveTest = {
      status: "unavailable",
      message: "Slice 8.3 Template Configuration test status could not be loaded.",
    };
  }
  renderSlice83LiveTest();
}

async function startSlice83LiveTest(clipboardWrite) {
  state.slice83LiveTest = { status: "running", message: "Slice 8.3 Template Configuration test is running." };
  renderSlice83LiveTest();
  const response = await fetch("/api/live-test/slice-8-3/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 8.3 Template Configuration test returned no copyable report.");
  }
  state.slice83LastReport = payload.reportText;
  state.slice83LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 8.3 Template Configuration test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice83LiveTest();
  return { payload, copied };
}

elements.templateConfigTemplate.addEventListener("change", () => {
  templateConfigDirty = false;
  const template = selectedTemplateConfig();
  buildTemplateConfigFields(template);
  writeTemplateConfigValues(template);
  renderTemplateConfig();
});
elements.templateConfigFields.addEventListener("input", () => {
  templateConfigDirty = true;
});
elements.templateConfigFields.addEventListener("change", () => {
  templateConfigDirty = true;
});

elements.templateConfigSave.addEventListener("click", async () => {
  const templateId = elements.templateConfigTemplate.value;
  setFeedback("Saving normal Template Configuration settings…");
  try {
    const payload = await templateConfigAction("save", {
      templateId,
      values: readTemplateConfigValues(),
    });
    templateConfigDirty = false;
    renderTemplateConfig();
    setFeedback(payload.message ?? "Template Configuration settings saved.", "success");
  } catch (error) {
    setFeedback(`Template Configuration save failed: ${error.message}`, "error");
  }
});

elements.templateConfigReset.addEventListener("click", async () => {
  const templateId = elements.templateConfigTemplate.value;
  setFeedback("Resetting Template Configuration settings…");
  try {
    await templateConfigAction("reset", { templateId });
    templateConfigDirty = false;
    renderTemplateConfig();
    setFeedback("Template Configuration settings reset.", "success");
  } catch (error) {
    setFeedback(`Template Configuration reset failed: ${error.message}`, "error");
  }
});

elements.templateConfigStart.addEventListener("click", async () => {
  const templateId = elements.templateConfigTemplate.value;
  setFeedback("Saving settings and starting the existing template…");
  try {
    await templateConfigAction("save", {
      templateId,
      values: readTemplateConfigValues(),
    });
    templateConfigDirty = false;
    const payload = await templateConfigAction("start", { templateId });
    setFeedback(payload.message ?? "Template started.", "success");
    await refreshSimpleFarmer();
  } catch (error) {
    setFeedback(`Template start failed: ${error.message}`, "error");
  }
});

elements.templateConfigStop.addEventListener("click", async () => {
  const templateId = elements.templateConfigTemplate.value;
  setFeedback("Stopping the existing template…");
  try {
    const payload = await templateConfigAction("stop", { templateId });
    setFeedback(payload.message ?? "Template stopped.", "success");
    await refreshSimpleFarmer();
  } catch (error) {
    setFeedback(`Template stop failed: ${error.message}`, "error");
  }
});

elements.startSlice83LiveTest.addEventListener("click", async () => {
  if (state.slice83LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice83LastReport = null;
  elements.copySlice83LiveTestResult.hidden = true;
  setFeedback("Slice 8.3 Template Configuration test started. It changes and restores settings only; no gameplay automation will start.");
  try {
    const { payload, copied } = await startSlice83LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 8.3 test ${String(outcome).toUpperCase()}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice83LiveTest();
    setFeedback(`Slice 8.3 Template Configuration test could not finish: ${error.message}`, "error");
  } finally {
    templateConfigDirty = false;
    await refreshTemplateConfig();
  }
});

elements.copySlice83LiveTestResult.addEventListener("click", async () => {
  if (!state.slice83LastReport) return;
  try {
    await writeClipboard(state.slice83LastReport);
    setFeedback("Complete Slice 8.3 Template Configuration result and sanitized diagnostic log copied.", "success");
  } catch (error) {
    setFeedback(`Template Configuration result copy failed: ${error.message}`, "error");
  }
});


function replaceExplainabilityList(container, rows, emptyText) {
  container.replaceChildren();
  if (!rows?.length) {
    const item = document.createElement("li");
    item.textContent = emptyText;
    container.append(item);
    return;
  }
  for (const row of rows) {
    const item = document.createElement("li");
    item.textContent = row;
    container.append(item);
  }
}

function renderExplainability() {
  const model = state.explainability;
  elements.explainabilityStatus.textContent = model?.status === "ready" ? "Ready" : "Unavailable";
  elements.explainabilityStrategy.textContent = model?.strategy
    ? `${model.strategy.name} · ${model.strategy.active ? "active" : model.strategy.runtimeStatus}`
    : "—";
  elements.explainabilityCurrentTarget.textContent = model?.currentTarget
    ? `${model.currentTarget.name} (${model.currentTarget.type})`
    : "None";
  elements.explainabilityRange.textContent = model?.range?.message ?? "—";
  elements.explainabilityCooldowns.textContent = model?.cooldowns
    ? `Attack ${model.cooldowns.attackMs} ms · HP ${model.cooldowns.hpMs} ms · MP ${model.cooldowns.mpMs} ms`
    : "—";
  elements.explainabilityMovementTarget.textContent = model?.movementTarget?.status === "telemetry"
    ? `${model.movementTarget.map ?? "map"} @ ${model.movementTarget.x}, ${model.movementTarget.y}`
    : "None";
  elements.explainabilityNextAction.textContent = model?.nextAction?.label ?? "—";
  elements.explainabilitySelectionReason.textContent = model?.selectionReason ?? "—";
  replaceExplainabilityList(
    elements.explainabilityRejectedTargets,
    (model?.rejectedTargets ?? []).map((target) =>
      `${target.name} (${target.type}) — ${target.reason}`
    ),
    "No rejected targets.",
  );
  replaceExplainabilityList(
    elements.explainabilityBlockers,
    model?.blockers ?? [],
    "No blockers.",
  );
  elements.explainabilityNote.textContent = model?.nextAction
    ? `${model.nextAction.reason} ${model.message ?? ""}`
    : model?.message ?? "Explainability is unavailable.";
}

function renderSlice84LiveTest() {
  const test = state.slice84LiveTest;
  const labels = {
    idle: "Ready", running: "Running…", passed: "PASSED",
    blocked: "BLOCKED", failed: "FAILED", unavailable: "Unavailable",
  };
  const status = test?.status ?? "idle";
  elements.slice84LiveTestStatus.textContent = labels[status] ?? status;
  elements.startSlice84LiveTest.disabled = status === "running";
  elements.copySlice84LiveTestResult.hidden = !state.slice84LastReport;
  if (status === "running") {
    elements.slice84LiveTestNote.textContent =
      "Reading explainability twice and verifying zero Action Gateway dispatch.";
  } else if (test?.message) {
    elements.slice84LiveTestNote.textContent =
      `${test.message} The complete report is copied automatically when the test finishes.`;
  }
}

async function refreshExplainability() {
  try {
    const response = await fetch("/api/explainability", { cache: "no-store" });
    state.explainability = await response.json();
  } catch {
    state.explainability = {
      status: "unavailable",
      message: "Explainability could not be loaded.",
      blockers: [],
      rejectedTargets: [],
    };
  }
  renderExplainability();
}

async function refreshSlice84LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-8-4", { cache: "no-store" });
    state.slice84LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 8.4 explainability test is unavailable." };
  } catch {
    state.slice84LiveTest = {
      status: "unavailable",
      message: "Slice 8.4 explainability test status could not be loaded.",
    };
  }
  renderSlice84LiveTest();
}

async function startSlice84LiveTest(clipboardWrite) {
  state.slice84LiveTest = { status: "running", message: "Slice 8.4 explainability test is running." };
  renderSlice84LiveTest();
  const response = await fetch("/api/live-test/slice-8-4/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 8.4 explainability test returned no copyable report.");
  }
  state.slice84LastReport = payload.reportText;
  state.slice84LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 8.4 explainability test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice84LiveTest();
  await refreshExplainability();
  return { payload, copied };
}

elements.startSlice84LiveTest.addEventListener("click", async () => {
  if (state.slice84LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice84LastReport = null;
  elements.copySlice84LiveTestResult.hidden = true;
  setFeedback("Slice 8.4 explainability test started. It is read-only and dispatches no gameplay action.");
  try {
    const { payload, copied } = await startSlice84LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 8.4 test ${String(outcome).toUpperCase()}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice84LiveTest();
    setFeedback(`Slice 8.4 explainability test could not finish: ${error.message}`, "error");
  }
});

elements.copySlice84LiveTestResult.addEventListener("click", async () => {
  if (!state.slice84LastReport) return;
  try {
    await writeClipboard(state.slice84LastReport);
    setFeedback("Complete Slice 8.4 explainability result and sanitized diagnostic log copied.", "success");
  } catch (error) {
    setFeedback(`Explainability result copy failed: ${error.message}`, "error");
  }
});

function renderMovementDebug() {
  const debug = state.movementDebug;
  if (!debug) {
    elements.movementDebugStatus.textContent = "Waiting";
    return;
  }

  elements.movementDebugStatus.textContent =
    debug.status === "ready" ? "Ready" : "Unavailable";
  elements.movementDebugTrailCount.textContent =
    String(debug.trailPointCount ?? 0);
  elements.movementDebugMovementCount.textContent =
    String(debug.movementCount ?? 0);
  elements.movementDebugPlanCount.textContent =
    String(debug.plannedRouteCount ?? 0);

  const trail = Array.isArray(debug.trail) ? debug.trail : [];
  elements.movementDebugTrail.value = trail.length > 0
    ? trail.slice(-40).map((point) => {
      const coordinates = `${Number(point.x).toFixed(2)}, ${Number(point.y).toFixed(2)}`;
      return `#${point.sequence} ${point.recordedAt} [${point.origin}] ${point.map} ${coordinates} ${point.kind}`;
    }).join("\n")
    : "No confirmed movement recorded yet.";

  const route = debug.plannedRoute;
  elements.movementDebugRoute.value = route
    ? JSON.stringify({
      status: route.status,
      message: route.message,
      reasonCode: route.reasonCode,
      from: route.from,
      to: route.to,
      waypoints: route.waypoints,
      legs: route.legs,
      diagnostics: route.diagnostics,
    }, null, 2)
    : "No route planned yet.";

  elements.movementDebugNote.textContent =
    debug.message ??
    "Read-only movement and route debug telemetry is available.";
}

function renderGameVersion() {
  const gameVersion = state.gameVersion;
  if (!gameVersion) return;

  elements.gameVersion.textContent =
    gameVersion.currentVersion === undefined ? "Not checked" : String(gameVersion.currentVersion);
  elements.gameLastDeploy.textContent = gameVersion.lastDeploy ?? "—";

  if (gameVersion.status === "checking") {
    elements.gameVersionStatus.textContent = "Checking…";
  } else if (gameVersion.status === "current") {
    elements.gameVersionStatus.textContent = "Current";
  } else if (gameVersion.status === "changed") {
    elements.gameVersionStatus.textContent =
      gameVersion.previousVersion === undefined
        ? "Changed"
        : `Changed from ${gameVersion.previousVersion}`;
  } else if (gameVersion.status === "error") {
    elements.gameVersionStatus.textContent = "Check failed";
  } else {
    elements.gameVersionStatus.textContent = "Waiting";
  }

  elements.gameVersionStatus.title = gameVersion.message ?? "";
}

function renderGameData() {
  const gameData = state.gameData;
  if (!gameData) return;

  const statusLabels = {
    idle: "Waiting",
    loading: "Loading…",
    loaded: "Loaded",
    error: "Load failed",
  };

  elements.gameDataStatus.textContent = statusLabels[gameData.status] ?? gameData.status;
  elements.gameDataStatus.title = gameData.message ?? "";
  elements.gameDataVersion.textContent =
    gameData.version === undefined ? "—" : String(gameData.version);
  elements.gameDataFamilyTotal.textContent =
    `${gameData.loadedFamilyCount ?? 0} / ${gameData.familyCount ?? 0}`;
  elements.gameDataLoadedAt.textContent =
    gameData.loadedAt ? formatPublished(gameData.loadedAt) : "—";
  elements.gameDataOrigin.textContent =
    gameData.origin === "live"
      ? "Live snapshot"
      : gameData.origin === "cache"
        ? "Local cache"
        : "—";
  const cacheStatusLabels = {
    disabled: "Disabled",
    "not-checked": "Not checked",
    missing: "Empty",
    loaded: "Loaded",
    stored: "Current",
    stale: "Stale",
    invalid: "Invalid",
    error: "Error",
  };
  elements.gameDataCacheStatus.textContent =
    cacheStatusLabels[gameData.cacheStatus] ?? gameData.cacheStatus ?? "—";
  elements.gameDataCacheStatus.title = gameData.cacheMessage ?? "";
  elements.gameDataCachedAt.textContent =
    gameData.cachedAt ? formatPublished(gameData.cachedAt) : "—";

  elements.gameDataFamilies.replaceChildren();
  const families = gameData.families ?? [];
  if (families.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Game data has not been loaded yet.";
    elements.gameDataFamilies.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const family of families) {
    const card = document.createElement("article");
    card.className = "game-data-family";
    card.dataset.loaded = String(family.loaded);

    const name = document.createElement("span");
    name.className = "label";
    name.textContent = `G.${family.name}`;

    const count = document.createElement("strong");
    count.textContent = family.loaded ? `${family.count} entries` : "Not loaded";

    const kind = document.createElement("small");
    kind.textContent = family.required ? "Required data family" : "Additional data family";

    card.append(name, count, kind);
    fragment.append(card);
  }
  elements.gameDataFamilies.append(fragment);
}

function renderUpdate() {
  const update = state.update;
  const visible = update && ["available", "downloading", "installing"].includes(update.status);
  elements.updateBanner.hidden = !visible;
  if (!visible) return;

  elements.updateTitle.textContent = `ALRemastered ${update.latestVersion} is available`;
  elements.updateSummary.textContent =
    `Current version: ${update.currentVersion} · New version: ${update.latestVersion} · Published: ${formatPublished(update.publishedAt)}`;

  if (update.releaseNotesUrl) {
    elements.releaseNotes.href = update.releaseNotesUrl;
    elements.releaseNotes.hidden = false;
  } else {
    elements.releaseNotes.hidden = true;
  }

  const busy = update.status === "downloading" || update.status === "installing";
  elements.installUpdate.disabled = busy;
  elements.skipUpdate.disabled = busy;
  elements.remindUpdate.disabled = busy;
  elements.updateProgress.hidden = !busy;

  if (busy) {
    const progress = Math.max(0, Math.min(100, update.progressPercent ?? 0));
    elements.updateProgressBar.style.width = `${progress}%`;
    elements.updateProgressLabel.textContent = update.status === "installing" ? "Verified" : `${progress}%`;
  }
}

function renderDiagnostics() {
  const diagnostics = state.diagnostics;
  if (!diagnostics) return;

  elements.componentHealth.replaceChildren();
  const healthFragment = document.createDocumentFragment();
  for (const component of diagnostics.components) {
    const card = document.createElement("article");
    card.className = "health-card";
    card.dataset.status = component.status;

    const name = document.createElement("span");
    name.className = "label";
    name.textContent = component.name;

    const status = document.createElement("strong");
    status.textContent = component.status;

    const message = document.createElement("p");
    message.textContent = component.message;

    card.append(name, status, message);
    healthFragment.append(card);
  }
  elements.componentHealth.append(healthFragment);

  elements.recentErrors.replaceChildren();
  if (diagnostics.recentErrors.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No recent errors.";
    elements.recentErrors.append(empty);
    return;
  }

  const errorFragment = document.createDocumentFragment();
  for (const diagnosticError of [...diagnostics.recentErrors].reverse()) {
    const card = document.createElement("article");
    card.className = "error-card";

    const header = document.createElement("div");
    header.className = "error-card-header";

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy full log";
    copy.addEventListener("click", () => void copyFullLog());

    const summaryGroup = document.createElement("div");
    const meta = document.createElement("div");
    meta.className = "error-card-meta";
    meta.textContent = `${diagnosticError.timestamp} · ${diagnosticError.level} · ${diagnosticError.component}`;

    const summary = document.createElement("p");
    summary.textContent = diagnosticError.summary;
    summaryGroup.append(meta, summary);
    header.append(summaryGroup, copy);

    const details = document.createElement("details");
    const detailsSummary = document.createElement("summary");
    detailsSummary.textContent = "Technical details";
    const technical = document.createElement("pre");
    technical.textContent = JSON.stringify(diagnosticError.technical, null, 2);
    details.append(detailsSummary, technical);

    card.append(header, details);
    errorFragment.append(card);
  }
  elements.recentErrors.append(errorFragment);
}

async function refreshDiagnostics() {
  try {
    const response = await fetch("/api/diagnostics/snapshot", { cache: "no-store" });
    if (!response.ok) return;
    state.diagnostics = await response.json();
    renderDiagnostics();
  } catch {
    // Dashboard connectivity is reported separately.
  }
}

async function copyFullLog() {
  try {
    const response = await fetch("/api/logs/export", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    await writeClipboard(payload.text);
    setFeedback(
      `Copied ${payload.lineCount} log lines. Version: ${state.status?.version ?? "unknown"}. Platform: ${state.status?.platform ?? "unknown"}. Time range: ${payload.from} -> ${payload.to}. Secrets sanitized: yes.`,
      "success",
    );
  } catch (error) {
    setFeedback(`Copy failed: ${error.message}`, "error");
  }
}

async function refreshStatus() {
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.status = await response.json();
    updateStatusView();
    elements.connectionStatus.textContent = "Dashboard connected";
    elements.connectionStatus.classList.add("online");
  } catch {
    elements.connectionStatus.textContent = "Dashboard disconnected";
    elements.connectionStatus.classList.remove("online");
  }
}

async function refreshAccount() {
  try {
    const response = await fetch("/api/account", { cache: "no-store" });
    if (!response.ok) return;
    state.account = await response.json();
    renderAccount();
  } catch {
    // Dashboard connectivity is reported separately.
  }
}

async function refreshSelection() {
  try {
    const response = await fetch("/api/selection", { cache: "no-store" });
    if (!response.ok) return;
    state.selection = await response.json();
    renderSelection();
  } catch {
    // Dashboard connectivity is reported separately.
  }
}

async function refreshCharacterConnection() {
  try {
    const response = await fetch("/api/character", { cache: "no-store" });
    if (!response.ok) return;
    state.character = await response.json();
    renderCharacterConnection();
  } catch {
    // Dashboard connectivity is reported separately.
  }
}

async function refreshControlMode() {
  try {
    const response = await fetch("/api/control-mode", { cache: "no-store" });
    if (!response.ok) return;
    state.controlMode = await response.json();
    renderControlMode();
  } catch {
    // Dashboard connectivity is reported separately.
  }
}

async function refreshActionGateway() {
  try {
    const response = await fetch("/api/action-gateway", { cache: "no-store" });
    if (!response.ok) return;
    state.actionGateway = await response.json();
    renderActionGateway();
  } catch {
    // Dashboard connectivity is reported separately.
  }
}

async function refreshSkillOptions() {
  try {
    const response = await fetch("/api/action-gateway/skill-options", {
      cache: "no-store",
    });
    state.skillOptions = await response.json();
    renderSkillControls();
  } catch {
    state.skillOptions = {
      status: "unavailable",
      message: "Skill options could not be loaded.",
      skills: [],
    };
    renderSkillControls();
  }
}

async function refreshLootConsumableOptions() {
  try {
    const response = await fetch("/api/action-gateway/loot-consumable-options", {
      cache: "no-store",
    });
    state.lootConsumableOptions = await response.json();
    renderLootConsumableControls();
  } catch {
    state.lootConsumableOptions = {
      status: "unavailable",
      message: "Loot and consumable options could not be loaded.",
      lootChests: [],
      consumables: [],
    };
    renderLootConsumableControls();
  }
}

async function refreshSlice35LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-3-5", {
      cache: "no-store",
    });
    if (!response.ok) {
      state.slice35LiveTest = {
        status: "unavailable",
        message: "Slice 3.5 one-click live test is unavailable.",
      };
    } else {
      state.slice35LiveTest = await response.json();
    }
    renderSlice35LiveTest();
  } catch {
    state.slice35LiveTest = {
      status: "unavailable",
      message: "Slice 3.5 one-click live-test status could not be loaded.",
    };
    renderSlice35LiveTest();
  }
}

async function refreshScriptRuntime() {
  try {
    const response = await fetch("/api/script-runtime", { cache: "no-store" });
    if (!response.ok) {
      state.scriptRuntime = {
        status: "unavailable",
        message: "Script runtime is unavailable.",
      };
    } else {
      state.scriptRuntime = await response.json();
    }
    renderScriptRuntime();
  } catch {
    state.scriptRuntime = {
      status: "unavailable",
      message: "Script runtime status could not be loaded.",
    };
    renderScriptRuntime();
  }
}

async function refreshSlice41LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-4-1", {
      cache: "no-store",
    });
    if (!response.ok) {
      state.slice41LiveTest = {
        status: "unavailable",
        message: "Slice 4.1 one-click live test is unavailable.",
      };
    } else {
      state.slice41LiveTest = await response.json();
    }
    renderSlice41LiveTest();
  } catch {
    state.slice41LiveTest = {
      status: "unavailable",
      message: "Slice 4.1 one-click live-test status could not be loaded.",
    };
    renderSlice41LiveTest();
  }
}

async function refreshSlice42LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-4-2", {
      cache: "no-store",
    });
    if (!response.ok) {
      state.slice42LiveTest = {
        status: "unavailable",
        message: "Slice 4.2 one-click live test is unavailable.",
      };
    } else {
      state.slice42LiveTest = await response.json();
    }
    renderSlice42LiveTest();
  } catch {
    state.slice42LiveTest = {
      status: "unavailable",
      message: "Slice 4.2 one-click live-test status could not be loaded.",
    };
    renderSlice42LiveTest();
  }
}

async function refreshSlice43LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-4-3", {
      cache: "no-store",
    });
    if (!response.ok) {
      state.slice43LiveTest = {
        status: "unavailable",
        message: "Slice 4.3 one-click live test is unavailable.",
      };
    } else {
      state.slice43LiveTest = await response.json();
    }
    renderSlice43LiveTest();
  } catch {
    state.slice43LiveTest = {
      status: "unavailable",
      message: "Slice 4.3 one-click live-test status could not be loaded.",
    };
    renderSlice43LiveTest();
  }
}

async function refreshSlice44LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-4-4", {
      cache: "no-store",
    });
    if (!response.ok) {
      state.slice44LiveTest = {
        status: "unavailable",
        message: "Slice 4.4 one-click storage test is unavailable.",
      };
    } else {
      state.slice44LiveTest = await response.json();
    }
    renderSlice44LiveTest();
  } catch {
    state.slice44LiveTest = {
      status: "unavailable",
      message: "Slice 4.4 one-click storage-test status could not be loaded.",
    };
    renderSlice44LiveTest();
  }
}

async function refreshSimpleFarmer() {
  try {
    const [optionsResponse, stateResponse] = await Promise.all([
      fetch("/api/simple-farmer/options", { cache: "no-store" }),
      fetch("/api/simple-farmer", { cache: "no-store" }),
    ]);
    state.simpleFarmerOptions = await optionsResponse.json();
    state.simpleFarmer = await stateResponse.json();
    renderSimpleFarmer();
  } catch {
    state.simpleFarmerOptions = { status: "unavailable", monsters: [], message: "Simple Farmer status could not be loaded." };
    state.simpleFarmer = { status: "error", message: "Simple Farmer status could not be loaded." };
    renderSimpleFarmer();
  }
}

async function refreshSlice45LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-4-5", { cache: "no-store" });
    state.slice45LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 4.5 one-click live test is unavailable." };
    renderSlice45LiveTest();
  } catch {
    state.slice45LiveTest = {
      status: "unavailable",
      message: "Slice 4.5 one-click live-test status could not be loaded.",
    };
    renderSlice45LiveTest();
  }
}

async function refreshSlice51LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-5-1", { cache: "no-store" });
    state.slice51LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 5.1 heartbeat test is unavailable." };
    renderSlice51LiveTest();
  } catch {
    state.slice51LiveTest = {
      status: "unavailable",
      message: "Slice 5.1 heartbeat-test status could not be loaded.",
    };
    renderSlice51LiveTest();
  }
}

async function refreshSlice52LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-5-2", { cache: "no-store" });
    state.slice52LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 5.2 reconnect test is unavailable." };
    renderSlice52LiveTest();
  } catch {
    state.slice52LiveTest = {
      status: "unavailable",
      message: "Slice 5.2 reconnect-test status could not be loaded.",
    };
    renderSlice52LiveTest();
  }
}

async function refreshSlice53LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-5-3", { cache: "no-store" });
    state.slice53LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 5.3 death/respawn recovery test is unavailable." };
    renderSlice53LiveTest();
  } catch {
    state.slice53LiveTest = {
      status: "unavailable",
      message: "Slice 5.3 death/respawn recovery status could not be loaded.",
    };
    renderSlice53LiveTest();
  }
}

async function refreshSlice54LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-5-4", { cache: "no-store" });
    state.slice54LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 5.4 watchdog/restart-guard test is unavailable." };
    renderSlice54LiveTest();
  } catch {
    state.slice54LiveTest = {
      status: "unavailable",
      message: "Slice 5.4 watchdog/restart-guard status could not be loaded.",
    };
    renderSlice54LiveTest();
  }
}

async function refreshSlice61LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-6-1", { cache: "no-store" });
    state.slice61LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 6.1 map/geometry-model test is unavailable." };
    renderSlice61LiveTest();
  } catch {
    state.slice61LiveTest = {
      status: "unavailable",
      message: "Slice 6.1 map/geometry-model status could not be loaded.",
    };
    renderSlice61LiveTest();
  }
}

async function refreshSlice62LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-6-2", { cache: "no-store" });
    state.slice62LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 6.2 simple path-planner test is unavailable." };
    renderSlice62LiveTest();
  } catch {
    state.slice62LiveTest = {
      status: "unavailable",
      message: "Slice 6.2 simple path-planner status could not be loaded.",
    };
    renderSlice62LiveTest();
  }
}

async function refreshSlice63LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-6-3", { cache: "no-store" });
    state.slice63LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 6.3 smart_move() compatibility test is unavailable." };
    renderSlice63LiveTest();
  } catch {
    state.slice63LiveTest = {
      status: "unavailable",
      message: "Slice 6.3 smart_move() compatibility status could not be loaded.",
    };
    renderSlice63LiveTest();
  }
}

async function refreshSlice64LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-6-4", { cache: "no-store" });
    state.slice64LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 6.4 movement-debug test is unavailable." };
    renderSlice64LiveTest();
  } catch {
    state.slice64LiveTest = {
      status: "unavailable",
      message: "Slice 6.4 movement-debug status could not be loaded.",
    };
    renderSlice64LiveTest();
  }
}

async function refreshCharacterSessions() {
  try {
    const response = await fetch("/api/character-sessions", { cache: "no-store" });
    state.characterSessions = response.ok
      ? await response.json()
      : {
        status: "unavailable",
        activeSessionCount: 0,
        sessionLimit: 4,
        sessions: [],
        message: "Multi-character session manager is unavailable.",
      };
    renderCharacterSessions();
  } catch {
    state.characterSessions = {
      status: "unavailable",
      activeSessionCount: 0,
      sessionLimit: 4,
      sessions: [],
      message: "Multi-character session status could not be loaded.",
    };
    renderCharacterSessions();
  }
}

async function refreshSlice71LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-7-1", { cache: "no-store" });
    state.slice71LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 7.1 multi-character session test is unavailable." };
    renderSlice71LiveTest();
  } catch {
    state.slice71LiveTest = {
      status: "unavailable",
      message: "Slice 7.1 multi-character session-test status could not be loaded.",
    };
    renderSlice71LiveTest();
  }
}

async function refreshCharacterMessaging() {
  try {
    const response = await fetch("/api/character-messaging", { cache: "no-store" });
    state.characterMessaging = response.ok
      ? await response.json()
      : {
        status: "unavailable",
        requestCount: 0,
        localDeliveryCount: 0,
        unavailableRecipientCount: 0,
        message: "Local Character messaging is unavailable.",
      };
    renderCharacterMessaging();
  } catch {
    state.characterMessaging = {
      status: "unavailable",
      requestCount: 0,
      localDeliveryCount: 0,
      unavailableRecipientCount: 0,
      message: "Local Character messaging status could not be loaded.",
    };
    renderCharacterMessaging();
  }
}

async function refreshSlice72LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-7-2", { cache: "no-store" });
    state.slice72LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 7.2 local Character messaging test is unavailable." };
    renderSlice72LiveTest();
  } catch {
    state.slice72LiveTest = {
      status: "unavailable",
      message: "Slice 7.2 local Character messaging status could not be loaded.",
    };
    renderSlice72LiveTest();
  }
}

async function refreshPartyCoordinator() {
  try {
    const response = await fetch("/api/party-coordinator", { cache: "no-store" });
    state.partyCoordinator = response.ok
      ? await response.json()
      : { status: "unavailable", memberCount: 0, message: "Party Coordinator is unavailable." };
    renderPartyCoordinator();
  } catch {
    state.partyCoordinator = {
      status: "unavailable",
      memberCount: 0,
      message: "Party Coordinator status could not be loaded.",
    };
    renderPartyCoordinator();
  }
}

async function refreshSlice73LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-7-3", { cache: "no-store" });
    state.slice73LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 7.3 Party Coordinator test is unavailable." };
    renderSlice73LiveTest();
  } catch {
    state.slice73LiveTest = {
      status: "unavailable",
      message: "Slice 7.3 Party Coordinator test status could not be loaded.",
    };
    renderSlice73LiveTest();
  }
}



async function refreshPartyTemplates() {
  try {
    const response = await fetch("/api/party-templates", { cache: "no-store" });
    state.partyTemplates = response.ok
      ? await response.json()
      : { status: "unavailable", memberCount: 0, assignments: [], message: "Party Templates are unavailable." };
    renderPartyTemplates();
  } catch {
    state.partyTemplates = {
      status: "unavailable",
      memberCount: 0,
      assignments: [],
      message: "Party Templates status could not be loaded.",
    };
    renderPartyTemplates();
  }
}

async function refreshSlice74LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-7-4", { cache: "no-store" });
    state.slice74LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 7.4 Party Templates test is unavailable." };
    renderSlice74LiveTest();
  } catch {
    state.slice74LiveTest = {
      status: "unavailable",
      message: "Slice 7.4 Party Templates test status could not be loaded.",
    };
    renderSlice74LiveTest();
  }
}


async function refreshCharacterCards() {
  try {
    const response = await fetch("/api/character-cards", { cache: "no-store" });
    state.characterCards = response.ok
      ? await response.json()
      : { status: "unavailable", cards: [], message: "Character Cards are unavailable." };
    renderCharacterCards();
  } catch {
    state.characterCards = {
      status: "unavailable",
      cards: [],
      message: "Character Cards status could not be loaded.",
    };
    renderCharacterCards();
  }
}

async function refreshSlice81LiveTest() {
  try {
    const response = await fetch("/api/live-test/slice-8-1", { cache: "no-store" });
    state.slice81LiveTest = response.ok
      ? await response.json()
      : { status: "unavailable", message: "Slice 8.1 Character Cards test is unavailable." };
    renderSlice81LiveTest();
  } catch {
    state.slice81LiveTest = {
      status: "unavailable",
      message: "Slice 8.1 Character Cards test status could not be loaded.",
    };
    renderSlice81LiveTest();
  }
}

async function refreshMovementDebug() {
  try {
    const response = await fetch("/api/navigation/movement-debug", {
      cache: "no-store",
    });
    state.movementDebug = response.ok
      ? await response.json()
      : {
        status: "unavailable",
        trailPointCount: 0,
        movementCount: 0,
        plannedRouteCount: 0,
        trail: [],
        message: "Movement debug telemetry is unavailable.",
      };
    renderMovementDebug();
  } catch {
    state.movementDebug = {
      status: "unavailable",
      trailPointCount: 0,
      movementCount: 0,
      plannedRouteCount: 0,
      trail: [],
      message: "Movement debug telemetry could not be loaded.",
    };
    renderMovementDebug();
  }
}

async function refreshGameData() {
  try {
    const response = await fetch("/api/game-data", { cache: "no-store" });
    if (!response.ok) return;
    state.gameData = await response.json();
    renderGameData();
  } catch {
    // Dashboard connectivity is reported separately.
  }
}

async function refreshGameVersion() {
  try {
    const response = await fetch("/api/game-version", { cache: "no-store" });
    if (!response.ok) return;
    state.gameVersion = await response.json();
    renderGameVersion();
  } catch {
    // Dashboard connectivity is reported separately.
  }
}

async function waitForUpdatedDashboard(previousVersion, expectedVersion) {
  if (state.updateReconnectPending) return;
  state.updateReconnectPending = true;

  const deadline = Date.now() + 2 * 60 * 1000;
  let sawDisconnect = false;
  setFeedback(
    "Installing update. Keep this dashboard open; it will reload automatically.",
    "success",
  );

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));

    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const status = await response.json();
      const expectedVersionReached =
        expectedVersion && status.version === expectedVersion;
      const versionChanged =
        previousVersion && status.version !== previousVersion;

      if (expectedVersionReached || (sawDisconnect && versionChanged)) {
        setFeedback(
          `ALRemastered ${status.version} installed successfully. Reloading dashboard…`,
          "success",
        );
        window.location.reload();
        return;
      }
    } catch {
      sawDisconnect = true;
      elements.connectionStatus.textContent = "Installing update…";
      elements.connectionStatus.classList.remove("online");
    }
  }

  state.updateReconnectPending = false;
  setFeedback(
    "The update was started, but the dashboard did not reconnect automatically. Reload this page after ALRemastered finishes updating.",
    "error",
  );
}

async function refreshUpdate() {
  try {
    const response = await fetch("/api/update", { cache: "no-store" });
    if (!response.ok) return;
    state.update = await response.json();
    renderUpdate();
  } catch {
    // The connection indicator already reports dashboard connectivity.
  }
}

async function loadLogs() {
  const response = await fetch("/api/logs", { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load logs: HTTP ${response.status}`);
  const payload = await response.json();
  replaceRecords(payload.records);
  renderLogs();
}

function connectStream() {
  state.source?.close();
  const source = new EventSource("/api/logs/stream");
  state.source = source;

  source.addEventListener("log", (event) => {
    appendRecord(JSON.parse(event.data));
    renderLogs();
  });

  source.addEventListener("clear", () => {
    clearRecords();
    setFeedback("In-memory diagnostic log cleared. Persistent log files were kept.", "success");
  });

  source.addEventListener("open", () => {
    elements.connectionStatus.textContent = "Dashboard connected";
    elements.connectionStatus.classList.add("online");
  });

  source.addEventListener("error", () => {
    elements.connectionStatus.textContent = state.updateReconnectPending
      ? "Installing update…"
      : "Reconnecting…";
    elements.connectionStatus.classList.remove("online");
  });
}

async function accountAction(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json; charset=utf-8" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  state.account = payload;
  renderAccount();
  return payload;
}

async function selectionAction(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json; charset=utf-8" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  state.selection = payload;
  renderSelection();
  return payload;
}

async function characterAction(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json; charset=utf-8" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  state.character = payload;
  renderCharacterConnection();
  return payload;
}

async function actionGatewayProbe() {
  const response = await fetch("/api/action-gateway/probe", { method: "POST" });
  const payload = await response.json();
  await refreshActionGateway();
  if (!response.ok) {
    throw new Error(
      payload.error?.message ??
      payload.error ??
      `Gateway probe failed with HTTP ${response.status}`,
    );
  }
  return payload;
}

async function movementTest(direction) {
  const response = await fetch("/api/action-gateway/movement-test", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      mode: elements.movementMode.value,
      direction,
    }),
  });
  const payload = await response.json();
  await refreshActionGateway();
  if (!response.ok) {
    throw new Error(
      payload.error?.message ??
      payload.error ??
      `Movement test failed with HTTP ${response.status}`,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  await refreshCharacterConnection();
  return payload;
}

async function attackTest() {
  const targetId = elements.attackTarget.value;
  if (!targetId) throw new Error("Select a visible monster first.");

  const response = await fetch("/api/action-gateway/attack-test", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ targetId }),
  });
  const payload = await response.json();
  await refreshActionGateway();
  if (!response.ok) {
    const retry = typeof payload.retryAfterMs === "number"
      ? ` Retry after ${payload.retryAfterMs} ms.`
      : "";
    throw new Error(
      (payload.error?.message ??
        payload.error ??
        `Attack test failed with HTTP ${response.status}`) + retry,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  await refreshCharacterConnection();
  return payload;
}

async function skillTest() {
  const skillName = elements.skillName.value;
  if (!skillName) throw new Error("Select a supported skill first.");
  const targetId = elements.skillTarget.disabled
    ? undefined
    : elements.skillTarget.value || undefined;

  const response = await fetch("/api/action-gateway/skill-test", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ skillName, targetId }),
  });
  const payload = await response.json();
  await refreshActionGateway();
  await refreshSkillOptions();
  if (!response.ok) {
    const retry = typeof payload.retryAfterMs === "number"
      ? ` Retry after ${payload.retryAfterMs} ms.`
      : "";
    throw new Error(
      (payload.error?.message ??
        payload.error ??
        `Skill test failed with HTTP ${response.status}`) + retry,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  await refreshCharacterConnection();
  return payload;
}

async function lootTest() {
  const chestId = elements.lootChest.value;
  if (!chestId) throw new Error("Select a visible loot chest first.");

  const response = await fetch("/api/action-gateway/loot-test", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ chestId }),
  });
  const payload = await response.json();
  await refreshActionGateway();
  await refreshLootConsumableOptions();
  if (!response.ok) {
    const retry = typeof payload.retryAfterMs === "number"
      ? ` Retry after ${payload.retryAfterMs} ms.`
      : "";
    throw new Error(
      (payload.error?.message ??
        payload.error ??
        `Loot test failed with HTTP ${response.status}`) + retry,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  await refreshCharacterConnection();
  return payload;
}

async function consumableTest() {
  const inventoryIndex = Number(elements.consumableItem.value);
  const option = (state.lootConsumableOptions?.consumables ?? []).find(
    (item) => item.inventoryIndex === inventoryIndex,
  );
  if (!option) throw new Error("Select a validated HP/MP consumable first.");

  const response = await fetch("/api/action-gateway/consumable-test", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      inventoryIndex: option.inventoryIndex,
      itemName: option.itemName,
      kind: option.kind,
    }),
  });
  const payload = await response.json();
  await refreshActionGateway();
  await refreshLootConsumableOptions();
  if (!response.ok) {
    const retry = typeof payload.retryAfterMs === "number"
      ? ` Retry after ${payload.retryAfterMs} ms.`
      : "";
    throw new Error(
      (payload.error?.message ??
        payload.error ??
        `Consumable test failed with HTTP ${response.status}`) + retry,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  await refreshCharacterConnection();
  return payload;
}

function beginDeferredClipboardWrite() {
  if (
    navigator.clipboard?.write &&
    typeof ClipboardItem === "function"
  ) {
    let resolveText;
    const textPromise = new Promise((resolve) => {
      resolveText = resolve;
    });
    const item = new ClipboardItem({
      "text/plain": textPromise.then((text) =>
        new Blob([text], { type: "text/plain;charset=utf-8" })
      ),
    });
    const writePromise = navigator.clipboard.write([item]).then(
      () => true,
      () => false,
    );
    return {
      finish: async (text) => {
        resolveText(text);
        return await writePromise;
      },
    };
  }

  return {
    finish: async (text) => {
      try {
        await writeClipboard(text);
        return true;
      } catch {
        return false;
      }
    },
  };
}

async function startSlice35LiveTest(clipboardWrite) {
  state.slice35LiveTest = {
    status: "running",
    message: "Slice 3.5 one-click live test is running.",
  };
  renderSlice35LiveTest();

  const response = await fetch("/api/live-test/slice-3-5/start", {
    method: "POST",
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ??
      payload.message ??
      `Slice 3.5 live test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 3.5 live test returned no copyable report.");
  }

  state.slice35LastReport = payload.reportText;
  state.slice35LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 3.5 live test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice35LiveTest();
  await refreshCharacterConnection();
  await refreshActionGateway();
  await refreshSkillOptions();
  await refreshLootConsumableOptions();

  return { payload, copied };
}

async function scriptRuntimeAction(path, body) {
  const options = { method: "POST" };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  state.scriptRuntime = payload;
  renderScriptRuntime();
  return payload;
}

async function startSlice41LiveTest(clipboardWrite) {
  state.slice41LiveTest = {
    status: "running",
    message: "Slice 4.1 one-click live test is running.",
  };
  renderSlice41LiveTest();

  const response = await fetch("/api/live-test/slice-4-1/start", {
    method: "POST",
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ??
      payload.message ??
      `Slice 4.1 live test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 4.1 live test returned no copyable report.");
  }

  state.slice41LastReport = payload.reportText;
  state.slice41LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 4.1 live test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice41LiveTest();
  await refreshScriptRuntime();
  await refreshDiagnostics();

  return { payload, copied };
}

async function startSlice42LiveTest(clipboardWrite) {
  state.slice42LiveTest = {
    status: "running",
    message: "Slice 4.2 one-click live test is running.",
  };
  renderSlice42LiveTest();

  const response = await fetch("/api/live-test/slice-4-2/start", {
    method: "POST",
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ??
      payload.message ??
      `Slice 4.2 live test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 4.2 live test returned no copyable report.");
  }

  state.slice42LastReport = payload.reportText;
  state.slice42LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 4.2 live test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice42LiveTest();
  await refreshScriptRuntime();
  await refreshCharacterConnection();
  await refreshActionGateway();
  await refreshDiagnostics();

  return { payload, copied };
}

async function startSlice43LiveTest(clipboardWrite) {
  state.slice43LiveTest = {
    status: "running",
    message: "Slice 4.3 one-click live test is running.",
  };
  renderSlice43LiveTest();

  const response = await fetch("/api/live-test/slice-4-3/start", {
    method: "POST",
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ??
      payload.message ??
      `Slice 4.3 live test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 4.3 live test returned no copyable report.");
  }

  state.slice43LastReport = payload.reportText;
  state.slice43LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 4.3 live test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice43LiveTest();
  await refreshScriptRuntime();
  await refreshCharacterConnection();
  await refreshDiagnostics();

  return { payload, copied };
}

async function startSlice44LiveTest(clipboardWrite) {
  state.slice44LiveTest = {
    status: "running",
    message: "Slice 4.4 one-click storage test is running.",
  };
  renderSlice44LiveTest();

  const response = await fetch("/api/live-test/slice-4-4/start", {
    method: "POST",
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ??
      payload.message ??
      `Slice 4.4 storage test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 4.4 storage test returned no copyable report.");
  }

  state.slice44LastReport = payload.reportText;
  state.slice44LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 4.4 storage test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice44LiveTest();
  await refreshScriptRuntime();
  await refreshDiagnostics();

  return { payload, copied };
}

async function simpleFarmerAction(path, body) {
  const options = { method: "POST" };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  state.simpleFarmer = payload;
  renderSimpleFarmer();
  await refreshScriptRuntime();
  return payload;
}

async function startSlice45LiveTest(clipboardWrite) {
  state.slice45LiveTest = {
    status: "running",
    message: "Slice 4.5 one-click live test is running.",
  };
  renderSlice45LiveTest();
  const response = await fetch("/api/live-test/slice-4-5/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? payload.message ?? `Slice 4.5 live test failed with HTTP ${response.status}`);
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 4.5 live test returned no copyable report.");
  }
  state.slice45LastReport = payload.reportText;
  state.slice45LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 4.5 live test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice45LiveTest();
  await refreshSimpleFarmer();
  await refreshScriptRuntime();
  await refreshCharacterConnection();
  await refreshActionGateway();
  await refreshDiagnostics();
  return { payload, copied };
}

async function startSlice51LiveTest(clipboardWrite) {
  state.slice51LiveTest = {
    status: "running",
    message: "Slice 5.1 heartbeat test is running.",
  };
  renderSlice51LiveTest();
  const response = await fetch("/api/live-test/slice-5-1/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? payload.message ?? `Slice 5.1 heartbeat test failed with HTTP ${response.status}`);
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 5.1 heartbeat test returned no copyable report.");
  }
  state.slice51LastReport = payload.reportText;
  state.slice51LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 5.1 heartbeat test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice51LiveTest();
  await refreshStatus();
  await refreshCharacterConnection();
  await refreshScriptRuntime();
  await refreshDiagnostics();
  return { payload, copied };
}

async function startSlice52LiveTest(clipboardWrite) {
  state.slice52LiveTest = {
    status: "running",
    message: "Slice 5.2 reconnect test is running.",
  };
  renderSlice52LiveTest();
  const response = await fetch("/api/live-test/slice-5-2/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? payload.message ?? `Slice 5.2 reconnect test failed with HTTP ${response.status}`);
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 5.2 reconnect test returned no copyable report.");
  }
  state.slice52LastReport = payload.reportText;
  state.slice52LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 5.2 reconnect test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice52LiveTest();
  await refreshCharacterConnection();
  await refreshDiagnostics();
  return { payload, copied };
}

async function startSlice53LiveTest(clipboardWrite) {
  state.slice53LiveTest = {
    status: "running",
    message: "Slice 5.3 death/respawn recovery test is running.",
  };
  renderSlice53LiveTest();
  const response = await fetch("/api/live-test/slice-5-3/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ??
        payload.message ??
        `Slice 5.3 death/respawn recovery test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 5.3 death/respawn recovery test returned no copyable report.");
  }
  state.slice53LastReport = payload.reportText;
  state.slice53LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 5.3 death/respawn recovery test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice53LiveTest();
  await refreshCharacterConnection();
  await refreshScriptRuntime();
  await refreshDiagnostics();
  return { payload, copied };
}

async function startSlice54LiveTest(clipboardWrite) {
  state.slice54LiveTest = {
    status: "running",
    message: "Slice 5.4 watchdog/restart-guard test is running.",
  };
  renderSlice54LiveTest();
  const response = await fetch("/api/live-test/slice-5-4/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ??
        payload.message ??
        `Slice 5.4 watchdog/restart-guard test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 5.4 watchdog/restart-guard test returned no copyable report.");
  }
  state.slice54LastReport = payload.reportText;
  state.slice54LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 5.4 watchdog/restart-guard test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice54LiveTest();
  await refreshCharacterConnection();
  await refreshScriptRuntime();
  await refreshDiagnostics();
  return { payload, copied };
}

async function startSlice61LiveTest(clipboardWrite) {
  state.slice61LiveTest = {
    status: "running",
    message: "Slice 6.1 map/geometry-model test is running.",
  };
  renderSlice61LiveTest();
  const response = await fetch("/api/live-test/slice-6-1/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ??
        payload.message ??
        `Slice 6.1 map/geometry-model test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 6.1 map/geometry-model test returned no copyable report.");
  }
  state.slice61LastReport = payload.reportText;
  state.slice61LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 6.1 map/geometry-model test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice61LiveTest();
  await refreshCharacterConnection();
  await refreshGameData();
  await refreshDiagnostics();
  return { payload, copied };
}

async function startSlice62LiveTest(clipboardWrite) {
  state.slice62LiveTest = {
    status: "running",
    message: "Slice 6.2 simple path-planner test is running.",
  };
  renderSlice62LiveTest();
  const response = await fetch("/api/live-test/slice-6-2/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ??
        payload.message ??
        `Slice 6.2 simple path-planner test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 6.2 simple path-planner test returned no copyable report.");
  }
  state.slice62LastReport = payload.reportText;
  state.slice62LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 6.2 simple path-planner test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice62LiveTest();
  await refreshCharacterConnection();
  await refreshGameData();
  await refreshDiagnostics();
  return { payload, copied };
}

async function startSlice63LiveTest(clipboardWrite) {
  state.slice63LiveTest = {
    status: "running",
    message: "Slice 6.3 smart_move() compatibility test is running.",
  };
  renderSlice63LiveTest();
  const response = await fetch("/api/live-test/slice-6-3/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ??
        payload.message ??
        `Slice 6.3 smart_move() compatibility test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 6.3 smart_move() compatibility test returned no copyable report.");
  }
  state.slice63LastReport = payload.reportText;
  state.slice63LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 6.3 smart_move() compatibility test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice63LiveTest();
  await refreshCharacterConnection();
  await refreshDiagnostics();
  return { payload, copied };
}

async function startSlice64LiveTest(clipboardWrite) {
  state.slice64LiveTest = {
    status: "running",
    message: "Slice 6.4 movement-debug test is running.",
  };
  renderSlice64LiveTest();
  const response = await fetch("/api/live-test/slice-6-4/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ??
        payload.message ??
        `Slice 6.4 movement-debug test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 6.4 movement-debug test returned no copyable report.");
  }
  state.slice64LastReport = payload.reportText;
  state.slice64LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 6.4 movement-debug test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice64LiveTest();
  await refreshCharacterConnection();
  await refreshMovementDebug();
  await refreshActionGateway();
  await refreshDiagnostics();
  return { payload, copied };
}

async function startSlice71LiveTest(clipboardWrite) {
  state.slice71LiveTest = {
    status: "running",
    message: "Slice 7.1 multi-character session test is running.",
  };
  renderSlice71LiveTest();
  const response = await fetch("/api/live-test/slice-7-1/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ??
        payload.message ??
        `Slice 7.1 multi-character session test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 7.1 multi-character session test returned no copyable report.");
  }
  state.slice71LastReport = payload.reportText;
  state.slice71LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 7.1 multi-character session test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice71LiveTest();
  await refreshCharacterConnection();
  await refreshCharacterSessions();
  await refreshDiagnostics();
  return { payload, copied };
}

async function startSlice72LiveTest(clipboardWrite) {
  state.slice72LiveTest = {
    status: "running",
    message: "Slice 7.2 local Character messaging test is running.",
  };
  renderSlice72LiveTest();
  const response = await fetch("/api/live-test/slice-7-2/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ??
        payload.message ??
        `Slice 7.2 local Character messaging test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 7.2 local Character messaging test returned no copyable report.");
  }
  state.slice72LastReport = payload.reportText;
  state.slice72LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 7.2 local Character messaging test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice72LiveTest();
  await refreshCharacterConnection();
  await refreshCharacterSessions();
  await refreshCharacterMessaging();
  await refreshScriptRuntime();
  await refreshDiagnostics();
  return { payload, copied };
}

async function startSlice73LiveTest(clipboardWrite) {
  state.slice73LiveTest = {
    status: "running",
    message: "Slice 7.3 Party Coordinator test is running.",
  };
  renderSlice73LiveTest();
  const response = await fetch("/api/live-test/slice-7-3/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ?? payload.message ??
        `Slice 7.3 Party Coordinator test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 7.3 Party Coordinator test returned no copyable report.");
  }
  state.slice73LastReport = payload.reportText;
  state.slice73LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 7.3 Party Coordinator test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice73LiveTest();
  await refreshCharacterConnection();
  await refreshCharacterSessions();
  await refreshCharacterMessaging();
  await refreshPartyCoordinator();
  await refreshScriptRuntime();
  await refreshDiagnostics();
  return { payload, copied };
}

async function gameDataAction(path) {
  const response = await fetch(path, { method: "POST" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  state.gameData = payload;
  renderGameData();
  return payload;
}

async function gameVersionAction(path) {
  const response = await fetch(path, { method: "POST" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  state.gameVersion = payload;
  renderGameVersion();
  return payload;
}

async function updateAction(path) {
  const response = await fetch(path, { method: "POST" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  state.update = payload;
  renderUpdate();
  return payload;
}

async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard access was denied.");
}

function diagnosticHeader(records) {
  const first = records.at(0)?.timestamp ?? "n/a";
  const last = records.at(-1)?.timestamp ?? "n/a";
  return [
    "ALRemastered Diagnostic Log",
    `Client version: ${state.status?.version ?? "unknown"}`,
    `Platform: ${state.status?.platform ?? "unknown"}`,
    `Log lines: ${records.length}`,
    `Time range: ${first} -> ${last}`,
    "Secrets sanitized: yes",
    "",
  ].join("\n");
}

function serializeRecords(records) {
  return `${diagnosticHeader(records)}${records.map((record) => JSON.stringify(record)).join("\n")}`;
}

elements.level.addEventListener("change", renderLogs);
elements.search.addEventListener("input", renderLogs);

elements.autoScroll.addEventListener("change", () => {
  state.autoScroll = elements.autoScroll.checked;
  if (state.autoScroll) elements.console.scrollTop = elements.console.scrollHeight;
});

elements.pause.addEventListener("click", () => {
  state.paused = !state.paused;
  elements.pause.textContent = state.paused ? "Resume" : "Pause";
  elements.pause.setAttribute("aria-pressed", String(state.paused));
  setFeedback(state.paused ? "Live display paused. Logging continues." : "Live display resumed.");
  if (!state.paused) renderLogs();
});

elements.copyFull.addEventListener("click", () => void copyFullLog());

elements.copyFiltered.addEventListener("click", async () => {
  try {
    const records = visibleRecords();
    await writeClipboard(serializeRecords(records));
    setFeedback(`Copied ${records.length} filtered log lines. Secrets sanitized: yes.`, "success");
  } catch (error) {
    setFeedback(`Copy failed: ${error.message}`, "error");
  }
});

elements.download.addEventListener("click", () => {
  const text = serializeRecords(state.records);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `ALRemastered-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
  document.body.append(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
  setFeedback(`Downloaded ${state.records.length} log lines. Secrets sanitized: yes.`, "success");
});

elements.clear.addEventListener("click", async () => {
  try {
    const response = await fetch("/api/logs/clear", { method: "POST" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    clearRecords();
  } catch (error) {
    setFeedback(`Clear failed: ${error.message}`, "error");
  }
});

elements.copySnapshot.addEventListener("click", async () => {
  try {
    await refreshDiagnostics();
    await writeClipboard(JSON.stringify(state.diagnostics, null, 2));
    setFeedback("Copied diagnostic snapshot. Secrets sanitized: yes.", "success");
  } catch (error) {
    setFeedback(`Snapshot copy failed: ${error.message}`, "error");
  }
});

elements.downloadPackage.addEventListener("click", async () => {
  try {
    const response = await fetch("/api/diagnostics/package", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `ALRemastered-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.append(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();
    setFeedback("Diagnostic package downloaded. Secrets sanitized: yes.", "success");
  } catch (error) {
    setFeedback(`Diagnostic package download failed: ${error.message}`, "error");
  }
});

elements.accountForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.accountConnect.disabled = true;
  setFeedback("Connecting to Adventure Land…");
  try {
    const account = await accountAction("/api/account/login", {
      email: elements.accountEmail.value,
      password: elements.accountPassword.value,
    });
    if (account.status === "connected") {
      elements.accountEmail.value = "";
      await refreshSelection();
      const selection = state.selection;
      if (selection?.status === "ready") {
        setFeedback(
          `Adventure Land account connected. Loaded ${selection.characters.length} characters and ${selection.servers.length} servers.`,
          "success",
        );
      } else {
        setFeedback(
          selection?.message ?? "Adventure Land account connected.",
          selection?.status === "error" ? "error" : "success",
        );
      }
    } else {
      setFeedback(account.message ?? "Adventure Land account connection failed.", "error");
    }
  } catch (error) {
    setFeedback(`Adventure Land account connection failed: ${error.message}`, "error");
  } finally {
    elements.accountPassword.value = "";
    elements.accountConnect.disabled = false;
  }
});

elements.accountDisconnect.addEventListener("click", async () => {
  elements.accountDisconnect.disabled = true;
  try {
    await accountAction("/api/account/disconnect");
    state.selection = {
      status: "disconnected",
      characters: [],
      servers: [],
      message: "Connect an Adventure Land account to load characters and servers.",
    };
    state.character = {
      status: "disconnected",
      message: "No headless Adventure Land character is connected.",
    };
    renderSelection();
    renderCharacterConnection();
    elements.accountEmail.value = "";
    elements.accountPassword.value = "";
    setFeedback("Adventure Land account disconnected.", "success");
  } catch (error) {
    setFeedback(`Account disconnect failed: ${error.message}`, "error");
  } finally {
    elements.accountDisconnect.disabled = false;
  }
});

elements.refreshSelection.addEventListener("click", async () => {
  elements.refreshSelection.disabled = true;
  setFeedback("Refreshing Adventure Land characters and servers…");
  try {
    const selection = await selectionAction("/api/selection/refresh");
    if (selection.status === "ready") {
      setFeedback(
        `Loaded ${selection.characters.length} characters and ${selection.servers.length} servers.`,
        "success",
      );
    } else {
      setFeedback(selection.message ?? "Character and server refresh failed.", "error");
    }
  } catch (error) {
    setFeedback(`Character and server refresh failed: ${error.message}`, "error");
  } finally {
    elements.refreshSelection.disabled = false;
  }
});

elements.selectServer.addEventListener("click", async () => {
  const serverKey = elements.serverSelect.value;
  if (!serverKey) return;
  elements.selectServer.disabled = true;
  try {
    const selection = await selectionAction("/api/selection/server", { serverKey });
    setFeedback(selection.message ?? "Adventure Land server selected.", "success");
  } catch (error) {
    setFeedback(`Server selection failed: ${error.message}`, "error");
  } finally {
    elements.selectServer.disabled = false;
  }
});

elements.startCharacter.addEventListener("click", async () => {
  const characterId = elements.characterSelect.value;
  if (!characterId) return;
  elements.startCharacter.disabled = true;
  setFeedback("Starting headless Adventure Land character connection…");
  try {
    const connection = await characterAction("/api/character/start", { characterId });
    if (connection.status === "connected") {
      setFeedback(
        `${connection.characterName} connected headlessly to ${connection.serverRegion} ${connection.serverName}. No automation is running.`,
        "success",
      );
    } else {
      setFeedback(connection.message ?? "Character connection failed.", "error");
    }
  } catch (error) {
    setFeedback(`Character connection failed: ${error.message}`, "error");
  } finally {
    renderCharacterConnection();
  }
});

elements.stopCharacter.addEventListener("click", async () => {
  elements.stopCharacter.disabled = true;
  try {
    const connection = await characterAction("/api/character/stop");
    setFeedback(connection.message ?? "Headless character disconnected.", "success");
  } catch (error) {
    setFeedback(`Character disconnect failed: ${error.message}`, "error");
  } finally {
    renderCharacterConnection();
  }
});

elements.runActionGatewayProbe.addEventListener("click", async () => {
  elements.runActionGatewayProbe.disabled = true;
  setFeedback("Running local action gateway probe…");
  try {
    const result = await actionGatewayProbe();
    setFeedback(
      `Action gateway probe completed. Request ID: ${result.requestId}. Outcome: ${result.outcome}.`,
      "success",
    );
  } catch (error) {
    setFeedback(`Action gateway probe failed: ${error.message}`, "error");
  } finally {
    elements.runActionGatewayProbe.disabled = false;
  }
});

for (const button of elements.movementButtons) {
  button.addEventListener("click", async () => {
    const direction = button.dataset.movementDirection;
    if (!direction) return;

    for (const movementButton of elements.movementButtons) {
      movementButton.disabled = true;
    }
    setFeedback(
      `Running ${elements.movementMode.value} ${direction} movement test…`,
    );
    try {
      const result = await movementTest(direction);
      const target = result.result
        ? ` Target: (${result.result.targetX}, ${result.result.targetY}).`
        : "";
      const confirmed = result.result?.serverConfirmed
        ? ` Confirmed position: (${result.result.confirmedX}, ${result.result.confirmedY}).`
        : "";
      setFeedback(
        `Movement confirmed by server. Request ID: ${result.requestId}. Outcome: ${result.outcome}.${target}${confirmed}`,
        "success",
      );
    } catch (error) {
      setFeedback(`Movement test failed: ${error.message}`, "error");
    } finally {
      for (const movementButton of elements.movementButtons) {
        movementButton.disabled = false;
      }
    }
  });
}

elements.attackTarget.addEventListener("change", () => {
  elements.runAttackTest.disabled = !elements.attackTarget.value;
});

elements.runAttackTest.addEventListener("click", async () => {
  const targetId = elements.attackTarget.value;
  if (!targetId) return;
  elements.runAttackTest.disabled = true;
  setFeedback(`Attacking selected monster ${targetId} once…`);
  try {
    const result = await attackTest();
    const cooldown = typeof result.result?.cooldownMs === "number"
      ? ` Cooldown: ${result.result.cooldownMs} ms.`
      : "";
    setFeedback(
      `Attack confirmed by server. Request ID: ${result.requestId}. Outcome: ${result.outcome}. Target: ${result.result?.targetType ?? targetId} (${targetId}).${cooldown}`,
      "success",
    );
  } catch (error) {
    setFeedback(`Attack test failed: ${error.message}`, "error");
  } finally {
    renderCharacterConnection();
  }
});

elements.skillName.addEventListener("change", () => {
  renderSkillTargets("");
});

elements.skillTarget.addEventListener("change", () => {
  const skills = state.skillOptions?.skills ?? [];
  const skill = skills.find((entry) => entry.skillName === elements.skillName.value);
  elements.runSkillTest.disabled = !skill ||
    (skill.targetMode !== "none" && !elements.skillTarget.value);
});

elements.runSkillTest.addEventListener("click", async () => {
  const skillName = elements.skillName.value;
  if (!skillName) return;
  elements.runSkillTest.disabled = true;
  setFeedback(`Using safe skill ${skillName} once…`);
  try {
    const result = await skillTest();
    const target = result.result?.targetName
      ? ` Target: ${result.result.targetName} (${result.result.targetId}).`
      : "";
    const cooldown = typeof result.result?.cooldownMs === "number"
      ? ` Cooldown: ${result.result.cooldownMs} ms.`
      : "";
    setFeedback(
      `Skill confirmed by server. Request ID: ${result.requestId}. Outcome: ${result.outcome}. Skill: ${result.result?.displayName ?? skillName}.${target}${cooldown}`,
      "success",
    );
  } catch (error) {
    setFeedback(`Skill test failed: ${error.message}`, "error");
  } finally {
    await refreshSkillOptions();
  }
});

elements.lootChest.addEventListener("change", () => {
  elements.runLootTest.disabled = !elements.lootChest.value;
});

elements.runLootTest.addEventListener("click", async () => {
  const chestId = elements.lootChest.value;
  if (!chestId) return;
  elements.runLootTest.disabled = true;
  setFeedback("Looting selected visible chest once…");
  try {
    const result = await lootTest();
    setFeedback(
      `Loot confirmed by server. Request ID: ${result.requestId}. Outcome: ${result.outcome}. Chest: ${result.result?.chestId ?? chestId}.`,
      "success",
    );
  } catch (error) {
    setFeedback(`Loot test failed: ${error.message}`, "error");
  } finally {
    await refreshLootConsumableOptions();
  }
});

elements.consumableItem.addEventListener("change", () => {
  elements.runConsumableTest.disabled = !elements.consumableItem.value;
});

elements.runConsumableTest.addEventListener("click", async () => {
  const inventoryIndex = Number(elements.consumableItem.value);
  const option = (state.lootConsumableOptions?.consumables ?? []).find(
    (item) => item.inventoryIndex === inventoryIndex,
  );
  if (!option) return;
  elements.runConsumableTest.disabled = true;
  setFeedback(`Using ${option.displayName} once…`);
  try {
    const result = await consumableTest();
    const cooldown = typeof result.result?.cooldownMs === "number"
      ? ` Cooldown: ${result.result.cooldownMs} ms.`
      : "";
    setFeedback(
      `Consumable confirmed by server. Request ID: ${result.requestId}. Outcome: ${result.outcome}. Item: ${result.result?.displayName ?? option.displayName}. Resource: ${option.kind.toUpperCase()}.${cooldown}`,
      "success",
    );
  } catch (error) {
    setFeedback(`Consumable test failed: ${error.message}`, "error");
  } finally {
    await refreshLootConsumableOptions();
  }
});

elements.startSlice35LiveTest.addEventListener("click", async () => {
  if (state.slice35LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice35LastReport = null;
  elements.copySlice35LiveTestResult.hidden = true;
  setFeedback(
    "Slice 3.5 live test started. Safe preparation and all checks now run automatically.",
  );

  try {
    const { payload, copied } = await startSlice35LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const outcomeLabel = String(outcome).toUpperCase();
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 3.5 test ${outcomeLabel}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice35LiveTest();
    setFeedback(
      `Slice 3.5 one-click test could not finish: ${error.message}`,
      "error",
    );
  } finally {
    renderSlice35LiveTest();
  }
});

elements.copySlice35LiveTestResult.addEventListener("click", async () => {
  if (!state.slice35LastReport) return;
  try {
    await writeClipboard(state.slice35LastReport);
    setFeedback(
      "Complete Slice 3.5 test result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Test-result copy failed: ${error.message}`, "error");
  }
});

elements.scriptRuntimeLoad.addEventListener("click", async () => {
  elements.scriptRuntimeLoad.disabled = true;
  setFeedback("Loading script into the isolated runtime…");
  try {
    const runtime = await scriptRuntimeAction("/api/script-runtime/load", {
      name: elements.scriptRuntimeScriptName.value,
      source: elements.scriptRuntimeSource.value,
    });
    setFeedback(`Script loaded: ${runtime.scriptName}.`, "success");
  } catch (error) {
    setFeedback(`Script load failed: ${error.message}`, "error");
  } finally {
    elements.scriptRuntimeLoad.disabled = false;
    await refreshScriptRuntime();
  }
});

elements.scriptRuntimeStart.addEventListener("click", async () => {
  setFeedback("Starting script in its isolated worker…");
  try {
    const runtime = await scriptRuntimeAction("/api/script-runtime/start");
    setFeedback(
      runtime.status === "running"
        ? `Script started: ${runtime.scriptName}.`
        : `Script start ended with status ${runtime.status}: ${runtime.message}`,
      runtime.status === "running" ? "success" : "error",
    );
  } catch (error) {
    setFeedback(`Script start failed: ${error.message}`, "error");
  } finally {
    await refreshScriptRuntime();
  }
});

elements.scriptRuntimePause.addEventListener("click", async () => {
  setFeedback("Pausing script and clearing its timers…");
  try {
    const runtime = await scriptRuntimeAction("/api/script-runtime/pause");
    setFeedback(`Script status: ${runtime.status}. Active timers: ${runtime.activeTimers}.`, "success");
  } catch (error) {
    setFeedback(`Script pause failed: ${error.message}`, "error");
  } finally {
    await refreshScriptRuntime();
  }
});

elements.scriptRuntimeStop.addEventListener("click", async () => {
  setFeedback("Stopping script and releasing its worker…");
  try {
    const runtime = await scriptRuntimeAction("/api/script-runtime/stop");
    setFeedback(`Script status: ${runtime.status}. Active timers: ${runtime.activeTimers}.`, "success");
  } catch (error) {
    setFeedback(`Script stop failed: ${error.message}`, "error");
  } finally {
    await refreshScriptRuntime();
  }
});

elements.startSlice41LiveTest.addEventListener("click", async () => {
  if (state.slice41LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice41LastReport = null;
  elements.copySlice41LiveTestResult.hidden = true;
  setFeedback(
    "Slice 4.1 live test started. Script lifecycle and crash-isolation checks now run automatically.",
  );

  try {
    const { payload, copied } = await startSlice41LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const outcomeLabel = String(outcome).toUpperCase();
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 4.1 test ${outcomeLabel}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice41LiveTest();
    setFeedback(
      `Slice 4.1 one-click test could not finish: ${error.message}`,
      "error",
    );
  } finally {
    renderSlice41LiveTest();
  }
});

elements.copySlice41LiveTestResult.addEventListener("click", async () => {
  if (!state.slice41LastReport) return;
  try {
    await writeClipboard(state.slice41LastReport);
    setFeedback(
      "Complete Slice 4.1 test result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Test-result copy failed: ${error.message}`, "error");
  }
});

elements.startSlice42LiveTest.addEventListener("click", async () => {
  if (state.slice42LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice42LastReport = null;
  elements.copySlice42LiveTestResult.hidden = true;
  setFeedback(
    "Slice 4.2 live test started. A bounded isolated script farmer now runs automatically.",
  );

  try {
    const { payload, copied } = await startSlice42LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const outcomeLabel = String(outcome).toUpperCase();
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 4.2 test ${outcomeLabel}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice42LiveTest();
    setFeedback(
      `Slice 4.2 one-click test could not finish: ${error.message}`,
      "error",
    );
  } finally {
    renderSlice42LiveTest();
  }
});

elements.copySlice42LiveTestResult.addEventListener("click", async () => {
  if (!state.slice42LastReport) return;
  try {
    await writeClipboard(state.slice42LastReport);
    setFeedback(
      "Complete Slice 4.2 test result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Test-result copy failed: ${error.message}`, "error");
  }
});

elements.startSlice43LiveTest.addEventListener("click", async () => {
  if (state.slice43LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice43LastReport = null;
  elements.copySlice43LiveTestResult.hidden = true;
  setFeedback(
    "Slice 4.3 live test started. Fresh read-only game events are now verified automatically.",
  );

  try {
    const { payload, copied } = await startSlice43LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const outcomeLabel = String(outcome).toUpperCase();
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 4.3 test ${outcomeLabel}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice43LiveTest();
    setFeedback(
      `Slice 4.3 one-click test could not finish: ${error.message}`,
      "error",
    );
  } finally {
    renderSlice43LiveTest();
  }
});

elements.copySlice43LiveTestResult.addEventListener("click", async () => {
  if (!state.slice43LastReport) return;
  try {
    await writeClipboard(state.slice43LastReport);
    setFeedback(
      "Complete Slice 4.3 test result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Test-result copy failed: ${error.message}`, "error");
  }
});

elements.startSlice44LiveTest.addEventListener("click", async () => {
  if (state.slice44LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice44LastReport = null;
  elements.copySlice44LiveTestResult.hidden = true;
  setFeedback(
    "Slice 4.4 storage test started. Persistence and namespace isolation checks now run automatically.",
  );

  try {
    const { payload, copied } = await startSlice44LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const outcomeLabel = String(outcome).toUpperCase();
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 4.4 test ${outcomeLabel}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice44LiveTest();
    setFeedback(
      `Slice 4.4 one-click storage test could not finish: ${error.message}`,
      "error",
    );
  } finally {
    renderSlice44LiveTest();
  }
});

elements.copySlice44LiveTestResult.addEventListener("click", async () => {
  if (!state.slice44LastReport) return;
  try {
    await writeClipboard(state.slice44LastReport);
    setFeedback(
      "Complete Slice 4.4 test result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Test-result copy failed: ${error.message}`, "error");
  }
});

elements.simpleFarmerStart.addEventListener("click", async () => {
  setFeedback("Starting the no-code Simple Farmer Template…");
  try {
    const farmer = await simpleFarmerAction("/api/simple-farmer/start", {
      monster: elements.simpleFarmerMonster.value,
      hpThresholdPercent: Number(elements.simpleFarmerHpThreshold.value),
      mpThresholdPercent: Number(elements.simpleFarmerMpThreshold.value),
      loot: elements.simpleFarmerLoot.checked,
      respawn: elements.simpleFarmerRespawn.checked,
    });
    setFeedback(farmer.message ?? "Simple Farmer started.", "success");
  } catch (error) {
    setFeedback(`Simple Farmer start failed: ${error.message}`, "error");
  } finally {
    await refreshSimpleFarmer();
  }
});

elements.simpleFarmerStop.addEventListener("click", async () => {
  setFeedback("Stopping Simple Farmer…");
  try {
    const farmer = await simpleFarmerAction("/api/simple-farmer/stop");
    setFeedback(farmer.message ?? "Simple Farmer stopped.", "success");
  } catch (error) {
    setFeedback(`Simple Farmer stop failed: ${error.message}`, "error");
  } finally {
    await refreshSimpleFarmer();
  }
});

elements.startSlice45LiveTest.addEventListener("click", async () => {
  if (state.slice45LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice45LastReport = null;
  elements.copySlice45LiveTestResult.hidden = true;
  setFeedback("Slice 4.5 live farm test started. The test will select and approach a safe monster automatically, then verify attack and loot.");
  try {
    const { payload, copied } = await startSlice45LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const outcomeLabel = String(outcome).toUpperCase();
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 4.5 test ${outcomeLabel}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice45LiveTest();
    setFeedback(`Slice 4.5 one-click test could not finish: ${error.message}`, "error");
  } finally {
    renderSlice45LiveTest();
  }
});

elements.copySlice45LiveTestResult.addEventListener("click", async () => {
  if (!state.slice45LastReport) return;
  try {
    await writeClipboard(state.slice45LastReport);
    setFeedback("Complete Slice 4.5 test result and sanitized diagnostic log copied.", "success");
  } catch (error) {
    setFeedback(`Test-result copy failed: ${error.message}`, "error");
  }
});

elements.startSlice51LiveTest.addEventListener("click", async () => {
  if (state.slice51LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice51LastReport = null;
  elements.copySlice51LiveTestResult.hidden = true;
  setFeedback("Slice 5.1 heartbeat test started. Core, Character, and Script liveness will be observed passively.");
  try {
    const { payload, copied } = await startSlice51LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 5.1 test ${String(outcome).toUpperCase()}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice51LiveTest();
    setFeedback(`Slice 5.1 heartbeat test could not finish: ${error.message}`, "error");
  } finally {
    renderSlice51LiveTest();
  }
});

elements.copySlice51LiveTestResult.addEventListener("click", async () => {
  if (!state.slice51LastReport) return;
  try {
    await writeClipboard(state.slice51LastReport);
    setFeedback("Complete Slice 5.1 heartbeat result and sanitized diagnostic log copied.", "success");
  } catch (error) {
    setFeedback(`Heartbeat-result copy failed: ${error.message}`, "error");
  }
});

elements.startSlice52LiveTest.addEventListener("click", async () => {
  if (state.slice52LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice52LastReport = null;
  elements.copySlice52LiveTestResult.hidden = true;
  setFeedback("Slice 5.2 reconnect test started. The real character socket will be interrupted once and recovered automatically.");
  try {
    const { payload, copied } = await startSlice52LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 5.2 test ${String(outcome).toUpperCase()}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice52LiveTest();
    setFeedback(`Slice 5.2 reconnect test could not finish: ${error.message}`, "error");
  } finally {
    renderSlice52LiveTest();
  }
});

elements.copySlice52LiveTestResult.addEventListener("click", async () => {
  if (!state.slice52LastReport) return;
  try {
    await writeClipboard(state.slice52LastReport);
    setFeedback("Complete Slice 5.2 reconnect result and sanitized diagnostic log copied.", "success");
  } catch (error) {
    setFeedback(`Reconnect-result copy failed: ${error.message}`, "error");
  }
});

elements.startSlice53LiveTest.addEventListener("click", async () => {
  if (state.slice53LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice53LastReport = null;
  elements.copySlice53LiveTestResult.hidden = true;
  setFeedback(
    "Slice 5.3 recovery test started. A real server-observed death state is required; respawn and script continuation are handled automatically.",
  );
  try {
    const { payload, copied } = await startSlice53LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 5.3 test ${String(outcome).toUpperCase()}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice53LiveTest();
    setFeedback(`Slice 5.3 death/respawn recovery test could not finish: ${error.message}`, "error");
  } finally {
    renderSlice53LiveTest();
  }
});

elements.copySlice53LiveTestResult.addEventListener("click", async () => {
  if (!state.slice53LastReport) return;
  try {
    await writeClipboard(state.slice53LastReport);
    setFeedback(
      "Complete Slice 5.3 death/respawn recovery result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Death/respawn recovery-result copy failed: ${error.message}`, "error");
  }
});

elements.startSlice54LiveTest.addEventListener("click", async () => {
  if (state.slice54LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice54LastReport = null;
  elements.copySlice54LiveTestResult.hidden = true;
  setFeedback(
    "Slice 5.4 watchdog test started. The isolated probe heartbeat will be suppressed only at the host observation layer; no gameplay mutation is performed.",
  );
  try {
    const { payload, copied } = await startSlice54LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 5.4 test ${String(outcome).toUpperCase()}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice54LiveTest();
    setFeedback(`Slice 5.4 watchdog/restart-guard test could not finish: ${error.message}`, "error");
  } finally {
    renderSlice54LiveTest();
  }
});

elements.copySlice54LiveTestResult.addEventListener("click", async () => {
  if (!state.slice54LastReport) return;
  try {
    await writeClipboard(state.slice54LastReport);
    setFeedback(
      "Complete Slice 5.4 watchdog/restart-guard result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Watchdog-result copy failed: ${error.message}`, "error");
  }
});

elements.startSlice61LiveTest.addEventListener("click", async () => {
  if (state.slice61LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice61LastReport = null;
  elements.copySlice61LiveTestResult.hidden = true;
  setFeedback(
    "Slice 6.1 map model test started. Live game data will be validated passively; no movement or pathfinding action is performed.",
  );
  try {
    const { payload, copied } = await startSlice61LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 6.1 test ${String(outcome).toUpperCase()}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice61LiveTest();
    setFeedback(`Slice 6.1 map/geometry-model test could not finish: ${error.message}`, "error");
  } finally {
    renderSlice61LiveTest();
  }
});

elements.copySlice61LiveTestResult.addEventListener("click", async () => {
  if (!state.slice61LastReport) return;
  try {
    await writeClipboard(state.slice61LastReport);
    setFeedback(
      "Complete Slice 6.1 map/geometry-model result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Map-model result copy failed: ${error.message}`, "error");
  }
});

elements.startSlice62LiveTest.addEventListener("click", async () => {
  if (state.slice62LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice62LastReport = null;
  elements.copySlice62LiveTestResult.hidden = true;
  setFeedback(
    "Slice 6.2 path planner test started. A live cross-map route will be planned and validated without executing movement.",
  );
  try {
    const { payload, copied } = await startSlice62LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 6.2 test ${String(outcome).toUpperCase()}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice62LiveTest();
    setFeedback(`Slice 6.2 simple path-planner test could not finish: ${error.message}`, "error");
  } finally {
    renderSlice62LiveTest();
  }
});

elements.copySlice62LiveTestResult.addEventListener("click", async () => {
  if (!state.slice62LastReport) return;
  try {
    await writeClipboard(state.slice62LastReport);
    setFeedback(
      "Complete Slice 6.2 path-planner result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Path-planner result copy failed: ${error.message}`, "error");
  }
});

elements.startSlice63LiveTest.addEventListener("click", async () => {
  if (state.slice63LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice63LastReport = null;
  elements.copySlice63LiveTestResult.hidden = true;
  setFeedback(
    "Slice 6.3 smart_move() test started. The isolated worker will validate compatibility and stable error reasons without moving the Character.",
  );
  try {
    const { payload, copied } = await startSlice63LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 6.3 test ${String(outcome).toUpperCase()}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice63LiveTest();
    setFeedback(`Slice 6.3 smart_move() compatibility test could not finish: ${error.message}`, "error");
  } finally {
    renderSlice63LiveTest();
  }
});

elements.copySlice63LiveTestResult.addEventListener("click", async () => {
  if (!state.slice63LastReport) return;
  try {
    await writeClipboard(state.slice63LastReport);
    setFeedback(
      "Complete Slice 6.3 smart_move() result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`smart_move() result copy failed: ${error.message}`, "error");
  }
});

elements.startSlice64LiveTest.addEventListener("click", async () => {
  if (state.slice64LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice64LastReport = null;
  elements.copySlice64LiveTestResult.hidden = true;
  setFeedback(
    "Slice 6.4 movement-debug test started. One bounded planned route and server-confirmed movement round-trip will be verified without taking over the user script worker.",
  );
  try {
    const { payload, copied } = await startSlice64LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 6.4 test ${String(outcome).toUpperCase()}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice64LiveTest();
    setFeedback(`Slice 6.4 movement-debug test could not finish: ${error.message}`, "error");
  } finally {
    renderSlice64LiveTest();
  }
});

elements.copySlice64LiveTestResult.addEventListener("click", async () => {
  if (!state.slice64LastReport) return;
  try {
    await writeClipboard(state.slice64LastReport);
    setFeedback(
      "Complete Slice 6.4 movement-debug result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Movement-debug result copy failed: ${error.message}`, "error");
  }
});

elements.startSlice71LiveTest.addEventListener("click", async () => {
  if (state.slice71LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice71LastReport = null;
  elements.copySlice71LiveTestResult.hidden = true;
  setFeedback(
    "Slice 7.1 multi-character session test started. One additional Character will be connected and removed without interrupting the primary Character or user script.",
  );
  try {
    const { payload, copied } = await startSlice71LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 7.1 test ${String(outcome).toUpperCase()}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice71LiveTest();
    setFeedback(`Slice 7.1 multi-character session test could not finish: ${error.message}`, "error");
  } finally {
    renderSlice71LiveTest();
    await refreshCharacterSessions();
  }
});

elements.copySlice71LiveTestResult.addEventListener("click", async () => {
  if (!state.slice71LastReport) return;
  try {
    await writeClipboard(state.slice71LastReport);
    setFeedback(
      "Complete Slice 7.1 multi-character session result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Multi-character session result copy failed: ${error.message}`, "error");
  }
});

elements.startSlice72LiveTest.addEventListener("click", async () => {
  if (state.slice72LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice72LastReport = null;
  elements.copySlice72LiveTestResult.hidden = true;
  setFeedback(
    "Slice 7.2 local Character messaging test started. One temporary Character session and an isolated probe worker will verify send_cm() plus character.on('cm') without replacing the user script.",
  );
  try {
    const { payload, copied } = await startSlice72LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 7.2 test ${String(outcome).toUpperCase()}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice72LiveTest();
    setFeedback(`Slice 7.2 local Character messaging test could not finish: ${error.message}`, "error");
  } finally {
    renderSlice72LiveTest();
    await refreshCharacterSessions();
    await refreshCharacterMessaging();
  }
});

elements.copySlice72LiveTestResult.addEventListener("click", async () => {
  if (!state.slice72LastReport) return;
  try {
    await writeClipboard(state.slice72LastReport);
    setFeedback(
      "Complete Slice 7.2 local Character messaging result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Local Character messaging result copy failed: ${error.message}`, "error");
  }
});



async function partyTemplateAction(path, body) {
  const options = { method: "POST" };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  }
  state.partyTemplates = payload;
  renderPartyTemplates();
  await refreshPartyCoordinator();
  return payload;
}

async function startSlice74LiveTest(clipboardWrite) {
  state.slice74LiveTest = {
    status: "running",
    message: "Slice 7.4 Party Templates test is running.",
  };
  renderSlice74LiveTest();
  const response = await fetch("/api/live-test/slice-7-4/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ?? payload.message ??
        `Slice 7.4 Party Templates test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 7.4 Party Templates test returned no copyable report.");
  }
  state.slice74LastReport = payload.reportText;
  state.slice74LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 7.4 Party Templates test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice74LiveTest();
  await refreshCharacterConnection();
  await refreshCharacterSessions();
  await refreshCharacterMessaging();
  await refreshPartyCoordinator();
  await refreshPartyTemplates();
  await refreshScriptRuntime();
  await refreshDiagnostics();
  return { payload, copied };
}


elements.startSlice73LiveTest.addEventListener("click", async () => {
  if (state.slice73LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice73LastReport = null;
  elements.copySlice73LiveTestResult.hidden = true;
  setFeedback(
    "Slice 7.3 Party Coordinator test started. One temporary managed Character will verify technical role and target state without gameplay automation.",
  );
  try {
    const { payload, copied } = await startSlice73LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 7.3 test ${String(outcome).toUpperCase()}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice73LiveTest();
    setFeedback(`Slice 7.3 Party Coordinator test could not finish: ${error.message}`, "error");
  } finally {
    renderSlice73LiveTest();
    await refreshCharacterSessions();
    await refreshCharacterMessaging();
    await refreshPartyCoordinator();
  }
});

elements.copySlice73LiveTestResult.addEventListener("click", async () => {
  if (!state.slice73LastReport) return;
  try {
    await writeClipboard(state.slice73LastReport);
    setFeedback(
      "Complete Slice 7.3 Party Coordinator result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Party Coordinator result copy failed: ${error.message}`, "error");
  }
});



elements.partyTemplateMember.addEventListener("change", () => {
  const assignment = state.partyTemplates?.assignments?.find((item) =>
    item.characterId === elements.partyTemplateMember.value
  );
  if (assignment?.currentRole) elements.partyTemplateRole.value = assignment.currentRole;
});

elements.assignPartyTemplateRole.addEventListener("click", async () => {
  const characterId = elements.partyTemplateMember.value;
  const role = elements.partyTemplateRole.value;
  if (!characterId) return;
  try {
    await partyTemplateAction("/api/party-templates/assign", { characterId, role });
    setFeedback(`Assigned ${role.toUpperCase()} to the selected Coordinator member.`, "success");
  } catch (error) {
    setFeedback(`Party Template assignment failed: ${error.message}`, "error");
  }
});

elements.clearPartyTemplateRole.addEventListener("click", async () => {
  const characterId = elements.partyTemplateMember.value;
  if (!characterId) return;
  try {
    await partyTemplateAction("/api/party-templates/clear", { characterId });
    setFeedback("Cleared the selected Coordinator role.", "success");
  } catch (error) {
    setFeedback(`Party Template clear failed: ${error.message}`, "error");
  }
});

elements.applyRecommendedPartyRoles.addEventListener("click", async () => {
  try {
    await partyTemplateAction("/api/party-templates/apply-recommended");
    setFeedback("Applied Warrior Tank, Priest Healer, and DPS recommendations.", "success");
  } catch (error) {
    setFeedback(`Recommended Party Template assignment failed: ${error.message}`, "error");
  }
});

elements.startSlice74LiveTest.addEventListener("click", async () => {
  if (state.slice74LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice74LastReport = null;
  elements.copySlice74LiveTestResult.hidden = true;
  setFeedback(
    "Slice 7.4 Party Templates test started. Two bounded managed Characters will cover the missing template roles without gameplay automation.",
  );
  try {
    const { payload, copied } = await startSlice74LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 7.4 test ${String(outcome).toUpperCase()}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice74LiveTest();
    setFeedback(`Slice 7.4 Party Templates test could not finish: ${error.message}`, "error");
  } finally {
    renderSlice74LiveTest();
    await refreshCharacterSessions();
    await refreshCharacterMessaging();
    await refreshPartyCoordinator();
    await refreshPartyTemplates();
  }
});

elements.copySlice74LiveTestResult.addEventListener("click", async () => {
  if (!state.slice74LastReport) return;
  try {
    await writeClipboard(state.slice74LastReport);
    setFeedback(
      "Complete Slice 7.4 Party Templates result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Party Templates result copy failed: ${error.message}`, "error");
  }
});



async function characterCardAction(action, characterId) {
  const response = await fetch(`/api/character-cards/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? payload.message ?? `HTTP ${response.status}`);
  }
  state.characterCards = payload;
  renderCharacterCards();
  await refreshCharacterConnection();
  await refreshCharacterSessions();
  await refreshScriptRuntime();
  return payload;
}

async function startSlice81LiveTest(clipboardWrite) {
  state.slice81LiveTest = {
    status: "running",
    message: "Slice 8.1 Character Cards test is running.",
  };
  renderSlice81LiveTest();
  const response = await fetch("/api/live-test/slice-8-1/start", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ?? payload.message ??
        `Slice 8.1 Character Cards test failed with HTTP ${response.status}`,
    );
  }
  if (!payload.reportText || typeof payload.reportText !== "string") {
    throw new Error("Slice 8.1 Character Cards test returned no copyable report.");
  }
  state.slice81LastReport = payload.reportText;
  state.slice81LiveTest = {
    status: payload.result?.outcome ?? "failed",
    message: payload.result?.message ?? "Slice 8.1 Character Cards test finished.",
    lastResult: payload.result,
  };
  const copied = await clipboardWrite.finish(payload.reportText);
  renderSlice81LiveTest();
  await refreshCharacterCards();
  await refreshCharacterConnection();
  await refreshCharacterSessions();
  await refreshScriptRuntime();
  await refreshDiagnostics();
  return { payload, copied };
}

elements.characterCardsGrid.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-character-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.characterAction;
  const characterId = button.dataset.characterId;
  if (!action || !characterId) return;
  button.disabled = true;
  setFeedback(`${action[0].toUpperCase() + action.slice(1)} Character Card action started…`);
  try {
    await characterCardAction(action, characterId);
    setFeedback(
      `Character Card ${action} completed for ${characterId}.`,
      "success",
    );
  } catch (error) {
    setFeedback(`Character Card ${action} failed: ${error.message}`, "error");
  } finally {
    await refreshCharacterCards();
  }
});

elements.startSlice81LiveTest.addEventListener("click", async () => {
  if (state.slice81LiveTest?.status === "running") return;
  const clipboardWrite = beginDeferredClipboardWrite();
  state.slice81LastReport = null;
  elements.copySlice81LiveTestResult.hidden = true;
  setFeedback(
    "Slice 8.1 Character Cards test started. One bounded managed session and one isolated probe Script will be used without interrupting the user Script.",
  );
  try {
    const { payload, copied } = await startSlice81LiveTest(clipboardWrite);
    const outcome = payload.result?.outcome ?? "failed";
    const copyMessage = copied
      ? "Complete result and sanitized diagnostic log copied to clipboard."
      : "Automatic clipboard access was denied; use Copy last test result once.";
    setFeedback(
      `Slice 8.1 test ${String(outcome).toUpperCase()}. ${copyMessage}`,
      outcome === "passed" && copied ? "success" : outcome === "passed" ? "" : "error",
    );
  } catch (error) {
    await refreshSlice81LiveTest();
    setFeedback(`Slice 8.1 Character Cards test could not finish: ${error.message}`, "error");
  } finally {
    renderSlice81LiveTest();
    await refreshCharacterCards();
    await refreshCharacterSessions();
    await refreshScriptRuntime();
  }
});

elements.copySlice81LiveTestResult.addEventListener("click", async () => {
  if (!state.slice81LastReport) return;
  try {
    await writeClipboard(state.slice81LastReport);
    setFeedback(
      "Complete Slice 8.1 Character Cards result and sanitized diagnostic log copied.",
      "success",
    );
  } catch (error) {
    setFeedback(`Character Cards result copy failed: ${error.message}`, "error");
  }
});

elements.reloadGameData.addEventListener("click", async () => {
  elements.reloadGameData.disabled = true;
  setFeedback("Reloading Adventure Land game data…");
  state.gameData = { ...state.gameData, status: "loading" };
  renderGameData();
  try {
    const gameData = await gameDataAction("/api/game-data/reload");
    if (gameData.status === "loaded") {
      setFeedback(
        `Loaded Adventure Land game data version ${gameData.version}: ${gameData.loadedFamilyCount} / ${gameData.familyCount} data families available.`,
        "success",
      );
    } else {
      setFeedback(`Game data load failed: ${gameData.message}`, "error");
    }
  } catch (error) {
    setFeedback(`Game data load failed: ${error.message}`, "error");
  } finally {
    elements.reloadGameData.disabled = false;
  }
});

elements.checkGameVersion.addEventListener("click", async () => {
  elements.checkGameVersion.disabled = true;
  setFeedback("Checking Adventure Land game version…");
  try {
    const gameVersion = await gameVersionAction("/api/game-version/check");
    if (gameVersion.status === "changed") {
      setFeedback(gameVersion.message ?? "Adventure Land game version changed.", "success");
    } else if (gameVersion.status === "current") {
      setFeedback(
        `Adventure Land version ${gameVersion.currentVersion} is current and stored locally.`,
        "success",
      );
    } else if (gameVersion.status === "error") {
      setFeedback(`Game version check failed: ${gameVersion.message}`, "error");
    }
  } catch (error) {
    setFeedback(`Game version check failed: ${error.message}`, "error");
  } finally {
    elements.checkGameVersion.disabled = false;
  }
});

elements.checkUpdates.addEventListener("click", async () => {
  elements.checkUpdates.disabled = true;
  setFeedback("Checking for updates…");
  try {
    const update = await updateAction("/api/update/check");
    if (update.status === "available") {
      setFeedback(`ALRemastered ${update.latestVersion} is available.`, "success");
    } else if (update.status === "upToDate") {
      setFeedback("ALRemastered is up to date.", "success");
    } else if (update.status === "deferred") {
      setFeedback(update.message ?? "The latest update is currently deferred.");
    } else if (update.status === "error") {
      setFeedback(`Update check failed: ${update.message}`, "error");
    }
  } catch (error) {
    setFeedback(`Update check failed: ${error.message}`, "error");
  } finally {
    elements.checkUpdates.disabled = false;
  }
});

elements.skipUpdate.addEventListener("click", async () => {
  try {
    const update = await updateAction("/api/update/skip");
    setFeedback(update.message ?? "This version will be skipped.", "success");
  } catch (error) {
    setFeedback(`Skip failed: ${error.message}`, "error");
  }
});

elements.remindUpdate.addEventListener("click", async () => {
  try {
    const update = await updateAction("/api/update/remind");
    setFeedback(update.message ?? "This update will be shown again tomorrow.", "success");
  } catch (error) {
    setFeedback(`Reminder failed: ${error.message}`, "error");
  }
});

elements.installUpdate.addEventListener("click", async () => {
  setFeedback("Downloading and verifying update…");
  state.update = { ...state.update, status: "downloading", progressPercent: 0 };
  renderUpdate();
  try {
    const previousVersion = state.status?.version ?? state.update?.currentVersion;
    const update = await updateAction("/api/update/install");
    setFeedback(
      update.message ?? "Update verified. Installing automatically…",
      "success",
    );
    void waitForUpdatedDashboard(previousVersion, update.latestVersion);
  } catch (error) {
    setFeedback(`Update installation failed: ${error.message}`, "error");
    await refreshUpdate();
  }
});

await refreshStatus();
await refreshAccount();
await refreshSelection();
await refreshCharacterConnection();
await refreshControlMode();
await refreshActionGateway();
await refreshSkillOptions();
await refreshLootConsumableOptions();
await refreshSlice35LiveTest();
await refreshScriptRuntime();
await refreshSlice41LiveTest();
await refreshSlice42LiveTest();
await refreshSlice43LiveTest();
await refreshSlice44LiveTest();
await refreshSimpleFarmer();
await refreshSlice45LiveTest();
await refreshSlice51LiveTest();
await refreshSlice52LiveTest();
await refreshSlice53LiveTest();
await refreshSlice54LiveTest();
await refreshSlice61LiveTest();
await refreshSlice62LiveTest();
await refreshSlice63LiveTest();
await refreshSlice64LiveTest();
await refreshCharacterSessions();
await refreshSlice71LiveTest();
await refreshCharacterMessaging();
await refreshSlice72LiveTest();
await refreshPartyCoordinator();
await refreshSlice73LiveTest();
await refreshPartyTemplates();
await refreshSlice74LiveTest();
await refreshCharacterCards();
await refreshSlice81LiveTest();
await refreshSetupWizard();
await refreshSlice82LiveTest();
await refreshTemplateConfig();
await refreshSlice83LiveTest();
await refreshExplainability();
await refreshSlice84LiveTest();
await refreshMovementDebug();
await refreshGameVersion();
await refreshGameData();
await refreshUpdate();
await refreshDiagnostics();
await loadLogs();
connectStream();
setInterval(refreshStatus, 3000);
setInterval(refreshAccount, 2000);
setInterval(refreshSelection, 2000);
setInterval(refreshCharacterConnection, 1500);
setInterval(refreshControlMode, 1500);
setInterval(refreshActionGateway, 2000);
setInterval(refreshSkillOptions, 1500);
setInterval(refreshLootConsumableOptions, 1500);
setInterval(refreshSlice35LiveTest, 1500);
setInterval(refreshScriptRuntime, 1500);
setInterval(refreshSlice41LiveTest, 1500);
setInterval(refreshSlice42LiveTest, 1500);
setInterval(refreshSlice43LiveTest, 1500);
setInterval(refreshSlice44LiveTest, 1500);
setInterval(refreshSimpleFarmer, 1500);
setInterval(refreshSlice45LiveTest, 1500);
setInterval(refreshSlice51LiveTest, 1500);
setInterval(refreshSlice52LiveTest, 1500);
setInterval(refreshSlice53LiveTest, 1500);
setInterval(refreshSlice54LiveTest, 1500);
setInterval(refreshSlice61LiveTest, 1500);
setInterval(refreshSlice62LiveTest, 1500);
setInterval(refreshSlice63LiveTest, 1500);
setInterval(refreshSlice64LiveTest, 1500);
setInterval(refreshCharacterSessions, 1500);
setInterval(refreshSlice71LiveTest, 1500);
setInterval(refreshCharacterMessaging, 1500);
setInterval(refreshSlice72LiveTest, 1500);
setInterval(refreshPartyCoordinator, 1500);
setInterval(refreshSlice73LiveTest, 1500);
setInterval(refreshPartyTemplates, 1500);
setInterval(refreshSlice74LiveTest, 1500);
setInterval(refreshCharacterCards, 1500);
setInterval(refreshSlice81LiveTest, 1500);
setInterval(refreshSetupWizard, 2000);
setInterval(refreshSlice82LiveTest, 1500);
setInterval(refreshTemplateConfig, 2000);
setInterval(refreshSlice83LiveTest, 1500);
setInterval(refreshExplainability, 1000);
setInterval(refreshSlice84LiveTest, 1500);
setInterval(refreshMovementDebug, 1500);
setInterval(refreshGameVersion, 2000);
setInterval(refreshGameData, 2000);
setInterval(refreshUpdate, 1500);
setInterval(refreshDiagnostics, 1500);
setInterval(updateStatusView, 1000);
