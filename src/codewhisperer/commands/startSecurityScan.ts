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
import { CodeWhispererConstants } from '../models/constants'
import { DependencyGraphFactory } from '../util/dependencyGraph/dependencyGraphFactory'
import { JavaDependencyGraphError } from '../util/dependencyGraph/javaDependencyGraph'
import {
    getPresignedUrlAndUpload,
    createScanJob,
    pollScanJobStatus,
    listScanResults,
} from '../service/securityScanHandler'
import * as telemetry from '../../shared/telemetry/telemetry'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'
import { codeScanState, CodeScanTelemetryEntry } from '../models/model'
import { openSettings } from '../../shared/settings'
import { ok, viewSettings } from '../../shared/localizedText'
import { statSync } from 'fs'

const performance = globalThis.performance ?? require('perf_hooks').performance

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
    const codeScanTelemetryEntry: CodeScanTelemetryEntry = {
        codewhispererLanguage: runtimeLanguageContext.getLanguageContext(editor.document.languageId).language,
        codewhispererCodeScanPayloadBytes: 0,
        codewhispererCodeScanLines: 0,
        duration: 0,
        result: 'Succeeded',
        codewhispererCodeScanTotalIssues: 0,
    }
    try {
        getLogger().info(`Starting security scan for '${vscode.workspace.name}' ...`)
        /**
         * Step 1: Generate context truncations
         */
        const dependencyGraph = DependencyGraphFactory.getDependencyGraph(editor.document.languageId)
        if (dependencyGraph === undefined) {
            throw new Error(`"${editor.document.languageId}" is not supported for security scan.`)
        }
        const uri = dependencyGraph.getRootFile(editor)
        if (dependencyGraph.reachSizeLimit(statSync(uri.fsPath).size)) {
            throw new Error(
                `Selected file larger than ${dependencyGraph.getReadableSizeLimit()}. Please try with a different file.`
            )
        }
        const projectPath = dependencyGraph.getProjectPath(uri)
        const projectName = dependencyGraph.getProjectName(uri)
        if (isCloud9()) {
            securityPanelViewProvider.startNew(projectName)
        }
        const truncation = await dependencyGraph.generateTruncationWithTimeout(
            uri,
            CodeWhispererConstants.contextTruncationTimeoutSeconds
        )
        getLogger().info(`Complete project context processing.`)
        codeScanTelemetryEntry.codewhispererCodeScanPayloadBytes = truncation.src.size + truncation.build.size
        codeScanTelemetryEntry.codewhispererCodeScanLines = truncation.lines

        /**
         * Step 2: Get presigned Url, upload and clean up
         */
        let artifactMap
        try {
            artifactMap = await getPresignedUrlAndUpload(client, truncation)
        } finally {
            dependencyGraph.removeTmpFiles(truncation)
        }

        /**
         * Step 3:  Create scan job
         */
        const scanJob = await createScanJob(client, artifactMap, editor.document.languageId)
        getLogger().debug(`Job id: ${scanJob.jobId}`)
        if (scanJob.status === 'Failed') {
            throw new Error(scanJob.errorMessage)
        }
        getLogger().info(`Created security scan job.`)
        codeScanTelemetryEntry.codewhispererCodeScanJobId = scanJob.jobId

        /**
         * Step 4:  Polling mechanism on scan job status
         */
        const jobStatus = await pollScanJobStatus(client, scanJob.jobId)
        if (jobStatus === 'Failed') throw new Error('Security scan job failed.')

        /**
         * Step 5: Process and render scan results
         */
        getLogger().info(`Security scan job succeeded and start processing result.`)
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
        getLogger().info(`Security scan for '${vscode.workspace.name}' totally found ${total} issues.`)
        if (total > 0) {
            if (isCloud9()) {
                securityPanelViewProvider.addLines(securityRecommendationCollection, editor)
                vscode.commands.executeCommand('workbench.view.extension.aws-codewhisperer-security-panel')
            } else {
                initSecurityScanRender(securityRecommendationCollection, context)
                vscode.commands.executeCommand('workbench.action.problems.focus')
            }
        } else {
            vscode.window.showInformationMessage(`Security scan completed and no issues were found.`)
        }
        getLogger().info(`Security scan completed.`)
    } catch (error) {
        getLogger().error('Security scan failed.', error)
        errorPromptHelper(error as Error)
        codeScanTelemetryEntry.result = 'Failed'
        codeScanTelemetryEntry.reason = (error as Error).message
    } finally {
        codeScanState.running = false
        await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
        codeScanTelemetryEntry.duration = performance.now() - codeScanStartTime
        telemetry.recordCodewhispererSecurityScan(codeScanTelemetryEntry)
    }
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
