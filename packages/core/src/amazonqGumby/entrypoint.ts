/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { startTransformByQWithProgress } from '../codewhisperer/commands/startTransformByQ'
import { jobInProgressMessage, noActiveIdCMessage } from '../codewhisperer/models/constants'
import { transformByQState } from '../codewhisperer/models/model'
import { AuthUtil } from '../codewhisperer/util/authUtil'
import vscode from 'vscode'
import { telemetry } from '../shared/telemetry/telemetry'
import { MetadataResult } from '../shared/telemetry/telemetryClient'
import { codeTransformTelemetryState } from './telemetry/codeTransformTelemetryState'

export async function processTransformByQ() {
    if (!AuthUtil.instance.isValidCodeTransformationAuthUser()) {
        void vscode.window.showErrorMessage(noActiveIdCMessage)
        return
    }
    if (transformByQState.isNotStarted()) {
        telemetry.codeTransform_jobIsStartedFromChatPrompt.emit({
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            result: MetadataResult.Pass,
        })
        telemetry.codeTransform_isDoubleClickedToTriggerUserModal.emit({
            codeTransformStartSrcComponents: 'chatPrompt',
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
            result: MetadataResult.Pass,
        })
        return startTransformByQWithProgress()
    } else {
        void vscode.window.showInformationMessage(jobInProgressMessage, { modal: true })
    }
}
