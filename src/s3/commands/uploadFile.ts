/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import { statSync } from 'fs'
import * as vscode from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger'
import { S3BucketNode } from '../explorer/s3BucketNode'
import { S3FolderNode } from '../explorer/s3FolderNode'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import * as telemetry from '../../shared/telemetry/telemetry'
import { readablePath } from '../util'
import { progressReporter } from '../progressReporter'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showErrorWithLogs, showOutputMessage } from '../../shared/utilities/messages'

export interface FileSizeBytes {
    /**
     * Returns the file size in bytes.
     */
    (file: vscode.Uri): number
}

/**
 * Uploads a file to the bucket or folder represented by the given node.
 *
 * Prompts the user for the file location.
 * Shows the output channel with "upload started" message.
 * Uploads the file (showing a progress bar).
 * Shows the output channel with "upload completed" message.
 * Refreshes the node.
 *
 * Node that the node is reset to displaying its first page of results.
 * The file that is uploaded won't necessary fall on the first page.
 * The user may need to load more pages to see the uploaded file reflected in the tree.
 */
export async function uploadFileCommand(
    node: S3BucketNode | S3FolderNode,
    fileSizeBytes: FileSizeBytes = statFile,
    window = Window.vscode(),
    commands = Commands.vscode(),
    outputChannel = ext.outputChannel
): Promise<void> {
    getLogger().debug('UploadFile called for %O', node)

    const fileLocation = await promptForFileLocation(window)
    if (!fileLocation) {
        getLogger().info('UploadFile cancelled')
        telemetry.recordS3UploadObject({ result: 'Cancelled' })
        return
    }

    const fileName = path.basename(fileLocation.fsPath)
    const key = node.path + fileName
    const destinationPath = readablePath({ bucket: node.bucket, path: key })
    try {
        showOutputMessage(`Uploading file from ${fileLocation} to ${destinationPath}`, outputChannel)

        await uploadWithProgress({ node, key, fileLocation, fileSizeBytes: fileSizeBytes(fileLocation), window })

        showOutputMessage(`Successfully uploaded file ${destinationPath}`, outputChannel)
        telemetry.recordS3UploadObject({ result: 'Succeeded' })
    } catch (e) {
        getLogger().error(`Failed to upload file from ${fileLocation} to ${destinationPath}: %O`, e)
        showErrorWithLogs(localize('AWS.s3.uploadFile.error.general', 'Failed to upload file {0}', fileName), window)
        telemetry.recordS3UploadObject({ result: 'Failed' })
    }

    await refreshNode(node, commands)
}

async function promptForFileLocation(window: Window): Promise<vscode.Uri | undefined> {
    const fileLocations = await window.showOpenDialog({
        openLabel: localize('AWS.s3.uploadFile.openButton', 'Upload'),
    })

    if (!fileLocations || fileLocations.length == 0) {
        return undefined
    }

    return fileLocations[0]
}

async function uploadWithProgress({
    node,
    key,
    fileLocation,
    fileSizeBytes,
    window,
}: {
    node: S3BucketNode | S3FolderNode
    key: string
    fileLocation: vscode.Uri
    fileSizeBytes: number
    window: Window
}): Promise<void> {
    return window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: localize('AWS.s3.uploadFile.progressTitle', 'Uploading {0}...', path.basename(fileLocation.fsPath)),
        },
        progress => {
            return node.uploadFile({
                bucketName: node.bucket.name,
                key: key,
                fileLocation,
                progressListener: progressReporter({ progress, totalBytes: fileSizeBytes }),
            })
        }
    )
}

function statFile(file: vscode.Uri) {
    return statSync(file.fsPath).size
}

async function refreshNode(node: S3BucketNode | S3FolderNode, commands: Commands): Promise<void> {
    node.clearChildren()
    return commands.execute('aws.refreshAwsExplorerNode', node)
}
