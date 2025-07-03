/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Commands } from '../../shared/vscode/commands2'
import { SagemakerSpaceNode } from './explorer/sagemakerSpaceNode'
import { SagemakerParentNode } from './explorer/sagemakerParentNode'
import * as uriHandlers from './uriHandlers'
import { openRemoteConnect, filterSpaceAppsByDomainUserProfiles, stopSpace } from './commands'
import { ExtContext } from '../../shared/extensions'
import { telemetry } from '../../shared/telemetry/telemetry'

export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        uriHandlers.register(ctx),
        Commands.register('aws.sagemaker.openRemoteConnection', async (node: SagemakerSpaceNode) => {
            await telemetry.sagemaker_openRemoteConnection.run(async () => {
                await openRemoteConnect(node, ctx.extensionContext)
            })
        }),

        Commands.register('aws.sagemaker.filterSpaceApps', async (node: SagemakerParentNode) => {
            await telemetry.sagemaker_filterSpaces.run(async () => {
                await filterSpaceAppsByDomainUserProfiles(node)
            })
        }),

        Commands.register('aws.sagemaker.stopSpace', async (node: SagemakerSpaceNode) => {
            await telemetry.sagemaker_stopSpace.run(async () => {
                await stopSpace(node, ctx.extensionContext)
            })
        })
    )
}
