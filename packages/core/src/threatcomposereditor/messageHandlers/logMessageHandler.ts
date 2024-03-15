/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LogMessage } from '../types'
import { getLogger } from '../../shared/logger'
import * as vscode from 'vscode'
import { sendThreatComposerErrored } from './emitTelemetryMessageHandler'

export async function logMessageHandler(message: LogMessage) {
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
                await vscode.window.showErrorMessage(message.logMessage)
            }
            sendThreatComposerErrored({
                reason: message.logMessage,
            })
            return
    }
}
