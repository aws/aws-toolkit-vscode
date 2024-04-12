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
import { DependencyGraphFactory } from '../util/dependencyGraph/dependencyGraphFactory'
import { JavaDependencyGraphError } from '../util/dependencyGraph/javaDependencyGraph'
import {
    getPresignedUrlAndUpload,
    createScanJob,
    pollScanJobStatus,
    listScanResults,
    throwIfCancelled,
} from '../service/securityScanHandler'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'
import { codeScanState, CodeScanTelemetryEntry } from '../models/model'
import { openSettings } from '../../shared/settings'
import { cancel, ok, viewSettings } from '../../shared/localizedText'
import { statSync } from 'fs'
import { getFileExt } from '../util/commonUtil'
import { getDirSize } from '../../shared/filesystemUtilities'
import { telemetry } from '../../shared/telemetry/telemetry'
import { isAwsError } from '../../shared/errors'
import { openUrl } from '../../shared/utilities/vsCodeUtils'
import { AuthUtil } from '../util/authUtil'
import { DependencyGraphConstants } from '../util/dependencyGraph/dependencyGraph'
import path from 'path'
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
            await startSecurityScan(securityPanelViewProvider, editor, client, context)
        }
    )
}

export async function startSecurityScan(
    securityPanelViewProvider: SecurityPanelViewProvider,
    editor: vscode.TextEditor,
    client: DefaultCodeWhispererClient,
    context: vscode.ExtensionContext
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
         * Step 1: Generate context truncations
         */
        throwIfCancelled()
        const dependencyGraph = DependencyGraphFactory.getDependencyGraph(editor)
        if (dependencyGraph === undefined) {
            throw new Error(`"${editor.document.languageId}" is not supported for security scan.`)
        }
        const uri = dependencyGraph.getRootFile(editor)
        if (dependencyGraph.reachSizeLimit(statSync(uri.fsPath).size)) {
            throw new Error(
                `Selected file larger than ${dependencyGraph.getReadableSizeLimit()}. Try a different file.`
            )
        }
        const projectPath = dependencyGraph.getProjectPath(uri)
        const projectName = dependencyGraph.getProjectName(uri)
        if (isCloud9()) {
            securityPanelViewProvider.startNew(projectName)
        }
        const contextTruncationStartTime = performance.now()
        const truncation = await dependencyGraph.generateTruncationWithTimeout(
            uri,
            CodeWhispererConstants.contextTruncationTimeoutSeconds
        )
        // Check for file extension to send the telemetry language, Reason:- VSCode treats hcl and tf as "plaintext" instead of "tf"
        if (
            editor.document.fileName.endsWith(DependencyGraphConstants.hclExt) ||
            editor.document.fileName.endsWith(DependencyGraphConstants.tfExt)
        ) {
            codeScanTelemetryEntry.codewhispererLanguage = 'tf' satisfies CodeWhispererConstants.PlatformLanguageId
        }
        codeScanTelemetryEntry.contextTruncationDuration = performance.now() - contextTruncationStartTime
        getLogger().verbose(`Complete project context processing.`)
        codeScanTelemetryEntry.codewhispererCodeScanSrcPayloadBytes = truncation.srcPayloadSizeInBytes
        codeScanTelemetryEntry.codewhispererCodeScanBuildPayloadBytes = truncation.buildPayloadSizeInBytes
        codeScanTelemetryEntry.codewhispererCodeScanSrcZipFileBytes = truncation.zipFileSizeInBytes
        codeScanTelemetryEntry.codewhispererCodeScanLines = truncation.lines

        /**
         * Step 2: Get presigned Url, upload and clean up
         */
        throwIfCancelled()
        let artifactMap: ArtifactMap = {}
        const uploadStartTime = performance.now()
        try {
            artifactMap = await getPresignedUrlAndUpload(client, truncation)
        } catch (error) {
            getLogger().error('Failed to upload code artifacts', error)
            throw error
        } finally {
            await dependencyGraph.removeTmpFiles(truncation)
            codeScanTelemetryEntry.artifactsUploadDuration = performance.now() - uploadStartTime
        }

        /**
         * Step 3:  Create scan job
         */
        throwIfCancelled()
        serviceInvocationStartTime = performance.now()
        const scanJob = await createScanJob(client, artifactMap, codeScanTelemetryEntry.codewhispererLanguage)
        if (scanJob.status === 'Failed') {
            throw new Error(scanJob.errorMessage)
        }
        getLogger().verbose(`Created security scan job.`)
        codeScanTelemetryEntry.codewhispererCodeScanJobId = scanJob.jobId

        /**
         * Step 4:  Polling mechanism on scan job status
         */
        throwIfCancelled()
        const jobStatus = await pollScanJobStatus(client, scanJob.jobId)
        if (jobStatus === 'Failed') {
            throw new Error('Security scan job failed.')
        }

        /**
         * Step 5: Process and render scan results
         */
        throwIfCancelled()
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
        throwIfCancelled()
        getLogger().verbose(`Security scan totally found ${total} issues. ${withFixes} of them have fixes.`)
        if (isCloud9()) {
            securityPanelViewProvider.addLines(securityRecommendationCollection, editor)
            void vscode.commands.executeCommand('workbench.view.extension.aws-codewhisperer-security-panel')
        } else {
            initSecurityScanRender(securityRecommendationCollection, context)
            void vscode.commands.executeCommand('workbench.action.problems.focus')
        }
        populateCodeScanLogStream(truncation.scannedFiles)
        showScanCompletedNotification(total, truncation.scannedFiles, dependencyGraph.isProjectTruncated())
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
    if (error instanceof JavaDependencyGraphError) {
        void vscode.window
            .showWarningMessage(
                'Try rebuilding the Java project or specify compilation output in Settings.',
                viewSettings,
                ok
            )
            .then(async resp => {
                if (resp === viewSettings) {
                    openSettings('aws.amazonQ.javaCompilationOutput').catch(e => {
                        getLogger().error('openSettings failed: %s', (e as Error).message)
                    })
                }
            })
    } else {
        void vscode.window.showWarningMessage(`Security scan failed. ${error}`, ok)
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
