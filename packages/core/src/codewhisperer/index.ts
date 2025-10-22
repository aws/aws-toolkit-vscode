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
export { InlineCompletionService } from './service/inlineCompletionService'
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
export { onAcceptance } from './commands/onAcceptance'
export { CodeWhispererTracker } from './tracker/codewhispererTracker'
export { CodeWhispererUserGroupSettings } from './util/userGroupUtil'
export { session } from './util/codeWhispererSession'
export { onInlineAcceptance } from './commands/onInlineAcceptance'
export { stopTransformByQ } from './commands/startTransformByQ'
export { featureDefinitions, FeatureConfigProvider } from '../shared/featureConfig'
export { ReferenceInlineProvider } from './service/referenceInlineProvider'
export { ReferenceHoverProvider } from './service/referenceHoverProvider'
export { CWInlineCompletionItemProvider } from './service/inlineCompletionItemProvider'
export { ClassifierTrigger } from './service/classifierTrigger'
export { ReferenceLogViewProvider } from './service/referenceLogViewProvider'
export { RecommendationService } from './service/recommendationService'
export { ImportAdderProvider } from './service/importAdderProvider'
export { LicenseUtil } from './util/licenseUtil'
export { SecurityIssueProvider } from './service/securityIssueProvider'
export { listScanResults, mapToAggregatedList, pollScanJobStatus } from './service/securityScanHandler'
export { TelemetryHelper } from './util/telemetryHelper'
export { LineSelection, LineTracker } from './tracker/lineTracker'
export { BM25Okapi } from './util/supplementalContext/rankBm25'
export { runtimeLanguageContext, RuntimeLanguageContext } from './util/runtimeLanguageContext'
export * as startSecurityScan from './commands/startSecurityScan'
export * from './util/supplementalContext/utgUtils'
export * from './util/supplementalContext/crossFileContextUtil'
export * from './util/editorContext'
export { acceptSuggestion } from './commands/onInlineAcceptance'
export * from './util/showSsoPrompt'
export * from './util/securityScanLanguageContext'
export * from './util/importAdderUtil'
export * from './util/globalStateUtil'
export * from './util/zipUtil'
export * from './util/diagnosticsUtil'
export * from './util/commonUtil'
export * from './util/closingBracketUtil'
export * from './util/supplementalContext/codeParsingUtil'
export * from './util/supplementalContext/supplementalContextUtil'
export * from './util/codewhispererSettings'
export * as supplementalContextUtil from './util/supplementalContext/supplementalContextUtil'
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
} from './util/customizationUtil'
export { Container } from './service/serviceContainer'
export * from './util/gitUtil'
export * from './ui/prompters'
export { UserWrittenCodeTracker } from './tracker/userWrittenCodeTracker'
export { RegionProfileManager, defaultServiceConfig } from './region/regionProfileManager'
export { DocumentChangedSource, KeyStrokeHandler, DefaultDocumentChangedType } from './service/keyStrokeHandler'
export { RecommendationHandler } from './service/recommendationHandler'
export { CodeWhispererCodeCoverageTracker } from './tracker/codewhispererCodeCoverageTracker'
export { invokeRecommendation } from './commands/invokeRecommendation'
