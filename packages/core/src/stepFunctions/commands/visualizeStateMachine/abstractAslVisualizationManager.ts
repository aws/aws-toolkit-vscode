/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { StateMachineGraphCache } from '../../utils'

import { Logger } from '../../../shared/logger/logger'
import { AslVisualization } from './aslVisualization'

const localize = nls.loadMessageBundle()

export abstract class AbstractAslVisualizationManager<T extends AslVisualization = AslVisualization> {
    protected abstract readonly name: string
    protected readonly managedVisualizations = new Map<string, T>()
    protected readonly cache = new StateMachineGraphCache()

    public constructor(private readonly extensionContext: vscode.ExtensionContext) {}

    public abstract visualizeStateMachine(uri: vscode.Uri): Promise<vscode.WebviewPanel | undefined>

    protected pushToExtensionContextSubscriptions(visualizationDisposable: vscode.Disposable): void {
        this.extensionContext.subscriptions.push(visualizationDisposable)
    }

    protected handleErr(err: Error, logger: Logger): void {
        void vscode.window.showInformationMessage(
            localize(
                'AWS.stepfunctions.visualisation.errors.rendering',
                'There was an error rendering State Machine Graph, check logs for details.'
            )
        )

        logger.debug(`${this.name}: Unable to setup webview panel.`)
        logger.error(`${this.name}: unexpected exception: %s`, err)
    }

    public getManagedVisualizations(): Map<string, T> {
        return this.managedVisualizations
    }

    protected handleNewVisualization(key: string, visualization: T): void {
        this.managedVisualizations.set(key, visualization)

        const visualizationDisposable = visualization.onVisualizationDisposeEvent(() => {
            this.managedVisualizations.delete(key)
        })
        this.pushToExtensionContextSubscriptions(visualizationDisposable)
    }

    protected getExistingVisualization(key: string): T | undefined {
        return this.managedVisualizations.get(key)
    }

    protected async updateCache(logger: Logger): Promise<void> {
        try {
            await this.cache.updateCache()
        } catch (err) {
            // So we can't update the cache, but can we use an existing on disk version.
            logger.warn('Updating State Machine Graph Visualisation assets failed, checking for fallback local cache.')
            await this.cache.confirmCacheExists()
        }
    }
}
