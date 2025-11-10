/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { commands, window } from 'vscode'
import { commandKey, formatMessage, toString } from '../utils'
import { LanguageClient } from 'vscode-languageclient/node'

export function restartCommand(client: LanguageClient) {
    return commands.registerCommand(commandKey('server.restartServer'), async () => {
        try {
            if (client) {
                await client.restart()
            }
        } catch (error) {
            void window.showErrorMessage(formatMessage(`Failed to restart server: ${toString(error)}`))
        }
    })
}
