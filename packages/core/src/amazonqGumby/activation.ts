/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Commands } from '../shared/vscode/commands2'
import { TransformationHubViewProvider } from '../codewhisperer/service/transformByQ/transformationHubViewProvider'
import { ExtContext } from '../shared/extensions'
import {
    cleanupTransformationJob,
    postTransformationJob,
    stopTransformByQ,
} from '../codewhisperer/commands/startTransformByQ'
import { transformByQState } from '../codewhisperer/models/model'
import { ProposedTransformationExplorer } from '../codewhisperer/service/transformByQ/transformationResultsViewProvider'
import { CodeTransformTelemetryState } from './telemetry/codeTransformTelemetryState'
import { telemetry } from '../shared/telemetry/telemetry'
import { CancelActionPositions } from './telemetry/codeTransformTelemetry'
import { setContext } from '../shared'

export async function activate(context: ExtContext) {
    void setContext('gumby.wasQCodeTransformationUsed', false)

    const transformationHubViewProvider = new TransformationHubViewProvider()
    new ProposedTransformationExplorer(context.extensionContext)
    // Register an activation event listener to determine when the IDE opens, closes or users
    // select to open a new workspace
    const workspaceChangeEvent = vscode.workspace.onDidChangeWorkspaceFolders((event) => {
        // A loophole to register the IDE closed. This is when no folders were added nor
        // removed, but the event still fired. This assumes the user closed the workspace
        if (event.added.length === 0 && event.removed.length === 0) {
            // Only fire closed during running/active job status
            if (transformByQState.isRunning()) {
                telemetry.codeTransform_jobIsClosedDuringIdeRun.emit({
                    codeTransformJobId: transformByQState.getJobId(),
                    codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
                    codeTransformStatus: transformByQState.getStatus(),
                })
            }
        } else {
            telemetry.codeTransform_jobIsResumedAfterIdeClose.emit({
                codeTransformJobId: transformByQState.getJobId(),
                codeTransformSessionId: CodeTransformTelemetryState.instance.getSessionId(),
                codeTransformStatus: transformByQState.getStatus(),
            })
        }
    })

    context.extensionContext.subscriptions.push(
        vscode.window.registerWebviewViewProvider('aws.amazonq.transformationHub', transformationHubViewProvider),

        Commands.register('aws.amazonq.stopTransformationInHub', async (cancelSrc: CancelActionPositions) => {
            if (transformByQState.isRunning()) {
                await stopTransformByQ(transformByQState.getJobId(), cancelSrc)
                await postTransformationJob()
                await cleanupTransformationJob()
            }
        }),

        Commands.register('aws.amazonq.showHistoryInHub', async () => {
            await transformationHubViewProvider.updateContent('job history')
        }),

        Commands.register('aws.amazonq.showPlanProgressInHub', async (startTime: number) => {
            await transformationHubViewProvider.updateContent('plan progress', startTime)
        }),

        Commands.register('aws.amazonq.showTransformationPlanInHub', async () => {
            void vscode.commands.executeCommand(
                'markdown.showPreview',
                vscode.Uri.file(transformByQState.getPlanFilePath())
            )
        }),

        workspaceChangeEvent
    )
}
