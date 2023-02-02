/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { DefaultS3Client, SignedUrlRequest } from '../../shared/clients/s3Client'
import { Env } from '../../shared/vscode/env'
import { copyToClipboard } from '../../shared/utilities/messages'
import { S3FileNode } from '../explorer/s3FileNode'
import { Window } from '../../shared/vscode/window'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { invalidNumberWarning } from '../../shared/localizedText'
import { telemetry } from '../../shared/telemetry/telemetry'
import { ToolkitError } from '../../shared/errors'
import { Wizard } from '../../shared/wizards/wizard'
import { createQuickPick, DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { createCommonButtons } from '../../shared/ui/buttons'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { createRegionPrompter } from '../../shared/ui/common/region'
import { getLogger } from '../../shared/logger'

export async function presignedURLCommand(
    node?: S3FileNode,
    window = Window.vscode(),
    env = Env.vscode()
): Promise<void> {
    await telemetry.s3_copyUrl.run(async span => {
        span.record({ presigned: true })

        const response = await new PresignedUrlWizard(node).run()
        if (!response) {
            getLogger().debug('s3: PresignedUrlWizard returned undefined. User cancelled.')
            return
        }

        const request = response.signedUrlParams
        const s3Client = node ? node.s3 : new DefaultS3Client(response.region)

        const url = await s3Client.getSignedUrl(request).catch(e => {
            throw ToolkitError.chain(
                e,
                'Error creating the presigned URL. Make sure you have access to the requested file.'
            )
        })

        await copyToClipboard(url, 'URL', window, env)
        vscode.window.showInformationMessage(`A presigned URL has been copied to your clipboard`)
    })
}

export async function promptTime(fileName: string, window = Window.vscode()): Promise<number> {
    const timeStr = await window.showInputBox({
        value: '15',
        prompt: localize(
            'AWS.s3.promptTime.prompt',
            'Specify the time (minutes) until URL will expire for path: {0}',
            fileName
        ),
        placeHolder: localize('AWS.s3.promptTime.placeHolder', 'Defaults to 15 minutes'),
        validateInput: validateTime,
    })

    const time = Number(timeStr)

    if (isNaN(time) || time < 0) {
        throw new ToolkitError('The provided expiration time is not a positive number', { code: 'InvalidInput' })
    }

    return time
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
    signedUrlParams: SignedUrlRequest
}

export class PresignedUrlWizard extends Wizard<PresignedUrlWizardState> {
    constructor(node?: S3FileNode) {
        super({
            initState: {
                region: node?.bucket.region,
                signedUrlParams: node
                    ? ({ bucketName: node.bucket.name, key: node.file.key } as SignedUrlRequest)
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
                assertDefined(signedUrlParams?.operation, 'operation')
            )
        )

        this.form.signedUrlParams.time.bindPrompter(() => createExpiryPrompter().transform(s => Number(s) * 60))

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

    return createQuickPick(items, { title: 'Presigned URL: Choose an operation', buttons: createCommonButtons() })
}

function createExpiryPrompter() {
    return createInputBox({
        value: '15',
        prompt: 'Specify the expiry time (minutes) for the URL',
        placeholder: 'Defaults to 15 minutes',
        validateInput: validateTime,
        buttons: createCommonButtons(),
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

    return createQuickPick(items, { title: 'Select an S3 Bucket', buttons: createCommonButtons() })
}

function createS3FilePrompter(region: string, bucket: string, operation: string) {
    if (operation === 'getObject') {
        const items = getS3Files(region, bucket)
        return createQuickPick(items, {
            title: 'Choose the file for the presigned URL',
            buttons: createCommonButtons(),
        })
    }
    return createInputBox({
        title: 'Create a key',
        buttons: createCommonButtons(),
    })
}

async function getS3Files(region: string, bucket: string) {
    const client = new DefaultS3Client(region)
    const files = (await client.listFiles({ bucketName: bucket })).files
    const items: DataQuickPickItem<string>[] = files.map(f => {
        return {
            label: f.name,
            data: f.key,
        }
    })
    return items
}
