/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { Command, DeployRequestMessage, DeployResponseMessage, MessageType, WebviewContext } from '../types'
import { SamSyncResult } from '../../shared/sam/sync'
import { telemetry } from '../../shared/telemetry/telemetry'

export async function deployMessageHandler(message: DeployRequestMessage, context: WebviewContext) {
    // SAM already handles success/failure, so we only log that the user clicked the deploy button
    telemetry.appcomposer_deployClicked.emit({
        result: 'Succeeded',
    })
    const args = context.textDocument.uri
    /* TODO Rework this command so that a failure case is returned
     * We don't want to override the SAM Sync telemetry. The SAM telemetry catches all errors,
     * so we instead check for an undefined response to determine failure. The downside is that
     * we don't get failure reasons.
     */
    const result = (await vscode.commands.executeCommand('aws.samcli.sync', args, false)) as SamSyncResult
    if (result?.isSuccess) {
        void vscode.window.showInformationMessage('SAM Sync succeeded!')
        telemetry.appcomposer_deployCompleted.emit({ result: 'Succeeded' })
    } else {
        telemetry.appcomposer_deployCompleted.emit({ result: 'Failed' })
    }
    const response: DeployResponseMessage = {
        command: Command.DEPLOY,
        messageType: MessageType.RESPONSE,
        eventId: message.eventId,
        isSuccess: result?.isSuccess,
    }
    await context.panel.webview.postMessage(response)
}
