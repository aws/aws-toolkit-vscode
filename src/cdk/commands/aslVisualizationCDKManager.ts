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
    protected readonly managedVisualizations: Map<string, Map<string, AslVisualizationCDK>> = new Map<string, Map<string, AslVisualizationCDK>>()

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
        const appName = getCDKAppName(cdkOutPath!)
        const existingVisualization = this.getExistingVisualization(appName, uniqueIdentifier)
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
                this.handleNewVisualization(appName, newVisualization)
                return newVisualization.getPanel()
            }
        } catch (err) {
            this.handleErr(err, logger)
        }

        return
    }

    protected handleNewVisualization(cdkAppName: string, newVisualization: AslVisualizationCDK): void {
        let map = this.managedVisualizations.get(cdkAppName)
        if (!map) {
            map = new Map<string, AslVisualizationCDK>()
            map.set(newVisualization.uniqueIdentifier, newVisualization)
            this.managedVisualizations.set(cdkAppName, map)
        }
        else map.set(newVisualization.uniqueIdentifier, newVisualization)

        const visualizationDisposable = newVisualization.onVisualizationDisposeEvent(() => {
            this.deleteVisualization(cdkAppName, newVisualization.uniqueIdentifier)
        })
        this.pushToExtensionContextSubscriptions(visualizationDisposable)
    }

    public getManagedVisualizations(): Map<string, Map<string, AslVisualizationCDK>> {
        return this.managedVisualizations
    }

    protected deleteVisualization(cdkAppName: string, visualizationToDelete: string): void {
        this.managedVisualizations.get(cdkAppName)?.delete(visualizationToDelete)
    }

    protected getExistingVisualization(cdkAppName: string, stateMachineName: string): AslVisualizationCDK | undefined {
        return this.managedVisualizations.get(cdkAppName)?.get(stateMachineName)
    }
}

/**
 * @param {string} cdkOutPath - path to the cdk.out folder
 * @returns name of the CDK Application
 */
export function getCDKAppName(cdkOutPath: string) {
    if (typeof (cdkOutPath) != "string") return cdkOutPath;
    cdkOutPath = cdkOutPath.replace('/cdk.out', '')
    return cdkOutPath.substring(cdkOutPath.lastIndexOf("/") + 1, cdkOutPath.length)
};