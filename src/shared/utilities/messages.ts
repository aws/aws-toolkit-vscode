/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

export function makeCheckLogsMessage(): string {
    const commandName = localize('AWS.command.viewLogs', 'View AWS Toolkit Logs')
    const message = localize(
        'AWS.error.check.logs',
        'Check the logs for more information by running the "{0}" command from the Command Palette.',
        commandName
    )

    return message
}
