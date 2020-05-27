/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import * as vscode from 'vscode'
import { getLogger, Logger } from '../../../shared/logger'
import { StateMachineGraphCache } from '../../utils'
import { AslVisualization } from './aslVisualization'

export class AslVisualizationManager {
    protected readonly managedVisualizations: Map<string, AslVisualization> = new Map<string, AslVisualization>()
    private readonly extensionContext: vscode.ExtensionContext

    public constructor(extensionContext: vscode.ExtensionContext) {
        this.extensionContext = extensionContext
    }

    public getManagedVisualizations(): Map<string, AslVisualization> {
        return this.managedVisualizations
    }

    public async visualizeStateMachine(globalStorage: vscode.Memento): Promise<vscode.WebviewPanel | undefined> {
        const logger: Logger = getLogger()
        const cache = new StateMachineGraphCache()

        /* TODO: Determine behaviour when command is run against bad input, or
         * non-json files. Determine if we want to limit the command to only a
         * specifc subset of file types ( .json only, custom .states extension, etc...)
         * Ensure tests are written for this use case as well.
         */
        const activeTextEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor

        if (!activeTextEditor) {
            logger.error('Could not get active text editor for state machine render.')
            throw new Error('Could not get active text editor for state machine render.')
        }

        const textDocument: vscode.TextDocument = activeTextEditor.document

        // Attempt to retrieve existing visualization if it exists.
        const existingVisualization = this.getExistingVisualization(textDocument.uri)
        if (existingVisualization) {
            existingVisualization.showPanel()

            return existingVisualization.getPanel()
        }

        // Existing visualization does not exist, construct new visualization
        try {
            await cache.updateCache(globalStorage)

            const newVisualization = new AslVisualization(textDocument)
            this.handleNewVisualization(newVisualization)

            return newVisualization.getPanel()
        } catch (err) {
            vscode.window.showInformationMessage(
                localize(
                    'AWS.stepfunctions.visualisation.errors.rendering',
                    'There was an error rendering State Machine Graph, check logs for details.'
                )
            )

            logger.debug('Unable to setup webview panel.')
            logger.error(err as Error)
        }

        return
    }

    private deleteVisualization(visualizationToDelete: AslVisualization): void {
        this.managedVisualizations.delete(visualizationToDelete.documentUri.path)
    }

    private handleNewVisualization(newVisualization: AslVisualization): void {
        this.managedVisualizations.set(newVisualization.documentUri.path, newVisualization)

        const visualizationDisposable = newVisualization.onVisualizationDisposeEvent(() => {
            this.deleteVisualization(newVisualization)
        })
        this.extensionContext.subscriptions.push(visualizationDisposable)
    }

    private getExistingVisualization(uriToFind: vscode.Uri): AslVisualization | undefined {
        return this.managedVisualizations.get(uriToFind.path)
    }
}
