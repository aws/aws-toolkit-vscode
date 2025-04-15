/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ArtifactMap, DefaultCodeWhispererClient } from '../client/codewhisperer'
import { initSecurityScanRender } from '../service/diagnosticsProvider'
import { SecurityPanelViewProvider } from '../views/securityPanelViewProvider'
import { getLogger } from '../../shared/logger/logger'
import { makeLogger } from '../../shared/logger/activation'
import * as CodeWhispererConstants from '../models/constants'
import {
    getPresignedUrlAndUpload,
    createScanJob,
    pollScanJobStatus,
    listScanResults,
    throwIfCancelled,
    getLoggerForScope,
} from '../service/securityScanHandler'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'
import {
    AggregatedCodeScanIssue,
    CodeScansState,
    CodeScanState,
    codeScanState,
    CodeScanStoppedError,
    CodeScanTelemetryEntry,
    onDemandFileScanState,
    OnDemandFileScanState,
} from '../models/model'
import { cancel, ok } from '../../shared/localizedText'
import { telemetry } from '../../shared/telemetry/telemetry'
import { ToolkitError, getTelemetryReasonDesc, isAwsError } from '../../shared/errors'
import { AuthUtil } from '../util/authUtil'
import path from 'path'
import { ZipMetadata, ZipUtil } from '../util/zipUtil'
import { debounce } from 'lodash'
import { once } from '../../shared/utilities/functionUtils'
import { randomUUID } from '../../shared/crypto'
import { CodeAnalysisScope, ProjectSizeExceededErrorMessage, SecurityScanStep } from '../models/constants'
import {
    CodeScanJobFailedError,
    CreateCodeScanFailedError,
    MaximumFileScanReachedError,
    MaximumProjectScanReachedError,
    SecurityScanError,
} from '../models/errors'
import { SecurityIssueTreeViewProvider } from '../service/securityIssueTreeViewProvider'
import { ChatSessionManager } from '../../amazonqScan/chat/storages/chatSession'
import { TelemetryHelper } from '../util/telemetryHelper'

const localize = nls.loadMessageBundle()
export const stopScanButton = localize('aws.codewhisperer.stopscan', 'Stop Scan')

/**
 * Creates the vscode OutputChannel and Toolkit logger used by Security Scan, exactly once.
 *
 * To avoid cluttering the Output channels list, do not call this until it's actually needed.
 *
 * @returns Logger and OutputChannel created on the first invocation.
 */
const getLogOutputChan = once(() => {
    const codeScanOutpuChan = vscode.window.createOutputChannel('Amazon Q Security Scan Logs')
    const codeScanLogger = makeLogger({
        logLevel: 'info',
        outputChannels: [codeScanOutpuChan],
    })
    return [codeScanLogger, codeScanOutpuChan] as const
})

export function startSecurityScanWithProgress(
    securityPanelViewProvider: SecurityPanelViewProvider,
    editor: vscode.TextEditor | undefined,
    client: DefaultCodeWhispererClient,
    context: vscode.ExtensionContext,
    scope: CodeWhispererConstants.CodeAnalysisScope,
    initiatedByChat: boolean
) {
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title:
                scope === CodeWhispererConstants.CodeAnalysisScope.PROJECT
                    ? CodeWhispererConstants.runningSecurityScan
                    : CodeWhispererConstants.runningFileScan,
            cancellable: false,
        },
        async () => {
            await startSecurityScan(securityPanelViewProvider, editor, client, context, scope, initiatedByChat)
        }
    )
}

export const debounceStartSecurityScan = debounce(
    startSecurityScan,
    CodeWhispererConstants.autoScanDebounceDelaySeconds * 1000
)

export async function startSecurityScan(
    securityPanelViewProvider: SecurityPanelViewProvider,
    editor: vscode.TextEditor | undefined,
    client: DefaultCodeWhispererClient,
    context: vscode.ExtensionContext,
    scope: CodeWhispererConstants.CodeAnalysisScope,
    initiatedByChat: boolean,
    zipUtil: ZipUtil = new ZipUtil(),
    scanUuid?: string
) {
    const profile = AuthUtil.instance.regionProfileManager.activeRegionProfile
    const logger = getLoggerForScope(scope)
    /**
     * Step 0: Initial Code Scan telemetry
     */
    const codeScanStartTime = performance.now()
    if (scope === CodeAnalysisScope.FILE_AUTO) {
        CodeScansState.instance.setLatestScanTime(codeScanStartTime)
    }
    let serviceInvocationStartTime = 0
    const codeScanTelemetryEntry: CodeScanTelemetryEntry = {
        codewhispererLanguage: editor
            ? runtimeLanguageContext.getLanguageContext(
                  editor.document.languageId,
                  path.extname(editor.document.fileName)
              ).language
            : 'plaintext',
        codewhispererCodeScanSrcPayloadBytes: 0,
        codewhispererCodeScanSrcZipFileBytes: 0,
        codewhispererCodeScanLines: 0,
        duration: 0,
        contextTruncationDuration: 0,
        artifactsUploadDuration: 0,
        codeScanServiceInvocationsDuration: 0,
        result: 'Succeeded',
        codewhispererCodeScanTotalIssues: 0,
        codewhispererCodeScanIssuesWithFixes: 0,
        credentialStartUrl: AuthUtil.instance.startUrl,
        codewhispererCodeScanScope: scope,
        source: initiatedByChat ? 'chat' : 'menu',
    }
    const fileName = editor?.document.fileName
    const scanState = scope === CodeAnalysisScope.PROJECT ? codeScanState : onDemandFileScanState
    try {
        logger.verbose(`Starting security scan `)
        /**
         * Step 1: Generate zip
         */
        throwIfCancelled(scope, codeScanStartTime)
        if (initiatedByChat) {
            scanState.getChatControllers()?.scanProgress.fire({
                tabID: ChatSessionManager.Instance.getSession().tabID,
                step: SecurityScanStep.GENERATE_ZIP,
                scope,
                fileName,
                scanUuid,
            })
        }
        const zipMetadata = await zipUtil.generateZip(editor?.document.uri, scope)
        const projectPaths = zipUtil.getProjectPaths()

        const contextTruncationStartTime = performance.now()
        codeScanTelemetryEntry.contextTruncationDuration = performance.now() - contextTruncationStartTime
        logger.verbose(`Complete project context processing.`)
        codeScanTelemetryEntry.codewhispererCodeScanSrcPayloadBytes = zipMetadata.srcPayloadSizeInBytes
        codeScanTelemetryEntry.codewhispererCodeScanBuildPayloadBytes = zipMetadata.buildPayloadSizeInBytes
        codeScanTelemetryEntry.codewhispererCodeScanSrcZipFileBytes = zipMetadata.zipFileSizeInBytes
        codeScanTelemetryEntry.codewhispererCodeScanLines = zipMetadata.lines
        if (zipMetadata.language) {
            codeScanTelemetryEntry.codewhispererLanguage = zipMetadata.language
        }

        /**
         * Step 2: Get presigned Url, upload and clean up
         */

        throwIfCancelled(scope, codeScanStartTime)
        if (initiatedByChat) {
            scanState.getChatControllers()?.scanProgress.fire({
                tabID: ChatSessionManager.Instance.getSession().tabID,
                step: SecurityScanStep.UPLOAD_TO_S3,
                scope,
                fileName,
                scanUuid,
            })
        }
        let artifactMap: ArtifactMap = {}
        const uploadStartTime = performance.now()
        const scanName = randomUUID()
        try {
            artifactMap = await getPresignedUrlAndUpload(client, zipMetadata, scope, scanName, profile)
        } finally {
            await zipUtil.removeTmpFiles(zipMetadata, scope)
            codeScanTelemetryEntry.artifactsUploadDuration = performance.now() - uploadStartTime
        }

        /**
         * Step 3:  Create scan job
         */
        throwIfCancelled(scope, codeScanStartTime)
        if (initiatedByChat) {
            scanState.getChatControllers()?.scanProgress.fire({
                tabID: ChatSessionManager.Instance.getSession().tabID,
                step: SecurityScanStep.CREATE_SCAN_JOB,
                scope,
                fileName,
                scanUuid,
            })
        }
        serviceInvocationStartTime = performance.now()
        const scanJob = await createScanJob(
            client,
            artifactMap,
            codeScanTelemetryEntry.codewhispererLanguage,
            scope,
            scanName,
            profile
        )
        if (scanJob.status === 'Failed') {
            logger.verbose(`${scanJob.errorMessage}`)
            const errorMessage = scanJob.errorMessage ?? 'CreateCodeScanFailed'
            throw new CreateCodeScanFailedError(errorMessage)
        }
        logger.verbose(`Created security scan job.`)
        codeScanTelemetryEntry.codewhispererCodeScanJobId = scanJob.jobId

        /**
         * Step 4:  Polling mechanism on scan job status
         */
        throwIfCancelled(scope, codeScanStartTime)
        if (initiatedByChat) {
            scanState.getChatControllers()?.scanProgress.fire({
                tabID: ChatSessionManager.Instance.getSession().tabID,
                step: SecurityScanStep.POLL_SCAN_STATUS,
                scope,
                fileName,
                scanUuid,
            })
        }
        // pass profile
        const jobStatus = await pollScanJobStatus(client, scanJob.jobId, scope, codeScanStartTime, profile)
        if (jobStatus === 'Failed') {
            logger.verbose(`Security scan failed.`)
            throw new CodeScanJobFailedError()
        }

        /**
         * Step 5: Process and render scan results
         */
        throwIfCancelled(scope, codeScanStartTime)
        if (initiatedByChat) {
            scanState.getChatControllers()?.scanProgress.fire({
                tabID: ChatSessionManager.Instance.getSession().tabID,
                step: SecurityScanStep.PROCESS_SCAN_RESULTS,
                scope,
                fileName,
                scanUuid,
            })
        }
        logger.verbose(`Security scan job succeeded and start processing result.`)
        const securityRecommendationCollection = await listScanResults(
            client,
            scanJob.jobId,
            CodeWhispererConstants.codeScanFindingsSchema,
            projectPaths,
            scope,
            editor,
            profile
        )
        for (const issue of securityRecommendationCollection
            .flatMap(({ issues }) => issues)
            .filter(({ visible, autoDetected }) => visible && !autoDetected)) {
            telemetry.codewhisperer_codeScanIssueDetected.emit({
                autoDetected: issue.autoDetected,
                codewhispererCodeScanJobId: issue.scanJobId,
                detectorId: issue.detectorId,
                findingId: issue.findingId,
                includesFix: issue.suggestedFixes.length > 0,
                ruleId: issue.ruleId,
                result: 'Succeeded',
            })
        }
        const { total, withFixes } = securityRecommendationCollection.reduce(
            (accumulator, current) => ({
                total: accumulator.total + current.issues.length,
                withFixes: accumulator.withFixes + current.issues.filter((i) => i.suggestedFixes.length > 0).length,
            }),
            { total: 0, withFixes: 0 }
        )
        codeScanTelemetryEntry.codewhispererCodeScanTotalIssues = total
        codeScanTelemetryEntry.codewhispererCodeScanIssuesWithFixes = withFixes
        throwIfCancelled(scope, codeScanStartTime)
        logger.verbose(`Security scan totally found ${total} issues. ${withFixes} of them have fixes.`)
        /**
         * initiatedByChat is true for PROJECT and FILE_ON_DEMAND scopes,
         * initiatedByChat is false for PROJECT and FILE_AUTO scopes
         */
        if (initiatedByChat) {
            showScanResultsInChat(
                securityPanelViewProvider,
                securityRecommendationCollection,
                editor,
                context,
                scope,
                zipMetadata,
                total,
                scanUuid
            )
        } else {
            showSecurityScanResults(securityRecommendationCollection, editor, context, scope, zipMetadata, total)
        }
        TelemetryHelper.instance.sendCodeScanSucceededEvent(
            codeScanTelemetryEntry.codewhispererLanguage,
            scanJob.jobId,
            total,
            scope
        )

        logger.verbose(`Security scan completed.`)
    } catch (error) {
        getLogger().error('Security scan failed. %O', error)
        if (error instanceof CodeScanStoppedError) {
            codeScanState.getChatControllers()?.scanCancelled.fire({
                tabID: ChatSessionManager.Instance.getSession().tabID,
                scanUuid,
            })
            codeScanTelemetryEntry.result = 'Cancelled'
        } else if (isAwsError(error) && error.code === 'ThrottlingException') {
            codeScanTelemetryEntry.result = 'Failed'
            if (
                scope === CodeAnalysisScope.PROJECT &&
                error.message.includes(CodeWhispererConstants.scansLimitReachedErrorMessage)
            ) {
                const maximumProjectScanReachedError = new MaximumProjectScanReachedError()
                getLogger().error(maximumProjectScanReachedError.customerFacingMessage)
                errorPromptHelper(maximumProjectScanReachedError, scope, initiatedByChat, fileName, scanUuid)
                // TODO: Should we set a graphical state?
                // We shouldn't set vsCodeState.isFreeTierLimitReached here because it will hide CW and Q chat options.
            } else if (scope === CodeAnalysisScope.PROJECT) {
                getLogger().error(error.message)
                errorPromptHelper(
                    new SecurityScanError(
                        error.code,
                        (error as any).statusCode?.toString() ?? '',
                        'Too many requests, please wait before trying again.'
                    ),
                    scope,
                    initiatedByChat,
                    fileName,
                    scanUuid
                )
            } else {
                const maximumFileScanReachedError = new MaximumFileScanReachedError()
                getLogger().error(maximumFileScanReachedError.customerFacingMessage)
                errorPromptHelper(maximumFileScanReachedError, scope, initiatedByChat, fileName, scanUuid)
                CodeScansState.instance.setMonthlyQuotaExceeded()
            }
        } else {
            codeScanTelemetryEntry.result = 'Failed'
            errorPromptHelper(
                new SecurityScanError(
                    (error as any).code ?? 'unknown error',
                    (error as any).statusCode?.toString() ?? '',
                    'Encountered an unexpected error when processing the request, please try again'
                ),
                scope,
                initiatedByChat,
                fileName
            )
        }
        codeScanTelemetryEntry.reasonDesc =
            (error as ToolkitError)?.code === 'ContentLengthError'
                ? 'Payload size limit reached'
                : getTelemetryReasonDesc(error)
        codeScanTelemetryEntry.reason = (error as ToolkitError)?.code ?? 'DefaultError'
        if (codeScanTelemetryEntry.codewhispererCodeScanJobId) {
            TelemetryHelper.instance.sendCodeScanFailedEvent(
                codeScanTelemetryEntry.codewhispererLanguage,
                codeScanTelemetryEntry.codewhispererCodeScanJobId,
                scope
            )
        }
    } finally {
        const scanState = scope === CodeAnalysisScope.PROJECT ? codeScanState : onDemandFileScanState
        scanState.setToNotStarted()
        scanState.getChatControllers()?.scanStopped.fire({
            tabID: ChatSessionManager.Instance.getSession().tabID,
            scanUuid,
        })
        codeScanTelemetryEntry.duration = performance.now() - codeScanStartTime
        codeScanTelemetryEntry.codeScanServiceInvocationsDuration = performance.now() - serviceInvocationStartTime
        await emitCodeScanTelemetry(codeScanTelemetryEntry)
    }
}

export function showSecurityScanResults(
    securityRecommendationCollection: AggregatedCodeScanIssue[],
    editor: vscode.TextEditor | undefined,
    context: vscode.ExtensionContext,
    scope: CodeWhispererConstants.CodeAnalysisScope,
    zipMetadata: ZipMetadata,
    totalIssues: number
) {
    initSecurityScanRender(securityRecommendationCollection, context, editor, scope)

    if (scope === CodeWhispererConstants.CodeAnalysisScope.PROJECT) {
        populateCodeScanLogStream(zipMetadata.scannedFiles)
    }
}

export function showScanResultsInChat(
    securityPanelViewProvider: SecurityPanelViewProvider,
    securityRecommendationCollection: AggregatedCodeScanIssue[],
    editor: vscode.TextEditor | undefined,
    context: vscode.ExtensionContext,
    scope: CodeWhispererConstants.CodeAnalysisScope,
    zipMetadata: ZipMetadata,
    totalIssues: number,
    scanUuid: string | undefined
) {
    const tabID = ChatSessionManager.Instance.getSession().tabID
    const eventData = {
        message: 'Show Findings in the Chat panel',
        totalIssues,
        securityRecommendationCollection,
        fileName: scope === CodeAnalysisScope.FILE_ON_DEMAND ? [...zipMetadata.scannedFiles][0] : undefined,
        tabID,
        scope,
        scanUuid,
    }
    switch (scope) {
        case CodeAnalysisScope.PROJECT:
            codeScanState.getChatControllers()?.showSecurityScan.fire(eventData)
            break
        case CodeAnalysisScope.FILE_ON_DEMAND:
            onDemandFileScanState.getChatControllers()?.showSecurityScan.fire(eventData)
            break
        default:
            break
    }

    initSecurityScanRender(securityRecommendationCollection, context, editor, scope)
    if (totalIssues > 0) {
        SecurityIssueTreeViewProvider.focus()
    }

    populateCodeScanLogStream(zipMetadata.scannedFiles)
    if (scope === CodeAnalysisScope.PROJECT) {
        showScanCompletedNotification(totalIssues, zipMetadata.scannedFiles)
    }
}

export async function emitCodeScanTelemetry(codeScanTelemetryEntry: CodeScanTelemetryEntry) {
    codeScanTelemetryEntry.codewhispererCodeScanProjectBytes = 0
    telemetry.codewhisperer_securityScan.emit({
        ...codeScanTelemetryEntry,
        passive: codeScanTelemetryEntry.codewhispererCodeScanScope === CodeAnalysisScope.FILE_AUTO,
    })
}

export function errorPromptHelper(
    error: SecurityScanError,
    scope: CodeAnalysisScope,
    initiatedByChat: boolean,
    fileName?: string,
    scanUuid?: string
) {
    if (scope === CodeAnalysisScope.FILE_AUTO) {
        return
    }
    if (initiatedByChat) {
        const state = scope === CodeAnalysisScope.PROJECT ? codeScanState : onDemandFileScanState
        state.getChatControllers()?.errorThrown.fire({
            error,
            tabID: ChatSessionManager.Instance.getSession().tabID,
            scope,
            fileName,
            scanUuid,
        })
    }
    if (error.code !== 'NoSourceFilesError') {
        void vscode.window.showWarningMessage(getErrorMessage(error), ok)
    }
}

function getErrorMessage(error: any): string {
    switch (error.code) {
        case 'ContentLengthError':
            return ProjectSizeExceededErrorMessage
        case 'MaximumProjectScanReachedError':
        case 'MaximumFileScanReachedError':
            return CodeWhispererConstants.monthlyLimitReachedNotification
        default:
            return error.customerFacingMessage
    }
}

function populateCodeScanLogStream(scannedFiles: Set<string>) {
    const [codeScanLogger, codeScanOutpuChan] = getLogOutputChan()
    const numScannedFiles = scannedFiles.size
    // Clear log
    codeScanOutpuChan.clear()
    if (numScannedFiles === 1) {
        codeScanLogger.info(`${numScannedFiles} file was scanned during the last Security Scan.`)
    } else {
        codeScanLogger.info(`${numScannedFiles} files were scanned during the last Security Scan.`)
    }
    // Log all the scanned files to codeScanLogger
    for (const file of scannedFiles) {
        const uri = vscode.Uri.file(file)
        codeScanLogger.info(`File scanned: ${uri.fsPath}`)
    }
}

export async function confirmStopSecurityScan(
    state: CodeScanState | OnDemandFileScanState,
    initiatedByChat: boolean,
    scope: CodeWhispererConstants.CodeAnalysisScope,
    fileName: string | undefined,
    scanUuid?: string
) {
    // Confirm if user wants to stop security scan
    const resp = await vscode.window.showWarningMessage(CodeWhispererConstants.stopScanMessage, stopScanButton, cancel)
    if (resp === stopScanButton && state.isRunning()) {
        getLogger().verbose('User requested to stop security scan. Stopping security scan.')
        state.setToCancelling()
        if (initiatedByChat) {
            const scanState = scope === CodeAnalysisScope.PROJECT ? codeScanState : onDemandFileScanState
            const scopeText = scope === CodeAnalysisScope.PROJECT ? 'Project' : 'File'
            scanState.getChatControllers()?.errorThrown.fire({
                error: scopeText + CodeWhispererConstants.stopScanMessageInChat,
                tabID: ChatSessionManager.Instance.getSession().tabID,
                scope,
                fileName,
            })
        }
    }
}

function showScanCompletedNotification(total: number, scannedFiles: Set<string>) {
    const items = [CodeWhispererConstants.showScannedFilesMessage]
    void vscode.window.showInformationMessage(`Code Review Completed`, ...items).then((value) => {
        if (total > 0 && value === CodeWhispererConstants.showScannedFilesMessage) {
            SecurityIssueTreeViewProvider.focus()
        }
    })
}
