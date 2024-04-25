/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command, LogMessage, Message, MessageType, WebviewContext } from '../types'
import { getLogger } from '../../shared/logger'
import * as vscode from 'vscode'
import { sendThreatComposerErrored } from './emitTelemetryMessageHandler'

export async function logMessageHandler(message: LogMessage, context: WebviewContext) {
    const logger = getLogger()
    switch (message.logType) {
        case 'INFO':
            logger.info(message.logMessage)
            if (message.showNotification) {
                await vscode.window.showInformationMessage(message.logMessage)
            }
            return
        case 'WARNING':
            logger.warn(message.logMessage)
            if (message.showNotification) {
                await vscode.window.showWarningMessage(message.logMessage)
            }
            return
        case 'ERROR':
            logger.error(message.logMessage)
            if (message.showNotification) {
                if (message.notifitonType === 'INVALD_JSON') {
                    const selection = await vscode.window.showErrorMessage(
                        message.logMessage +
                            '. Please re-open the file in a text editor or overwrite the contents of the file with Threat Composer JSON.',
                        'Open in default editor',
                        'Overwrite'
                    )

                    if (selection === 'Open in default editor') {
                        await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
                        await vscode.commands.executeCommand('vscode.openWith', context.textDocument.uri, 'default')
                    } else if (selection === 'Overwrite') {
                        const broadcastMessage: Message = {
                            messageType: MessageType.BROADCAST,
                            command: Command.OVERWRITE_FILE,
                        }
                        await context.panel.webview.postMessage(broadcastMessage)
                    }
                } else {
                    await vscode.window.showErrorMessage(message.logMessage)
                }
            }
            sendThreatComposerErrored({
                reason: message.logMessage,
            })
            return
    }
}
