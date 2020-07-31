/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger'
import * as telemetry from '../../shared/telemetry/telemetry'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { S3BucketNode } from '../explorer/s3BucketNode'
import { S3FileNode } from '../explorer/s3FileNode'
import { S3FolderNode } from '../explorer/s3FolderNode'
import { readablePath, showConfirmationMessage, showErrorWithLogs } from '../util/messages'

const DELETE_FILE_DISPLAY_TIMEOUT_MS = 2000

/**
 * Deletes the file represented by the given node.
 *
 * Prompts the user for confirmation.
 * Deletes the file.
 * Shows status bar message.
 * Refreshes the parent node.
 */
export async function deleteFileCommand(
    node: S3FileNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('DeleteFile called for %O', node)

    const filePath = readablePath(node)
    const isConfirmed = await showConfirmationMessage(
        {
            prompt: localize('AWS.s3.deleteFile.prompt', 'Are you sure you want to delete file {0}?', filePath),
            confirm: localize('AWS.s3.deleteFile.confirm', 'Delete'),
            cancel: localize('AWS.s3.deleteFile.cancel', 'Cancel'),
        },
        window
    )
    if (!isConfirmed) {
        getLogger().info('DeleteFile cancelled')
        telemetry.recordS3DeleteObject({ result: 'Cancelled' })
        return
    }

    getLogger().info(`Deleting file ${filePath}`)
    try {
        await node.deleteFile()

        getLogger().info(`Successfully deleted file ${filePath}`)
        window.setStatusBarMessage(
            localize('AWS.deleteFile.success', '$(trash) Deleted {0}', node.file.name),
            DELETE_FILE_DISPLAY_TIMEOUT_MS
        )
        telemetry.recordS3DeleteObject({ result: 'Succeeded' })
    } catch (e) {
        getLogger().error(`Failed to delete file ${filePath}: %O`, e)
        showErrorWithLogs(
            localize('AWS.s3.deleteFile.error.general', 'Failed to delete file {0}', node.file.name),
            window
        )
        telemetry.recordS3DeleteObject({ result: 'Failed' })
    }

    await refreshNode(node.parent, commands)
}

async function refreshNode(node: S3BucketNode | S3FolderNode, commands: Commands): Promise<void> {
    node.clearChildren()
    return commands.execute('aws.refreshAwsExplorerNode', node)
}
