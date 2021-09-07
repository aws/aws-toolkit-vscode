/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ConstructNode } from '../../../cdk/explorer/nodes/constructNode'
import { StateMachineGraphCache } from '../../utils'

import { Logger } from '../../../shared/logger'

const localize = nls.loadMessageBundle()

export abstract class AbstractAslVisualizationManager {
    protected abstract name: string
    protected cache: StateMachineGraphCache = new StateMachineGraphCache()

    public constructor(private readonly extensionContext: vscode.ExtensionContext) {}

    public abstract visualizeStateMachine(
        globalStorage: vscode.Memento,
        input: vscode.TextEditor | ConstructNode | undefined
    ): Promise<vscode.WebviewPanel | undefined>

    protected pushToExtensionContextSubscriptions(visualizationDisposable: vscode.Disposable): void {
        this.extensionContext.subscriptions.push(visualizationDisposable)
    }

    protected handleErr(err: Error, logger: Logger): void {
        vscode.window.showInformationMessage(
            localize(
                'AWS.stepfunctions.visualisation.errors.rendering',
                'There was an error rendering State Machine Graph, check logs for details.'
            )
        )

        logger.debug(`${this.name}: Unable to setup webview panel.`)
        logger.error(`${this.name}: unexpected exception: %O`, err)
    }
}
