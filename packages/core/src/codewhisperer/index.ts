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
export {
    AutotriggerState,
    EndState,
    ManualtriggerState,
    PressTabState,
    TryMoreExState,
} from './views/lineAnnotationController'
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
export { refreshStatusBar, CodeWhispererStatusBar, InlineCompletionService } from './service/inlineCompletionService'
export { SecurityIssueHoverProvider } from './service/securityIssueHoverProvider'
export { SecurityIssueCodeActionProvider } from './service/securityIssueCodeActionProvider'
export {
    SecurityIssueTreeViewProvider,
    SecurityViewTreeItem,
    SecurityIssuesTree,
    FileItem,
    IssueItem,
    SeverityItem,
} from './service/securityIssueTreeViewProvider'
export { invokeRecommendation } from './commands/invokeRecommendation'
export { onAcceptance } from './commands/onAcceptance'
export { CodeWhispererTracker } from './tracker/codewhispererTracker'
export { RecommendationHandler } from './service/recommendationHandler'
export { CodeWhispererUserGroupSettings } from './util/userGroupUtil'
export { session } from './util/codeWhispererSession'
export { onInlineAcceptance } from './commands/onInlineAcceptance'
export { stopTransformByQ } from './commands/startTransformByQ'
export { getCompletionItems, getCompletionItem, getLabel } from './service/completionProvider'
export { featureDefinitions, FeatureConfigProvider } from '../shared/featureConfig'
export { ReferenceInlineProvider } from './service/referenceInlineProvider'
export { ReferenceHoverProvider } from './service/referenceHoverProvider'
export { CWInlineCompletionItemProvider } from './service/inlineCompletionItemProvider'
export { RecommendationService } from './service/recommendationService'
export { ClassifierTrigger } from './service/classifierTrigger'
export { DocumentChangedSource, KeyStrokeHandler, DefaultDocumentChangedType } from './service/keyStrokeHandler'
export { ReferenceLogViewProvider } from './service/referenceLogViewProvider'
export { LicenseUtil } from './util/licenseUtil'
export { SecurityIssueProvider } from './service/securityIssueProvider'
export { listScanResults, mapToAggregatedList } from './service/securityScanHandler'
export { CodeWhispererCodeCoverageTracker } from './tracker/codewhispererCodeCoverageTracker'
export { TelemetryHelper } from './util/telemetryHelper'
export { LineSelection, LineTracker } from './tracker/lineTracker'
export { BM25Okapi } from './util/supplementalContext/rankBm25'
export { handleExtraBrackets } from './util/closingBracketUtil'
export { runtimeLanguageContext, RuntimeLanguageContext } from './util/runtimeLanguageContext'
export * as startSecurityScan from './commands/startSecurityScan'
export * from './util/supplementalContext/utgUtils'
export * from './util/supplementalContext/crossFileContextUtil'
export * from './util/editorContext'
export * from './util/showSsoPrompt'
export * from './util/securityScanLanguageContext'
export * from './util/importAdderUtil'
export * from './util/globalStateUtil'
export * from './util/zipUtil'
export * from './util/commonUtil'
export * from './util/supplementalContext/codeParsingUtil'
export * from './util/supplementalContext/supplementalContextUtil'
export * from './util/codewhispererSettings'
export * as supplementalContextUtil from './util/supplementalContext/supplementalContextUtil'
export * from './service/diagnosticsProvider'
export * as diagnosticsProvider from './service/diagnosticsProvider'
export * from './ui/codeWhispererNodes'
export { SecurityScanError } from '../codewhisperer/models/errors'
export * as CodeWhispererConstants from '../codewhisperer/models/constants'
export { getSelectedCustomization, setSelectedCustomization, baseCustomization } from './util/customizationUtil'
export { Container } from './service/serviceContainer'
export * from './util/gitUtil'
