/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { extname, join } from 'path'
import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import * as telemetry from '../../shared/telemetry/telemetry'
import { Window } from '../../shared/vscode/window'
import { S3FileNode } from '../explorer/s3FileNode'
import { showErrorWithLogs } from '../util/messages'
import { progressReporter } from '../util/progressReporter'
import { localize } from '../../shared/utilities/vsCodeUtils'
import downloadsFolder = require('downloads-folder')

/**
 * Downloads a file represented by the given node.
 *
 * Prompts the user for the save location.
 * Downloads the file (showing a progress bar).
 */
export async function downloadFileAsCommand(node: S3FileNode, window = Window.vscode()): Promise<void> {
    getLogger().debug('DownloadFile called for %O', node)

    const saveLocation = await promptForSaveLocation(node.file.name, window)
    if (!saveLocation) {
        getLogger().info('DownloadFile cancelled')
        telemetry.recordS3DownloadObject({ result: 'Cancelled' })
        return
    }

    try {
        getLogger().info(`Downloading file from ${node.file.arn} to ${saveLocation}`)

        await downloadWithProgress(node, saveLocation, window)

        getLogger().info(`Successfully downloaded file from ${node.file.arn} to ${saveLocation}`)
        telemetry.recordS3DownloadObject({ result: 'Succeeded' })
    } catch (e) {
        getLogger().error(`Failed to download file from ${node.file.arn} to ${saveLocation}: %O`, e.toString())
        showErrorWithLogs(
            localize('AWS.s3.downloadFile.error.general', 'Failed to download file {0}', node.file.name),
            window
        )
        telemetry.recordS3DownloadObject({ result: 'Failed' })
    }
}

async function promptForSaveLocation(fileName: string, window: Window): Promise<vscode.Uri | undefined> {
    const filters: vscode.SaveDialogOptions['filters'] = { 'All files': ['*'] }

    const extension = extname(fileName)
    if (extension) {
        filters[`*${extension}`] = [extension]
    }

    const downloadPath = join(findDownloadsFolder(), fileName)
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

function findDownloadsFolder(): string {
    try {
        return downloadsFolder() ?? ''
    } catch (e) {
        getLogger().warn('Failed to find downloads folder: %O', e)
        return ''
    }
}
