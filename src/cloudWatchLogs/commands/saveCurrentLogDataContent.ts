/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as fs from 'fs-extra'
import { SystemUtilities } from '../../shared/systemUtilities'
import { isLogStreamUri, parseCloudWatchLogsUri } from '../cloudWatchLogsUtils'
import { LogDataRegistry } from '../registry/logDataRegistry'
import { telemetry, CloudWatchResourceType, Result } from '../../shared/telemetry/telemetry'
import { generateTextFromLogEvents } from '../document/textContent'

export async function saveCurrentLogDataContent(uri: vscode.Uri | undefined, registry: LogDataRegistry): Promise<void> {
    let result: Result = 'Succeeded'
    let resourceType: CloudWatchResourceType = 'logStream' // Default to stream if it fails to find URI

    try {
        if (!uri) {
            // No URI = used command palette as entrypoint, attempt to get URI from active editor
            // should work correctly under any normal circumstances since the action only appears in command palette when the editor is a CloudWatch Logs editor
            uri = vscode.window.activeTextEditor?.document.uri
            if (!uri) {
                throw new Error()
            }
        }
        resourceType = isLogStreamUri(uri) ? 'logStream' : 'logGroup'
        const cachedLogEvents = registry.fetchCachedLogEvents(uri)
        const content: string = generateTextFromLogEvents(cachedLogEvents, { timestamps: true }).text
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

        if (selectedUri) {
            try {
                await fs.writeFile(selectedUri.fsPath, content)
                // TODO: Open file and close virtual doc? Is this possible?
            } catch (e) {
                result = 'Failed'
                const err = e as Error
                vscode.window.showErrorMessage(
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
        vscode.window.showErrorMessage(
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
