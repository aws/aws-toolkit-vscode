/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { Logger } from '../../../shared/logger'

const localize = nls.loadMessageBundle()

export abstract class AbstractAslVisualizationManager {
    private readonly extensionContext: vscode.ExtensionContext

    public constructor(extensionContext: vscode.ExtensionContext) {
        this.extensionContext = extensionContext
    }

    abstract visualizeStateMachine(
        globalStorage: vscode.Memento,
        input: any
    ): Promise<vscode.WebviewPanel | undefined>

    protected pushToExtensionContextSubscriptions(visualizationDisposable: vscode.Disposable) {
        this.extensionContext.subscriptions.push(visualizationDisposable)
    }

    protected handleErr(err: Error, logger: Logger) {
        vscode.window.showInformationMessage(
            localize(
                'AWS.stepfunctions.visualisation.errors.rendering',
                'There was an error rendering State Machine Graph, check logs for details.'
            )
        )

        logger.debug('Unable to setup webview panel.')
        logger.error(err as Error)
    }
}