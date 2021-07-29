/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SignedUrlRequest } from '../../shared/clients/s3Client'
import { ext } from '../../shared/extensionGlobals'
import { Env } from '../../shared/vscode/env'
import { S3FileNode } from '../explorer/s3FileNode'
import { Window } from '../../shared/vscode/window'
import { addCodiconToString } from '../../shared/utilities/textUtilities'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { COPY_TO_CLIPBOARD_INFO_TIMEOUT_MS } from '../../shared/constants'
import { validateTime } from '../util'

export async function presignedURLCommand(
    node: S3FileNode,
    window = Window.vscode(),
    env = Env.vscode()
): Promise<void> {
    const time = await promptTime(node.file.key)
    const s3Client = ext.toolkitClientBuilder.createS3Client(node.bucket.region)

    const request: SignedUrlRequest = {
        bucketName: node.bucket.name,
        key: node.file.key,
        operation: 'getObject',
        time: time,
    }

    const url = await s3Client.getSignedUrl(request)

    await copyUrl(url, window, env)
}

export async function promptTime(fileName: string, window = Window.vscode()): Promise<number> {
    const timeStr = await window.showInputBox({
        value: '15',
        prompt: localize('AWS.s3.promptTime.prompt', 'Please enter the valid time (in minutes) for ${0} URL', fileName),
        placeHolder: localize('AWS.s3.promptTime.placeHolder', 'Defaults to 15 minutes'),
        validateInput: validateTime,
    })

    const time = Number(timeStr)

    if (isNaN(time) || time < 0) {
        return 15
    }

    return Promise.resolve(time)
}

export async function copyUrl(url: string, window = Window.vscode(), env = Env.vscode()) {
    await env.clipboard.writeText(url)
    window.setStatusBarMessage(
        addCodiconToString(
            'clippy',
            `${localize('AWS.explorerNode.copiedToClipboard', 'Copied {0} to clipboard', 'URL')}: ${url}`
        ),
        COPY_TO_CLIPBOARD_INFO_TIMEOUT_MS
    )
}
