/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { ToolkitError } from '../../shared/errors'
import { getIcon, Icon } from '../../shared/icons'
import {
    CodewhispererCodeScanScope,
    CodewhispererCompletionType,
    CodewhispererLanguage,
    CodewhispererTriggerType,
    MetricBase,
    Result,
} from '../../shared/telemetry/telemetry'
import { References } from '../client/codewhisperer'
import globals from '../../shared/extensionGlobals'
import { ChatControllerEventEmitters } from '../../amazonqGumby/chat/controller/controller'
import { TransformationSteps } from '../client/codewhispereruserclient'
import { Messenger } from '../../amazonqGumby/chat/controller/messenger/messenger'
import { TestChatControllerEventEmitters } from '../../amazonqTest/chat/controller/controller'
import { ScanChatControllerEventEmitters } from '../../amazonqScan/controller'

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

export type CrossFileStrategy = 'opentabs' | 'codemap' | 'bm25' | 'default'

export type SupplementalContextStrategy = CrossFileStrategy | UtgStrategy | 'Empty'

export type PatchInfo = {
    name: string
    filename: string
    isSuccessful: boolean
}

export type DescriptionContent = {
    content: PatchInfo[]
}

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
    /** The initial state if suggestion state was not defined */
    #fallback: boolean
    #onDidChangeState = new vscode.EventEmitter<boolean>()
    /** Set a callback for when the state of code suggestions changes */
    onDidChangeState = this.#onDidChangeState.event

    static #instance: CodeSuggestionsState
    static get instance() {
        return (this.#instance ??= new this())
    }

    protected constructor(fallback: boolean = true) {
        this.#fallback = fallback
    }

    async toggleSuggestions() {
        const autoTriggerEnabled = this.isSuggestionsEnabled()
        const toSet: boolean = !autoTriggerEnabled
        await globals.globalState.update('CODEWHISPERER_AUTO_TRIGGER_ENABLED', toSet)
        this.#onDidChangeState.fire(toSet)
        return toSet
    }

    async setSuggestionsEnabled(isEnabled: boolean) {
        if (this.isSuggestionsEnabled() !== isEnabled) {
            await this.toggleSuggestions()
        }
    }

    isSuggestionsEnabled(): boolean {
        const isEnabled = globals.globalState.tryGet('CODEWHISPERER_AUTO_TRIGGER_ENABLED', Boolean)
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
 *  Q Security Scans
 */

enum ScanStatus {
    NotStarted,
    Running,
    Cancelling,
}

type IconPath = { light: vscode.Uri; dark: vscode.Uri; toString: () => string } | Icon

abstract class BaseScanState {
    protected scanState: ScanStatus = ScanStatus.NotStarted

    protected chatControllers: ScanChatControllerEventEmitters | undefined = undefined

    public isNotStarted(): boolean {
        return this.scanState === ScanStatus.NotStarted
    }

    public isRunning(): boolean {
        return this.scanState === ScanStatus.Running
    }

    public isCancelling(): boolean {
        return this.scanState === ScanStatus.Cancelling
    }

    public setToNotStarted(): void {
        this.scanState = ScanStatus.NotStarted
    }

    public setToCancelling(): void {
        this.scanState = ScanStatus.Cancelling
    }

    public setToRunning(): void {
        this.scanState = ScanStatus.Running
    }

    public getPrefixTextForButton(): string {
        switch (this.scanState) {
            case ScanStatus.NotStarted:
                return 'Run'
            case ScanStatus.Running:
                return 'Stop'
            case ScanStatus.Cancelling:
                return 'Stopping'
        }
    }

    public setChatControllers(controllers: ScanChatControllerEventEmitters) {
        this.chatControllers = controllers
    }
    public getChatControllers() {
        return this.chatControllers
    }

    public abstract getIconForButton(): IconPath
}

export class CodeScanState extends BaseScanState {
    public getIconForButton(): IconPath {
        switch (this.scanState) {
            case ScanStatus.NotStarted:
                return getIcon('vscode-debug-all')
            case ScanStatus.Running:
                return getIcon('vscode-stop-circle')
            case ScanStatus.Cancelling:
                return getIcon('vscode-loading~spin')
        }
    }
}

export class OnDemandFileScanState extends BaseScanState {
    public getIconForButton(): IconPath {
        switch (this.scanState) {
            case ScanStatus.NotStarted:
                return getIcon('vscode-debug-all')
            case ScanStatus.Running:
                return getIcon('vscode-stop-circle')
            case ScanStatus.Cancelling:
                return getIcon('vscode-icons:loading~spin')
        }
    }
}
export const codeScanState: CodeScanState = new CodeScanState()
export const onDemandFileScanState: OnDemandFileScanState = new OnDemandFileScanState()

export class CodeScansState {
    /** The initial state if scan state was not defined */
    #fallback: boolean
    #onDidChangeState = new vscode.EventEmitter<boolean>()
    /** Set a callback for when state of code scans changes */
    onDidChangeState = this.#onDidChangeState.event

    private exceedsMonthlyQuota = false
    private latestScanTime: number | undefined = undefined

    static #instance: CodeScansState
    static get instance() {
        return (this.#instance ??= new this())
    }

    protected constructor(fallback: boolean = true) {
        this.#fallback = fallback
    }

    async toggleScans() {
        const autoScansEnabled = this.isScansEnabled()
        const toSet: boolean = !autoScansEnabled
        await globals.globalState.update('CODEWHISPERER_AUTO_SCANS_ENABLED', toSet)
        this.#onDidChangeState.fire(toSet)
        return toSet
    }

    async setScansEnabled(isEnabled: boolean) {
        if (this.isScansEnabled() !== isEnabled) {
            await this.toggleScans()
        }
    }

    isScansEnabled(): boolean {
        const isEnabled = globals.globalState.tryGet('CODEWHISPERER_AUTO_SCANS_ENABLED', Boolean)
        return isEnabled !== undefined ? isEnabled : this.#fallback
    }

    setMonthlyQuotaExceeded() {
        this.exceedsMonthlyQuota = true
    }

    isMonthlyQuotaExceeded() {
        return this.exceedsMonthlyQuota
    }

    setLatestScanTime(time: number) {
        this.latestScanTime = time
    }

    getLatestScanTime() {
        return this.latestScanTime
    }
}

export class CodeScanStoppedError extends ToolkitError {
    constructor() {
        super('Security scan stopped by user.', { cancelled: true })
    }
}

export interface CodeScanTelemetryEntry extends MetricBase {
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
    reasonDesc?: string
    codewhispererCodeScanTotalIssues: number
    codewhispererCodeScanIssuesWithFixes: number
    credentialStartUrl: string | undefined
    codewhispererCodeScanScope: CodewhispererCodeScanScope
    source?: string
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
    code?: string
    references?: References
}

export interface Remediation {
    recommendation: Recommendation
    suggestedFixes: SuggestedFix[]
}

export interface CodeLine {
    content: string
    number: number
}

/**
 * Unit Test Generation
 */
enum TestGenStatus {
    NotStarted,
    Running,
    Cancelling,
}
// TODO: Refactor model of /scan and /test
export class TestGenState {
    // Define a constructor for this class
    private testGenState: TestGenStatus = TestGenStatus.NotStarted

    protected chatControllers: TestChatControllerEventEmitters | undefined = undefined

    public isNotStarted() {
        return this.testGenState === TestGenStatus.NotStarted
    }

    public isRunning() {
        return this.testGenState === TestGenStatus.Running
    }

    public isCancelling() {
        return this.testGenState === TestGenStatus.Cancelling
    }

    public setToNotStarted() {
        this.testGenState = TestGenStatus.NotStarted
    }

    public setToCancelling() {
        this.testGenState = TestGenStatus.Cancelling
    }

    public setToRunning() {
        this.testGenState = TestGenStatus.Running
    }

    public setChatControllers(controllers: TestChatControllerEventEmitters) {
        this.chatControllers = controllers
    }
    public getChatControllers() {
        return this.chatControllers
    }
}

export const testGenState: TestGenState = new TestGenState()

enum CodeFixStatus {
    NotStarted,
    Running,
    Cancelling,
}

export class CodeFixState {
    // Define a constructor for this class
    private codeFixState: CodeFixStatus = CodeFixStatus.NotStarted

    public isNotStarted() {
        return this.codeFixState === CodeFixStatus.NotStarted
    }

    public isRunning() {
        return this.codeFixState === CodeFixStatus.Running
    }

    public isCancelling() {
        return this.codeFixState === CodeFixStatus.Cancelling
    }

    public setToNotStarted() {
        this.codeFixState = CodeFixStatus.NotStarted
    }

    public setToCancelling() {
        this.codeFixState = CodeFixStatus.Cancelling
    }

    public setToRunning() {
        this.codeFixState = CodeFixStatus.Running
    }
}

export const codeFixState: CodeFixState = new CodeFixState()

/**
 * Security Scan Interfaces
 */

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
    codeSnippet: CodeLine[]
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
    visible: boolean
    scanJobId: string
    language: string
    fixJobId?: string
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

export const severities = ['Critical', 'High', 'Medium', 'Low', 'Info'] as const
export type Severity = (typeof severities)[number]

export interface SecurityIssueFilters {
    severity: {
        Critical: boolean
        High: boolean
        Medium: boolean
        Low: boolean
        Info: boolean
    }
}
const defaultVisibilityState: SecurityIssueFilters = {
    severity: {
        Critical: true,
        High: true,
        Medium: true,
        Low: true,
        Info: true,
    },
}

export class SecurityTreeViewFilterState {
    #fallback: SecurityIssueFilters
    #onDidChangeState = new vscode.EventEmitter<SecurityIssueFilters>()
    onDidChangeState = this.#onDidChangeState.event

    static #instance: SecurityTreeViewFilterState
    static get instance() {
        return (this.#instance ??= new this())
    }

    protected constructor(fallback: SecurityIssueFilters = defaultVisibilityState) {
        this.#fallback = fallback
    }

    public getState(): SecurityIssueFilters {
        return globals.globalState.tryGet('aws.amazonq.securityIssueFilters', Object) ?? this.#fallback
    }

    public async setState(state: SecurityIssueFilters) {
        await globals.globalState.update('aws.amazonq.securityIssueFilters', state)
        this.#onDidChangeState.fire(state)
    }

    public getHiddenSeverities() {
        return Object.entries(this.getState().severity)
            .filter(([_, value]) => !value)
            .map(([key]) => key)
    }

    public resetFilters() {
        return this.setState(defaultVisibilityState)
    }
}

/**
 *  Q - Transform
 */

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

export enum TransformationType {
    LANGUAGE_UPGRADE = 'Language Upgrade',
    SQL_CONVERSION = 'SQL Conversion',
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

export enum DB {
    ORACLE = 'ORACLE',
    RDS_POSTGRESQL = 'RDS_POSTGRESQL',
    AURORA_POSTGRESQL = 'AURORA_POSTGRESQL',
    OTHER = 'OTHER',
}

export enum BuildSystem {
    Maven = 'Maven',
    Gradle = 'Gradle',
    Unknown = 'Unknown',
}

export class ZipManifest {
    sourcesRoot: string = 'sources/'
    dependenciesRoot: string = 'dependencies/'
    buildLogs: string = 'build-logs.txt'
    version: string = '1.0'
    hilCapabilities: string[] = ['HIL_1pDependency_VersionUpgrade']
    transformCapabilities: string[] = ['EXPLAINABILITY_V1']
    customBuildCommand: string = 'clean test'
    requestedConversions?: {
        sqlConversion?: {
            source?: string
            target?: string
            schema?: string
            host?: string
            sctFileName?: string
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
    constructor({ pomGroupId, pomArtifactId, targetPomVersion }: IHilZipManifestParams) {
        this.hilInput.pomGroupId = pomGroupId
        this.hilInput.pomArtifactId = pomArtifactId
        this.hilInput.targetPomVersion = targetPomVersion
    }
}

export enum DropdownStep {
    STEP_1 = 1,
    STEP_2 = 2,
}

export const jobPlanProgress: {
    uploadCode: StepProgress
    buildCode: StepProgress
    generatePlan: StepProgress
    transformCode: StepProgress
} = {
    uploadCode: StepProgress.NotStarted,
    buildCode: StepProgress.NotStarted,
    generatePlan: StepProgress.NotStarted,
    transformCode: StepProgress.NotStarted,
}

export let sessionJobHistory: {
    [jobId: string]: { startTime: string; projectName: string; status: string; duration: string }
} = {}

export class TransformByQState {
    private transformByQState: TransformByQStatus = TransformByQStatus.NotStarted

    private transformationType: TransformationType | undefined = undefined

    private projectName: string = ''
    private projectPath: string = ''

    private startTime: string = ''

    private jobId: string = ''

    private sourceJDKVersion: JDKVersion | undefined = undefined

    private targetJDKVersion: JDKVersion = JDKVersion.JDK17

    private produceMultipleDiffs: boolean = false

    private customBuildCommand: string = ''

    private sourceDB: DB | undefined = undefined

    private targetDB: DB | undefined = undefined

    private schema: string = ''

    private schemaOptions: Set<string> = new Set()

    private sourceServerName: string = ''

    private metadataPathSQL: string = ''

    private linesOfCodeSubmitted: number | undefined = undefined

    private planFilePath: string = ''
    private summaryFilePath: string = ''
    private preBuildLogFilePath: string = ''

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
    private chatMessenger: Messenger | undefined = undefined

    private dependencyFolderInfo: FolderInfo | undefined = undefined

    private planSteps: TransformationSteps | undefined = undefined

    private intervalId: NodeJS.Timeout | undefined = undefined

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

    public getTransformationType() {
        return this.transformationType
    }

    public getProjectName() {
        return this.projectName
    }

    public getProjectPath() {
        return this.projectPath
    }

    public getCustomBuildCommand() {
        return this.customBuildCommand
    }

    public getLinesOfCodeSubmitted() {
        return this.linesOfCodeSubmitted
    }

    public getMultipleDiffs() {
        return this.produceMultipleDiffs
    }

    public getPreBuildLogFilePath() {
        return this.preBuildLogFilePath
    }

    public getStartTime() {
        return this.startTime
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

    public getSourceDB() {
        return this.sourceDB
    }

    public getTargetDB() {
        return this.targetDB
    }

    public getSchema() {
        return this.schema
    }

    public getSchemaOptions() {
        return this.schemaOptions
    }

    public getSourceServerName() {
        return this.sourceServerName
    }

    public getMetadataPathSQL() {
        return this.metadataPathSQL
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

    public getChatMessenger() {
        return this.chatMessenger
    }

    public getDependencyFolderInfo(): FolderInfo | undefined {
        return this.dependencyFolderInfo
    }

    public getPlanSteps() {
        return this.planSteps
    }

    public getIntervalId() {
        return this.intervalId
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

    public setTransformationType(type: TransformationType) {
        this.transformationType = type
    }

    public setProjectName(name: string) {
        this.projectName = name
    }

    public setProjectPath(path: string) {
        this.projectPath = path
    }

    public setCustomBuildCommand(command: string) {
        this.customBuildCommand = command
    }

    public setLinesOfCodeSubmitted(lines: number) {
        this.linesOfCodeSubmitted = lines
    }

    public setMultipleDiffs(produceMultipleDiffs: boolean) {
        this.produceMultipleDiffs = produceMultipleDiffs
    }

    public setStartTime(time: string) {
        this.startTime = time
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

    public setSourceDB(db: DB) {
        this.sourceDB = db
    }

    public setTargetDB(db: DB) {
        this.targetDB = db
    }

    public setSchema(schema: string) {
        this.schema = schema
    }

    public setSchemaOptions(schemaOptions: Set<string>) {
        this.schemaOptions = schemaOptions
    }

    public setSourceServerName(serverName: string) {
        this.sourceServerName = serverName
    }

    public setMetadataPathSQL(path: string) {
        this.metadataPathSQL = path
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

    public setChatMessenger(messenger: Messenger) {
        this.chatMessenger = messenger
    }

    public setDependencyFolderInfo(folderInfo: FolderInfo) {
        this.dependencyFolderInfo = folderInfo
    }

    public setIntervalId(id: NodeJS.Timeout | undefined) {
        this.intervalId = id
    }

    public setPlanSteps(steps: TransformationSteps) {
        this.planSteps = steps
    }

    public setPreBuildLogFilePath(path: string) {
        this.preBuildLogFilePath = path
    }

    public resetPlanSteps() {
        this.planSteps = undefined
    }

    public resetSessionJobHistory() {
        sessionJobHistory = {}
    }

    public setJobDefaults() {
        this.setToNotStarted()
        this.jobFailureErrorNotification = undefined
        this.jobFailureErrorChatMessage = undefined
        this.jobFailureMetadata = ''
        this.payloadFilePath = ''
        this.metadataPathSQL = ''
        this.sourceJDKVersion = undefined
        this.targetJDKVersion = JDKVersion.JDK17
        this.sourceDB = undefined
        this.targetDB = undefined
        this.sourceServerName = ''
        this.schemaOptions.clear()
        this.schema = ''
        this.errorLog = ''
        this.customBuildCommand = ''
        this.intervalId = undefined
        this.produceMultipleDiffs = false
    }
}

export const transformByQState: TransformByQState = new TransformByQState()

export class TransformByQStoppedError extends ToolkitError {
    constructor() {
        super('Transform by Q stopped by user.', { cancelled: true })
    }
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

export interface ShortAnswerReference {
    licenseName?: string
    repository?: string
    url?: string
    recommendationContentSpan?: {
        start: number
        end: number
    }
}

export interface ShortAnswer {
    testFilePath: string
    buildCommands: string[]
    planSummary: string
    sourceFilePath?: string
    testFramework?: string
    executionCommands?: string[]
    testCoverage?: number
    stopIteration?: string
    errorMessage?: string
    codeReferences?: ShortAnswerReference[]
    numberOfTestMethods?: number
}
