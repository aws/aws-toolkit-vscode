/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { showLogOutputChannel } from '../../shared/logger/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Window } from '../../shared/vscode/window'

export function showErrorWithLogs(message: string, window: Window): void {
    const logsItem = localize('AWS.generic.message.viewLogs', 'View Logs...')

    window.showErrorMessage(message, localize('AWS.generic.message.viewLogs', 'View Logs...')).then(selection => {
        if (selection === logsItem) {
            showLogOutputChannel()
        }
    })
}
