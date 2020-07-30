/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { downloadsDir } from '../../shared/filesystemUtilities'
import { getLogger } from '../../shared/logger'
import * as telemetry from '../../shared/telemetry/telemetry'
import { Window } from '../../shared/vscode/window'
import { S3FileNode } from '../explorer/s3FileNode'
import { readablePath, showErrorWithLogs, showOutputMessage } from '../util/messages'
import { progressReporter } from '../util/progressReporter'
import { localize } from '../../shared/utilities/vsCodeUtils'

/**
 * Downloads a file represented by the given node.
 *
 * Prompts the user for the save location.
 * Shows the output channel with "download started" message.
 * Downloads the file (showing a progress bar).
 * Shows the output channel with "download completed" message.
 */
export async function downloadFileAsCommand(
    node: S3FileNode,
    window = Window.vscode(),
    outputChannel = ext.outputChannel
): Promise<void> {
    getLogger().debug('DownloadFile called for %O', node)

    const saveLocation = await promptForSaveLocation(node.file.name, window)
    if (!saveLocation) {
        getLogger().info('DownloadFile cancelled')
        telemetry.recordS3DownloadObject({ result: 'Cancelled' })
        return
    }

    const sourcePath = readablePath(node)
    try {
        showOutputMessage(`Downloading file from ${sourcePath} to ${saveLocation}`, outputChannel)

        await downloadWithProgress(node, saveLocation, window)

        showOutputMessage(`Successfully downloaded file ${saveLocation}`, outputChannel)
        telemetry.recordS3DownloadObject({ result: 'Succeeded' })
    } catch (e) {
        getLogger().error(`Failed to download file from ${sourcePath} to ${saveLocation}: %O`, e.toString())
        showErrorWithLogs(
            localize('AWS.s3.downloadFile.error.general', 'Failed to download file {0}', node.file.name),
            window
        )
        telemetry.recordS3DownloadObject({ result: 'Failed' })
    }
}

async function promptForSaveLocation(fileName: string, window: Window): Promise<vscode.Uri | undefined> {
    const extension = path.extname(fileName)

    // Insertion order matters, as it determines the ordering in the filters dropdown
    // First inserted item is at the top (this should be the extension, if present)
    const filters: vscode.SaveDialogOptions['filters'] = extension
        ? { [`*${extension}`]: [extension.slice(1)], 'All Files': ['*'] }
        : { 'All Files': ['*'] }

    const downloadPath = path.join(downloadsDir(), fileName)
    return window.showSaveDialog({
        defaultUri: vscode.Uri.file(downloadPath),
        saveLabel: localize('AWS.s3.downloadFile.saveButton', 'Download'),
        filters: filters,
    })
}

async function downloadWithProgress(node: S3FileNode, saveLocation: vscode.Uri, window: Window): Promise<void> {
    return window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: localize('AWS.s3.downloadFile.progressTitle', 'Downloading {0}...', node.file.name),
        },
        progress => {
            return node.downloadFile({
                bucketName: node.bucket.name,
                key: node.file.key,
                saveLocation,
                progressListener: progressReporter({ progress, totalBytes: node.file.sizeBytes }),
            })
        }
    )
}
