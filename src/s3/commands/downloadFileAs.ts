/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'

import { downloadsDir } from '../../shared/filesystemUtilities'
import { getLogger } from '../../shared/logger'
import * as telemetry from '../../shared/telemetry/telemetry'
import { Window } from '../../shared/vscode/window'
import { S3FileNode } from '../explorer/s3FileNode'
import { readablePath } from '../util'
import { progressReporter } from '../progressReporter'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage, showOutputMessage } from '../../shared/utilities/messages'
import { DefaultS3Client, S3Client } from '../../shared/clients/s3Client'
import { Timeout, CancellationError } from '../../shared/utilities/timeoutUtils'
import { ToolkitError } from '../../shared/toolkitError'
import { streamToBuffer, streamToFile } from '../../shared/utilities/streamUtilities'
import { S3File } from '../fileViewerManager'
import globals from '../../shared/extensionGlobals'

interface DownloadFileOptions {
    /**
     * Setting this field will show a progress notification for
     * the provided location, otherwise no progress will shown.
     */
    readonly progressLocation?: vscode.ProgressLocation
    /**
     * Destination for the downloaded file.
     *
     * If provided then the promise will not resolve into a Buffer.
     */
    readonly saveLocation?: vscode.Uri
    /**
     * Different window object to use for displaying progress
     */
    readonly window?: Window
    /**
     * Timeout associated with the download. If provided, it is assumed that
     * the download is also cancellable.
     */
    readonly timeout?: Timeout
    /**
     * Client to use for the download. Creates one if not provided.
     */
    readonly client?: S3Client
}

interface FileOptions extends DownloadFileOptions {
    readonly saveLocation: vscode.Uri
}
interface BufferOptions extends DownloadFileOptions {
    readonly saveLocation?: never
}

async function downloadS3File(
    client: S3Client,
    file: S3File,
    options?: FileOptions | BufferOptions
): Promise<Buffer | void> {
    const downloadStream = await client.downloadFileStream(file.bucket.name, file.key)
    const result = options?.saveLocation
        ? streamToFile(downloadStream, options.saveLocation)
        : streamToBuffer(downloadStream, file.sizeBytes)

    options?.timeout?.token.onCancellationRequested(({ agent }) => downloadStream.destroy(new CancellationError(agent)))

    if (options?.progressLocation) {
        ;(options.window ?? Window.vscode()).withProgress(
            {
                location: options.progressLocation,
                title: localize('AWS.s3.downloadFile.progressTitle', 'Downloading {0}...', file.name),
                cancellable: !!options.timeout,
            },
            (progress, token) => {
                const reporter = progressReporter(progress, { totalBytes: file.sizeBytes })
                const report = (chunk: Buffer | string) => reporter(chunk.length)
                token.onCancellationRequested(() => downloadStream.destroy(new CancellationError('user')))
                downloadStream.on('data', report)

                return new Promise<void>(resolve => result.finally(resolve))
            }
        )
    }

    return result
}

export async function downloadFile(file: S3File, options: FileOptions): Promise<void>
export async function downloadFile(file: S3File, options?: BufferOptions): Promise<Buffer>
export async function downloadFile(file: S3File, options?: FileOptions | BufferOptions): Promise<Buffer | void> {
    const client = options?.client ?? new DefaultS3Client(file.bucket.region)

    return downloadS3File(client, file, options).catch(err => {
        const message = localize('AWS.s3.downloadFile.error.general', 'Failed to download file {0}', file.name)
        const extraDetail = options?.saveLocation ? ` to ${options?.saveLocation.fsPath}` : ''

        throw new ToolkitError(message, {
            cause: err,
            detail: `Failed to download ${readablePath({ bucket: file.bucket, path: file.key })}${extraDetail}`,
            metric: {
                name: 's3_downloadObject',
                result: CancellationError.isUserCancelled(err) ? 'Cancelled' : 'Failed',
            },
        })
    })
}

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
    outputChannel = globals.outputChannel
): Promise<void> {
    const { bucket, file } = node

    getLogger().debug('DownloadFile called for %O', node)

    const saveLocation = await promptForSaveLocation(file.name, window)
    if (!saveLocation) {
        getLogger().info('DownloadFile cancelled')
        telemetry.recordS3DownloadObject({ result: 'Cancelled' })
        return
    }

    const sourcePath = readablePath(node)
    try {
        showOutputMessage(`Downloading file from ${sourcePath} to ${saveLocation}`, outputChannel)

        await downloadFile(
            { ...file, bucket },
            {
                window,
                saveLocation,
                client: node.s3,
                progressLocation: vscode.ProgressLocation.Notification,
            }
        )

        showOutputMessage(`Successfully downloaded file ${saveLocation}`, outputChannel)
        telemetry.recordS3DownloadObject({ result: 'Succeeded' })
    } catch (e) {
        if (e instanceof ToolkitError) {
            const result: telemetry.Result = e.cancelled ? 'Cancelled' : 'Failed'
            if (result !== 'Cancelled') {
                if (e.detail) {
                    getLogger().error(e.detail)
                }
                showViewLogsMessage(e.message, window)
            }
            telemetry.recordS3DownloadObject({ result })
        } else {
            throw e
        }
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
