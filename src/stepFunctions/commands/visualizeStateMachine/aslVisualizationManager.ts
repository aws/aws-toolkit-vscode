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

    public constructor(extensionContext: vscode.ExtensionContext) {
        super(extensionContext)
    }

    public async visualizeStateMachine(
        globalStorage: vscode.Memento,
        target: vscode.TextDocument | vscode.Uri
    ): Promise<vscode.WebviewPanel | undefined> {
        const logger: Logger = getLogger()
        const document = target instanceof vscode.Uri ? await vscode.workspace.openTextDocument(target) : target

        /* TODO: Determine behaviour when command is run against bad input, or
         * non-json files. Determine if we want to limit the command to only a
         * specifc subset of file types ( .json only, custom .states extension, etc...)
         * Ensure tests are written for this use case as well.
         */

        // Attempt to retrieve existing visualization if it exists.
        const existingVisualization = this.getExistingVisualization(document.uri.fsPath)
        if (existingVisualization) {
            existingVisualization.showPanel()

            return existingVisualization.getPanel()
        }

        // Existing visualization does not exist, construct new visualization
        try {
            await this.cache.updateCache(globalStorage)

            const newVisualization = new AslVisualization(document)
            this.handleNewVisualization(document.uri.fsPath, newVisualization)

            return newVisualization.getPanel()
        } catch (err) {
            this.handleErr(err as Error, logger)
        }
    }
}
