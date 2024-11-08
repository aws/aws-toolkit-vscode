/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { cloudwatchLogsLiveTailScheme } from '../../../shared/constants'

export class LiveTailCodeLensProvider implements vscode.CodeLensProvider {
    onDidChangeCodeLenses?: vscode.Event<void> | undefined

    provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        const uri = document.uri
        if (uri.scheme !== cloudwatchLogsLiveTailScheme) {
            return []
        }
        const codeLenses: vscode.CodeLens[] = []
        codeLenses.push(this.buildClearDocumentCodeLens(document))
        codeLenses.push(this.buildStopTailingCodeLens(document))
        return codeLenses
    }

    private buildClearDocumentCodeLens(document: vscode.TextDocument): vscode.CodeLens {
        const range = new vscode.Range(
            new vscode.Position(document.lineCount - 1, 0),
            new vscode.Position(document.lineCount - 1, 0)
        )
        const command: vscode.Command = {
            title: 'Clear document',
            command: 'aws.cwl.clearDocument',
            arguments: [document],
        }
        return new vscode.CodeLens(range, command)
    }

    private buildStopTailingCodeLens(document: vscode.TextDocument): vscode.CodeLens {
        const range = new vscode.Range(
            new vscode.Position(document.lineCount - 1, 0),
            new vscode.Position(document.lineCount - 1, 0)
        )
        const command: vscode.Command = {
            title: 'Stop tailing',
            command: 'aws.cwl.stopTailingLogGroup',
            arguments: [document],
        }
        return new vscode.CodeLens(range, command)
    }
}
