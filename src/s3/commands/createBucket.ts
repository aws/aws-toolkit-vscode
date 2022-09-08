/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { S3Node } from '../explorer/s3Nodes'
import { validateBucketName } from '../util'
import { ToolkitError } from '../../shared/errors'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { telemetry } from '../../shared/telemetry/telemetry'

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
    await telemetry.s3_createBucket.run(async () => {
        const bucketName = await window.showInputBox({
            prompt: localize('AWS.s3.createBucket.prompt', 'Enter a new bucket name'),
            placeHolder: localize('AWS.s3.createBucket.placeHolder', 'Bucket Name'),
            validateInput: validateBucketName,
        })

        if (!bucketName) {
            throw new CancellationError('user')
        }

        getLogger().info(`Creating bucket: ${bucketName}`)
        const bucket = await node
            .createBucket({ bucketName })
            .catch(e => {
                const message = localize(
                    'AWS.s3.createBucket.error.general',
                    'Failed to create bucket: {0}',
                    bucketName
                )
                throw ToolkitError.chain(e, message)
            })
            .finally(() => refreshNode(node, commands))

        getLogger().info('Created bucket: %O', bucket)
        window.showInformationMessage(localize('AWS.s3.createBucket.success', 'Created bucket: {0}', bucketName))
    })
}

async function refreshNode(node: S3Node, commands: Commands): Promise<void> {
    return commands.execute('aws.refreshAwsExplorerNode', node)
}
