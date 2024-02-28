/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Commands } from '../shared/vscode/commands2'
import { TransformationHubViewProvider } from '../codewhisperer/service/transformationHubViewProvider'
import { showTransformByQ, showTransformationHub } from './commands'
import { ExtContext } from '../shared/extensions'
import { startTransformByQWithProgress, confirmStopTransformByQ } from '../codewhisperer/commands/startTransformByQ'
import { transformByQState } from '../codewhisperer/models/model'
import * as CodeWhispererConstants from '../codewhisperer/models/constants'
import { ProposedTransformationExplorer } from '../codewhisperer/service/transformationResultsViewProvider'
import { codeTransformTelemetryState } from './telemetry/codeTransformTelemetryState'
import { telemetry } from '../shared/telemetry/telemetry'
import { CancelActionPositions, logCodeTransformInitiatedMetric } from './telemetry/codeTransformTelemetry'
import { CodeTransformConstants } from './models/constants'
import { AuthUtil } from '../codewhisperer/util/authUtil'
import { validateAndLogProjectDetails } from '../codewhisperer/service/transformByQHandler'

export async function activate(context: ExtContext) {
    // If the user is codewhisperer eligible, activate the plugin
    if (AuthUtil.instance.isValidEnterpriseSsoInUse()) {
        const transformationHubViewProvider = new TransformationHubViewProvider()
        new ProposedTransformationExplorer(context.extensionContext)
        // Register an activation event listener to determine when the IDE opens, closes or users
        // select to open a new workspace
        const workspaceChangeEvent = vscode.workspace.onDidChangeWorkspaceFolders(event => {
            // A loophole to register the IDE closed. This is when no folders were added nor
            // removed, but the event still fired. This assumes the user closed the workspace
            if (event.added.length === 0 && event.removed.length === 0) {
                // Only fire closed during running/active job status
                if (transformByQState.isRunning()) {
                    telemetry.codeTransform_jobIsClosedDuringIdeRun.emit({
                        codeTransformJobId: transformByQState.getJobId(),
                        codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                        codeTransformStatus: transformByQState.getStatus(),
                    })
                }
            } else {
                telemetry.codeTransform_jobIsResumedAfterIdeClose.emit({
                    codeTransformJobId: transformByQState.getJobId(),
                    codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
                    codeTransformStatus: transformByQState.getStatus(),
                })
            }
        })

        context.extensionContext.subscriptions.push(
            showTransformByQ.register(context),

            showTransformationHub.register(),

            vscode.window.registerWebviewViewProvider('aws.amazonq.transformationHub', transformationHubViewProvider),

            Commands.register('aws.amazonq.startTransformationInHub', async () => {
                logCodeTransformInitiatedMetric(CodeTransformConstants.HubStartButton)
                await startTransformByQWithProgress()
            }),

            Commands.register('aws.amazonq.stopTransformationInHub', async (cancelSrc: CancelActionPositions) => {
                if (transformByQState.isRunning()) {
                    void confirmStopTransformByQ(transformByQState.getJobId(), cancelSrc)
                } else {
                    void vscode.window.showInformationMessage(CodeWhispererConstants.noOngoingJobMessage)
                }
            }),

            Commands.register('aws.amazonq.showHistoryInHub', async () => {
                transformationHubViewProvider.updateContent('job history', 0) // 0 is dummy value for startTime - not used
            }),

            Commands.register('aws.amazonq.showPlanProgressInHub', async (startTime: number) => {
                transformationHubViewProvider.updateContent('plan progress', startTime)
            }),

            Commands.register('aws.amazonq.showTransformationPlanInHub', async () => {
                void vscode.commands.executeCommand(
                    'markdown.showPreview',
                    vscode.Uri.file(transformByQState.getPlanFilePath())
                )
            }),

            workspaceChangeEvent
        )

        validateAndLogProjectDetails()
    }
}
