/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ArtifactMap, DefaultCodeWhispererClient } from '../client/codewhisperer'
import { isCloud9 } from '../../shared/extensionUtilities'
import { initSecurityScanRender } from '../service/diagnosticsProvider'
import { SecurityPanelViewProvider } from '../views/securityPanelViewProvider'
import { getLogger } from '../../shared/logger'
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
    codeScanState,
    CodeScanStoppedError,
    CodeScanTelemetryEntry,
} from '../models/model'
import { cancel, ok } from '../../shared/localizedText'
import { getDirSize } from '../../shared/filesystemUtilities'
import { telemetry } from '../../shared/telemetry/telemetry'
import { isAwsError } from '../../shared/errors'
import { openUrl } from '../../shared/utilities/vsCodeUtils'
import { AuthUtil } from '../util/authUtil'
import path from 'path'
import { ZipMetadata, ZipUtil } from '../util/zipUtil'
import { debounce } from 'lodash'
import { once } from '../../shared/utilities/functionUtils'
import { randomUUID } from '../../common/crypto'
import { CodeAnalysisScope } from '../models/constants'

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
    client: DefaultCodeWhispererClient,
    context: vscode.ExtensionContext
) {
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: CodeWhispererConstants.runningSecurityScan,
            cancellable: false,
        },
        async () => {
            await startSecurityScan(
                securityPanelViewProvider,
                undefined,
                client,
                context,
                CodeWhispererConstants.CodeAnalysisScope.PROJECT
            )
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
    scope: CodeWhispererConstants.CodeAnalysisScope
) {
    const logger = getLoggerForScope(scope)
    /**
     * Step 0: Initial Code Scan telemetry
     */
    const codeScanStartTime = performance.now()
    if (scope === CodeAnalysisScope.FILE) {
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
    }
    try {
        logger.verbose(`Starting security scan `)
        /**
         * Step 1: Generate zip
         */
        throwIfCancelled(scope, codeScanStartTime)
        const zipUtil = new ZipUtil()
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
        let artifactMap: ArtifactMap = {}
        const uploadStartTime = performance.now()
        const scanName = randomUUID()
        try {
            artifactMap = await getPresignedUrlAndUpload(client, zipMetadata, scope, scanName)
        } finally {
            await zipUtil.removeTmpFiles(zipMetadata, scope)
            codeScanTelemetryEntry.artifactsUploadDuration = performance.now() - uploadStartTime
        }

        /**
         * Step 3:  Create scan job
         */
        throwIfCancelled(scope, codeScanStartTime)
        serviceInvocationStartTime = performance.now()
        const scanJob = await createScanJob(
            client,
            artifactMap,
            codeScanTelemetryEntry.codewhispererLanguage,
            scope,
            scanName
        )
        if (scanJob.status === 'Failed') {
            logger.verbose(`Failed to create scan job due to service error`)
            throw new Error('Failed code scan service error')
        }
        logger.verbose(`Created security scan job.`)
        codeScanTelemetryEntry.codewhispererCodeScanJobId = scanJob.jobId

        /**
         * Step 4:  Polling mechanism on scan job status
         */
        throwIfCancelled(scope, codeScanStartTime)
        const jobStatus = await pollScanJobStatus(client, scanJob.jobId, scope, codeScanStartTime)
        if (jobStatus === 'Failed') {
            logger.verbose(`Security code scan status failed due to service error`)
            throw new Error('Failed code scan service error')
        }

        /**
         * Step 5: Process and render scan results
         */
        throwIfCancelled(scope, codeScanStartTime)
        logger.verbose(`Security scan job succeeded and start processing result.`)
        const securityRecommendationCollection = await listScanResults(
            client,
            scanJob.jobId,
            CodeWhispererConstants.codeScanFindingsSchema,
            projectPaths,
            scope
        )
        const { total, withFixes } = securityRecommendationCollection.reduce(
            (accumulator, current) => ({
                total: accumulator.total + current.issues.length,
                withFixes: accumulator.withFixes + current.issues.filter(i => i.suggestedFixes.length > 0).length,
            }),
            { total: 0, withFixes: 0 }
        )
        codeScanTelemetryEntry.codewhispererCodeScanTotalIssues = total
        codeScanTelemetryEntry.codewhispererCodeScanIssuesWithFixes = withFixes
        throwIfCancelled(scope, codeScanStartTime)
        logger.verbose(`Security scan totally found ${total} issues. ${withFixes} of them have fixes.`)
        showSecurityScanResults(
            securityPanelViewProvider,
            securityRecommendationCollection,
            editor,
            context,
            scope,
            zipMetadata,
            total
        )

        logger.verbose(`Security scan completed.`)
    } catch (error) {
        getLogger().error('Security scan failed.', error)
        if (error instanceof CodeScanStoppedError) {
            codeScanTelemetryEntry.result = 'Cancelled'
        } else {
            errorPromptHelper(error as Error, scope)
            codeScanTelemetryEntry.result = 'Failed'
        }

        if (isAwsError(error) && error.code === 'ThrottlingException') {
            if (
                scope === CodeAnalysisScope.PROJECT &&
                error.message.includes(CodeWhispererConstants.projectScansThrottlingMessage)
            ) {
                void vscode.window.showErrorMessage(CodeWhispererConstants.projectScansLimitReached)
                // TODO: Should we set a graphical state?
                // We shouldn't set vsCodeState.isFreeTierLimitReached here because it will hide CW and Q chat options.
            } else if (
                scope === CodeAnalysisScope.FILE &&
                error.message.includes(CodeWhispererConstants.fileScansThrottlingMessage)
            ) {
                getLogger().error(CodeWhispererConstants.fileScansLimitReached)
                CodeScansState.instance.setMonthlyQuotaExceeded()
            }
        }
        let telemetryErrorMessage = ''
        const errorMessage = (error as Error).message
        switch (errorMessage) {
            case "Amazon Q: Can't find valid source zip.":
                telemetryErrorMessage = 'Failed to create valid source zip'
                break
            default:
                if (errorMessage.startsWith('Amazon Q: The selected file is larger than')) {
                    telemetryErrorMessage = 'Payload size limit reached.'
                }
                break
        }
        codeScanTelemetryEntry.reason =
            telemetryErrorMessage !== ''
                ? telemetryErrorMessage
                : error instanceof Error && error.message !== null
                ? error.message
                : 'Security scan failed.'
    } finally {
        codeScanState.setToNotStarted()
        codeScanTelemetryEntry.duration = performance.now() - codeScanStartTime
        codeScanTelemetryEntry.codeScanServiceInvocationsDuration = performance.now() - serviceInvocationStartTime
        await emitCodeScanTelemetry(codeScanTelemetryEntry)
    }
}

export function showSecurityScanResults(
    securityPanelViewProvider: SecurityPanelViewProvider,
    securityRecommendationCollection: AggregatedCodeScanIssue[],
    editor: vscode.TextEditor | undefined,
    context: vscode.ExtensionContext,
    scope: CodeWhispererConstants.CodeAnalysisScope,
    zipMetadata: ZipMetadata,
    totalIssues: number
) {
    if (isCloud9()) {
        securityPanelViewProvider.addLines(securityRecommendationCollection, editor)
        void vscode.commands.executeCommand('workbench.view.extension.aws-codewhisperer-security-panel')
    } else {
        initSecurityScanRender(securityRecommendationCollection, context, editor, scope)
        if (scope === CodeWhispererConstants.CodeAnalysisScope.PROJECT) {
            void vscode.commands.executeCommand('workbench.action.problems.focus')
        }
    }
    if (scope === CodeWhispererConstants.CodeAnalysisScope.PROJECT) {
        populateCodeScanLogStream(zipMetadata.scannedFiles)
        showScanCompletedNotification(totalIssues, zipMetadata.scannedFiles, false)
    }
}

export async function emitCodeScanTelemetry(codeScanTelemetryEntry: CodeScanTelemetryEntry) {
    codeScanTelemetryEntry.codewhispererCodeScanProjectBytes = 0
    const now = performance.now()
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        codeScanTelemetryEntry.codewhispererCodeScanProjectBytes += await getDirSize(
            folder.uri.fsPath,
            now,
            CodeWhispererConstants.projectSizeCalculateTimeoutSeconds * 1000
        )
    }
    telemetry.codewhisperer_securityScan.emit({
        ...codeScanTelemetryEntry,
        passive: codeScanTelemetryEntry.codewhispererCodeScanScope === CodeAnalysisScope.FILE,
    })
}
const CodeScanErrorMessage = 'Amazon Q encountered an error while scanning for security issues. Try again later.'
export function errorPromptHelper(error: Error, scope: CodeAnalysisScope) {
    if (scope === CodeAnalysisScope.PROJECT) {
        if (
            error.message.startsWith('Amazon Q: The selected project is larger than') ||
            error.message.startsWith('Amazon Q: The selected fle is larger than')
        ) {
            void vscode.window.showWarningMessage(`${error}`, ok)
        } else {
            void vscode.window.showWarningMessage(CodeScanErrorMessage, ok)
        }
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

export async function confirmStopSecurityScan() {
    // Confirm if user wants to stop security scan
    const resp = await vscode.window.showWarningMessage(CodeWhispererConstants.stopScanMessage, stopScanButton, cancel)
    if (resp === stopScanButton && codeScanState.isRunning()) {
        getLogger().verbose('User requested to stop security scan. Stopping security scan.')
        codeScanState.setToCancelling()
    }
}

function showScanCompletedNotification(total: number, scannedFiles: Set<string>, isProjectTruncated: boolean) {
    const totalFiles = `${scannedFiles.size} ${scannedFiles.size === 1 ? 'file' : 'files'}`
    const totalIssues = `${total} ${total === 1 ? 'issue was' : 'issues were'}`
    const fileSizeLimitReached = isProjectTruncated ? 'File size limit reached.' : ''
    const learnMore = 'Learn More'
    const items = [CodeWhispererConstants.showScannedFilesMessage]
    if (isProjectTruncated) {
        items.push(learnMore)
    }
    void vscode.window
        .showInformationMessage(
            `Security scan completed for ${totalFiles}. ${totalIssues} found. ${fileSizeLimitReached}`,
            ...items
        )
        .then(value => {
            if (value === CodeWhispererConstants.showScannedFilesMessage) {
                const [, codeScanOutpuChan] = getLogOutputChan()
                codeScanOutpuChan.show()
            } else if (value === learnMore) {
                void openUrl(vscode.Uri.parse(CodeWhispererConstants.securityScanLearnMoreUri))
            }
        })
}
