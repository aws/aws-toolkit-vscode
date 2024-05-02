/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtContext } from '../shared/extensions'
import { ecsDocumentationUrl } from '../shared/constants'
import { Commands } from '../shared/vscode/commands2'
import { openTaskInTerminal, runCommandInContainer, toggleExecuteCommandFlag } from './commands'
import { getResourceFromTreeNode } from '../shared/treeview/utils'
import { Instance } from '../shared/utilities/typeConstructors'
import { Service } from './model'
import { telemetry } from '../shared/telemetry/telemetry'
import { openUrl } from '../shared/utilities/vsCodeUtils'

export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(runCommandInContainer.register(), openTaskInTerminal.register())
    ctx.extensionContext.subscriptions.push(
        Commands.register('aws.ecs.enableEcsExec', (param?: unknown) => {
            return telemetry.ecs_enableExecuteCommand.run(async () => {
                const service = getResourceFromTreeNode(param, Instance(Service))
                await toggleExecuteCommandFlag(service)
            })
        }),
        Commands.register('aws.ecs.disableEcsExec', (param?: unknown) => {
            return telemetry.ecs_disableExecuteCommand.run(async () => {
                const service = getResourceFromTreeNode(param, Instance(Service))
                await toggleExecuteCommandFlag(service)
            })
        }),
        Commands.register('aws.ecs.viewDocumentation', async () => {
            void openUrl(vscode.Uri.parse(ecsDocumentationUrl))
        })
    )
}
