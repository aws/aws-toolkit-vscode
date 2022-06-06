/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DefaultConsolasClient } from '../client/consolas'
import { isCloud9 } from '../../../shared/extensionUtilities'
import { initSecurityScanRender } from '../service/diagnosticsProvider'
import { SecurityPanelViewProvider } from '../views/securityPanelViewProvider'
import { getLogger } from '../../../shared/logger'
import { ConsolasConstants } from '../models/constants'
import { DependencyGraphFactory } from '../util/dependencyGraph/dependencyGraphFactory'
import {
    getPresignedUrlAndUpload,
    createScanJob,
    pollScanJobStatus,
    listScanResults,
} from '../service/securityScanHandler'

export function startSecurityScanWithProgress(
    securityPanelViewProvider: SecurityPanelViewProvider,
    editor: vscode.TextEditor,
    client: DefaultConsolasClient,
    context: vscode.ExtensionContext
) {
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: ConsolasConstants.runningSecurityScan,
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
    client: DefaultConsolasClient,
    context: vscode.ExtensionContext
) {
    try {
        getLogger().info(`Starting security scan for '${vscode.workspace.name}' ...`)
        /**
         * Step 1: Generate context truncations
         */
        const dependencyGraph = DependencyGraphFactory.getDependencyGraph(editor.document.languageId)
        if (dependencyGraph === undefined) {
            throw new Error(`${editor.document.languageId} is not supported for security scan.`)
        }
        const uri = dependencyGraph.getRootFile(editor)
        const projectPath = dependencyGraph.getProjectPath(uri)
        const projectName = dependencyGraph.getProjectName(uri)
        if (isCloud9()) {
            securityPanelViewProvider.startNew(projectName)
        }
        const truncation = await dependencyGraph.generateTruncationWithTimeout(
            uri,
            ConsolasConstants.contextTruncationTimeout
        )
        getLogger().info(`Complete project context processing.`)

        /**
         * Step 2: Get presigned Url, upload and clean up
         */
        const artifactMap = await getPresignedUrlAndUpload(client, truncation)
        dependencyGraph.removeTmpFiles(truncation)

        /**
         * Step 3:  Create scan job
         */
        const scanJob = await createScanJob(client, artifactMap, editor.document.languageId)
        getLogger().debug(`Job ID: ${scanJob.jobId}`)
        if (scanJob.status === 'Failed') {
            throw new Error(scanJob.errorMessage)
        }
        getLogger().info(`Created security scan job.`)

        /**
         * Step 4:  Polling mechanism on scan job status
         */
        const jobStatus = await pollScanJobStatus(client, scanJob.jobId)
        if (jobStatus === 'Failed') throw new Error('Code Scan job failed.')

        /**
         * Step 5: Process and render scan results
         */
        getLogger().info(`Security scan job succeeded and start processing result.`)
        const securityRecommendationCollection = await listScanResults(client, scanJob.jobId, projectPath)
        const total = securityRecommendationCollection.reduce((accumulator, current) => {
            return accumulator + current.issues.length
        }, 0)
        getLogger().info(`Security scan for '${vscode.workspace.name}' totally found ${total} issues.`)
        if (total > 0) {
            if (isCloud9()) {
                securityPanelViewProvider.addLines(securityRecommendationCollection, editor)
                vscode.commands.executeCommand('workbench.view.extension.aws-consolas-security-panel')
            } else {
                initSecurityScanRender(securityRecommendationCollection, context)
                vscode.commands.executeCommand('workbench.action.problems.focus')
            }
        } else {
            vscode.window.showInformationMessage(`Security scan completed and no security issues.`)
        }
        getLogger().info(`Security scan completed.`)
    } catch (error) {
        getLogger().error('Security scan failed:', error)
        vscode.window.showWarningMessage(`Security scan failed: ${error}`)
    } finally {
        context.globalState.update(ConsolasConstants.codeScanStartedKey, false).then(async () => {
            await vscode.commands.executeCommand('aws.consolas.refresh')
        })
    }
}
