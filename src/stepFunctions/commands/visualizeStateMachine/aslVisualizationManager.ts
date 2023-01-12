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

        // Attempt to retrieve existing visualization if it exists.
        const existingVisualization = this.getExistingVisualization(document.uri.fsPath)
        if (existingVisualization) {
            existingVisualization.showPanel()

            return existingVisualization.getPanel()
        }

        // Existing visualization does not exist, construct new visualization
        try {
            try {
                await this.cache.updateCache(globalStorage)
            } catch (err) {
                // So we can't update the cache, but can we use an existing on disk version.
                try {
                    logger.warn(
                        'Updating State Machine Graph Visualisation assets failed, checking for fallback local cache.'
                    )
                    await this.cache.confirmCacheExists()
                } catch (err) {
                    logger.error('No local cached State Machine Graph Visualization assets found.')
                    throw err
                }
            }

            const newVisualization = new AslVisualization(document)
            this.handleNewVisualization(document.uri.fsPath, newVisualization)

            return newVisualization.getPanel()
        } catch (err) {
            this.handleErr(err as Error, logger)
        }
    }
}
