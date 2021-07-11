/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import * as vscode from 'vscode'
import { getLogger, Logger } from '../../shared/logger'
import { AslVisualizationCDK } from './aslVisualizationCDK'
import { ConstructNode } from '../explorer/nodes/constructNode'
import { renderGraphCommand } from './renderGraph'

export class AslVisualizationCDKManager {
    protected readonly managedVisualizations: Map<string, AslVisualizationCDK> = new Map<string, AslVisualizationCDK>()
    private readonly extensionContext: vscode.ExtensionContext

    public constructor(extensionContext: vscode.ExtensionContext) {
        this.extensionContext = extensionContext
    }

    public getManagedVisualizations(): Map<string, AslVisualizationCDK> {
        return this.managedVisualizations
    }

    public async visualizeStateMachine(
        globalStorage: vscode.Memento,
        node: ConstructNode
    ): Promise<vscode.WebviewPanel | undefined> {
        const logger: Logger = getLogger()
        //const cache = new StateMachineGraphCache()

        // Attempt to retrieve existing visualization if it exists.
        const existingVisualization = this.getExistingVisualization(node.label)
        if (existingVisualization) {
            existingVisualization.showPanel()

            return existingVisualization.getPanel()
        }

        // Existing visualization does not exist, construct new visualization
        try {
            //await cache.updateCache(globalStorage)

            const newVisualization = await renderGraphCommand(node)
            if (newVisualization) {
                this.handleNewVisualization(node.label, newVisualization)
                return newVisualization.getPanel()
            }
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

    private deleteVisualization(visualizationToDelete: AslVisualizationCDK): void {
        this.managedVisualizations.delete(visualizationToDelete.uniqueIdentifier)
    }

    private handleNewVisualization(key: string, newVisualization: AslVisualizationCDK): void {
        this.managedVisualizations.set(key, newVisualization)

        const visualizationDisposable = newVisualization.onVisualizationDisposeEvent(() => {
            this.deleteVisualization(newVisualization)
        })
        this.extensionContext.subscriptions.push(visualizationDisposable)
    }

    private getExistingVisualization(uniqueIdentifier: string): AslVisualizationCDK | undefined {
        return this.managedVisualizations.get(uniqueIdentifier)
    }
}