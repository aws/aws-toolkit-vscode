/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as telemetry from '../shared/telemetry/telemetry'
import { showInputBox } from '../shared/ui/inputPrompter'
import { createURIFromArgs } from './cloudWatchLogsUtils'
import { getActiveUri, highlightDocument } from './document/logStreamDocumentProvider'
import { CloudWatchLogsData, filterLogEventsFromUriComponents, LogStreamRegistry } from './registry/logStreamRegistry'
import { isViewAllEvents, TimeFilterResponse, TimeFilterSubmenu } from './timeFilterSubmenu'

type ChangeableParam = 'filterPattern' | 'timeFilter'

export async function changeLogSearchParams(registry: LogStreamRegistry, param: ChangeableParam): Promise<void> {
    let result: telemetry.Result = 'Succeeded'

    const oldUri = getActiveUri(registry)
    const oldData = registry.getLogData(oldUri) as CloudWatchLogsData
    const newData: CloudWatchLogsData = {
        ...oldData,
        data: [],
        next: undefined,
        previous: undefined,
    }

    switch (param) {
        case 'filterPattern':
            const newPattern = await showInputBox({
                title: 'Log Group Keyword Search',
                placeholder: oldData.parameters.filterPattern ?? 'Enter Text Here',
            })
            if (newPattern === undefined) {
                result = 'Cancelled'
                return
            }
            newData.parameters.filterPattern = newPattern

            break

        case 'timeFilter':
            const newTimeRange = (await new TimeFilterSubmenu().prompt()) as TimeFilterResponse
            if (newTimeRange === undefined) {
                result = 'Cancelled'
                return
            }
            newData.parameters.startTime = isViewAllEvents(newTimeRange) ? undefined : newTimeRange.start
            newData.parameters.endTime = isViewAllEvents(newTimeRange) ? undefined : newTimeRange.end

            break
    }

    if (newData.parameters.streamName) {
        newData.retrieveLogsFunction = filterLogEventsFromUriComponents
        newData.parameters.streamNameOptions = [newData.parameters.streamName]
        newData.parameters.streamName = undefined
    }

    registry.deregisterLog(oldUri)
    const newUri = createURIFromArgs(oldData.logGroupInfo, oldData.parameters)
    await registry.registerLog(newUri, newData)
    const doc = await vscode.workspace.openTextDocument(newUri) // calls back into the provider
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
}
