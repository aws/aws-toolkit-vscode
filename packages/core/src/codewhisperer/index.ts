/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export { activate, shutdown } from './activation'
export * from './util/authUtil'
export * from './models/model'
export * from './models/constants'
export * from './commands/basicCommands'
export * from './commands/types'
export type {
    TransformationProgressUpdate,
    TransformationStep,
    FeatureEvaluation,
    ListFeatureEvaluationsResponse,
    GenerateCompletionsRequest,
    Completion,
    SendTelemetryEventResponse,
    TelemetryEvent,
    InlineChatEvent,
    Customization,
} from './client/codewhispereruserclient.d.ts'
export type { default as CodeWhispererUserClient } from './client/codewhispereruserclient.d.ts'
export { SecurityPanelViewProvider } from './views/securityPanelViewProvider'
export { isInlineCompletionEnabled } from './util/commonUtil'
export {
    DefaultCodeWhispererClient,
    Recommendation,
    ListCodeScanFindingsResponse,
    ListRecommendationsResponse,
    RecommendationsList,
    FileContext,
    ListRecommendationsRequest,
    GenerateRecommendationsRequest,
    codeWhispererClient,
} from './client/codewhisperer'
export { listCodeWhispererCommands, listCodeWhispererCommandsId } from './ui/statusBarMenu'
export { refreshStatusBar, CodeWhispererStatusBarManager } from './service/statusBar'
export { SecurityIssueHoverProvider } from './service/securityIssueHoverProvider'
export { SecurityIssueCodeActionProvider } from './service/securityIssueCodeActionProvider'
export {
    SecurityIssueTreeViewProvider,
    SecurityViewTreeItem,
    FileItem,
    IssueItem,
    SeverityItem,
} from './service/securityIssueTreeViewProvider'
export { CodeWhispererTracker } from './tracker/codewhispererTracker'
export { CodeWhispererUserGroupSettings } from './util/userGroupUtil'
export { session } from './util/codeWhispererSession'
export { stopTransformByQ } from './commands/startTransformByQ'
export { featureDefinitions, FeatureConfigProvider } from '../shared/featureConfig'
export { ReferenceInlineProvider } from './service/referenceInlineProvider'
export { ReferenceHoverProvider } from './service/referenceHoverProvider'
export { ReferenceLogViewProvider } from './service/referenceLogViewProvider'
export { ImportAdderProvider } from './service/importAdderProvider'
export { LicenseUtil } from './util/licenseUtil'
export { SecurityIssueProvider } from './service/securityIssueProvider'
export { listScanResults, mapToAggregatedList, pollScanJobStatus } from './service/securityScanHandler'
export { TelemetryHelper } from './util/telemetryHelper'
export { LineSelection, LineTracker } from './tracker/lineTracker'
export { runtimeLanguageContext, RuntimeLanguageContext } from './util/runtimeLanguageContext'
export * as startSecurityScan from './commands/startSecurityScan'
export * from './util/showSsoPrompt'
export * from './util/securityScanLanguageContext'
export * from './util/importAdderUtil'
export * from './util/zipUtil'
export * from './util/diagnosticsUtil'
export * from './util/commonUtil'
export * from './util/codewhispererSettings'
export * as getStartUrl from './util/getStartUrl'
export * from './service/diagnosticsProvider'
export * as diagnosticsProvider from './service/diagnosticsProvider'
export * from './ui/codeWhispererNodes'
export { SecurityScanError, SecurityScanTimedOutError } from '../codewhisperer/models/errors'
export * as CodeWhispererConstants from '../codewhisperer/models/constants'
export {
    getSelectedCustomization,
    setSelectedCustomization,
    baseCustomization,
    onProfileChangedListener,
    CustomizationProvider,
    notifyNewCustomizations,
} from './util/customizationUtil'
export { Container } from './service/serviceContainer'
export * from './util/gitUtil'
export * from './ui/prompters'
export { UserWrittenCodeTracker } from './tracker/userWrittenCodeTracker'
export { RegionProfileManager, defaultServiceConfig } from './region/regionProfileManager'
