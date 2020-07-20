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
import { parseCloudWatchLogsUri } from '../cloudWatchLogsUtils'
import { LogStreamRegistry } from '../registry/logStreamRegistry'
import { recordCloudwatchlogsDownloadStreamToFile, Result } from '../../shared/telemetry/telemetry'

export async function saveCurrentLogStreamContent(uri: vscode.Uri, registry: LogStreamRegistry): Promise<void> {
    let result: Result = 'Succeeded'

    const content = registry.getLogContent(uri, { timestamps: true })
    const workspaceDir = vscode.workspace.workspaceFolders
        ? vscode.workspace.workspaceFolders[0].uri
        : vscode.Uri.file(SystemUtilities.getHomeDirectory())
    const uriComponents = parseCloudWatchLogsUri(uri)

    const localizedLogFile = localize('AWS.command.saveCurrentLogStreamContent.logfile', 'Log File')
    const selectedUri = await vscode.window.showSaveDialog({
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
    recordCloudwatchlogsDownloadStreamToFile({
        result: result,
    })
}
