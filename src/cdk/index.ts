/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { awsexplorer } from '../modules.gen'
import { once } from '../shared/utilities/functionUtils'
import { telemetry } from '../shared/telemetry/telemetry'
import { Commands } from '../shared/vscode/commands2'
import { CdkRootNode } from './explorer/rootNode'
import { cdkDocumentationUrl } from '../shared/constants'

export async function activate(ctx: vscode.ExtensionContext, explorer: awsexplorer): Promise<void> {
    const cdkNode = new CdkRootNode()

    // Legacy CDK behavior. Mostly useful for C9 as they do not have inline buttons.
    ctx.subscriptions.push(
        explorer.developerTools.view.onDidChangeVisibility(({ visible }) => visible && cdkNode.refresh())
    )

    // Legacy CDK metric, remove this when we add something generic
    const recordExpandCdkOnce = once(() => telemetry.cdk_appExpanded.emit())
    ctx.subscriptions.push(
        explorer.developerTools.view.onDidExpandElement(e => {
            if (e.element.resource instanceof CdkRootNode) {
                recordExpandCdkOnce()
            }
        })
    )

    ctx.subscriptions.push(
        explorer.developerTools.registerNode(cdkNode),
        Commands.register('aws.cdk.refresh', cdkNode.refresh.bind(cdkNode)),
        Commands.register('aws.cdk.viewDocs', () => {
            vscode.env.openExternal(vscode.Uri.parse(cdkDocumentationUrl))
            telemetry.aws_help.emit({ name: 'cdk' })
        })
    )
}
