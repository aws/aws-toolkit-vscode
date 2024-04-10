/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ArtifactMap, DefaultCodeWhispererClient } from '../client/codewhisperer'
import { isCloud9 } from '../../shared/extensionUtilities'
import { initSecurityScanRender, securityScanRender } from '../service/diagnosticsProvider'
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
} from '../service/securityScanHandler'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'
import { AggregatedCodeScanIssue, codeScanState, CodeScanTelemetryEntry } from '../models/model'
import { cancel, ok } from '../../shared/localizedText'
import { getFileExt } from '../util/commonUtil'
import { getDirSize } from '../../shared/filesystemUtilities'
import { telemetry } from '../../shared/telemetry/telemetry'
import { isAwsError } from '../../shared/errors'
import { openUrl } from '../../shared/utilities/vsCodeUtils'
import { AuthUtil } from '../util/authUtil'
import path from 'path'
import { ZipMetadata, ZipUtil } from '../util/zipUtil'
import { debounce } from 'lodash'
import { once } from '../../shared/utilities/functionUtils'

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
    const codeScanOutpuChan = vscode.window.createOutputChannel('CodeWhisperer Security Scan Logs')
    const codeScanLogger = makeLogger({
        outputChannels: [codeScanOutpuChan],
    })
    return [codeScanLogger, codeScanOutpuChan] as const
})

export function startSecurityScanWithProgress(
    securityPanelViewProvider: SecurityPanelViewProvider,
    editor: vscode.TextEditor,
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
                editor,
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
    editor: vscode.TextEditor,
    client: DefaultCodeWhispererClient,
    context: vscode.ExtensionContext,
    scope: CodeWhispererConstants.CodeAnalysisScope
) {
    /**
     * Step 0: Initial Code Scan telemetry
     */
    const codeScanStartTime = performance.now()
    let serviceInvocationStartTime = 0
    const codeScanTelemetryEntry: CodeScanTelemetryEntry = {
        codewhispererLanguage: runtimeLanguageContext.getLanguageContext(
            editor.document.languageId,
            path.extname(editor.document.fileName)
        ).language,
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
    }
    try {
        getLogger().verbose(`Starting security scan `)
        /**
         * Step 1: Generate zip
         */
        throwIfCancelled(scope)
        const zipUtil = new ZipUtil()
        const zipMetadata = await zipUtil.generateZip(editor.document.uri, scope)
        const projectPath = zipUtil.getProjectPath(editor.document.uri)

        const contextTruncationStartTime = performance.now()
        codeScanTelemetryEntry.contextTruncationDuration = performance.now() - contextTruncationStartTime
        getLogger().verbose(`Complete project context processing.`)
        codeScanTelemetryEntry.codewhispererCodeScanSrcPayloadBytes = zipMetadata.srcPayloadSizeInBytes
        codeScanTelemetryEntry.codewhispererCodeScanBuildPayloadBytes = zipMetadata.buildPayloadSizeInBytes
        codeScanTelemetryEntry.codewhispererCodeScanSrcZipFileBytes = zipMetadata.zipFileSizeInBytes
        codeScanTelemetryEntry.codewhispererCodeScanLines = zipMetadata.lines

        /**
         * Step 2: Get presigned Url, upload and clean up
         */
        throwIfCancelled(scope)
        let artifactMap: ArtifactMap = {}
        const uploadStartTime = performance.now()
        try {
            artifactMap = await getPresignedUrlAndUpload(client, zipMetadata)
        } catch (error) {
            getLogger().error('Failed to upload code artifacts', error)
            throw error
        } finally {
            await zipUtil.removeTmpFiles(zipMetadata)
            codeScanTelemetryEntry.artifactsUploadDuration = performance.now() - uploadStartTime
        }

        /**
         * Step 3:  Create scan job
         */
        throwIfCancelled(scope)
        serviceInvocationStartTime = performance.now()
        const scanJob = await createScanJob(client, artifactMap, codeScanTelemetryEntry.codewhispererLanguage, scope)
        if (scanJob.status === 'Failed') {
            throw new Error(scanJob.errorMessage)
        }
        getLogger().verbose(`Created security scan job.`)
        codeScanTelemetryEntry.codewhispererCodeScanJobId = scanJob.jobId

        /**
         * Step 4:  Polling mechanism on scan job status
         */
        throwIfCancelled(scope)
        const jobStatus = await pollScanJobStatus(client, scanJob.jobId, scope)
        if (jobStatus === 'Failed') {
            throw new Error('Security scan job failed.')
        }

        /**
         * Step 5: Process and render scan results
         */
        throwIfCancelled(scope)
        getLogger().verbose(`Security scan job succeeded and start processing result.`)
        const securityRecommendationCollection = await listScanResults(
            client,
            scanJob.jobId,
            CodeWhispererConstants.codeScanFindingsSchema,
            projectPath
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
        throwIfCancelled(scope)
        getLogger().verbose(`Security scan totally found ${total} issues. ${withFixes} of them have fixes.`)
        if (codeScanStartTime > securityScanRender.lastUpdated) {
            showSecurityScanResults(
                securityPanelViewProvider,
                securityRecommendationCollection,
                editor,
                context,
                scope,
                zipMetadata,
                total,
                codeScanStartTime
            )
        } else {
            getLogger().verbose('Received issues from older scan, discarding the results')
        }

        getLogger().verbose(`Security scan completed.`)
    } catch (error) {
        getLogger().error('Security scan failed.', error)
        if (codeScanState.isCancelling()) {
            codeScanTelemetryEntry.result = 'Cancelled'
        } else {
            errorPromptHelper(error as Error)
            codeScanTelemetryEntry.result = 'Failed'
        }

        if (isAwsError(error)) {
            if (
                error.code === 'ThrottlingException' &&
                error.message.includes(CodeWhispererConstants.throttlingMessage)
            ) {
                void vscode.window.showErrorMessage(CodeWhispererConstants.freeTierLimitReachedCodeScan)
                // TODO: Should we set a graphical state?
                // We shouldn't set vsCodeState.isFreeTierLimitReached here because it will hide CW and Q chat options.
            }
        }
        codeScanTelemetryEntry.reason = (error as Error).message
    } finally {
        codeScanState.setToNotStarted()
        codeScanTelemetryEntry.duration = performance.now() - codeScanStartTime
        codeScanTelemetryEntry.codeScanServiceInvocationsDuration = performance.now() - serviceInvocationStartTime
        await emitCodeScanTelemetry(editor, codeScanTelemetryEntry)
    }
}

export function showSecurityScanResults(
    securityPanelViewProvider: SecurityPanelViewProvider,
    securityRecommendationCollection: AggregatedCodeScanIssue[],
    editor: vscode.TextEditor,
    context: vscode.ExtensionContext,
    scope: CodeWhispererConstants.CodeAnalysisScope,
    zipMetadata: ZipMetadata,
    totalIssues: number,
    codeScanStartTime: number
) {
    if (isCloud9()) {
        securityPanelViewProvider.addLines(securityRecommendationCollection, editor)
        void vscode.commands.executeCommand('workbench.view.extension.aws-codewhisperer-security-panel')
    } else {
        initSecurityScanRender(securityRecommendationCollection, context, editor, scope, codeScanStartTime)
        if (scope === CodeWhispererConstants.CodeAnalysisScope.PROJECT) {
            void vscode.commands.executeCommand('workbench.action.problems.focus')
        }
    }
    populateCodeScanLogStream(zipMetadata.scannedFiles)
    if (scope === CodeWhispererConstants.CodeAnalysisScope.PROJECT) {
        showScanCompletedNotification(totalIssues, zipMetadata.scannedFiles, false)
    }
}

export async function emitCodeScanTelemetry(editor: vscode.TextEditor, codeScanTelemetryEntry: CodeScanTelemetryEntry) {
    const uri = editor.document.uri
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
    const fileExt = getFileExt(editor.document.languageId)
    if (workspaceFolder !== undefined && fileExt !== undefined) {
        const projectSize = await getDirSize(
            workspaceFolder.uri.fsPath,
            performance.now(),
            CodeWhispererConstants.projectSizeCalculateTimeoutSeconds * 1000,
            fileExt
        )
        codeScanTelemetryEntry.codewhispererCodeScanProjectBytes = projectSize
    }
    telemetry.codewhisperer_securityScan.emit(codeScanTelemetryEntry)
}

export function errorPromptHelper(error: Error) {
    void vscode.window.showWarningMessage(`Security scan failed. ${error}`, ok)
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
    codeScanOutpuChan.show()
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
