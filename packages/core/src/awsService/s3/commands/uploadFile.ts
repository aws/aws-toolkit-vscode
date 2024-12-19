/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as mime from 'mime-types'
import * as vscode from 'vscode'
import { statSync } from 'fs' // eslint-disable-line no-restricted-imports
import { S3 } from 'aws-sdk'
import { getLogger } from '../../../shared/logger'
import { S3Node } from '../explorer/s3Nodes'
import { readablePath } from '../util'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { showOutputMessage } from '../../../shared/utilities/messages'
import { createQuickPick, promptUser, verifySinglePickerOutput } from '../../../shared/ui/picker'
import { addCodiconToString } from '../../../shared/utilities/textUtilities'
import { Bucket, Folder, S3Client } from '../../../shared/clients/s3Client'
import { createBucketCommand } from './createBucket'
import { S3BucketNode } from '../explorer/s3BucketNode'
import { S3FolderNode } from '../explorer/s3FolderNode'
import * as localizedText from '../../../shared/localizedText'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { progressReporter } from '../progressReporter'
import globals from '../../../shared/extensionGlobals'
import { telemetry } from '../../../shared/telemetry/telemetry'

export interface FileSizeBytes {
    /**
     * Returns the file size in bytes.
     */
    (file: vscode.Uri): number
}

interface UploadRequest {
    bucketName: string
    key: string
    fileLocation: vscode.Uri
    fileSizeBytes: number
    s3Client: S3Client
    ongoingUpload?: S3.ManagedUpload
}

/**
 * Wizard to upload a file.
 *
 * @param s3Client account to upload the file to
 * @param nodeOrDocument node to upload to or file currently open, if undefined then there was no active editor
 *
 */
export async function uploadFileCommand(
    s3Client: S3Client,
    nodeOrDocument: S3BucketNode | S3FolderNode | vscode.Uri | undefined,
    fileSizeBytes: FileSizeBytes = statFile,
    getBucket = promptUserForBucket,
    getFile = getFilesToUpload,
    outputChannel = globals.outputChannel
): Promise<void> {
    let node: S3BucketNode | S3FolderNode | undefined
    let document: vscode.Uri | undefined
    const uploadRequests: UploadRequest[] = []

    if (nodeOrDocument) {
        if (nodeOrDocument instanceof S3BucketNode || nodeOrDocument instanceof S3FolderNode) {
            node = nodeOrDocument as S3BucketNode | S3FolderNode
            document = undefined
        } else {
            node = undefined
            document = nodeOrDocument as vscode.Uri
        }
    } else {
        node = undefined
        document = undefined
    }

    const fileToUploadRequest = (bucketName: string, key: string, file: vscode.Uri) => ({
        bucketName,
        key: key,
        fileLocation: file,
        fileSizeBytes: fileSizeBytes(file),
        s3Client,
    })

    if (node) {
        const filesToUpload = await getFile(undefined)

        if (!filesToUpload) {
            showOutputMessage(
                localize('AWS.message.error.uploadFileCommand.noFileSelected', 'No file selected, cancelling upload'),
                outputChannel
            )
            getLogger().info('UploadFile cancelled')
            telemetry.s3_uploadObject.emit({ result: 'Cancelled' })
            return
        }

        uploadRequests.push(
            ...filesToUpload.map((file) => {
                const key = node!.path + path.basename(file.fsPath)
                return fileToUploadRequest(node!.bucket.name, key, file)
            })
        )
        if (node instanceof S3FolderNode) {
            globals.globalState.tryUpdate('aws.lastUploadedToS3Folder', {
                bucket: node.bucket,
                folder: node.folder,
            })
        }
    } else {
        while (true) {
            const filesToUpload = await getFile(document)

            if (!filesToUpload || filesToUpload.length === 0) {
                // if file is undefined, means the back button was pressed(there is no step before) or no file was selected
                // thus break the loop of the 'wizard'
                showOutputMessage(
                    localize(
                        'AWS.message.error.uploadFileCommand.noFileSelected',
                        'No file selected, cancelling upload'
                    ),
                    outputChannel
                )
                getLogger().info('UploadFile cancelled')
                telemetry.s3_uploadObject.emit({ result: 'Cancelled' })
                return
            }

            const bucketResponse = await getBucket(s3Client).catch((e) => {})

            if (!bucketResponse) {
                telemetry.s3_uploadObject.emit({ result: 'Failed' })
                return
            }

            if (typeof bucketResponse === 'string') {
                if (bucketResponse === 'back') {
                    continue
                }

                showOutputMessage(
                    localize(
                        'AWS.message.error.uploadFileCommand.noBucketSelected',
                        'No bucket selected, cancelling upload'
                    ),
                    outputChannel
                )
                getLogger().info('No bucket selected, cancelling upload')
                telemetry.s3_uploadObject.emit({ result: 'Cancelled' })
                return
            }

            const bucketName = bucketResponse.bucket!.Name
            if (!bucketName) {
                throw Error(`bucketResponse is not a S3.Bucket`)
            }

            uploadRequests.push(
                ...filesToUpload.map((file) => {
                    const key =
                        bucketResponse.folder !== undefined
                            ? bucketResponse.folder.path + path.basename(file.fsPath)
                            : path.basename(file.fsPath)
                    return fileToUploadRequest(bucketName, key, file)
                })
            )

            if (bucketResponse.folder) {
                globals.globalState.tryUpdate('aws.lastUploadedToS3Folder', {
                    bucket: bucketResponse.bucket,
                    folder: bucketResponse.folder,
                })
            }

            break
        }
    }

    await runBatchUploads(uploadRequests, outputChannel)

    void vscode.commands.executeCommand('aws.refreshAwsExplorer', true)
}

async function promptForFileLocation(): Promise<vscode.Uri[] | undefined> {
    const fileLocations = await vscode.window.showOpenDialog({
        canSelectMany: true,
        openLabel: localize('AWS.s3.uploadFile.openButton', 'Upload'),
    })

    return fileLocations
}

function statFile(file: vscode.Uri) {
    return statSync(file.fsPath).size
}

/**
 * Continously attempts to upload the files until all succeed or the user cancels.
 */
async function runBatchUploads(uploadRequests: UploadRequest[], outputChannel = globals.outputChannel): Promise<void> {
    let failedRequests = await uploadBatchOfFiles(uploadRequests, outputChannel)

    showOutputMessage(
        localize(
            'AWS.s3.uploadFile.complete',
            'Uploaded {0}/{1} files',
            uploadRequests.length - failedRequests.length,
            uploadRequests.length
        ),
        outputChannel
    )

    while (failedRequests.length > 0) {
        const failedKeys = failedRequests.map((request) => request.key)
        getLogger().error(`List of requests failed to upload:\n${failedRequests.toString().split(',').join('\n')}`)

        if (failedRequests.length > 5) {
            showOutputMessage(
                localize(
                    'AWS.s3.uploadFile.failedMany',
                    'Failed uploads:\n{0}\nSee logs for full list of failed items',
                    failedKeys.toString().split(',').slice(0, 5).join('\n')
                ),
                outputChannel
            )
        } else {
            showOutputMessage(
                localize(
                    'AWS.s3.uploadFile.failed',
                    'Failed uploads:\n{0}',
                    failedKeys.toString().split(',').join('\n')
                ),
                outputChannel
            )
        }
        // at least one request failed
        const response = await vscode.window.showErrorMessage(
            localize(
                'AWS.s3.uploadFile.retryPrompt',
                'S3 Upload: {0}/{1} failed.',
                failedRequests.length,
                uploadRequests.length
            ),
            localizedText.retry,
            localizedText.skip
        )

        if (response === localizedText.retry) {
            // No tail call optimization in node :(
            failedRequests = await uploadBatchOfFiles(failedRequests, outputChannel)
        } else {
            break
        }
    }
}

/**
 * Uploads an array of requests to their specified s3 location.
 *
 * @returns array of unsuccessful requests
 */

async function uploadBatchOfFiles(
    uploadRequests: UploadRequest[],
    outputChannel = globals.outputChannel
): Promise<UploadRequest[]> {
    const totalBytes = uploadRequests.map((r) => r.fileSizeBytes).reduce((a, b) => a + b, 0)
    const response = await vscode.window.withProgress(
        {
            cancellable: true,
            location: vscode.ProgressLocation.Notification,
            title: localize(
                'AWS.s3.uploadFile.progressTitle.batch',
                'Uploading {0} files to {1}',
                uploadRequests.length,
                uploadRequests[0].bucketName
            ),
        },
        async (progress, token) => {
            let requestIdx: number = 0
            const failedRequests: UploadRequest[] = []

            token.onCancellationRequested((e) => {
                if (uploadRequests[requestIdx].ongoingUpload) {
                    uploadRequests[requestIdx].ongoingUpload?.abort()
                }
                return failedRequests
            })

            while (!token.isCancellationRequested && requestIdx < uploadRequests.length) {
                const request = uploadRequests[requestIdx]
                const fileName = path.basename(request.key)
                const destinationPath = readablePath({ bucket: { name: request.bucketName }, path: request.key })
                showOutputMessage(
                    localize('AWS.s3.uploadFile.startUpload', 'Uploading file {0} to {1}', fileName, destinationPath),
                    outputChannel
                )
                let remainder = 0
                let lastLoaded = 0
                // TODO: don't use `withProgress`, it makes it hard to have control over the individual outputs
                // For now we will hide the noisy info to the channel.
                const progressWithCount: typeof progress = {
                    report(value) {
                        const loaded = ((value.increment ?? 0) / 100) * request.fileSizeBytes + remainder
                        const rounded = Math.floor(loaded)
                        const increment = ((rounded - lastLoaded) / totalBytes) * 100

                        remainder = loaded - rounded
                        lastLoaded = rounded
                        progress.report({ message: `${fileName} (${value.message})`, increment })
                    },
                }

                const uploadResult = await uploadWithProgress(request, progressWithCount, token).catch((err) => {
                    showOutputMessage(
                        localize(
                            'AWS.s3.uploadFile.error.general',
                            'Failed to upload file {0}: {1}',
                            fileName,
                            err.message
                        ),
                        outputChannel
                    )

                    return request
                })

                if (uploadResult) {
                    // this request failed to upload
                    failedRequests.push(uploadResult)
                }

                requestIdx += 1
            }

            return failedRequests.concat(uploadRequests.slice(requestIdx))
        }
    )

    telemetry.s3_uploadObject.emit({
        result: response.length > 0 ? 'Failed' : 'Succeeded',
        value: uploadRequests.length,
        failedCount: response.length,
        successCount: uploadRequests.length - response.length,
    })

    return response
}

/**
 * Uploads a single request to s3 with a progress window
 *
 * @param request File to be uploaded
 * @param progress Progress to report to
 * @param token Cancellation token
 * @returns The same request if failed, undefined otherwise
 */
async function uploadWithProgress(
    request: UploadRequest,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    token: vscode.CancellationToken
): Promise<UploadRequest | undefined> {
    const progressListener = progressReporter(progress, {
        reportMessage: true,
        totalBytes: request.fileSizeBytes,
    })

    const currentStream = await request.s3Client.uploadFile({
        bucketName: request.bucketName,
        key: request.key,
        content: request.fileLocation,
        progressListener,
        contentType: mime.contentType(path.extname(request.fileLocation.fsPath)) || undefined,
    })

    progressListener(0)
    request.ongoingUpload = currentStream

    const cancelled = new Promise<void>((_, reject) => {
        token.onCancellationRequested((e) => {
            currentStream.abort()
            reject(new CancellationError('user'))
        })
    })

    await Promise.race([currentStream.promise(), cancelled])

    return (request.ongoingUpload = undefined)
}

export interface BucketQuickPickItem extends vscode.QuickPickItem {
    bucket: S3.Bucket | undefined
    folder?: Folder | undefined
}

interface SavedFolder {
    bucket: Bucket
    folder: Folder
}

// TODO:: extract and reuse logic from sam deploy wizard (bucket selection)
/**
 * Will display a quick pick with the list of all buckets owned by the user.
 * @param s3client client to get the list of buckets
 *
 * @returns Bucket selected by the user, 'back' or 'cancel'
 *
 * @throws Error if there is an error calling s3
 */
export async function promptUserForBucket(
    s3client: S3Client,
    promptUserFunction = promptUser,
    createBucket = createBucketCommand
): Promise<BucketQuickPickItem | 'cancel' | 'back'> {
    let allBuckets: S3.Bucket[]
    try {
        allBuckets = await s3client.listAllBuckets()
    } catch (e) {
        getLogger().error('Failed to list buckets from client %O', e)
        void vscode.window.showErrorMessage(
            localize('AWS.message.error.promptUserForBucket.listBuckets', 'Failed to list buckets from client')
        )
        throw new Error('Failed to list buckets from client')
    }

    const s3Buckets = allBuckets.filter((bucket) => {
        return bucket && bucket.Name
    }) as S3.Bucket[]

    const createNewBucket: BucketQuickPickItem = {
        label: localize('AWS.command.s3.createBucket', 'Create new bucket'),
        bucket: undefined,
    }
    const bucketItems: BucketQuickPickItem[] = s3Buckets.map((bucket) => {
        return {
            label: bucket.Name!,
            bucket,
        }
    })

    const lastTouchedFolder = globals.globalState.tryGet<SavedFolder>('aws.lastTouchedS3Folder', Object)
    let lastFolderItem: BucketQuickPickItem | undefined = undefined
    if (lastTouchedFolder) {
        lastFolderItem = {
            label: lastTouchedFolder.folder.name,
            description: '(last opened S3 folder)',
            bucket: { Name: lastTouchedFolder.bucket.name },
            folder: lastTouchedFolder.folder,
        }
    }

    const lastUploadedToFolder = globals.globalState.tryGet<SavedFolder>('aws.lastUploadedToS3Folder', Object)
    let lastUploadedFolderItem: BucketQuickPickItem | undefined = undefined
    if (lastUploadedToFolder) {
        lastUploadedFolderItem = {
            label: lastUploadedToFolder.folder.name,
            description: '(last uploaded-to S3 folder)',
            bucket: { Name: lastUploadedToFolder.bucket.name },
            folder: lastUploadedToFolder.folder,
        }
    }

    const folderItems = []
    if (lastUploadedFolderItem !== undefined) {
        folderItems.push(lastUploadedFolderItem)
    }
    // de-dupe if folders are the same
    if (
        lastFolderItem !== undefined &&
        (lastUploadedFolderItem === undefined || lastFolderItem.folder?.path !== lastUploadedFolderItem.folder?.path)
    ) {
        folderItems.push(lastFolderItem)
    }

    const items: BucketQuickPickItem[] = [
        ...(folderItems.length > 0
            ? [
                  {
                      label: localize('AWS.s3.uploadFile.folderSeparator', 'Folders'),
                      kind: vscode.QuickPickItemKind.Separator,
                      bucket: undefined,
                  } as BucketQuickPickItem,
              ]
            : []),
        ...folderItems,
        {
            label: localize('AWS.s3.uploadFile.bucketSeparator', 'Buckets'),
            kind: vscode.QuickPickItemKind.Separator,
            bucket: undefined,
        } as BucketQuickPickItem,
        ...bucketItems,
        createNewBucket,
    ]

    const picker = createQuickPick({
        options: {
            canPickMany: false,
            ignoreFocusOut: true,
            title: localize('AWS.message.selectBucket', 'Select an S3 bucket or folder to upload to'),
            step: 2,
            totalSteps: 2,
        },
        items,
        buttons: [vscode.QuickInputButtons.Back],
    })
    const response = verifySinglePickerOutput(
        await promptUserFunction({
            picker: picker,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve([
                        {
                            label: 'back',
                            bucket: undefined,
                        },
                    ])
                }
            },
        })
    )

    if (!response) {
        return 'cancel'
    }

    if (!response.bucket) {
        if (response.label === 'back') {
            return response.label
        }
        if (response.label === 'Create new bucket') {
            const s3Node = new S3Node(s3client)
            await createBucket(s3Node)
            return promptUserForBucket(s3client)
        }
    } else {
        return response
    }
    return 'cancel'
}

/**
 * Gets the open file in the current editor
 * Asks the user to browse for more files
 * If no file is open it prompts the user to select file
 * @param document document to use as currently open
 *
 * @returns file selected by the user
 */
export async function getFilesToUpload(
    document?: vscode.Uri,
    promptUserFunction = promptUser
): Promise<vscode.Uri[] | undefined> {
    let fileLocations: vscode.Uri[] | undefined

    if (!document) {
        fileLocations = await promptForFileLocation()
    } else {
        fileLocations = [document]
        const fileNameToDisplay = path.basename(fileLocations[0].fsPath)

        const fileOption: vscode.QuickPickItem = {
            label: addCodiconToString('file', fileNameToDisplay),
        }
        const selectMore: vscode.QuickPickItem = {
            label: localize('AWS.message.browseMoreFiles', 'Browse for more files...'),
        }

        const picker = createQuickPick({
            options: {
                canPickMany: false,
                ignoreFocusOut: true,
                title: localize('AWS.message.selectFileUpload', 'Select a file to upload'),
                step: 1,
                totalSteps: 2,
            },
            items: [fileOption, selectMore],
            buttons: [vscode.QuickInputButtons.Back],
        })

        const response = verifySinglePickerOutput(
            await promptUserFunction({
                picker: picker,
                onDidTriggerButton: (button, resolve, reject) => {
                    if (button === vscode.QuickInputButtons.Back) {
                        resolve(undefined)
                    }
                },
            })
        )

        if (!response) {
            return
        }

        if (response.label === selectMore.label) {
            fileLocations = await promptForFileLocation()
        }
    }

    return fileLocations
}
