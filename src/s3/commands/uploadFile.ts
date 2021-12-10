/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { S3 } from 'aws-sdk'
import * as path from 'path'
import { statSync } from 'fs'
import * as vscode from 'vscode'

import { getLogger } from '../../shared/logger'
import { S3Node } from '../explorer/s3Nodes'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import * as telemetry from '../../shared/telemetry/telemetry'
import { readablePath } from '../util'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showOutputMessage } from '../../shared/utilities/messages'
import { createQuickPick, promptUser, verifySinglePickerOutput } from '../../shared/ui/picker'
import { addCodiconToString } from '../../shared/utilities/textUtilities'
import { S3Client } from '../../shared/clients/s3Client'
import { createBucketCommand } from './createBucket'
import { S3BucketNode } from '../explorer/s3BucketNode'
import { S3FolderNode } from '../explorer/s3FolderNode'
import * as localizedText from '../../shared/localizedText'
import bytes = require('bytes')
import globals from '../../shared/extensionGlobals'

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
    window: Window
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
    window = Window.vscode(),
    outputChannel = globals.outputChannel,
    commands = Commands.vscode()
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
        window,
    })

    if (node) {
        const filesToUpload = await getFile(undefined, window)

        if (!filesToUpload) {
            showOutputMessage(
                localize('AWS.message.error.uploadFileCommand.noFileSelected', 'No file selected, cancelling upload'),
                outputChannel
            )
            getLogger().info('UploadFile cancelled')
            telemetry.recordS3UploadObject({ result: 'Cancelled' })
            return
        }

        uploadRequests.push(
            ...filesToUpload.map(file => {
                const key = node!.path + path.basename(file.fsPath)
                return fileToUploadRequest(node!.bucket.name, key, file)
            })
        )
    } else {
        while (true) {
            const filesToUpload = await getFile(document, window)

            if (!filesToUpload || filesToUpload.length === 0) {
                //if file is undefined, means the back button was pressed(there is no step before) or no file was selected
                //thus break the loop of the 'wizard'
                showOutputMessage(
                    localize(
                        'AWS.message.error.uploadFileCommand.noFileSelected',
                        'No file selected, cancelling upload'
                    ),
                    outputChannel
                )
                getLogger().info('UploadFile cancelled')
                telemetry.recordS3UploadObject({ result: 'Cancelled' })
                return
            }

            const bucketResponse = await getBucket(s3Client).catch(e => {})

            if (!bucketResponse) {
                telemetry.recordS3UploadObject({ result: 'Failed' })
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
                telemetry.recordS3UploadObject({ result: 'Cancelled' })
                return
            }

            const bucketName = bucketResponse.Name
            if (!bucketName) {
                throw Error(`bucketResponse is not a S3.Bucket`)
            }

            uploadRequests.push(
                ...filesToUpload.map(file => {
                    const key = path.basename(file.fsPath)
                    return fileToUploadRequest(bucketName, key, file)
                })
            )

            break
        }
    }

    await runBatchUploads(uploadRequests, window, outputChannel)

    commands.execute('aws.refreshAwsExplorer', true)
}

async function promptForFileLocation(window: Window): Promise<vscode.Uri[] | undefined> {
    const fileLocations = await window.showOpenDialog({
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
async function runBatchUploads(
    uploadRequests: UploadRequest[],
    window = Window.vscode(),
    outputChannel = globals.outputChannel
): Promise<void> {
    let failedRequests = await uploadBatchOfFiles(uploadRequests, window, outputChannel)

    showOutputMessage(
        localize(
            'AWS.s3.uploadFile.complete',
            'Uploaded {0}/{1} file(s)',
            uploadRequests.length - failedRequests.length,
            uploadRequests.length
        ),
        outputChannel
    )

    while (failedRequests.length > 0) {
        const failedKeys = failedRequests.map(request => request.key)
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
        //at least one request failed
        const response = await window.showErrorMessage(
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
            failedRequests = await uploadBatchOfFiles(failedRequests, window, outputChannel)
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
    window = Window.vscode(),
    outputChannel = globals.outputChannel
): Promise<UploadRequest[]> {
    const response = await window.withProgress(
        {
            cancellable: true,
            location: vscode.ProgressLocation.Notification,
            title: localize(
                'AWS.s3.uploadFile.progressTitle.batch',
                'Uploading {0} file(s) to {1}',
                uploadRequests.length,
                uploadRequests[0].bucketName
            ),
        },
        async (progress, token) => {
            let requestIdx: number = 0
            const failedRequests: UploadRequest[] = []

            token.onCancellationRequested(e => {
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

                // TODO: don't use `withProgress`, it makes it hard to have control over the individual outputs
                // For now we will hide the noisy info to the channel.
                const progressWithCount: typeof progress = {
                    report(value) {
                        progress.report({ message: `${fileName} (${value.message})` })
                    },
                }

                const uploadResult = await uploadWithProgress(request, progressWithCount, token).catch(err => {
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
                    //this request failed to upload
                    failedRequests.push(uploadResult)
                }

                requestIdx += 1
                progress.report({ increment: 100.0 / uploadRequests.length })
            }

            return failedRequests.concat(uploadRequests.slice(requestIdx))
        }
    )

    telemetry.recordS3UploadObject({
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
    const fileName = request.key
    const totalBytes = request.fileSizeBytes

    // TODO: share this code better. We have a `ProgressReporter` class but all it does is output the increment?
    let lastBytes = 0
    const increment = (newBytes: number) => {
        if (request.fileSizeBytes === 0) {
            return 0
        }
        const percentage = (newBytes - lastBytes) / request.fileSizeBytes
        lastBytes = newBytes
        return percentage
    }
    const format = (newBytes: number) => bytes(newBytes, { unitSeparator: ' ', decimalPlaces: 0 })
    const report = (newBytes: number) => {
        progress.report({
            message: totalBytes ? `${format(newBytes)} / ${format(totalBytes)}` : '',
            increment: totalBytes ? increment(newBytes) : 100,
        })
    }

    // Let the progress callback know we're starting
    report(0)

    const currentStream = await request.s3Client.uploadFile({
        bucketName: request.bucketName,
        key: request.key,
        fileLocation: request.fileLocation,
        progressListener: report,
    })

    request.ongoingUpload = currentStream

    token.onCancellationRequested(e => {
        currentStream.abort()
        throw new Error(`User cancelled upload for ${fileName}`)
    })

    await currentStream.promise()

    return (request.ongoingUpload = undefined)
}

interface BucketQuickPickItem extends vscode.QuickPickItem {
    bucket: S3.Bucket | undefined
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
    window = Window.vscode(),
    promptUserFunction = promptUser,
    createBucket = createBucketCommand
): Promise<S3.Bucket | 'cancel' | 'back'> {
    let allBuckets: S3.Bucket[]
    try {
        allBuckets = await s3client.listAllBuckets()
    } catch (e) {
        getLogger().error('Failed to list buckets from client', e)
        window.showErrorMessage(
            localize('AWS.message.error.promptUserForBucket.listBuckets', 'Failed to list buckets from client')
        )
        throw new Error('Failed to list buckets from client')
    }

    const s3Buckets = allBuckets.filter(bucket => {
        return bucket && bucket.Name
    }) as S3.Bucket[]

    const createNewBucket: BucketQuickPickItem = {
        label: localize('AWS.command.s3.createBucket', 'Create new bucket'),
        bucket: undefined,
    }
    const bucketItems: BucketQuickPickItem[] = s3Buckets.map(bucket => {
        return {
            label: bucket.Name!,
            bucket,
        }
    })

    const picker = createQuickPick({
        options: {
            canPickMany: false,
            ignoreFocusOut: true,
            title: localize('AWS.message.selectBucket', 'Select an S3 bucket to upload to'),
            step: 2,
            totalSteps: 2,
        },
        items: [...bucketItems, createNewBucket],
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
            await createBucket(s3Node, window, Commands.vscode())
            return promptUserForBucket(s3client)
        }
    } else {
        return response.bucket
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
    window = Window.vscode(),
    promptUserFunction = promptUser
): Promise<vscode.Uri[] | undefined> {
    let fileLocations: vscode.Uri[] | undefined

    if (!document) {
        fileLocations = await promptForFileLocation(window)
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
            fileLocations = await promptForFileLocation(window)
        }
    }

    return fileLocations
}
