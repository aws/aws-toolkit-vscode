/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command, LogMessage, Message, MessageType, WebviewContext } from '../types'
import { getLogger } from '../../shared/logger'
import * as vscode from 'vscode'
import { sendThreatComposerErrored } from './emitTelemetryMessageHandler'

/**
 * Handler for logging messages from the webview.
 * @param message The message containing the log message and other metadata.
 * @param context The context object containing the necessary information for the webview.
 */
export async function logMessageHandler(message: LogMessage, context: WebviewContext) {
    const logger = getLogger()
    switch (message.logType) {
        case 'INFO':
            logger.info(message.logMessage)
            if (message.showNotification) {
                void vscode.window.showInformationMessage(message.logMessage)
            }
            return
        case 'WARNING':
            logger.warn(message.logMessage)
            if (message.showNotification) {
                void vscode.window.showWarningMessage(message.logMessage)
            }
            return
        case 'ERROR':
            logger.error(message.logMessage)
            sendThreatComposerErrored({
                reason: message.logMessage,
                id: context.fileId,
            })
            if (message.showNotification) {
                if (message.notificationType === 'INVALID_JSON') {
                    const selection = await vscode.window.showErrorMessage(
                        `${message.logMessage}. Please re-open the file in a text editor or overwrite the contents of the file with Threat Composer JSON.`,
                        'Open in default editor',
                        'Overwrite'
                    )

                    if (selection === 'Open in default editor') {
                        context.panel.dispose()
                        await vscode.commands.executeCommand('vscode.openWith', context.textDocument.uri, 'default')
                    } else if (selection === 'Overwrite') {
                        const broadcastMessage: Message = {
                            messageType: MessageType.BROADCAST,
                            command: Command.OVERWRITE_FILE,
                        }
                        await context.panel.webview.postMessage(broadcastMessage)
                    }
                } else {
                    void vscode.window.showErrorMessage(message.logMessage)
                }
            }
            return
    }
}
