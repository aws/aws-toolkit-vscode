/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { telemetry } from '../shared/telemetry/telemetry'
import { Commands } from '../shared/vscode/commands2'
import * as CodeWhispererConstants from '../codewhisperer/models/constants'
import { stopTransformByQ } from '../codewhisperer/commands/startTransformByQ'
import { transformByQState } from '../codewhisperer/models/model'
import { AuthUtil } from '../codewhisperer/util/authUtil'
import { CancelActionPositions, logCodeTransformInitiatedMetric } from './telemetry/codeTransformTelemetry'
import { ChatControllerEventEmitters } from './chat/controller/controller'
import { focusAmazonQPanel } from '../auth/ui/vue/show'
import { sleep } from '../shared/utilities/timeoutUtils'
import { randomUUID } from 'crypto'
import { ChatSessionManager } from './chat/storages/chatSession'

export const showTransformByQ = Commands.declare(
    { id: 'aws.awsq.transform', compositeKey: { 0: 'source' } },
    (controllerEventEmitters: ChatControllerEventEmitters) => async (source: string) => {
        if (AuthUtil.instance.isConnectionExpired()) {
            await AuthUtil.instance.notifyReauthenticate()
        }

        if (transformByQState.isNotStarted()) {
            logCodeTransformInitiatedMetric(source)
            await focusAmazonQPanel().then(async () => {
                // non blocking wait for a tenth of a second
                // note: we need this because the webview has to be loaded
                // before it can listen to events we fire
                await sleep(250)

                controllerEventEmitters.commandSentFromIDE.fire({
                    command: 'aws.awsq.transform',
                    tabId: ChatSessionManager.Instance.getSession().tabID ?? '',
                    eventId: randomUUID,
                })
            })
        } else if (transformByQState.isCancelled()) {
            void vscode.window.showInformationMessage(CodeWhispererConstants.cancellationInProgressMessage)
        } else if (transformByQState.isRunning()) {
            await stopTransformByQ(transformByQState.getJobId(), CancelActionPositions.DevToolsSidePanel)
        }
        // emit telemetry if clicked from tree node
        if (source === CodeWhispererConstants.transformTreeNode) {
            telemetry.ui_click.emit({
                elementId: 'amazonq_transform',
                passive: false,
            })
        }
    }
)

export const showTransformationHub = Commands.declare(
    { id: 'aws.amazonq.showTransformationHub', compositeKey: { 0: 'source' } },
    () => async (source: string) => {
        await vscode.commands.executeCommand('workbench.view.extension.aws-codewhisperer-transformation-hub')
    }
)
