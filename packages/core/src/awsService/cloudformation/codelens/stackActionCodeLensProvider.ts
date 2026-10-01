/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CancellationToken, CodeLens, CodeLensProvider, Event, EventEmitter, TextDocument } from 'vscode'
import { LanguageClient } from 'vscode-languageclient/node'

const codeLensRequest = 'textDocument/codeLens'

export class StackActionCodeLensProvider implements CodeLensProvider {
    private readonly _onDidChangeCodeLenses = new EventEmitter<void>()
    public readonly onDidChangeCodeLenses: Event<void> = this._onDidChangeCodeLenses.event

    constructor(private readonly client: LanguageClient) {}

    async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
        if (token.isCancellationRequested) {
            return []
        }

        const result = await this.client.sendRequest<CodeLens[]>(
            codeLensRequest,
            { textDocument: { uri: document.uri.toString() } },
            token
        )

        return result || []
    }

    refresh(): void {
        this._onDidChangeCodeLenses.fire()
    }
}
