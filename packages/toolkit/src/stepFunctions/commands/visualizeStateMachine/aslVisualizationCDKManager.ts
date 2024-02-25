/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { AslVisualizationCDK } from './aslVisualizationCDK'
import { AbstractAslVisualizationManager } from './abstractAslVisualizationManager'
import { getLogger } from '../../../shared/logger'

export class AslVisualizationCDKManager extends AbstractAslVisualizationManager<AslVisualizationCDK> {
    protected readonly name: string = 'AslVisualizationCDKManager'

    public constructor(extensionContext: vscode.ExtensionContext) {
        super(extensionContext)
    }

    public async visualizeStateMachine(
        globalStorage: vscode.Memento,
        uri: vscode.Uri
    ): Promise<vscode.WebviewPanel | undefined> {
        const logger = getLogger()
        const existingVisualization = this.getExistingVisualization(this.getKey(uri))

        if (existingVisualization) {
            existingVisualization.showPanel()

            return existingVisualization.getPanel()
        }

        const [appName, resourceName] = uri.fragment.split('/')
        const cdkOutPath = vscode.Uri.joinPath(uri, '..')
        const templateUri = vscode.Uri.joinPath(cdkOutPath, `${appName}.template.json`)

        try {
            await this.cache.updateCache(globalStorage)

            const textDocument = await vscode.workspace.openTextDocument(templateUri.with({ fragment: '' }))
            const newVisualization = new AslVisualizationCDK(textDocument, templateUri.fsPath, resourceName)
            this.handleNewVisualization(this.getKey(uri), newVisualization)

            return newVisualization.getPanel()
        } catch (err) {
            this.handleErr(err as Error, logger)
        }
    }

    private getKey(uri: vscode.Uri): string {
        return `${uri.path}#${uri.fragment}`
    }
}
