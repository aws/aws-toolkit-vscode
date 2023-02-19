/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import * as fs from 'fs'

import { getDefaultDownloadPath, setDefaultDownloadPath } from '../../shared/filesystemUtilities'
import { Window } from '../../shared/vscode/window'
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
import { S3FolderNode } from '../explorer/s3FolderNode'
import { isNonNullable } from '../../shared/utilities/tsUtils'
import { getLogger } from '../../shared/logger'
import * as localizedText from '../../shared/localizedText'

const downloadBatchSizeLimit = 20
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

        throw ToolkitError.chain(err, message, {
            details: { bucket: file.bucket, path: file.key, destination: options?.saveLocation?.path },
        })
    })
}

async function downloadBatchFiles(fileList: S3File[], saveLocation: vscode.Uri, client: S3Client): Promise<S3File[]> {
    const results = await Promise.all(
        fileList.map(async file => {
            try {
                await downloadFile(file, {
                    window: Window.vscode(),
                    saveLocation: vscode.Uri.joinPath(saveLocation, file.name),
                    client,
                    progressLocation: vscode.ProgressLocation.Notification,
                })
            } catch (error) {
                getLogger().error(`s3: Failed to download file '${file.name}': `, error as Error)
                return file
            }
        })
    )
    return results.filter(isNonNullable)
}

/**
 * Downloads an S3 Folder or any number of selected S3 files
 *
 * @param node S3FolderNode to download
 * @param allNodes Multi-selected explorer nodes
 * @param window
 * @param outputChannel
 */
export async function downloadFilesCommand(
    node: S3FolderNode | S3FileNode,
    allNodes: S3FileNode[] = [],
    window = Window.vscode(),
    outputChannel = globals.outputChannel
): Promise<void> {
    let files: S3File[]
    await telemetry.s3_downloadObject.run(async () => {
        let saveLocation = await promptForSaveFolderLocation()
        if (!saveLocation) {
            throw new CancellationError('user')
        }
        if (!fs.statSync(saveLocation.fsPath).isDirectory()) {
            throw new Error('Chosen save location is not a directory')
        }
        setDefaultDownloadPath(saveLocation.fsPath)

        if (node instanceof S3FolderNode) {
            // get files from the folder and convert to S3File
            files = (await node.s3.listFiles({ bucketName: node.bucket.name, folderPath: node.folder.path })).files.map(
                file => {
                    return { bucket: node.bucket, ...file }
                }
            )
            // create a folder with the folder name
            const dir = path.join(saveLocation.fsPath, node.folder.name)
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir)
                saveLocation = vscode.Uri.file(dir)
            }
        } else if (allNodes.length === 0 && node instanceof S3FileNode) {
            files = [{ bucket: node.bucket, ...node.file }]
        } else {
            // since we cannot control which nodes are selected and passed here, filter only S3FileNodes
            allNodes = allNodes.filter(node => node instanceof S3FileNode)
            files = allNodes?.map(fileNode => {
                return { bucket: fileNode.bucket, ...fileNode.file }
            })
        }

        let failed = await downloadAllFiles(files, saveLocation, node.s3)

        showOutputMessage(
            localize(
                'AWS.s3.downloadFile.complete',
                'Downloaded {0}/{1} files',
                files.length - failed.length,
                files.length
            ),
            outputChannel
        )

        while (failed.length > 0) {
            const failedKeys = failed.map(file => file.key)
            getLogger().error(`List of requests failed to download:\n${failedKeys.toString().split(',').join('\n')}`)

            if (failed.length > 5) {
                showOutputMessage(
                    localize(
                        'AWS.s3.downloadFile.failedMany',
                        'Failed downloads:\n{0}\nSee logs for full list of failed items',
                        failedKeys.slice(0, 5).join('\n')
                    ),
                    outputChannel
                )
            } else {
                showOutputMessage(
                    localize('AWS.s3.download.failed', 'Failed downloads:\n{0}', failedKeys.join('\n')),
                    outputChannel
                )
            }

            const response = await window.showErrorMessage(
                localize('AWS.s3.downLoad.retryPrompt', 'S3 Download: {0}/{1} failed.', failed.length, files.length),
                localizedText.retry,
                localizedText.skip
            )

            if (response === localizedText.retry) {
                failed = await downloadAllFiles(failed, saveLocation, node.s3)
            } else {
                break
            }
        }
    })
}

async function promptForSaveFolderLocation(window = Window.vscode()): Promise<vscode.Uri | undefined> {
    const saveLocation = getDefaultDownloadPath()
    const folderLocation = await window.showOpenDialog({
        defaultUri: vscode.Uri.file(saveLocation),
        openLabel: localize('AWS.s3.downloadFolder.openButton', 'Download Here'),
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
    })

    if (!folderLocation || folderLocation.length == 0) {
        return undefined
    }

    return folderLocation[0]
}

/**
 * Download all S3 Files provided, divided in batches
 *
 * @param fileList
 * @param saveLocation
 * @param client
 * @returns list of files that failed to download
 */
async function downloadAllFiles(fileList: S3File[], saveLocation: vscode.Uri, client: S3Client): Promise<S3File[]> {
    const failed: S3File[] = []
    let a = 0
    let b = 0
    while (b < fileList.length) {
        a = b
        b += downloadBatchSizeLimit
        failed.push(...(await downloadBatchFiles(fileList.slice(a, b), saveLocation, client)))
    }
    return failed
}
