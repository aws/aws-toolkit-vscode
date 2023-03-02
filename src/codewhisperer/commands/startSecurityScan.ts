/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
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
import { codeScanState, CodeScanStoppedError, CodeScanTelemetryEntry } from '../models/model'
import { openSettings } from '../../shared/settings'
import { cancel, confirm, ok, viewSettings } from '../../shared/localizedText'
import { statSync } from 'fs'
import { getFileExt } from '../util/commonUtil'
import { getDirSize } from '../../shared/filesystemUtilities'
import { telemetry } from '../../shared/telemetry/telemetry'
import { TelemetryHelper } from '../util/telemetryHelper'

const performance = globalThis.performance ?? require('perf_hooks').performance
const securityScanOutputChannel = vscode.window.createOutputChannel('CodeWhisperer Security Scan Logs')
const codeScanLogger = makeLogger(
    {
        outputChannels: [securityScanOutputChannel]
    }
)


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
        codewhispererLanguage: runtimeLanguageContext.getLanguageContext(editor.document.languageId).language,
        codewhispererCodeScanSrcPayloadBytes: 0,
        codewhispererCodeScanSrcZipFileBytes: 0,
        codewhispererCodeScanLines: 0,
        duration: 0,
        contextTruncationDuration: 0,
        artifactsUploadDuration: 0,
        codeScanServiceInvocationsDuration: 0,
        result: 'Succeeded',
        codewhispererCodeScanTotalIssues: 0,
        credentialStartUrl: TelemetryHelper.instance.startUrl,
    }
    try {
        getLogger().verbose(`Starting security scan `)
        /**
         * Step 1: Generate context truncations
         */
        throwIfCancelled()
        const dependencyGraph = DependencyGraphFactory.getDependencyGraph(editor.document.languageId)
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
        codeScanTelemetryEntry.contextTruncationDuration = performance.now() - contextTruncationStartTime
        getLogger().verbose(`Complete project context processing.`)
        codeScanTelemetryEntry.codewhispererCodeScanSrcPayloadBytes = truncation.src.size
        codeScanTelemetryEntry.codewhispererCodeScanBuildPayloadBytes = truncation.build.size
        codeScanTelemetryEntry.codewhispererCodeScanSrcZipFileBytes = truncation.src.zipSize
        codeScanTelemetryEntry.codewhispererCodeScanBuildZipFileBytes = truncation.build.zipSize
        codeScanTelemetryEntry.codewhispererCodeScanLines = truncation.lines

        /**
         * Step 2: Get presigned Url, upload and clean up
         */
        throwIfCancelled()
        let artifactMap
        const uploadStartTime = performance.now()
        try {
            artifactMap = await getPresignedUrlAndUpload(client, truncation)
        } finally {
            dependencyGraph.removeTmpFiles(truncation)
            codeScanTelemetryEntry.artifactsUploadDuration = performance.now() - uploadStartTime
        }

        /**
         * Step 3:  Create scan job
         */
        throwIfCancelled()
        serviceInvocationStartTime = performance.now()
        const scanJob = await createScanJob(client, artifactMap, editor.document.languageId)
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
        const total = securityRecommendationCollection.reduce((accumulator, current) => {
            return accumulator + current.issues.length
        }, 0)
        codeScanTelemetryEntry.codewhispererCodeScanTotalIssues = total
        getLogger().verbose(`Security scan totally found ${total} issues.`)
        if (total > 0) {
            if (isCloud9()) {
                securityPanelViewProvider.addLines(securityRecommendationCollection, editor)
                vscode.commands.executeCommand('workbench.view.extension.aws-codewhisperer-security-panel')
            } else {
                initSecurityScanRender(securityRecommendationCollection, context)
                vscode.commands.executeCommand('workbench.action.problems.focus')
            }
            populateCodeScanLogStream(truncation.src.scannedFiles)
            showScanCompletedNotification(total, truncation.src.scannedFiles, dependencyGraph.isProjectTruncated())
        } else {
            vscode.window.showInformationMessage(`Security scan completed and no issues were found.`)
        }
        getLogger().verbose(`Security scan completed.`)
    } catch (error) {
        getLogger().error('Security scan failed.', error)
        if (error instanceof CodeScanStoppedError) {
            codeScanTelemetryEntry.result = 'Cancelled'
        }
        else {
            errorPromptHelper(error as Error)
            codeScanTelemetryEntry.result = 'Failed'
        }
        codeScanTelemetryEntry.reason = (error as Error).message
    } finally {
        codeScanState.setToNotStarted()
        await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
        codeScanTelemetryEntry.duration = performance.now() - codeScanStartTime
        codeScanTelemetryEntry.codeScanServiceInvocationsDuration = performance.now() - serviceInvocationStartTime
        emitCodeScanTelemetry(editor, codeScanTelemetryEntry)
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
        vscode.window
            .showWarningMessage(
                'Try rebuilding the Java project or specify compilation output in Settings.',
                viewSettings,
                ok
            )
            .then(async resp => {
                if (resp === viewSettings) {
                    openSettings('aws.codeWhisperer.javaCompilationOutput')
                }
            })
    } else {
        vscode.window.showWarningMessage(`Security scan failed. ${error}`, ok)
    }
}


function populateCodeScanLogStream(scannedFiles: Set<string>){
    // Clear log
    securityScanOutputChannel.clear()
    const numScannedFiles = scannedFiles.size
    if (numScannedFiles == 1) {
        codeScanLogger.verbose(`${numScannedFiles} file was scanned during the last Security Scan.`)
    } else {
        codeScanLogger.verbose(`${numScannedFiles} files were scanned during the last Security Scan.`)
    }
    // Log all the scanned files to codeScanLogger
    for (const file of scannedFiles) {
        const uri = vscode.Uri.file(file)
        codeScanLogger.verbose(`File scanned: ${uri.fsPath}`)
    }    
}

export async function confirmStopSecurityScan() {
    // Confirm if user wants to stop security scan
     const resp = await vscode.window.showWarningMessage(
        CodeWhispererConstants.stopScanMessage, confirm, cancel
    )
    if (resp === confirm && codeScanState.isRunning()) {
        getLogger().verbose('User requested to stop security scan. Stopping security scan.')
        codeScanState.setToCancelling()
    }
}

export function showScanCompletedNotification(total: number, scannedFiles: Set<string>, isProjectTruncated: boolean) {
    const totalFiles = `${scannedFiles.size} ${(scannedFiles.size === 1) ? 'file' : 'files'}`
    const totalIssues = `${total} ${(total === 1) ? 'issue was' : 'issues were'}`
    const fileSizeLimitReached = isProjectTruncated ? 'File size limit reached.' : ''
    const learnMore = 'Learn More'
    const items = [CodeWhispererConstants.showScannedFilesMessage]
    if (isProjectTruncated) {
        items.push(learnMore)
    }
    vscode.window.showInformationMessage(`Security scan completed for ${totalFiles}. ${totalIssues} found. ${fileSizeLimitReached}`, ...items).then(
        (value) => {
            if (value === CodeWhispererConstants.showScannedFilesMessage) {
                vscode.commands.executeCommand(CodeWhispererConstants.codeScanLogsOutputChannelId)
            } else if (value === learnMore) {
                vscode.env.openExternal(vscode.Uri.parse(CodeWhispererConstants.learnMoreUri))
            }
        }
    )
}