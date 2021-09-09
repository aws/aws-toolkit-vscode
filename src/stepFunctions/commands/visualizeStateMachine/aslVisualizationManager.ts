/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { AbstractAslVisualizationManager } from './abstractAslVisualizationManager'
import { AslVisualization } from './aslVisualization'
import { getLogger, Logger } from '../../../shared/logger'

export class AslVisualizationManager extends AbstractAslVisualizationManager {
    protected readonly name: string = 'AslVisualizationManager'
    private readonly managedVisualizations: Map<string, AslVisualization> = new Map<string, AslVisualization>()

    public constructor(extensionContext: vscode.ExtensionContext) {
        super(extensionContext)
    }

    public async visualizeStateMachine(
        globalStorage: vscode.Memento,
        activeTextEditor: vscode.TextEditor | undefined
    ): Promise<vscode.WebviewPanel | undefined> {
        const logger: Logger = getLogger()

        /* TODO: Determine behaviour when command is run against bad input, or
         * non-json files. Determine if we want to limit the command to only a
         * specifc subset of file types ( .json only, custom .states extension, etc...)
         * Ensure tests are written for this use case as well.
         */

        // Output channel is considered a text editor by VSCode (which we don't want)
        // This check is required to prevent integration tests from failing due to the Go extension
        if (!activeTextEditor || activeTextEditor.document.fileName.includes('extension-output')) {
            logger.error('Could not get active text editor for state machine render.')
            throw new Error('Could not get active text editor for state machine render.')
        }

        const textDocument: vscode.TextDocument = activeTextEditor.document

        // Attempt to retrieve existing visualization if it exists.
        const existingVisualization = this.getExistingVisualization(textDocument.uri.fsPath)
        if (existingVisualization) {
            existingVisualization.showPanel()

            return existingVisualization.getPanel()
        }

        // Existing visualization does not exist, construct new visualization
        try {
            await this.cache.updateCache(globalStorage)

            const newVisualization = new AslVisualization(textDocument)
            this.handleNewVisualization(newVisualization)

            return newVisualization.getPanel()
        } catch (err) {
            this.handleErr(err as Error, logger)
        }

        return
    }

    private handleNewVisualization(newVisualization: AslVisualization): void {
        this.managedVisualizations.set(newVisualization.documentUri.fsPath, newVisualization)

        const visualizationDisposable = newVisualization.onVisualizationDisposeEvent(() => {
            this.deleteVisualization(newVisualization.documentUri.fsPath)
        })
        this.pushToExtensionContextSubscriptions(visualizationDisposable)
    }

    public getManagedVisualizations(): Map<string, AslVisualization> {
        return this.managedVisualizations
    }

    private deleteVisualization(visualizationToDelete: string): void {
        this.managedVisualizations.delete(visualizationToDelete)
    }

    private getExistingVisualization(visualization: string): AslVisualization | undefined {
        return this.managedVisualizations.get(visualization)
    }
}
