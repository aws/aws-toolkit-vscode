/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DefaultS3Client, SignedUrlRequest } from '../../shared/clients/s3Client'
import * as nls from 'vscode-nls'
import { Env } from '../../shared/vscode/env'
import { copyToClipboard } from '../../shared/utilities/messages'
import { S3FileNode } from '../explorer/s3FileNode'
import { invalidNumberWarning } from '../../shared/localizedText'
import { telemetry } from '../../shared/telemetry/telemetry'
import { ToolkitError } from '../../shared/errors'
import { Wizard } from '../../shared/wizards/wizard'
import { createQuickPick, DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { createCommonButtons } from '../../shared/ui/buttons'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { createRegionPrompter } from '../../shared/ui/common/region'
import { getLogger } from '../../shared/logger'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { s3PresigndUrlHelpUrl } from '../../shared/constants'
import { S3FolderNode } from '../explorer/s3FolderNode'
import { S3BucketNode } from '../explorer/s3BucketNode'

const localize = nls.loadMessageBundle()

export async function presignedURLCommand(
    node: S3FileNode | S3FolderNode | S3BucketNode,
    env = Env.vscode()
): Promise<void> {
    await telemetry.s3_copyUrl.run(async span => {
        span.record({ presigned: true })
        let nodeInfo: PresignedUrlWizardOptions | undefined
        if (node) {
            nodeInfo = {
                region: node.bucket.region,
                bucketname: node.bucket.name,
            }
            if (node instanceof S3FileNode) {
                nodeInfo.key = node.file.key
            }
            if (node instanceof S3FolderNode) {
                nodeInfo.folderPrefix = node.folder.path
            }
        }

        const response = await new PresignedUrlWizard(nodeInfo).run()
        if (!response) {
            getLogger().debug('s3: PresignedUrlWizard returned undefined. User cancelled.')
            throw new CancellationError('user')
        }

        const request = response.signedUrlParams
        const s3Client = node ? node.s3 : new DefaultS3Client(response.region)

        const url = await s3Client.getSignedUrl(request).catch(e => {
            throw ToolkitError.chain(
                e,
                'Error creating the presigned URL. Make sure you have access to the requested file.'
            )
        })

        await copyToClipboard(url, 'URL', env)
    })
}

function validateTime(time: string): string | undefined {
    const number = Number(time)

    if (isNaN(Number(time)) || !Number.isSafeInteger(number) || Number(time) <= 0) {
        return invalidNumberWarning
    }

    return undefined
}

export interface PresignedUrlWizardState {
    region: string
    folderPrefix?: string
    signedUrlParams: SignedUrlRequest
}

export interface PresignedUrlWizardOptions {
    region: string
    bucketname: string
    key?: string
    folderPrefix?: string
}

export class PresignedUrlWizard extends Wizard<PresignedUrlWizardState> {
    constructor(nodeInfo?: PresignedUrlWizardOptions) {
        // If command is initiated from a S3FileNode, initialize state with region and bucket name
        // Prompters by default are skipped when the data for their form field is present
        super({
            initState: {
                region: nodeInfo?.region,
                folderPrefix: nodeInfo?.folderPrefix,
                signedUrlParams: nodeInfo
                    ? ({ bucketName: nodeInfo.bucketname, key: nodeInfo.key } as SignedUrlRequest)
                    : undefined,
            },
        })
        this.form.region.bindPrompter(() => createRegionPrompter().transform(region => region.id))
        this.form.signedUrlParams.operation.bindPrompter(() => createOperationPrompter())
        this.form.signedUrlParams.bucketName.bindPrompter(({ region }) =>
            createBucketPrompter(assertDefined(region, 'region'))
        )

        this.form.signedUrlParams.key.bindPrompter(({ region, signedUrlParams }) =>
            createS3FilePrompter(
                assertDefined(region, 'region'),
                assertDefined(signedUrlParams?.bucketName, 'bucketName'),
                assertDefined(signedUrlParams?.operation, 'operation'),
                nodeInfo?.folderPrefix
            ).transform(key => {
                if (nodeInfo?.folderPrefix) {
                    return nodeInfo.folderPrefix + key
                }
                return key
            })
        )

        this.form.signedUrlParams.time.bindPrompter(({ signedUrlParams }) =>
            createExpiryPrompter(assertDefined(signedUrlParams?.key, 'key')).transform(s => Number(s) * 60)
        )

        function assertDefined<T>(val: T | undefined, key: string): T {
            if (val === undefined) {
                throw Error(`PresignedUrlWizard: "${key}" is undefined`)
            }
            return val
        }
    }
}

function createOperationPrompter() {
    const items: DataQuickPickItem<string>[] = [
        { label: 'Download (GET)', data: 'getObject' },
        { label: 'Upload (PUT)', data: 'putObject' },
    ]

    return createQuickPick(items, {
        title: 'Presigned URL: Choose an operation',
        buttons: createCommonButtons(s3PresigndUrlHelpUrl),
    })
}

function createExpiryPrompter(path: string) {
    return createInputBox({
        value: '15',
        prompt: localize(
            'AWS.s3.presignedURL.epiryPrompt',
            'Specify the time (minutes) until URL will expire for path: {0}',
            path
        ),
        placeholder: 'Defaults to 15 minutes',
        validateInput: validateTime,
        buttons: createCommonButtons(s3PresigndUrlHelpUrl),
    })
}

function createBucketPrompter(region: string) {
    const client = new DefaultS3Client(region)
    const items = client.listBucketsIterable().map(b => [
        {
            label: b.Name,
            data: b.Name,
        },
    ])

    return createQuickPick(items, { title: 'Select an S3 Bucket', buttons: createCommonButtons(s3PresigndUrlHelpUrl) })
}

function createS3FilePrompter(region: string, bucket: string, operation: string, folderPath?: string) {
    if (operation === 'getObject') {
        const items = getS3Files(region, bucket, folderPath)
        return createQuickPick(items, {
            title: 'Choose the file for the presigned URL',
            buttons: createCommonButtons(s3PresigndUrlHelpUrl),
        })
    }
    return createInputBox({
        title: 'Specify the key (S3 file path) where the upload will be saved',
        buttons: createCommonButtons(s3PresigndUrlHelpUrl),
    })
}

async function getS3Files(region: string, bucket: string, folderPath?: string) {
    const client = new DefaultS3Client(region)
    const files = (await client.listFiles({ bucketName: bucket, folderPath })).files
    const items: DataQuickPickItem<string>[] = files.map(f => {
        return {
            label: f.name,
            data: f.key,
        }
    })
    return items
}
