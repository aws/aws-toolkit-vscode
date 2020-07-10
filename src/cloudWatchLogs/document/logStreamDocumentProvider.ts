/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LogStreamRegistry } from '../registry/logStreamRegistry'
import { getLogger } from '../../shared/logger'

export class LogStreamDocumentProvider implements vscode.TextDocumentContentProvider {
    public constructor() {}

    // Expose an event to signal changes of _virtual_ documents
    // to the editor
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>()
    public get onDidChange() {
        return this._onDidChange.event
    }

    public provideTextDocumentContent(uri: vscode.Uri): string {
        const registry = LogStreamRegistry.getLogStreamRegistry()
        // get latest content and return
        const content = registry.getLogContent(uri)
        if (!content) {
            getLogger().error(`No content found for URI: ${uri}`)
        }

        return content ?? ''
    }
}
