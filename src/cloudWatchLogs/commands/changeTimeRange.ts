/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as telemetry from '../../shared/telemetry/telemetry'
import { CloudWatchLogsData, LogStreamRegistry } from '../registry/logStreamRegistry'
import { highlightDocument } from '../document/logStreamDocumentProvider'
import { createURIFromArgs } from '../cloudWatchLogsUtils'
import { showInputBox } from '../../shared/ui/inputPrompter'

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
export async function changeFilterPattern(registry: LogStreamRegistry): Promise<void> {
    let result: telemetry.Result = 'Succeeded'

    const oldUri = getActiveUri(registry)
    const oldData = registry.getLogData(oldUri) as CloudWatchLogsData
    const newPattern = await showInputBox({
        title: 'Keyword Search',
        placeholder: 'Enter text here',
    })

    if (newPattern) {
        // Overwrite old data to remove old events, tokens, and filterPattern.
        const newData: CloudWatchLogsData = {
            ...oldData,
            data: [],
            next: undefined,
            previous: undefined,
            parameters: {
                ...oldData.parameters,
                filterPattern: newPattern,
            },
        }

        // Remove old search
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
    } else {
        result = 'Cancelled'
    }
    // This is a placeholder until new telemetry stuff exists
    //telemetry.recordCloudwatchlogsOpenStream({ result })
}
