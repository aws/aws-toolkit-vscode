/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { parseCloudWatchLogsUri } from '../cloudWatchLogsUtils'

export async function copyLogStreamName(uri?: vscode.Uri): Promise<void> {
    try {
        if (!uri) {
            // No URI = used command palette as entrypoint, attempt to get URI from active editor
            // should work correctly under any normal circumstances since the action only appears in command palette when the editor is a CloudWatch Logs editor
            uri = vscode.window.activeTextEditor?.document.uri
            if (!uri) {
                throw new Error()
            }
        }
        const parsedUri = parseCloudWatchLogsUri(uri)
        await vscode.env.clipboard.writeText(parsedUri.streamName)
    } catch (e) {
        vscode.window.showErrorMessage(
            localize(
                'AWS.cloudWatchLogs.invalidEditor',
                'Not a Cloudwatch Log stream: {0}',
                vscode.window.activeTextEditor?.document.fileName
            )
        )
        return
    }
}
