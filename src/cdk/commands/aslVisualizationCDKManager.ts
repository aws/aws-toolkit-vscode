/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { AslVisualizationCDK } from './aslVisualizationCDK'
import { ConstructNode } from '../explorer/nodes/constructNode'
import { getLogger, Logger } from '../../shared/logger'
import { AbstractAslVisualizationManager } from '../../../src/stepFunctions/commands/visualizeStateMachine/abstractAslVisualizationManager'
import { StateMachineGraphCache } from '../../../src/stepFunctions/utils'

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
        const uniqueIdentifier = node.label
        const cdkOutPath = node.id?.replace(`/tree.json/${node.tooltip}`, ``)
        const stackName = node.tooltip?.replace(`/${uniqueIdentifier}`, ``)
        const templatePath = String(cdkOutPath) + `/${stackName}.template.json`
        const uri = vscode.Uri.file(templatePath);
        // Attempt to retrieve existing visualization if it exists.
        const existingVisualization = this.getExistingVisualization(uri.path + uniqueIdentifier)
        if (existingVisualization) {
            existingVisualization.showPanel()

            return existingVisualization.getPanel()
        }

        // Existing visualization does not exist, construct new visualization
        try {
            await cache.updateCache(globalStorage)

            const textDocument = await vscode.workspace.openTextDocument(uri)
            const newVisualization = new AslVisualizationCDK(textDocument, templatePath, uniqueIdentifier)
            if (newVisualization) {
                this.handleNewVisualization(newVisualization)
                return newVisualization.getPanel()
            }
        } catch (err) {
            this.handleErr(err, logger)
        }

        return
    }

    protected handleNewVisualization(newVisualization: AslVisualizationCDK): void {
        this.managedVisualizations.set(newVisualization.documentUri.path + newVisualization.uniqueIdentifier, newVisualization)

        const visualizationDisposable = newVisualization.onVisualizationDisposeEvent(() => {
            this.deleteVisualization(newVisualization.documentUri.path + newVisualization.uniqueIdentifier,)
        })
        this.pushToExtensionContextSubscriptions(visualizationDisposable)
    }
}