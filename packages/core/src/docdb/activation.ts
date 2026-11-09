/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Commands } from '../shared/vscode/commands2'
import { ExtContext } from '../shared/extensions'
import { DBResourceNode } from './explorer/dbResourceNode'
import { DocumentDBNode } from './explorer/docdbNode'
import { DBClusterNode } from './explorer/dbClusterNode'
import { DBInstanceNode } from './explorer/dbInstanceNode'
import { addRegion } from './commands/addRegion'
import { createCluster } from './commands/createCluster'
import { deleteCluster } from './commands/deleteCluster'
import { renameCluster } from './commands/renameCluster'
import { startCluster } from './commands/startCluster'
import { stopCluster } from './commands/stopCluster'
import { createInstance } from './commands/createInstance'
import { deleteInstance } from './commands/deleteInstance'
import { modifyInstance } from './commands/modifyInstance'
import { rebootInstance } from './commands/rebootInstance'
import { renameInstance } from './commands/renameInstance'
import { addTag, listTags, removeTag } from './commands/tagCommands'
import { Uri } from 'vscode'
import { openUrl } from '../shared/utilities/vsCodeUtils'
import { getLogger } from '../shared/logger/logger'

/**
 * A utility function to automatically invoke trackChanges after a command.
 */

function withTrackChanges<T extends DBResourceNode>(
    command: (node: T) => Promise<void>,
    commandName: string = 'UnnamedCommand'
): (node: T) => Promise<void> {
    return async (node: T) => {
        const arn = node.arn || 'UnknownARN'
        const startTime = new Date().toISOString()

        getLogger().info(
            `[${startTime}] Executing command "${commandName}" for resource with ARN: ${arn}. Tracking changes will be invoked post-execution.`
        )

        await command(node)

        const endTime = new Date().toISOString()
        getLogger().info(
            `[${endTime}] Successfully executed command "${commandName}" for resource with ARN: ${arn}. Invoking trackChanges now.`
        )

        await node.trackChangesWithWaitProcessingStatus()
    }
}

/**
 * Activates DocumentDB components.
 */
export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        Commands.register('aws.docdb.createCluster', async (node?: DocumentDBNode) => {
            await createCluster(node)
        }),

        Commands.register('aws.docdb.deleteCluster', withTrackChanges<DBClusterNode>(deleteCluster, 'deleteCluster')),

        Commands.register('aws.docdb.renameCluster', withTrackChanges<DBClusterNode>(renameCluster, 'renameCluster')),

        Commands.register('aws.docdb.startCluster', withTrackChanges<DBClusterNode>(startCluster, 'startCluster')),

        Commands.register('aws.docdb.stopCluster', withTrackChanges<DBClusterNode>(stopCluster, 'stopCluster')),

        Commands.register('aws.docdb.addRegion', withTrackChanges<DBClusterNode>(addRegion, 'addRegion')),

        Commands.register(
            'aws.docdb.createInstance',
            withTrackChanges<DBClusterNode>(createInstance, 'createInstance')
        ),

        Commands.register(
            'aws.docdb.deleteInstance',
            withTrackChanges<DBInstanceNode>(deleteInstance, 'deleteInstance')
        ),

        Commands.register(
            'aws.docdb.modifyInstance',
            withTrackChanges<DBInstanceNode>(modifyInstance, 'modifyInstance')
        ),

        Commands.register(
            'aws.docdb.rebootInstance',
            withTrackChanges<DBInstanceNode>(rebootInstance, 'rebootInstance')
        ),

        Commands.register(
            'aws.docdb.renameInstance',
            withTrackChanges<DBInstanceNode>(renameInstance, 'renameInstance')
        ),

        Commands.register('aws.docdb.listTags', async (node: DBResourceNode) => {
            await listTags(node)
        }),

        Commands.register('aws.docdb.addTag', async (node: DBResourceNode) => {
            await addTag(node)
        }),

        Commands.register('aws.docdb.removeTag', async (node: DBResourceNode) => {
            await removeTag(node)
        }),

        Commands.register('aws.docdb.viewConsole', async (node?: DBResourceNode) => {
            await node?.openInBrowser()
        }),

        Commands.register('aws.docdb.viewDocs', async () => {
            await openUrl(
                Uri.parse('https://docs.aws.amazon.com/documentdb/latest/developerguide/get-started-guide.html')
            )
        }),

        Commands.register('aws.docdb.copyEndpoint', async (node?: DBResourceNode) => {
            await node?.copyEndpoint()
        })
    )
}
