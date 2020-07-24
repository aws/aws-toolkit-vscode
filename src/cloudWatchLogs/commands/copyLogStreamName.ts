/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { parseCloudWatchLogsUri } from '../cloudWatchLogsUtils'

export async function copyLogStreamName(uri?: vscode.Uri): Promise<void> {
    if (!uri) {
        uri = vscode.window.activeTextEditor?.document.uri
        if (!uri) {
            vscode.window.showErrorMessage(
                localize('aws.cloudWatchLogs.invalidEditor', 'Current editor is not a valid Cloudwatch Logs editor.')
            )
            return
        }
    }
    try {
        const parsedUri = parseCloudWatchLogsUri(uri)
        await vscode.env.clipboard.writeText(parsedUri.streamName)
    } catch (e) {
        vscode.window.showErrorMessage(
            localize('aws.cloudWatchLogs.invalidEditor', 'Current editor is not a valid Cloudwatch Logs editor.')
        )
        return
    }
}
