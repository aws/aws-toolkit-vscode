/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtContext } from '../shared/extensions'
import { Commands } from '../shared/vscode/commands2'
import * as CodeWhispererConstants from '../codewhisperer/models/constants'
import { startTransformByQWithProgress, confirmStopTransformByQ } from '../codewhisperer/commands/startTransformByQ'
import { transformByQState } from '../codewhisperer/models/model'
import { AuthUtil } from '../codewhisperer/util/authUtil'
import { CancelActionPositions, logCodeTransformInitiatedMetric } from './telemetry/codeTransformTelemetry'

export const showTransformByQ = Commands.declare(
    { id: 'aws.awsq.transform', compositeKey: { 0: 'source' } },
    (context: ExtContext) => async (source: string) => {
        if (AuthUtil.instance.isConnectionExpired()) {
            await AuthUtil.instance.notifyReauthenticate()
        }

        if (transformByQState.isNotStarted()) {
            logCodeTransformInitiatedMetric(source)
            await startTransformByQWithProgress()
        } else if (transformByQState.isCancelled()) {
            void vscode.window.showInformationMessage(CodeWhispererConstants.cancellationInProgressMessage)
        } else if (transformByQState.isRunning()) {
            await confirmStopTransformByQ(transformByQState.getJobId(), CancelActionPositions.DevToolsSidePanel)
        }
    }
)

export const showTransformationHub = Commands.declare(
    { id: 'aws.amazonq.showTransformationHub', compositeKey: { 0: 'source' } },
    () => async (source: string) => {
        await vscode.commands.executeCommand('workbench.view.extension.aws-codewhisperer-transformation-hub')
    }
)
