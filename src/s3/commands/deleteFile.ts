/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as localizedText from '../../shared/localizedText'
import { getLogger } from '../../shared/logger'
import { addCodiconToString } from '../../shared/utilities/textUtilities'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { S3BucketNode } from '../explorer/s3BucketNode'
import { S3FileNode } from '../explorer/s3FileNode'
import { S3FolderNode } from '../explorer/s3FolderNode'
import { readablePath } from '../util'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import { telemetry } from '../../shared/telemetry/telemetry'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { ToolkitError } from '../../shared/errors'

const deleteFileDisplayTimeoutMs = 2000

/**
 * Deletes the file represented by the given node.
 *
 * Prompts the user for confirmation.
 * Deletes the file.
 * Shows status bar message.
 * Refreshes the parent node.
 */
export async function deleteFileCommand(node: S3FileNode): Promise<void> {
    const filePath = readablePath(node)
    getLogger().debug('DeleteFile called for %O', node)

    await telemetry.s3_deleteObject.run(async () => {
        const isConfirmed = await showConfirmationMessage({
            prompt: localize('AWS.s3.deleteFile.prompt', 'Are you sure you want to delete file {0}?', filePath),
            confirm: localizedText.localizedDelete,
            cancel: localizedText.cancel,
        })
        if (!isConfirmed) {
            throw new CancellationError('user')
        }

        getLogger().info(`Deleting file ${filePath}`)

        await node
            .deleteFile()
            .catch(e => {
                const message = localize('AWS.s3.deleteFile.error.general', 'Failed to delete file {0}', node.file.name)
                throw ToolkitError.chain(e, message)
            })
            .finally(() => refreshNode(node.parent))

        getLogger().info(`deleted file: ${filePath}`)
        vscode.window.setStatusBarMessage(
            addCodiconToString('trash', localize('AWS.deleteFile.success', 'Deleted: {0}', node.file.name)),
            deleteFileDisplayTimeoutMs
        )
    })
}

async function refreshNode(node: S3BucketNode | S3FolderNode): Promise<void> {
    node.clearChildren()
    return vscode.commands.executeCommand('aws.refreshAwsExplorerNode', node)
}
