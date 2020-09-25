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

export function makeFailedWriteMessage(filename: string): string {
    const commandName = localize('AWS.command.viewLogs', 'View AWS Toolkit Logs')
    const message = localize(
        'AWS.failedToWrite',
        'AWS: Failed to write "{0}". Use the "{1}" command to see error details.',
        filename,
        commandName
    )

    return message
}
