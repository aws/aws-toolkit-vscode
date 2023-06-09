/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { parseCloudWatchLogsUri } from '../cloudWatchLogsUtils'
import { copyToClipboard } from '../../shared/utilities/messages'

export async function copyLogGroupName(uri?: vscode.Uri): Promise<void> {
    try {
        if (!uri) {
            // No URI = used command palette as entrypoint, attempt to get URI from active editor
            // should work correctly under any normal circumstances since the action only appears in command palette when the editor is a CloudWatch Logs editor
            uri = vscode.window.activeTextEditor?.document.uri
            if (!uri) {
                throw new Error("Attempt to copy log group for Uri that doesn't exist.")
            }
        }
        const parsedUri = parseCloudWatchLogsUri(uri)
        console.log(parsedUri);
        const groupName = parsedUri.logGroupInfo.groupName

        if (!groupName) {
            throw new Error(`Unable to copy log group for Uri that doesn\'t have stream. Attempted copy on ${uri}`)
        }
        await copyToClipboard(groupName)
    } catch (e) {
        vscode.window.showErrorMessage(
            localize(
                'AWS.cwl.invalidEditor',
                'Not a Cloudwatch Log group: {0}',
                vscode.window.activeTextEditor?.document.fileName
            )
        )
        return
    }
}
