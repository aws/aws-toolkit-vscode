/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { SystemUtilities } from '../../shared/systemUtilities'
import { isLogStreamUri, parseCloudWatchLogsUri } from '../cloudWatchLogsUtils'
import { telemetry, CloudWatchResourceType, Result } from '../../shared/telemetry/telemetry'
import { FileSystemCommon } from '../../srcShared/fs'

/** Prompts the user to select a file location to save the currently visible "aws-cwl:" document to. */
export async function saveCurrentLogDataContent(): Promise<void> {
    let result: Result = 'Succeeded'
    let resourceType: CloudWatchResourceType = 'logStream' // Default to stream if it fails to find URI

    try {
        // Get URI from active editor.
        const uri = vscode.window.activeTextEditor?.document.uri
        if (!uri) {
            throw new Error()
        }

        resourceType = isLogStreamUri(uri) ? 'logStream' : 'logGroup'
        const content = vscode.window.activeTextEditor?.document.getText()
        const workspaceDir = vscode.workspace.workspaceFolders
            ? vscode.workspace.workspaceFolders[0].uri
            : vscode.Uri.file(SystemUtilities.getHomeDirectory())
        const uriComponents = parseCloudWatchLogsUri(uri)
        const logGroupInfo = uriComponents.logGroupInfo

        const localizedLogFile = localize('AWS.command.saveCurrentLogDataContent.logfile', 'Log File')
        const selectedUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.joinPath(
                workspaceDir,
                logGroupInfo.streamName ? logGroupInfo.streamName : logGroupInfo.groupName
            ),
            filters: {
                [localizedLogFile]: ['log'],
            },
        })

        if (selectedUri && content) {
            try {
                await FileSystemCommon.instance.writeFile(selectedUri, content)
            } catch (e) {
                result = 'Failed'
                const err = e as Error
                void vscode.window.showErrorMessage(
                    localize(
                        'AWS.command.saveCurrentLogDataContent.error',
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
        void vscode.window.showErrorMessage(
            localize(
                'AWS.cwl.invalidEditor',
                'Not a Cloudwatch Log data source: {0}',
                vscode.window.activeTextEditor?.document.fileName
            )
        )
    }

    telemetry.cloudwatchlogs_download.emit({
        result: result,
        cloudWatchResourceType: resourceType,
    })
}
