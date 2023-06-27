/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { CloudWatchLogsGroupInfo, LogDataRegistry, UriString } from '../registry/logDataRegistry'
import { getLogger } from '../../shared/logger'
import { isCwlUri } from '../cloudWatchLogsUtils'
import { generateTextFromLogEvents, LineToLogStreamMap } from './textContent'

export class LogDataDocumentProvider implements vscode.TextDocumentContentProvider {
    /** Resolves the correct {@link LineToLogStreamMap} instance for a given URI */
    readonly lineToLogStreamMapResolver: Map<UriString, LineToLogStreamMap> = new Map()
    // Expose an event to signal changes of _virtual_ documents
    // to the editor
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>()
    public get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event
    }

    public constructor(private readonly registry: LogDataRegistry) {
        this.registry.onDidChange(uri => {
            getLogger().debug(`Registry item changed: ${uri.path}`)
            this._onDidChange.fire(uri)
        })
    }

    public provideTextDocumentContent(uri: vscode.Uri): string {
        if (!isCwlUri(uri)) {
            throw new Error(`Uri is not a CWL Uri, so no text can be provided: ${uri.toString()}`)
        }
        const events = this.registry.fetchCachedLogEvents(uri)
        const { text, streamIdMap } = generateTextFromLogEvents(events, { timestamps: true })
        this.lineToLogStreamMapResolver.set(uri.toString(), streamIdMap)
        return text
    }

    /**
     * Gives the Log Stream ID at a given line of a given document.
     *
     * The given document uri must have already been processed by this
     * class, otherwise an error will be thrown.
     *
     * * @param lineNumber The line number of the document. Starts at 0, NOT 1!
     */
    public getLogStreamNameAtLine(
        uri: vscode.Uri,
        lineNumber: number
    ): NonNullable<CloudWatchLogsGroupInfo['streamName']> {
        let lineToLogStreamMap = this.lineToLogStreamMapResolver.get(uri.toString())
        if (lineToLogStreamMap === undefined) {
            // Document was not initialized yet, we will initialize and try again.
            this.provideTextDocumentContent(uri)
            lineToLogStreamMap = this.lineToLogStreamMapResolver.get(uri.toString())
            if (lineToLogStreamMap === undefined) {
                throw new Error(`${this.provideTextDocumentContent.name}() should have prevented this error.`)
            }
        }

        const logStreamName = lineToLogStreamMap.get(lineNumber)
        if (logStreamName === undefined) {
            throw new Error(`Line number was not set in LineToLogStreamMap: ${lineNumber}`)
        }
        return logStreamName
    }
}

export function getActiveDocumentUri(registry: LogDataRegistry) {
    const currentEditor = vscode.window.activeTextEditor
    if (!currentEditor) {
        throw new Error('cwl: Failed to identify active editor.')
    }

    const activeUri = currentEditor.document.uri
    if (!registry.isRegistered(activeUri)) {
        throw new Error('cwl: Document open has unregistered uri.')
    }

    return activeUri
}
