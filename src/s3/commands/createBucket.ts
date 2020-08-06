/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger'
import * as telemetry from '../../shared/telemetry/telemetry'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { S3Node } from '../explorer/s3Nodes'
import { showErrorWithLogs } from '../util/messages'
import { validateBucketName } from '../util/validateBucketName'

/**
 * Creates a bucket in the s3 region represented by the given node.
 *
 * Prompts the user for the bucket name, applying basic validations.
 * Creates the bucket.
 * Refreshes the node.
 */
export async function createBucketCommand(
    node: S3Node,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('CreateBucket called for %O', node)

    const bucketName = await window.showInputBox({
        prompt: localize('AWS.s3.createBucket.prompt', 'Enter a new bucket name'),
        placeHolder: localize('AWS.s3.createBucket.placeHolder', 'Bucket Name'),
        validateInput: validateBucketName,
    })

    if (!bucketName) {
        getLogger().info('CreateBucket cancelled')
        telemetry.recordS3CreateBucket({ result: 'Cancelled' })
        return
    }

    getLogger().info(`Creating bucket ${bucketName}`)
    try {
        const bucket = await node.createBucket({ bucketName })

        getLogger().info('Successfully created bucket %O', bucket)
        window.showInformationMessage(localize('AWS.s3.createBucket.success', 'Created bucket {0}', bucketName))
        telemetry.recordS3CreateBucket({ result: 'Succeeded' })
    } catch (e) {
        getLogger().error(`Failed to create bucket ${bucketName}: %O`, e)
        showErrorWithLogs(
            localize('AWS.s3.createBucket.error.general', 'Failed to create bucket {0}', bucketName),
            window
        )
        telemetry.recordS3CreateBucket({ result: 'Failed' })
    }

    await refreshNode(node, commands)
}

async function refreshNode(node: S3Node, commands: Commands): Promise<void> {
    return commands.execute('aws.refreshAwsExplorerNode', node)
}
