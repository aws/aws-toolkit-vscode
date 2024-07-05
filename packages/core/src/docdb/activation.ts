/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Commands } from '../shared'
import { ExtContext } from '../shared/extensions'
import { DBNode, DocumentDBNode } from './explorer/docdbNode'
import { DBClusterNode } from './explorer/dbClusterNode'
import { createCluster } from './commands/createCluster'
import { createInstance } from './commands/createInstance'
import { startCluster, stopCluster } from './commands/commands'

/**
 * Activates DocumentDB components.
 */

export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        Commands.register('aws.docdb.createCluster', async (node?: DocumentDBNode) => {
            await createCluster(node)
        }),

        Commands.register('aws.docdb.startCluster', async (node?: DBNode) => {
            await startCluster(node)
        }),

        Commands.register('aws.docdb.stopCluster', async (node?: DBNode) => {
            await stopCluster(node)
        }),

        Commands.register('aws.docdb.createInstance', async (node: DBClusterNode) => {
            await createInstance(node)
        })
    )
}
