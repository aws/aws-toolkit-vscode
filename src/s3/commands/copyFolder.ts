/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CopyFolderSource, CopyFolderTarget, S3Client } from '../../shared/clients/s3Client'
import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { ToolkitError } from '../../shared/errors'

export async function copyFolder(client: S3Client, source: CopyFolderSource, target: CopyFolderTarget) {
    getLogger().info(
        `Copying folder "${source.folder.name}" to "${
            target.folderPath ? target.bucketName + '/' + target.folderPath : target.bucketName
        }"`
    )
    await copyWithProgress(client, source, target)
        .catch(e => {
            const message = localize('AWS.s3.copyFolder.error.general', 'Failed to copy folder {0}', source.folder.name)
            throw ToolkitError.chain(e, message)
        })
        .finally(() => vscode.commands.executeCommand('aws.refreshAwsExplorer', true))
    getLogger().info(`copied folder: ${source.folder.name}`)
}

async function copyWithProgress(client: S3Client, source: CopyFolderSource, target: CopyFolderTarget): Promise<void> {
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: localize('AWS.s3.copyObject.progressTitle', 'Copying {0}...', source.folder.name),
        },
        () => {
            return client.copyFolder(source, target)
        }
    )
}
