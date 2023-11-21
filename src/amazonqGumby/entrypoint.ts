/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { startTransformByQWithProgress } from '../codewhisperer/commands/startTransformByQ'
import { jobInProgressMessage } from '../codewhisperer/models/constants'
import { transformByQState } from '../codewhisperer/models/model'
import { window } from 'vscode'

export function processTransformByQ() {
    if (transformByQState.isNotStarted()) {
        startTransformByQWithProgress()
    } else {
        window.showInformationMessage(jobInProgressMessage)
    }
}
