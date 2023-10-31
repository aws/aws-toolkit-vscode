/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { S3BucketNode } from '../explorer/s3BucketNode'
import { S3Node } from '../explorer/s3Nodes'
import { telemetry } from '../../shared/telemetry/telemetry'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { ToolkitError } from '../../shared/errors'

/**
 * Deletes the bucket represented by the given node.
 *
 * Prompts the user for confirmation (user must type the bucket name).
 * Empties and deletes the bucket, showing a progress bar.
 * Refreshes the parent node.
 *
 * Note that this just repeatedly calls list and delete to empty the bucket before deletion.
 * Failures during the emptying or deleting step can leave the bucket in a state where
 * some (or all) objects are deleted, but the bucket remains.
 *
 * This is unfortunate, but it's still a valuable feature and partial failures
 * don't result in a state of too much confusion for the user.
 */
export async function deleteBucketCommand(node: S3BucketNode): Promise<void> {
    getLogger().debug('DeleteBucket called for %O', node)

    await telemetry.s3_deleteBucket.run(async () => {
        const isConfirmed = await showConfirmationDialog(node.bucket.name)
        if (!isConfirmed) {
            throw new CancellationError('user')
        }

        getLogger().info(`Deleting bucket: ${node.bucket.name}`)
        await deleteWithProgress(node)
            .catch(e => {
                const message = localize(
                    'AWS.s3.deleteBucket.error.general',
                    'Failed to delete bucket {0}',
                    node.bucket.name
                )
                throw ToolkitError.chain(e, message)
            })
            .finally(() => refreshNode(node.parent))
        getLogger().info(`deleted bucket: ${node.bucket.name}`)
    })
}

async function showConfirmationDialog(bucketName: string): Promise<boolean> {
    const prompt = localize('AWS.s3.deleteBucket.prompt', 'Enter {0} to confirm deletion', bucketName)
    const confirmationInput = await vscode.window.showInputBox({
        prompt,
        placeHolder: bucketName,
        validateInput: input => (input !== bucketName ? prompt : undefined),
    })

    return confirmationInput === bucketName
}

async function deleteWithProgress(node: S3BucketNode): Promise<void> {
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: localize('AWS.s3.deleteBucket.progressTitle', 'Deleting {0}...', node.bucket.name),
        },
        () => {
            return node.deleteBucket()
        }
    )
}

async function refreshNode(node: S3Node): Promise<void> {
    return vscode.commands.executeCommand('aws.refreshAwsExplorerNode', node)
}
