/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Commands } from '../../shared/vscode/commands2'
import { ExtContext } from '../../shared/extensions'
import { SagemakerParentNode } from './explorer/sagemakerParentNode'
import { filterSpaceAppsByDomainUserProfiles } from './commands'

export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        Commands.register('aws.sagemaker.filterSpaceApps', async (node: SagemakerParentNode) => {
            await filterSpaceAppsByDomainUserProfiles(node)
        })
    )
}
