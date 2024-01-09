/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode, { Uri } from 'vscode'
import { Command, DeployRequestMessage, DeployResponseMessage, MessageType, WebviewContext } from '../types'
import { SamSyncResult } from '../../shared/sam/sync'
import { telemetry } from '../../shared/telemetry/telemetry'
import { Auth } from '../../auth/auth'
import { promptAndUseConnection } from '../../auth/utils'
import { openUrl } from '../../shared/utilities/vsCodeUtils'
import { localize } from 'vscode-nls'
import { StatefulConnection } from '../../auth/connection'

const credentialsDocLink = 'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/setup-credentials.html'

async function promptReauth(connection?: StatefulConnection) {
    let errorMessage = localize(
        'aws.applicationComposer.deploy.authModal.message',
        'Syncing requires authentication with IAM credentials.'
    )
    if (connection?.state === 'valid') {
        errorMessage =
            localize(
                'aws.applicationComposer.deploy.authModal.invalidAuth',
                'Authentication through Builder ID or IAM Identity Center detected. '
            ) + errorMessage
    }
    const acceptMessage = localize(
        'aws.applicationComposer.deploy.authModal.accept',
        'Authenticate with IAM credentials'
    )
    const docMessage = localize('aws.applicationComposer.deploy.authModal.docLink', 'Open documentation')
    const modalResponse = await vscode.window.showInformationMessage(
        errorMessage,
        { modal: true },
        acceptMessage,
        docMessage
    )
    if (modalResponse === docMessage) {
        await openUrl(Uri.parse(credentialsDocLink))
    }
    if (modalResponse !== acceptMessage) {
        return
    }
    await promptAndUseConnection(Auth.instance, 'iam', true)
}

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
    const connection = Auth.instance.activeConnection
    if (connection?.type !== 'iam' || connection?.state !== 'valid') {
        await promptReauth(connection)
        if (connection?.type !== 'iam' || connection?.state !== 'valid') {
            const response: DeployResponseMessage = {
                command: Command.DEPLOY,
                messageType: MessageType.RESPONSE,
                eventId: message.eventId,
                isSuccess: false,
            }
            await context.panel.webview.postMessage(response)
            return
        }
    }
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
