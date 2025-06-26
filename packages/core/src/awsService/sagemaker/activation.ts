/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Commands } from '../../shared/vscode/commands2'
import { SagemakerSpaceNode } from './explorer/sagemakerSpaceNode'
import { SagemakerParentNode } from './explorer/sagemakerParentNode'
import * as uriHandlers from './uriHandlers'
import { getLogger } from '../../shared/logger/logger'
import { openRemoteConnect, filterSpaceAppsByDomainUserProfiles } from './commands'
import { ExtContext } from '../../shared/extensions'

export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        uriHandlers.register(ctx),
        Commands.register('aws.sagemaker.openRemoteConnection', async (node: SagemakerSpaceNode) => {
            getLogger().info('start openRemoteConnection')
            await openRemoteConnect(node, ctx.extensionContext)
        })
    )

    ctx.extensionContext.subscriptions.push(
        Commands.register('aws.sagemaker.filterSpaceApps', async (node: SagemakerParentNode) => {
            await filterSpaceAppsByDomainUserProfiles(node)
        })
    )
}
