/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { isLogStreamUri, parseCloudWatchLogsUri } from '../cloudWatchLogsUtils'
import { copyToClipboard } from '../../shared/utilities/messages'

export async function copyLogResource(uri?: vscode.Uri): Promise<void> {
    try {
        if (!uri) {
            // No URI = used command palette as entrypoint, attempt to get URI from active editor
            // should work correctly under any normal circumstances since the action only appears in command palette when the editor is a CloudWatch Logs editor
            uri = vscode.window.activeTextEditor?.document.uri
            if (!uri) {
                throw new Error('no active text editor, or undefined URI')
            }
        }
        const parsedUri = parseCloudWatchLogsUri(uri)
        const resourceName = isLogStreamUri(uri) ? parsedUri.logGroupInfo.streamName : parsedUri.logGroupInfo.groupName

        if (!resourceName) {
            throw new Error(`Failed to copy log resource name for URI (missing stream or group?): ${uri}`)
        }
        await copyToClipboard(resourceName)
    } catch (e) {
        void vscode.window.showErrorMessage(
            localize(
                'AWS.cwl.invalidEditor',
                'Invalid Cloudwatch Log stream or group: {0}',
                vscode.window.activeTextEditor?.document.fileName
            )
        )
        return
    }
}
