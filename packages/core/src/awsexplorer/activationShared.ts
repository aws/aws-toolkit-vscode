/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { createToolView, ToolView } from './toolView'
import { telemetry } from '../shared/telemetry/telemetry'
import { CdkRootNode } from '../cdk/explorer/rootNode'
import { once } from '../shared/utilities/functionUtils'

/**
 * Activates vscode Views (eg tree view) that work in any vscode environment (nodejs or browser).
 */
export async function activateViewsShared(context: vscode.ExtensionContext): Promise<void> {}

export function registerToolView(viewNode: ToolView, context: vscode.ExtensionContext) {
    const toolView = createToolView(viewNode)
    context.subscriptions.push(toolView)
    if (viewNode.view === 'aws.cdk') {
        // Legacy CDK behavior. Mostly useful for C9 as they do not have inline buttons.
        toolView.onDidChangeVisibility(({ visible }) => visible && CdkRootNode.instance.refresh())
    }

    toolView.onDidExpandElement(e => {
        if (e.element.resource instanceof CdkRootNode) {
            // Legacy CDK metric, remove this when we add something generic
            const recordExpandCdkOnce = once(() => telemetry.cdk_appExpanded.emit())
            recordExpandCdkOnce()
        }
    })
}
