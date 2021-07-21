/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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

    public async visualizeStateMachine(
        globalStorage: vscode.Memento,
        node: ConstructNode
    ): Promise<vscode.WebviewPanel | undefined> {
        const logger: Logger = getLogger()
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
            const uniqueIdentifier = node.label
            const cdkOutPath = node.id?.replace(`/tree.json/${node.tooltip}`, ``)
            const stackName = node.tooltip?.replace(`/${node.label}`, ``)
            // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
            const templatePath = cdkOutPath + `/${stackName}.template.json`
            const uri = vscode.Uri.file(templatePath);
            const textDocument = await vscode.workspace.openTextDocument(uri)
            //const newVisualization = await renderGraphCommand(node)
            const newVisualization = new AslVisualizationCDK(textDocument, templatePath, uniqueIdentifier)
            if (newVisualization) {
                this.handleNewVisualization(node.label, newVisualization)
                return newVisualization.getPanel()
            }
        } catch (err) {
            this.handleErr(err, logger)
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