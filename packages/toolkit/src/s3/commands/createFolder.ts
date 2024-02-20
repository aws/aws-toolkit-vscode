/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DEFAULT_DELIMITER } from '../../shared/clients/s3Client'
import { getLogger } from '../../shared/logger'
import { S3BucketNode } from '../explorer/s3BucketNode'
import { S3FolderNode } from '../explorer/s3FolderNode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { readablePath } from '../util'
import { telemetry } from '../../shared/telemetry/telemetry'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { ToolkitError } from '../../shared/errors'

/**
 * Creates a subfolder in the bucket or folder represented by the given node.
 *
 * Prompts the user for the folder name, applying basic validations.
 * Creates the folder.
 * Refreshes the node.
 *
 * Node that the node is reset to displaying its first page of results.
 * The folder that is created won't necessary fall on the first page.
 * The user may need to load more pages to see the created folder reflected in the tree.
 */
export async function createFolderCommand(node: S3BucketNode | S3FolderNode): Promise<void> {
    getLogger().debug('CreateFolder called for %O', node)

    await telemetry.s3_createFolder.run(async () => {
        const folderName = await vscode.window.showInputBox({
            prompt: localize('AWS.s3.createFolder.prompt', 'Enter a folder to create in {0}', readablePath(node)),
            placeHolder: localize('AWS.s3.createFolder.placeHolder', 'Folder Name'),
            validateInput: validateFolderName,
        })

        if (!folderName) {
            throw new CancellationError('user')
        }

        const path = node.path + folderName + DEFAULT_DELIMITER
        getLogger().info(`Creating folder "${path}" in bucket '${node.bucket.name}'`)

        const { folder } = await node
            .createFolder({ path, bucketName: node.bucket.name })
            .catch(e => {
                const message = localize(
                    'AWS.s3.createFolder.error.general',
                    'Failed to create folder: {0}',
                    folderName
                )
                throw ToolkitError.chain(e, message)
            })
            .finally(() => refreshNode(node))

        getLogger().info('created folder: %O', folder)
        void vscode.window.showInformationMessage(
            localize('AWS.s3.createFolder.success', 'Created folder: {0}', folderName)
        )
    })
}

function validateFolderName(name: string): string | undefined {
    if (name.includes(DEFAULT_DELIMITER)) {
        return localize(
            'AWS.s3.createFolder.error.illegalCharacter',
            `Folder name must not contain '{0}'`,
            DEFAULT_DELIMITER
        )
    }

    if (name === '') {
        return localize('AWS.s3.createFolder.error.emptyName', 'Folder name must not be empty')
    }
    return undefined
}

async function refreshNode(node: S3BucketNode | S3FolderNode): Promise<void> {
    node.clearChildren()
    return vscode.commands.executeCommand('aws.refreshAwsExplorerNode', node)
}
