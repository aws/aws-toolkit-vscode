/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { S3Node } from '../explorer/s3Nodes'
import { showErrorWithLogs } from '../../shared/utilities/messages'
import { validateBucketName } from '../util'

/**
 * Shows an explicitly-specified bucket in the AWS treeview.
 * 
 * To create a new bucket resource, see `createBucketCommand()`.
 */
export async function showBucketCommand(
    node: S3Node,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('[s3]: addBucket called for: %O', node)

    const bucketName = await window.showInputBox({
        prompt: localize('AWS.s3.showBucket.prompt', 'Enter an existing bucket name'),
        placeHolder: localize('AWS.s3.showBucket.placeHolder', 'Bucket Name'),
        validateInput: validateBucketName,
    })

    if (!bucketName) {
        getLogger().debug('[s3]: addBucket cancelled')
        return
    }

    getLogger().info(`Adding bucket: ${bucketName}`)
    try {
        const bucket = await node.showBucket(bucketName)

        getLogger().info('Added bucket: %O', bucket)
        window.showInformationMessage(localize('AWS.s3.showBucket.success', 'Added bucket: {0}', bucketName))
        await refreshNode(node, commands)
    } catch (e) {
        getLogger().error(`Failed to add bucket ${bucketName}: %O`, e)
        showErrorWithLogs(
            localize('AWS.s3.showBucket.error.general', 'Failed to add bucket: {0}', bucketName),
            window
        )
    }
}

async function refreshNode(node: S3Node, commands: Commands): Promise<void> {
    return commands.execute('aws.refreshAwsExplorerNode', node)
}
