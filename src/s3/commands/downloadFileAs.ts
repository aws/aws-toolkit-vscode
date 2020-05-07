/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { extname } from 'path'
import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import * as telemetry from '../../shared/telemetry/telemetry'
import { DefaultWindow, Window } from '../../shared/vscode/window'
import { S3FileNode } from '../explorer/s3FileNode'
import { progressReporter } from '../util/progressReporter'
import { localize } from '../../shared/utilities/vsCodeUtils'

/**
 * Downloads a file represented by the given node.
 *
 * Prompts the user for the save location.
 * Downloads the file (showing a progress bar).
 */
export async function downloadFileAsCommand(node: S3FileNode, window: Window = new DefaultWindow()): Promise<void> {
    getLogger().debug(`DownloadFile called for ${node}`)

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
        getLogger().info(`Failed to download file from ${node.file.arn} to ${saveLocation}`, e)
        window.showErrorMessage(
            localize('AWS.s3.downloadFile.error.general', 'Failed to download file {0}', node.file.name)
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

    return window.showSaveDialog({
        defaultUri: vscode.Uri.file(fileName),
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
                progressListener: progressReporter(progress, node.file.sizeBytes),
            })
        }
    )
}
