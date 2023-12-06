/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { startTransformByQWithProgress } from '../codewhisperer/commands/startTransformByQ'
import { jobInProgressMessage, noActiveIdCMessage } from '../codewhisperer/models/constants'
import { transformByQState } from '../codewhisperer/models/model'
import { AuthUtil } from '../codewhisperer/util/authUtil'
import vscode from 'vscode'
import { sleep } from '../shared/utilities/timeoutUtils'
import { telemetry } from '../shared/telemetry/telemetry'

export async function processTransformByQ() {
    if (!AuthUtil.instance.isEnterpriseSsoInUse()) {
        vscode.window.showErrorMessage(noActiveIdCMessage)
        return
    }
    if (transformByQState.isNotStarted()) {
        await sleep(1000) // sleep so that chat can respond first, then show input prompt
        telemetry.codeTransform_jobIsStartedFromChatPrompt.emit()
        startTransformByQWithProgress()
    } else {
        vscode.window.showInformationMessage(jobInProgressMessage, { modal: true })
    }
}
