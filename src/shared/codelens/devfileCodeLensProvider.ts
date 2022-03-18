/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'

export class MdeDevfileCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>()
    public get onDidChangeCodeLenses(): vscode.Event<void> {
        return this._onDidChangeCodeLenses.event
    }

    public provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        const uri = document.uri
        const codelenses = [
            {
                // TODO: handle both create and update case based on current context
                range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
                isResolved: true,
                command: {
                    title: localize('AWS.mde.codeLens.updateMde', 'Update MDE'),
                    command: 'aws.mde.update', // placeholder
                    arguments: [],
                },
            },
        ]

        return uri.scheme === 'file' ? codelenses : []
    }
}
