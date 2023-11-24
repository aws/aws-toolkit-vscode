/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { startTransformByQWithProgress } from '../codewhisperer/commands/startTransformByQ'
import { jobInProgressMessage } from '../codewhisperer/models/constants'
import { transformByQState } from '../codewhisperer/models/model'
import { AuthUtil } from '../codewhisperer/util/authUtil'
import vscode from 'vscode'

export function processTransformByQ() {
    if (!AuthUtil.instance.isEnterpriseSsoInUse()) {
        vscode.window.showErrorMessage('Transform by Q requires an active IAM Identity Center connection')
        return
    }
    if (transformByQState.isNotStarted()) {
        startTransformByQWithProgress()
    } else {
        vscode.window.showInformationMessage(jobInProgressMessage, { modal: true })
    }
}
