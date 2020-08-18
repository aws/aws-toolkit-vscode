/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LogStreamRegistry } from '../registry/logStreamRegistry'
import { getLogger } from '../../shared/logger'

export class LogStreamDocumentProvider implements vscode.TextDocumentContentProvider {
    // Expose an event to signal changes of _virtual_ documents
    // to the editor
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>()
    public get onDidChange() {
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
            getLogger().error(`No content found for URI: ${uri}`)
        }

        return content ?? ''
    }
}
