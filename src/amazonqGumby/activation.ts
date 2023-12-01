/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Commands } from '../shared/vscode/commands2'
import { TransformationHubViewProvider } from '../codewhisperer/service/transformationHubViewProvider'
import { showTransformByQ, showTransformationHub } from '../codewhisperer/commands/basicCommands'
import { ExtContext } from '../shared/extensions'
import { startTransformByQWithProgress, confirmStopTransformByQ } from '../codewhisperer/commands/startTransformByQ'
import { transformByQState } from '../codewhisperer/models/model'
import * as CodeWhispererConstants from '../codewhisperer/models/constants'
import { ProposedTransformationExplorer } from '../codewhisperer/service/transformationResultsViewProvider'

export async function activate(context: ExtContext) {
    const transformationHubViewProvider = new TransformationHubViewProvider()
    new ProposedTransformationExplorer(context.extensionContext)

    context.extensionContext.subscriptions.push(
        showTransformByQ.register(context),

        showTransformationHub.register(),

        vscode.window.registerWebviewViewProvider('aws.amazonq.transformationHub', transformationHubViewProvider),

        Commands.register('aws.amazonq.startTransformationInHub', async () => {
            await startTransformByQWithProgress()
        }),

        Commands.register('aws.amazonq.stopTransformationInHub', async () => {
            if (transformByQState.isRunning()) {
                confirmStopTransformByQ(transformByQState.getJobId())
            } else {
                vscode.window.showInformationMessage(CodeWhispererConstants.noOngoingJobMessage)
            }
        }),

        Commands.register('aws.amazonq.showHistoryInHub', async () => {
            transformationHubViewProvider.updateContent('job history', 0) // 0 is dummy value for startTime - not used
        }),

        Commands.register('aws.amazonq.showPlanProgressInHub', async (startTime: number) => {
            transformationHubViewProvider.updateContent('plan progress', startTime)
        }),

        Commands.register('aws.amazonq.showTransformationPlanInHub', async () => {
            vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(transformByQState.getPlanFilePath()))
        })
    )
}
