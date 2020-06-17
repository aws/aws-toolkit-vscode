/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import * as telemetry from '../../shared/telemetry/telemetry'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { S3BucketNode } from '../explorer/s3BucketNode'
import { S3Node } from '../explorer/s3Nodes'
import { showErrorWithLogs } from '../util/messages'

/**
 * Deletes the bucket represented by the given node.
 *
 * Prompts the user for confirmation (user must type the bucket name).
 * Deletes the bucket, showing a progress bar.
 * Refreshes the parent node.
 */
export async function deleteBucketCommand(
    node: S3BucketNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('DeleteBucket called for %O', node)

    const isConfirmed = await showConfirmationDialog(node.bucket.name, window)
    if (!isConfirmed) {
        getLogger().info('DeleteBucket cancelled')
        telemetry.recordS3DeleteBucket({ result: 'Cancelled' })
        return
    }

    getLogger().info(`Deleting bucket ${node.bucket.name}`)
    try {
        await deleteWithProgress(node, window)

        getLogger().info(`Successfully deleted bucket ${node.bucket.name}`)
        telemetry.recordS3DeleteBucket({ result: 'Succeeded' })
    } catch (e) {
        getLogger().error(`Failed to delete bucket ${node.bucket.name}: %O`, e)
        showErrorWithLogs(
            localize('AWS.s3.deleteBucket.error.general', 'Failed to delete bucket {0}', node.bucket.name),
            window
        )
        telemetry.recordS3DeleteBucket({ result: 'Failed' })
    }

    await refreshNode(node.parent, commands)
}

async function showConfirmationDialog(bucketName: string, window: Window): Promise<boolean> {
    const prompt = localize('AWS.s3.deleteBucket.prompt', 'Enter {0} to confirm deletion', bucketName)
    const confirmationInput = await window.showInputBox({
        prompt,
        placeHolder: bucketName,
        validateInput: input => (input !== bucketName ? prompt : undefined),
    })

    return confirmationInput === bucketName
}

async function deleteWithProgress(node: S3BucketNode, window: Window): Promise<void> {
    return window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: localize('AWS.s3.deleteBucket.progressTitle', 'Deleting {0}...', node.bucket.name),
        },
        () => {
            return node.deleteBucket()
        }
    )
}

async function refreshNode(node: S3Node, commands: Commands): Promise<void> {
    return commands.execute('aws.refreshAwsExplorerNode', node)
}
