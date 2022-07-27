/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as telemetry from '../../shared/telemetry/telemetry'
import { CloudWatchLogsData, LogStreamRegistry } from '../registry/logStreamRegistry'
import { highlightDocument } from '../document/logStreamDocumentProvider'
import { createURIFromArgs } from '../cloudWatchLogsUtils'
import { isViewAllEvents, TimeFilterResponse, TimeFilterSubmenu } from '../timeFilterSubmenu'

function getActiveUri(registry: LogStreamRegistry) {
    const currentEditor = vscode.window.activeTextEditor
    if (!currentEditor) {
        throw new Error('cwl: Failed to identify active editor.')
    }

    const activeUri = currentEditor.document.uri
    if (!registry.hasLog(activeUri)) {
        throw new Error('cwl: Document open has unregistered uri.')
    }

    return activeUri
}
export async function changeTimeFilter(registry: LogStreamRegistry): Promise<void> {
    let result: telemetry.Result = 'Succeeded'

    const oldUri = getActiveUri(registry)
    const oldData = registry.getLogData(oldUri) as CloudWatchLogsData
    const newTimeRange = (await new TimeFilterSubmenu().prompt()) as TimeFilterResponse

    if (newTimeRange) {
        // Overwrite old data to remove old events, tokens, and filterPattern.
        const newData: CloudWatchLogsData = {
            ...oldData,
            data: [],
            next: undefined,
            previous: undefined,
            parameters: {
                ...oldData.parameters,
                startTime: isViewAllEvents(newTimeRange) ? undefined : newTimeRange.start,
                endTime: isViewAllEvents(newTimeRange) ? undefined : newTimeRange.end,
            },
        }

        // Remove old search
        registry.deregisterLog(oldUri)
        const newUri = createURIFromArgs(oldData.logGroupInfo, oldData.parameters)
        await registry.registerLog(newUri, newData)
        const doc: vscode.TextDocument = await vscode.workspace.openTextDocument(newUri) // calls back into the provider
        vscode.languages.setTextDocumentLanguage(doc, 'log')
        const textEditor = await vscode.window.showTextDocument(doc, { preview: false })
        registry.setTextEditor(newUri, textEditor)
        highlightDocument(registry, newUri)
        vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
            if (event.document.uri.toString() === doc.uri.toString()) {
                highlightDocument(registry, newUri)
            }
        })
        result = 'Succeeded'
    } else {
        result = 'Cancelled'
    }
    console.log(result)
    // This is a placeholder until new telemetry stuff exists
    //telemetry.recordCloudwatchlogsOpenStream({ result })
}
