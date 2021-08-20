/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { AslVisualizationCDK } from './aslVisualizationCDK'
import { AbstractAslVisualizationManager } from './abstractAslVisualizationManager'
import { ConstructNode } from '../../../cdk/explorer/nodes/constructNode'
import { getLogger } from '../../../shared/logger'
import { StateMachineGraphCache } from '../../utils'

export class AslVisualizationCDKManager extends AbstractAslVisualizationManager {
    protected readonly name: string = 'AslVisualizationCDKManager'
    protected readonly managedVisualizations: Map<string, Map<string, AslVisualizationCDK>> = new Map<
        string,
        Map<string, AslVisualizationCDK>
    >()

    public constructor(extensionContext: vscode.ExtensionContext) {
        super(extensionContext)
    }

    //vscode.Memento passed in to update StateMachineGraphCache on each visualization
    public async visualizeStateMachine(
        globalStorage: vscode.Memento,
        node: ConstructNode
    ): Promise<vscode.WebviewPanel | undefined> {
        const logger = getLogger()
        const cache = new StateMachineGraphCache()
        const cdkOutPath = node.id.replace(`/tree.json/${node.tooltip}`, ``)
        const workspaceName = this.getCDKAppWorkspaceName(cdkOutPath)
        const existingVisualization = this.getExistingVisualization(workspaceName, node.tooltip)
        const stateMachineName = node.label
        const appName = node.tooltip.replace(`/${stateMachineName}`, ``)
        const templatePath = String(cdkOutPath) + `/${appName}.template.json`
        const uri = vscode.Uri.file(templatePath)
        if (existingVisualization) {
            existingVisualization.showPanel()

            return existingVisualization.getPanel()
        }

        // Existing visualization does not exist, construct new visualization
        try {
            await cache.updateCache(globalStorage)

            const textDocument = await vscode.workspace.openTextDocument(uri)
            const newVisualization = new AslVisualizationCDK(textDocument, templatePath, appName, stateMachineName)
            if (newVisualization) {
                this.handleNewVisualization(workspaceName, newVisualization)
                return newVisualization.getPanel()
            }
        } catch (err) {
            this.handleErr(err, logger)
        }

        return
    }

    protected handleNewVisualization(workspaceName: string, newVisualization: AslVisualizationCDK): void {
        let map = this.managedVisualizations.get(workspaceName)
        const uniqueIdentifier = newVisualization.cdkAppName + '/' + newVisualization.stateMachineName
        if (!map) {
            map = new Map<string, AslVisualizationCDK>()
            map.set(uniqueIdentifier, newVisualization)
            this.managedVisualizations.set(workspaceName, map)
        } else {
            map.set(uniqueIdentifier, newVisualization)
        }

        const visualizationDisposable = newVisualization.onVisualizationDisposeEvent(() => {
            this.deleteVisualization(workspaceName, uniqueIdentifier)
        })
        this.pushToExtensionContextSubscriptions(visualizationDisposable)
    }

    public getManagedVisualizations(): Map<string, Map<string, AslVisualizationCDK>> {
        return this.managedVisualizations
    }

    protected deleteVisualization(workspaceName: string, visualizationToDelete: string): void {
        this.managedVisualizations.get(workspaceName)?.delete(visualizationToDelete)
    }

    protected getExistingVisualization(
        workspaceName: string,
        uniqueIdentifier: string
    ): AslVisualizationCDK | undefined {
        return this.managedVisualizations.get(workspaceName)?.get(uniqueIdentifier)
    }

    /**
     * @param {string} cdkOutPath - path to the cdk.out folder
     * @returns name of the CDK application workspace name
     */
    public getCDKAppWorkspaceName(cdkOutPath: string): string {
        if (typeof cdkOutPath != 'string') {
            return cdkOutPath
        }
        cdkOutPath = cdkOutPath.replace('/cdk.out', '')
        return cdkOutPath.substring(cdkOutPath.lastIndexOf('/') + 1, cdkOutPath.length)
    }
}
