/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { getLogger, Logger } from '../shared/logger/logger'
import * as vscode from 'vscode'
import { SamVisualization } from './samVisualization'
export class SamVisualizationManager {
    private readonly extensionContext: vscode.ExtensionContext
    // Maps a path to a template file to a SamVisualization
    public readonly managedVisualizations: Map<string, SamVisualization>

    public constructor(extensionContext: vscode.ExtensionContext) {
        this.extensionContext = extensionContext
        this.managedVisualizations = new Map<string, SamVisualization>()
    }

    /**
     * Creates and renders a new SamVisualization, or shows an existing one.
     * @param activeTextEditor The TextEditor whose contents are used to construct a SamVisualization
     * @returns
     */
    public renderSamVisualization(activeTextEditor?: vscode.TextEditor): vscode.WebviewPanel | undefined {
        const logger: Logger = getLogger()

        // Output channel is considered a text editor by VSCode (which we don't want)
        // This check is required to prevent integration tests from failing due to the Go extension
        if (!activeTextEditor || activeTextEditor.document.fileName.includes('extension-output')) {
            logger.error(
                'Could not get active text editor. Ensure there is a text editor open containing a valid CloudFormation template to render.'
            )
            throw new Error(
                'Could not get active text editor. Ensure there is a text editor open containing a valid CloudFormation template to render.'
            )
        }

        const textDocument: vscode.TextDocument = activeTextEditor.document
        const existingVisualization = this.getExistingVisualization(textDocument.uri)

        if (existingVisualization) {
            existingVisualization.revealPanel()
            return existingVisualization.webviewPanel
        } else {
            const newVisualization = new SamVisualization(activeTextEditor.document, this.extensionContext)
            this.handleNewVisualization(newVisualization)
            return newVisualization.webviewPanel
        }
    }

    private getExistingVisualization(uriToFind: vscode.Uri): SamVisualization | undefined {
        return this.managedVisualizations.get(uriToFind.path)
    }

    private deleteVisualization(visualizationToDelete: SamVisualization): void {
        this.managedVisualizations.delete(visualizationToDelete.textDocumentUri.path)
    }

    private handleNewVisualization(newVisualization: SamVisualization): void {
        this.managedVisualizations.set(newVisualization.textDocumentUri.path, newVisualization)

        const visualizationDisposable = newVisualization.onVisualizationDisposeEvent(() => {
            this.deleteVisualization(newVisualization)
        })
        this.extensionContext.subscriptions.push(visualizationDisposable)
    }
}
