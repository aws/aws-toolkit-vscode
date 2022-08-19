/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SignedUrlRequest } from '../../shared/clients/s3Client'
import { Env } from '../../shared/vscode/env'
import { copyToClipboard } from '../../shared/utilities/messages'
import { S3FileNode } from '../explorer/s3FileNode'
import { Window } from '../../shared/vscode/window'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { invalidNumberWarning } from '../../shared/localizedText'
import { getLogger } from '../../shared/logger/logger'
import { telemetry } from '../../shared/telemetry/spans'

export async function presignedURLCommand(
    node: S3FileNode,
    window = Window.vscode(),
    env = Env.vscode()
): Promise<void> {
    let validTime: number
    try {
        validTime = await promptTime(node.file.key, window)
    } catch (e) {
        getLogger().error(e as Error)
        telemetry.s3_copyUrl.emit({ result: 'Cancelled', presigned: true })
        return
    }

    const s3Client = node.s3

    const request: SignedUrlRequest = {
        bucketName: node.bucket.name,
        key: node.file.key,
        time: validTime * 60,
        operation: 'getObject',
    }

    let url: string
    try {
        url = await s3Client.getSignedUrl(request)
    } catch (e) {
        window.showErrorMessage('Error creating the presigned URL. Make sure you have access to the requested file.')
        telemetry.s3_copyUrl.emit({ result: 'Failed', presigned: true })
        return
    }

    await copyToClipboard(url, 'URL', window, env)
    telemetry.s3_copyUrl.emit({ result: 'Succeeded', presigned: true })
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
        throw new Error(`promptTime: Invalid input by the user`)
    }

    return Promise.resolve(time)
}

function validateTime(time: string): string | undefined {
    const number = Number(time)

    if (isNaN(Number(time)) || !Number.isSafeInteger(number) || Number(time) <= 0) {
        return invalidNumberWarning
    }

    return undefined
}
