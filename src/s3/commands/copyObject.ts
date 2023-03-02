/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CopyObjectRequest, S3Client } from '../../shared/clients/s3Client'
import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { ToolkitError } from '../../shared/errors'

export async function copyObjectCommand(client: S3Client, request: CopyObjectRequest): Promise<void> {
    getLogger().info(
        `Copying object "${request.name}" to "${
            request.folderPath ? request.bucket + '/' + request.folderPath : request.bucket
        }"`
    )
    await copyWithProgress(client, request)
        .catch(e => {
            const message = localize('AWS.s3.copyObject.error.general', 'Failed to copy object {0}', request.name)
            throw ToolkitError.chain(e, message)
        })
        .finally(() => vscode.commands.executeCommand('aws.refreshAwsExplorer', true))
    getLogger().info(`copied object: ${request.name}`)
}

async function copyWithProgress(client: S3Client, request: CopyObjectRequest): Promise<void> {
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: localize('AWS.s3.copyObject.progressTitle', 'Copying {0}...', request.name),
        },
        () => {
            return client.copyObject(request)
        }
    )
}
