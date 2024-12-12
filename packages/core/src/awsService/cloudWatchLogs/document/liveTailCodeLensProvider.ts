/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { cloudwatchLogsLiveTailScheme } from '../../../shared/constants'
import { LiveTailSessionRegistry } from '../registry/liveTailSessionRegistry'
import { uriToKey } from '../cloudWatchLogsUtils'

export class LiveTailCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event

    public constructor(private readonly registry: LiveTailSessionRegistry) {}

    public provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        const uri = document.uri
        // if registry does not contain session, it is assumed to have been stopped, thus, hide lenses.
        if (uri.scheme !== cloudwatchLogsLiveTailScheme || !this.registry.has(uriToKey(uri))) {
            return []
        }
        const codeLenses: vscode.CodeLens[] = []
        codeLenses.push(this.buildClearDocumentCodeLens(document))
        codeLenses.push(this.buildStopTailingCodeLens(document))
        return codeLenses
    }

    public refresh() {
        this._onDidChangeCodeLenses.fire()
    }

    private buildClearDocumentCodeLens(document: vscode.TextDocument): vscode.CodeLens {
        const range = this.getBottomOfDocumentRange(document)
        const command: vscode.Command = {
            title: 'Clear document',
            command: 'aws.cwl.clearDocument',
            arguments: [document],
        }
        return new vscode.CodeLens(range, command)
    }

    private buildStopTailingCodeLens(document: vscode.TextDocument): vscode.CodeLens {
        const range = this.getBottomOfDocumentRange(document)
        const command: vscode.Command = {
            title: 'Stop tailing',
            command: 'aws.cwl.stopTailingLogGroup',
            arguments: [document, 'codeLens'],
        }
        return new vscode.CodeLens(range, command)
    }

    private getBottomOfDocumentRange(document: vscode.TextDocument): vscode.Range {
        return new vscode.Range(
            new vscode.Position(document.lineCount - 1, 0),
            new vscode.Position(document.lineCount - 1, 0)
        )
    }
}
