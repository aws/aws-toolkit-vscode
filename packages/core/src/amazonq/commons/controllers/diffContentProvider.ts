/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import vscode from 'vscode'
import { getLogger } from '../../../shared/logger/logger'

/**
 * A TextDocumentContentProvider that can handle multiple URIs with the same scheme.
 * This provider maintains a mapping of URIs to their content.
 */
export class DiffContentProvider implements vscode.TextDocumentContentProvider {
    private contentMap = new Map<string, string>()
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>()

    public readonly onDidChange = this._onDidChange.event

    /**
     * Register content for a specific URI
     * @param uri The URI to register content for
     * @param content The content to serve for this URI
     */
    public registerContent(uri: vscode.Uri, content: string): void {
        this.contentMap.set(uri.toString(), content)
        this._onDidChange.fire(uri)
    }

    /**
     * Unregister a URI
     * @param uri The URI to unregister
     */
    public unregisterUri(uri: vscode.Uri): void {
        this.contentMap.delete(uri.toString())
    }

    /**
     * Provides the content for a given URI
     * @param uri The URI to provide content for
     * @returns The content as a string
     */
    public provideTextDocumentContent(uri: vscode.Uri): string {
        const content = this.contentMap.get(uri.toString())

        if (content === undefined) {
            getLogger().warn('No content registered for URI: %s', uri.toString())
            return ''
        }

        return content
    }
}
