/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'

import { getDefaultDownloadPath, setDefaultDownloadPath } from '../../shared/filesystemUtilities'
import { S3FileNode } from '../explorer/s3FileNode'
import { readablePath } from '../util'
import { progressReporter } from '../progressReporter'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showOutputMessage } from '../../shared/utilities/messages'
import { DefaultS3Client, S3Client } from '../../shared/clients/s3Client'
import { Timeout, CancellationError } from '../../shared/utilities/timeoutUtils'
import { ToolkitError } from '../../shared/errors'
import { streamToBuffer, streamToFile } from '../../shared/utilities/streamUtilities'
import { S3File } from '../fileViewerManager'
import globals from '../../shared/extensionGlobals'
import { telemetry } from '../../shared/telemetry/telemetry'

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
        void vscode.window.withProgress(
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

        throw ToolkitError.chain(err, message, {
            details: { bucket: file.bucket, path: file.key, destination: options?.saveLocation?.path },
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
export async function downloadFileAsCommand(node: S3FileNode, outputChannel = globals.outputChannel): Promise<void> {
    const { bucket, file } = node
    const sourcePath = readablePath(node)

    await telemetry.s3_downloadObject.run(async () => {
        const downloadPath = getDefaultDownloadPath()

        const saveLocation = await promptForSaveLocation(file.name, downloadPath)
        if (!saveLocation) {
            throw new CancellationError('user')
        }
        await setDefaultDownloadPath(saveLocation.fsPath)

        showOutputMessage(`Downloading "${sourcePath}" to: ${saveLocation}`, outputChannel)

        await downloadFile(
            { ...file, bucket },
            {
                saveLocation,
                client: node.s3,
                progressLocation: vscode.ProgressLocation.Notification,
            }
        )

        showOutputMessage(`Downloaded: ${saveLocation}`, outputChannel)
    })
}

async function promptForSaveLocation(fileName: string, saveLocation: string): Promise<vscode.Uri | undefined> {
    const extension = path.extname(fileName)

    // Insertion order matters, as it determines the ordering in the filters dropdown
    // First inserted item is at the top (this should be the extension, if present)
    const filters: vscode.SaveDialogOptions['filters'] = extension
        ? { [`*${extension}`]: [extension.slice(1)], 'All Files': ['*'] }
        : { 'All Files': ['*'] }

    const downloadPath = path.join(saveLocation, fileName)
    return vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(downloadPath),
        saveLabel: localize('AWS.s3.downloadFile.saveButton', 'Download'),
        filters: filters,
    })
}
