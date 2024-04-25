/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { ToolkitError } from '../../shared/errors'
import { getIcon } from '../../shared/icons'
import {
    CodewhispererCompletionType,
    CodewhispererLanguage,
    CodewhispererTriggerType,
    Result,
} from '../../shared/telemetry/telemetry'
import { References } from '../client/codewhisperer'
import globals from '../../shared/extensionGlobals'
import { autoTriggerEnabledKey } from './constants'
import { get, set } from '../util/commonUtil'
import { ChatControllerEventEmitters } from '../../amazonqGumby/chat/controller/controller'
import { TransformationSteps } from '../client/codewhispereruserclient'

// unavoidable global variables
interface VsCodeState {
    /**
     * Flag indicates intelli sense pop up is active or not
     * Adding this since VS Code intelliSense API does not expose this variable
     */
    isIntelliSenseActive: boolean
    /**
     * Flag indicates whether codewhisperer is doing vscode.TextEditor.edit
     */
    isCodeWhispererEditing: boolean
    /**
     * Timestamp of previous user edit
     */
    lastUserModificationTime: number

    isFreeTierLimitReached: boolean
}

export const vsCodeState: VsCodeState = {
    isIntelliSenseActive: false,
    isCodeWhispererEditing: false,
    lastUserModificationTime: 0,
    isFreeTierLimitReached: false,
}

export type UtgStrategy = 'ByName' | 'ByContent'

export type CrossFileStrategy = 'OpenTabs_BM25'

export type SupplementalContextStrategy = CrossFileStrategy | UtgStrategy | 'Empty'

export interface CodeWhispererSupplementalContext {
    isUtg: boolean
    isProcessTimeout: boolean
    supplementalContextItems: CodeWhispererSupplementalContextItem[]
    contentsLength: number
    latency: number
    strategy: SupplementalContextStrategy
}

export interface CodeWhispererSupplementalContextItem {
    content: string
    filePath: string
    score?: number
}

// This response struct can contain more info as needed
export interface GetRecommendationsResponse {
    readonly result: 'Succeeded' | 'Failed'
    readonly recommendationCount: number
    readonly errorMessage: string | undefined
}

/** Manages the state of CodeWhisperer code suggestions */
export class CodeSuggestionsState {
    #context: vscode.Memento
    /** The initial state if suggestion state was not defined */
    #fallback: boolean
    #onDidChangeState = new vscode.EventEmitter<boolean>()
    /** Set a callback for when the state of code suggestions changes */
    onDidChangeState = this.#onDidChangeState.event

    static #instance: CodeSuggestionsState
    static get instance() {
        return (this.#instance ??= new this())
    }

    protected constructor(context: vscode.Memento = globals.context.globalState, fallback: boolean = false) {
        this.#context = context
        this.#fallback = fallback
    }

    async toggleSuggestions() {
        const autoTriggerEnabled = this.isSuggestionsEnabled()
        const toSet: boolean = !autoTriggerEnabled
        await set(autoTriggerEnabledKey, toSet, this.#context)
        this.#onDidChangeState.fire(toSet)
        return toSet
    }

    async setSuggestionsEnabled(isEnabled: boolean) {
        if (this.isSuggestionsEnabled() !== isEnabled) {
            await this.toggleSuggestions()
        }
    }

    isSuggestionsEnabled(): boolean {
        const isEnabled = get(autoTriggerEnabledKey, this.#context)
        return isEnabled !== undefined ? isEnabled : this.#fallback
    }
}

export interface AcceptedSuggestionEntry {
    readonly time: Date
    readonly fileUrl: vscode.Uri
    readonly originalString: string
    readonly startPosition: vscode.Position
    readonly endPosition: vscode.Position
    readonly requestId: string
    readonly sessionId: string
    readonly index: number
    readonly triggerType: CodewhispererTriggerType
    readonly completionType: CodewhispererCompletionType
    readonly language: CodewhispererLanguage
}

export interface OnRecommendationAcceptanceEntry {
    readonly editor: vscode.TextEditor | undefined
    readonly range: vscode.Range
    readonly effectiveRange: vscode.Range
    readonly acceptIndex: number
    readonly recommendation: string
    readonly requestId: string
    readonly sessionId: string
    readonly triggerType: CodewhispererTriggerType
    readonly completionType: CodewhispererCompletionType
    readonly language: CodewhispererLanguage
    readonly references: References | undefined
}

export interface ConfigurationEntry {
    readonly isShowMethodsEnabled: boolean
    readonly isManualTriggerEnabled: boolean
    readonly isAutomatedTriggerEnabled: boolean
    readonly isSuggestionsWithCodeReferencesEnabled: boolean
}

export interface InlineCompletionItem {
    content: string
    index: number
}

/**
 * Security Scan Interfaces
 */
enum CodeScanStatus {
    NotStarted,
    Running,
    Cancelling,
}

export class CodeScanState {
    // Define a constructor for this class
    private codeScanState: CodeScanStatus = CodeScanStatus.NotStarted

    public isNotStarted() {
        return this.codeScanState === CodeScanStatus.NotStarted
    }

    public isRunning() {
        return this.codeScanState === CodeScanStatus.Running
    }

    public isCancelling() {
        return this.codeScanState === CodeScanStatus.Cancelling
    }

    public setToNotStarted() {
        this.codeScanState = CodeScanStatus.NotStarted
    }

    public setToCancelling() {
        this.codeScanState = CodeScanStatus.Cancelling
    }

    public setToRunning() {
        this.codeScanState = CodeScanStatus.Running
    }

    public getPrefixTextForButton() {
        switch (this.codeScanState) {
            case CodeScanStatus.NotStarted:
                return 'Run'
            case CodeScanStatus.Running:
                return 'Stop'
            case CodeScanStatus.Cancelling:
                return 'Stopping'
        }
    }

    public getIconForButton() {
        switch (this.codeScanState) {
            case CodeScanStatus.NotStarted:
                return getIcon('vscode-debug-alt-small')
            case CodeScanStatus.Running:
                return getIcon('vscode-stop-circle')
            case CodeScanStatus.Cancelling:
                return getIcon('vscode-icons:loading~spin')
        }
    }
}

export const codeScanState: CodeScanState = new CodeScanState()

export class CodeScanStoppedError extends ToolkitError {
    constructor() {
        super('Security scan stopped by user.', { cancelled: true })
    }
}

// for internal use; store status of job
export enum TransformByQStatus {
    NotStarted = 'Not Started',
    Running = 'Running', // includes creating job, uploading code, analyzing, testing, transforming, etc.
    WaitingUserInput = 'WaitingForUserInput', // The human in the loop, this period is waiting for user input to continue
    Cancelled = 'Cancelled', // if user manually cancels
    Failed = 'Failed', // if job is rejected or if any other error experienced; user will receive specific error message
    Succeeded = 'Succeeded',
    PartiallySucceeded = 'Partially Succeeded',
}

export enum TransformByQReviewStatus {
    NotStarted = 'NotStarted',
    PreparingReview = 'PreparingReview',
    InReview = 'InReview',
}

export enum StepProgress {
    NotStarted = 'Not Started',
    Pending = 'Pending',
    Succeeded = 'Succeeded',
    Failed = 'Failed',
}

export enum JDKVersion {
    JDK8 = '8',
    JDK11 = '11',
    JDK17 = '17',
    UNSUPPORTED = 'UNSUPPORTED',
}

export enum BuildSystem {
    Maven = 'Maven',
    Gradle = 'Gradle',
    Unknown = 'Unknown',
}

export class ZipManifest {
    sourcesRoot: string = 'sources/'
    dependenciesRoot: string | undefined = 'dependencies/'
    buildLogs: string = 'build-logs.txt'
    version: string = '1.0'
    hilCapabilities: string[] = ['HIL_1pDependency_VersionUpgrade']
    constructor(dependencyPath?: FolderInfo) {
        if (dependencyPath) {
            // this.dependenciesRoot = `dependencies/${dependencyPath.name}/`
            console.log(dependencyPath)
        }
    }
}

export interface IHilZipManifestParams {
    pomGroupId: string
    pomArtifactId: string
    targetPomVersion: string
    dependenciesRoot?: string
}
export class HilZipManifest {
    hilCapability: string = 'HIL_1pDependency_VersionUpgrade'
    hilInput: IHilZipManifestParams = {
        pomGroupId: '',
        pomArtifactId: '',
        targetPomVersion: '',
        dependenciesRoot: 'dependencies/',
    }
    constructor({ pomGroupId, pomArtifactId, targetPomVersion }: IHilZipManifestParams, dependencyPath?: FolderInfo) {
        this.hilInput.pomGroupId = pomGroupId
        this.hilInput.pomArtifactId = pomArtifactId
        this.hilInput.targetPomVersion = targetPomVersion
        // if (dependencyPath) {
        //     this.hilInput.dependenciesRoot = `dependencies/${dependencyPath.name}/`
        // }
    }
}

export enum DropdownStep {
    STEP_1 = 1,
    STEP_2 = 2,
}

export const sessionPlanProgress: {
    startJob: StepProgress
    buildCode: StepProgress
    generatePlan: StepProgress
    transformCode: StepProgress
} = {
    startJob: StepProgress.NotStarted,
    buildCode: StepProgress.NotStarted,
    generatePlan: StepProgress.NotStarted,
    transformCode: StepProgress.NotStarted,
}

export class TransformByQState {
    private transformByQState: TransformByQStatus = TransformByQStatus.NotStarted

    private projectName: string = ''
    private projectPath: string = ''

    private jobId: string = ''

    private sourceJDKVersion: JDKVersion | undefined = undefined

    private targetJDKVersion: JDKVersion = JDKVersion.JDK17

    private planFilePath: string = ''
    private summaryFilePath: string = ''

    private resultArchiveFilePath: string = ''
    private projectCopyFilePath: string = ''

    private polledJobStatus: string = ''

    private jobFailureMetadata: string = ''

    private payloadFilePath: string = ''

    private jobFailureErrorNotification: string | undefined = undefined

    private jobFailureErrorChatMessage: string | undefined = undefined

    private errorLog: string = ''

    private mavenName: string = ''

    private javaHome: string | undefined = undefined

    private chatControllers: ChatControllerEventEmitters | undefined = undefined

    private dependencyFolderInfo: FolderInfo | undefined = undefined

    private planSteps: TransformationSteps | undefined = undefined

    public isNotStarted() {
        return this.transformByQState === TransformByQStatus.NotStarted
    }

    public isRunning() {
        return this.transformByQState === TransformByQStatus.Running
    }

    public isCancelled() {
        return this.transformByQState === TransformByQStatus.Cancelled
    }

    public isFailed() {
        return this.transformByQState === TransformByQStatus.Failed
    }

    public isSucceeded() {
        return this.transformByQState === TransformByQStatus.Succeeded
    }

    public isPartiallySucceeded() {
        return this.transformByQState === TransformByQStatus.PartiallySucceeded
    }

    public getProjectName() {
        return this.projectName
    }

    public getProjectPath() {
        return this.projectPath
    }

    public getJobId() {
        return this.jobId
    }

    public getSourceJDKVersion() {
        return this.sourceJDKVersion
    }

    public getTargetJDKVersion() {
        return this.targetJDKVersion
    }

    public getStatus() {
        return this.transformByQState
    }

    public getPolledJobStatus() {
        return this.polledJobStatus
    }

    public getPlanFilePath() {
        return this.planFilePath
    }

    public getSummaryFilePath() {
        return this.summaryFilePath
    }

    public getResultArchiveFilePath() {
        return this.resultArchiveFilePath
    }

    public getProjectCopyFilePath() {
        return this.projectCopyFilePath
    }

    public getJobFailureMetadata() {
        return this.jobFailureMetadata
    }

    public getPayloadFilePath() {
        return this.payloadFilePath
    }

    public getJobFailureErrorNotification() {
        return this.jobFailureErrorNotification
    }

    public getJobFailureErrorChatMessage() {
        return this.jobFailureErrorChatMessage
    }

    public getErrorLog() {
        return this.errorLog
    }

    public getMavenName() {
        return this.mavenName
    }

    public getJavaHome() {
        return this.javaHome
    }

    public getChatControllers() {
        return this.chatControllers
    }

    public getDependencyFolderInfo(): FolderInfo | undefined {
        return this.dependencyFolderInfo
    }

    public getPlanSteps() {
        return this.planSteps
    }

    public appendToErrorLog(message: string) {
        this.errorLog += `${message}\n\n`
    }

    public setToNotStarted() {
        this.transformByQState = TransformByQStatus.NotStarted
    }

    public setToRunning() {
        this.transformByQState = TransformByQStatus.Running
    }

    public setToCancelled() {
        this.transformByQState = TransformByQStatus.Cancelled
    }

    public setToFailed() {
        this.transformByQState = TransformByQStatus.Failed
    }

    public setToSucceeded() {
        this.transformByQState = TransformByQStatus.Succeeded
    }

    public setToPartiallySucceeded() {
        this.transformByQState = TransformByQStatus.PartiallySucceeded
    }

    public setProjectName(name: string) {
        this.projectName = name
    }

    public setProjectPath(path: string) {
        this.projectPath = path
    }

    public setJobId(id: string) {
        this.jobId = id
    }

    public setSourceJDKVersion(version: JDKVersion | undefined) {
        this.sourceJDKVersion = version
    }

    public setTargetJDKVersion(version: JDKVersion) {
        this.targetJDKVersion = version
    }

    public setPlanFilePath(filePath: string) {
        this.planFilePath = filePath
    }

    public setPolledJobStatus(status: string) {
        this.polledJobStatus = status
    }

    public setSummaryFilePath(filePath: string) {
        this.summaryFilePath = filePath
    }

    public setResultArchiveFilePath(filePath: string) {
        this.resultArchiveFilePath = filePath
    }

    public setProjectCopyFilePath(filePath: string) {
        this.projectCopyFilePath = filePath
    }

    public setJobFailureMetadata(data: string) {
        this.jobFailureMetadata = data
    }

    public setPayloadFilePath(payloadFilePath: string) {
        this.payloadFilePath = payloadFilePath
    }

    public setJobFailureErrorNotification(errorNotification: string) {
        this.jobFailureErrorNotification = errorNotification
    }

    public setJobFailureErrorChatMessage(errorChatMessage: string) {
        this.jobFailureErrorChatMessage = errorChatMessage
    }

    public setMavenName(mavenName: string) {
        this.mavenName = mavenName
    }

    public setJavaHome(javaHome: string) {
        this.javaHome = javaHome
    }

    public setChatControllers(controllers: ChatControllerEventEmitters) {
        this.chatControllers = controllers
    }

    public setDependencyFolderInfo(folderInfo: FolderInfo) {
        this.dependencyFolderInfo = folderInfo
    }

    public setPlanSteps(steps: TransformationSteps) {
        this.planSteps = steps
    }

    public resetPlanSteps() {
        this.planSteps = undefined
    }

    public getPrefixTextForButton() {
        switch (this.transformByQState) {
            case TransformByQStatus.NotStarted:
                return 'Run'
            case TransformByQStatus.Cancelled:
                return 'Stopping'
            default:
                return 'Stop'
        }
    }

    public getIconForButton() {
        switch (this.transformByQState) {
            case TransformByQStatus.NotStarted:
                return getIcon('vscode-play')
            default:
                return getIcon('vscode-stop-circle')
        }
    }

    public setJobDefaults() {
        this.setToNotStarted() // so that the "Transform by Q" button resets
        this.polledJobStatus = '' // reset polled job status too
        this.jobFailureErrorNotification = undefined
        this.jobFailureErrorChatMessage = undefined
        this.jobFailureMetadata = ''
        this.payloadFilePath = ''
        this.errorLog = ''
    }
}

export const transformByQState: TransformByQState = new TransformByQState()

export class TransformByQStoppedError extends ToolkitError {
    constructor() {
        super('Transform by Q stopped by user.', { cancelled: true })
    }
}

export interface CodeScanTelemetryEntry {
    codewhispererCodeScanJobId?: string
    codewhispererLanguage: CodewhispererLanguage
    codewhispererCodeScanProjectBytes?: number
    codewhispererCodeScanSrcPayloadBytes: number
    codewhispererCodeScanBuildPayloadBytes?: number
    codewhispererCodeScanSrcZipFileBytes: number
    codewhispererCodeScanBuildZipFileBytes?: number
    codewhispererCodeScanLines: number
    duration: number
    contextTruncationDuration: number
    artifactsUploadDuration: number
    codeScanServiceInvocationsDuration: number
    result: Result
    reason?: string
    codewhispererCodeScanTotalIssues: number
    codewhispererCodeScanIssuesWithFixes: number
    credentialStartUrl: string | undefined
}

export interface RecommendationDescription {
    text: string
    markdown: string
}

export interface Recommendation {
    text: string
    url: string
}

export interface SuggestedFix {
    description: string
    code: string
}

export interface Remediation {
    recommendation: Recommendation
    suggestedFixes: SuggestedFix[]
}

export interface RawCodeScanIssue {
    filePath: string
    startLine: number
    endLine: number
    title: string
    description: RecommendationDescription
    detectorId: string
    detectorName: string
    findingId: string
    ruleId?: string
    relatedVulnerabilities: string[]
    severity: string
    remediation: Remediation
}

export interface CodeScanIssue {
    startLine: number
    endLine: number
    comment: string
    title: string
    description: RecommendationDescription
    detectorId: string
    detectorName: string
    findingId: string
    ruleId?: string
    relatedVulnerabilities: string[]
    severity: string
    recommendation: Recommendation
    suggestedFixes: SuggestedFix[]
}

export interface AggregatedCodeScanIssue {
    filePath: string
    issues: CodeScanIssue[]
}

export interface SecurityPanelItem {
    path: string
    range: vscode.Range
    severity: vscode.DiagnosticSeverity
    message: string
    issue: CodeScanIssue
    decoration: vscode.DecorationOptions
}

export interface SecurityPanelSet {
    path: string
    uri: vscode.Uri
    items: SecurityPanelItem[]
}

export enum Cloud9AccessState {
    NoAccess,
    RequestedAccess,
    HasAccess,
}

export interface TransformationCandidateProject {
    name: string
    path: string
    JDKVersion?: JDKVersion
}

export interface FolderInfo {
    path: string
    name: string
}
