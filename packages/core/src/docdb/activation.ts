/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Commands } from '../shared'
import { ExtContext } from '../shared/extensions'
import { DBNode } from './explorer/docdbNode'
import { startCluster, stopCluster } from './commands'

/**
 * Activates DocumentDB components.
 */

export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        Commands.register('aws.docdb.startCluster', async (node?: DBNode) => {
            await startCluster(node)
            node?.parent.refresh()
        }),

        Commands.register('aws.docdb.stopCluster', async (node?: DBNode) => {
            await stopCluster(node)
            node?.parent.refresh()
        })
    )
}
