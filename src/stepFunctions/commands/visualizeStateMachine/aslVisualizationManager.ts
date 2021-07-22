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
import { AbstractAslVisualizationManager } from './abstractAslVisualizationManager'

export class AslVisualizationManager extends AbstractAslVisualizationManager {

    public constructor(extensionContext: vscode.ExtensionContext) {
        super(extensionContext)
    }

    public async visualizeStateMachine(
        globalStorage: vscode.Memento,
        activeTextEditor: vscode.TextEditor | undefined
    ): Promise<vscode.WebviewPanel | undefined> {
        const logger: Logger = getLogger()
        const cache = new StateMachineGraphCache()

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
        const existingVisualization = this.getExistingVisualization(textDocument.uri.path)
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
            this.handleErr(err, logger)
        }

        return
    }

    protected handleNewVisualization(newVisualization: AslVisualization): void {
        this.managedVisualizations.set(newVisualization.documentUri.path, newVisualization)

        const visualizationDisposable = newVisualization.onVisualizationDisposeEvent(() => {
            this.deleteVisualization(newVisualization.documentUri.path)
        })
        this.pushToExtensionContextSubscriptions(visualizationDisposable)
    }
}
