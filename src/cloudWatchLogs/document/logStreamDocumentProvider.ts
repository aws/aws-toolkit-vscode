/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as telemetry from '../../shared/telemetry/telemetry'
import * as vscode from 'vscode'
import {
    CloudWatchLogsParameters,
    getLogEventsFromUriComponents,
    LogStreamRegistry,
    getInitialLogData,
} from '../registry/logStreamRegistry'
import { getLogger } from '../../shared/logger'
import { parseCloudWatchLogsUri, createURIFromArgs } from '../cloudWatchLogsUtils'

export class LogStreamDocumentProvider implements vscode.TextDocumentContentProvider, vscode.DefinitionProvider {
    // Expose an event to signal changes of _virtual_ documents
    // to the editor
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>()
    public get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event
    }

    public constructor(private readonly registry: LogStreamRegistry) {
        this.registry.onDidChange(uri => {
            getLogger().debug(`Registry item changed: ${uri.path}`)
            this._onDidChange.fire(uri)
        })
    }

    public provideTextDocumentContent(uri: vscode.Uri): string {
        // get latest content and return
        const content = this.registry.getLogContent(uri, { timestamps: true })
        if (!content) {
            getLogger().error(`No content found for URI: ${uri.path}`)
        }
        return content ?? ''
    }

    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | vscode.LocationLink[] | undefined> {
        const activeUri = document.uri
        const logGroupInfo = parseCloudWatchLogsUri(activeUri).logGroupInfo
        if (logGroupInfo.streamName) {
            // This means we have a stream file not a log search.
            // TODO: Should there be any telemetry output here?
            return
        }
        const curLine = document.lineAt(position.line)
        try {
            const streamIDMap = this.registry.getStreamIdMap(activeUri)
            if (!streamIDMap || streamIDMap.size === 0) {
                throw new Error(`cwl: No streamIDMap found for stream with uri ${activeUri.path}`)
            }
            const streamID = streamIDMap.get(curLine.lineNumber)

            if (!streamID) {
                throw new Error(
                    `cwl: current line number ${curLine.lineNumber} is unregistered in streamIDMap for ${activeUri}`
                )
            }
            const parameters: CloudWatchLogsParameters = {
                limit: this.registry.configuration.get('limit', 10000),
            }
            logGroupInfo.streamName = streamID
            const initialStreamData = getInitialLogData(logGroupInfo, parameters, getLogEventsFromUriComponents)
            const streamUri = createURIFromArgs(logGroupInfo, parameters)

            await this.registry.registerLog(streamUri, initialStreamData)
            const doc = await vscode.workspace.openTextDocument(streamUri)
            vscode.languages.setTextDocumentLanguage(doc, 'log')

            telemetry.recordCloudwatchlogsJumpToStream({ result: 'Succeeded' })
            return new vscode.Location(streamUri, new vscode.Position(0, 0))
        } catch (err) {
            telemetry.recordCloudwatchlogsJumpToStream({ result: 'Failed' })

            throw new Error(`cwl: Error determining definition for content in ${document.fileName}`)
        }
    }
}

export function getActiveDocumentUri(registry: LogStreamRegistry) {
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
