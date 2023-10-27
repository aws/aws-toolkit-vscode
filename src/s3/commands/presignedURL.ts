/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SignedUrlRequest } from '../../shared/clients/s3Client'
import { copyToClipboard } from '../../shared/utilities/messages'
import { S3FileNode } from '../explorer/s3FileNode'
import * as vscode from 'vscode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { invalidNumberWarning } from '../../shared/localizedText'
import { telemetry } from '../../shared/telemetry/telemetry'
import { ToolkitError } from '../../shared/errors'

export async function presignedURLCommand(node: S3FileNode): Promise<void> {
    await telemetry.s3_copyUrl.run(async span => {
        span.record({ presigned: true })

        const validTime = await promptTime(node.file.key)
        const s3Client = node.s3
        const request: SignedUrlRequest = {
            bucketName: node.bucket.name,
            key: node.file.key,
            time: validTime * 60,
            operation: 'getObject',
        }

        const url = await s3Client.getSignedUrl(request).catch(e => {
            throw ToolkitError.chain(
                e,
                'Error creating the presigned URL. Make sure you have access to the requested file.'
            )
        })

        await copyToClipboard(url, 'URL')
    })
}

export async function promptTime(fileName: string): Promise<number> {
    const timeStr = await vscode.window.showInputBox({
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
