/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as fs from 'fs-extra'
import * as path from 'path'
import { SystemUtilities } from '../../shared/systemUtilities'
import { recordCloudwatchlogsDownloadStreamToFile, Result } from '../../shared/telemetry/telemetry'
import { Window } from '../../shared/vscode/window'
import { parseCloudWatchLogsUri } from '../cloudWatchLogsUtils'
import { LogStreamRegistry } from '../registry/logStreamRegistry'

export async function saveCurrentLogStreamContent(
    uri: vscode.Uri | undefined,
    registry: LogStreamRegistry,
    window = Window.vscode()
): Promise<void> {
    let result: Result = 'Succeeded'

    try {
        if (!uri) {
            // No URI = used command palette as entrypoint, attempt to get URI from active editor
            // should work correctly under any normal circumstances since the action only appears in command palette when the editor is a CloudWatch Logs editor
            uri = vscode.window.activeTextEditor?.document.uri
            if (!uri) {
                throw new Error()
            }
        }
        const content = registry.getLogContent(uri, { timestamps: true })
        const workspaceDir = vscode.workspace.workspaceFolders
            ? vscode.workspace.workspaceFolders[0].uri
            : vscode.Uri.file(SystemUtilities.getHomeDirectory())
        const uriComponents = parseCloudWatchLogsUri(uri)

        const localizedLogFile = localize('AWS.command.saveCurrentLogStreamContent.logfile', 'Log File')
        const selectedUri = await window.showSaveDialog({
            defaultUri: vscode.Uri.parse(path.join(workspaceDir.toString(), uriComponents.streamName)),
            filters: {
                [localizedLogFile]: ['log'],
            },
        })

        if (selectedUri) {
            try {
                await fs.writeFile(selectedUri.fsPath, content)
                // TODO: Open file and close virtual doc? Is this possible?
            } catch (e) {
                result = 'Failed'
                const err = e as Error
                vscode.window.showErrorMessage(
                    localize(
                        'AWS.command.saveCurrentLogStreamContent.error',
                        'Error saving current log to {0}: {1}',
                        selectedUri.fsPath,
                        err.message
                    )
                )
            }
        } else {
            result = 'Cancelled'
        }
    } catch (e) {
        result = 'Failed'
        vscode.window.showErrorMessage(
            localize(
                'AWS.cloudWatchLogs.invalidEditor',
                'Not a Cloudwatch Log stream: {0}',
                vscode.window.activeTextEditor?.document.fileName
            )
        )
    }

    recordCloudwatchlogsDownloadStreamToFile({
        result: result,
    })
}
