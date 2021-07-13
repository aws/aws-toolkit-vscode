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
import { StateMachineGraphCache } from '../../../src/stepFunctions/utils'
import { AbstractAslVisualizationManager } from '../../../src/stepFunctions/commands/visualizeStateMachine/abstractAslVisualizationManager'

export class AslVisualizationCDKManager extends AbstractAslVisualizationManager {

    public constructor(extensionContext: vscode.ExtensionContext) {
        super(extensionContext)
    }

    public override async visualizeStateMachine(
        globalStorage: vscode.Memento,
        node: ConstructNode
    ): Promise<vscode.WebviewPanel | undefined> {
        const logger: Logger = getLogger()
        //not sure if I can use this cache
        const cache = new StateMachineGraphCache()

        // Attempt to retrieve existing visualization if it exists.
        const existingVisualization = this.getExistingVisualization(node.label)
        if (existingVisualization) {
            existingVisualization.showPanel()

            return existingVisualization.getPanel()
        }

        // Existing visualization does not exist, construct new visualization
        try {
            await cache.updateCache(globalStorage)

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

    protected handleNewVisualization(key: string, newVisualization: AslVisualizationCDK): void {
        this.managedVisualizations.set(key, newVisualization)

        const visualizationDisposable = newVisualization.onVisualizationDisposeEvent(() => {
            this.deleteVisualization(newVisualization.uniqueIdentifier)
        })
        this.pushToExtensionContextSubscriptions(visualizationDisposable)
    }
}