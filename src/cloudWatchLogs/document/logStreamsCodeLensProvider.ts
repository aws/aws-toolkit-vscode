/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CLOUDWATCH_LOGS_SCHEME } from '../../shared/constants'
import { CloudWatchLogsGroupInfo, LogDataRegistry } from '../registry/logDataRegistry'
import {
    CloudWatchLogsSettings,
    createURIFromArgs,
    isLogStreamUri,
    parseCloudWatchLogsUri,
} from '../cloudWatchLogsUtils'
import { LogDataDocumentProvider } from './logDataDocumentProvider'

type IdWithLine = { streamId: string; lineNum: number }

/** Provides the "View Full Log Stream..." codelens. */
export class LogStreamCodeLensProvider implements vscode.CodeLensProvider {
    /**
     * Constructor
     *
     * @param documentProvider We specifically want {@link LogDataDocumentProvider} since it manages the stream
     *                         id map which this class will read data from.
     */
    public constructor(
        private readonly registry: LogDataRegistry,
        private readonly documentProvider: LogDataDocumentProvider
    ) {}

    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>()
    public get onDidChangeCodeLenses(): vscode.Event<void> {
        return this._onDidChangeCodeLenses.event
    }

    public async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[] | null | undefined> {
        const uri = document.uri

        if (uri.scheme !== CLOUDWATCH_LOGS_SCHEME || isLogStreamUri(uri)) {
            return []
        }

        const logGroupInfo = parseCloudWatchLogsUri(uri).logGroupInfo

        if (logGroupInfo.streamName) {
            // This means we have a stream file not a log search.
            return
        }

        const codelenses: vscode.CodeLens[] = []

        const linesToGenerateCodeLens = await this.getStartingLineOfEachStreamId(document)

        // Create a code lens at the start of each Log Stream in the document
        linesToGenerateCodeLens.forEach(idWithLine => {
            codelenses.push(this.createLogStreamCodeLens(logGroupInfo, idWithLine))
        })
        return codelenses
    }

    createLogStreamCodeLens(logGroupInfo: CloudWatchLogsGroupInfo, idWithLine: IdWithLine): vscode.CodeLens {
        const settings = new CloudWatchLogsSettings()
        const limit = settings.get('limit', 1000)
        const streamUri = createURIFromArgs({ ...logGroupInfo, streamName: idWithLine.streamId }, { limit: limit })
        const cmd: vscode.Command = {
            command: 'aws.loadLogStreamFile',
            arguments: [streamUri, this.registry],
            title: 'View Full Log Stream...',
            tooltip: 'Open the full Log Stream associated with these search results',
        }
        const codeLensLocation = new vscode.Range(idWithLine.lineNum, 0, idWithLine.lineNum, 0)
        return new vscode.CodeLens(codeLensLocation, cmd)
    }

    /**
     * Gets the Log Stream Id + Line number it starts at for each Log Stream
     * in the given document.
     */
    private async getStartingLineOfEachStreamId(document: vscode.TextDocument): Promise<IdWithLine[]> {
        const result: IdWithLine[] = []

        let currLine = 0
        let lastStreamId = ''
        while (currLine < document.lineCount - 1) {
            const currStreamId = this.documentProvider.getLogStreamNameAtLine(document.uri, currLine)

            if (currStreamId === undefined) {
                throw new Error(`uriToStreamIdMap does not reflect the latest content of: ${document.uri.toString()}`)
            }

            if (currStreamId === lastStreamId) {
                currLine++
                continue
            }
            result.push({ streamId: currStreamId, lineNum: currLine })
            currLine++
            lastStreamId = currStreamId
        }
        return result
    }
}

export async function openLogStreamFile(uri: vscode.Uri, registry: LogDataRegistry): Promise<void> {
    const td = await vscode.workspace.openTextDocument(uri)
    await Promise.all([
        vscode.window.showTextDocument(td),
        vscode.languages.setTextDocumentLanguage(td, 'log'),
        registry.fetchNextLogEvents(uri, true),
    ])
}
