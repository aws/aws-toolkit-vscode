/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AbstractAslVisualization } from './abstractAslVisualization'
import { AslVisualization } from './aslVisualization'

export abstract class AbstractAslVisualizationManager {
    protected readonly managedVisualizations: Map<string, AbstractAslVisualization> = new Map<string, AslVisualization>()
    private readonly extensionContext: vscode.ExtensionContext

    public constructor(extensionContext: vscode.ExtensionContext) {
        this.extensionContext = extensionContext
    }

    public getManagedVisualizations(): Map<string, AbstractAslVisualization> {
        return this.managedVisualizations
    }

    abstract visualizeStateMachine(
        globalStorage: vscode.Memento,
        input: any
    ): Promise<vscode.WebviewPanel | undefined>

    protected deleteVisualization(visualizationToDelete: any): void {
        this.managedVisualizations.delete(visualizationToDelete)
    }

    protected pushToExtensionContextSubscriptions(visualizationDisposable: any) {
        this.extensionContext.subscriptions.push(visualizationDisposable)
    }

    protected getExistingVisualization(visualization: any): AbstractAslVisualization | undefined {
        return this.managedVisualizations.get(visualization)
    }
}